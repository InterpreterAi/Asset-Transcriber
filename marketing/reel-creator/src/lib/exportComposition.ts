import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { toPng } from "html-to-image";
import {
  CANVAS_H,
  CANVAS_W,
  compositionDurationMs,
  reelConfig,
  type ReelConfig,
  videoTimeAt,
} from "./config";
import {
  assertExactCanvasSize,
  blitRecordingFrame,
  clearFrame,
  seekVideo,
  snapshotRecordingFrame,
  verifyRecordingFrameExact,
  type FidelityReport,
} from "./renderPipeline";

export type ExportProgress = {
  pct: number;
  stage: "preparing" | "verifying" | "rendering" | "encoding" | "muxing" | "done";
  detail: string;
};

export type { FidelityReport };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function captureOverlay(
  el: HTMLElement,
  transparent = false,
): Promise<HTMLImageElement> {
  const dataUrl = await toPng(el, {
    width: CANVAS_W,
    height: CANVAS_H,
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor: transparent ? null : "#02050B",
    style: {
      transform: "none",
      width: `${CANVAS_W}px`,
      height: `${CANVAS_H}px`,
      left: "0",
      top: "0",
    },
  });
  return loadImage(dataUrl);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

function drawOverlayMotion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  progress01: number,
) {
  const p = easeOut(Math.min(1, Math.max(0, progress01)));
  const scale = 0.97 + 0.03 * p;
  const w = CANVAS_W * scale;
  const h = CANVAS_H * scale;
  const x = (CANVAS_W - w) / 2;
  const y = (CANVAS_H - h) / 2;
  ctx.save();
  ctx.globalAlpha = p;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

/** Run pixel-exact gate at a sample time. Throws → caller must abort export. */
export async function verifyRecordingFidelity(
  video: HTMLVideoElement,
): Promise<FidelityReport> {
  assertExactCanvasSize(video);
  const t = Math.min(Math.max(0, video.duration * 0.35), Math.max(0, video.duration - 0.05));
  await seekVideo(video, t);
  const report = verifyRecordingFrameExact(video);
  if (!report.ok) {
    throw new Error(report.errors.join("\n"));
  }
  return report;
}

/**
 * Export: Intro → recording (shared blitRecordingFrame pipeline) → Outro.
 * Aborts if recording ≠ 1080×1920 or any pixel differs from the MP4 frame.
 */
export async function exportCompositionMp4(opts: {
  video: HTMLVideoElement;
  overlayHost: HTMLElement;
  setOverlay: (mode: "intro" | "outro" | "none") => void;
  waitForPaint: () => Promise<void>;
  cfg?: ReelConfig;
  filename?: string;
  onProgress?: (p: ExportProgress) => void;
}): Promise<FidelityReport> {
  const cfg = opts.cfg ?? reelConfig;
  const video = opts.video;
  const fps = cfg.export.fps || 60;
  const bitrate = cfg.export.bitrate || 16_000_000;
  const videoMs = Math.max(0, video.duration) * 1000;
  const durationMs = compositionDurationMs(video.duration, cfg);
  const frameCount = Math.max(1, Math.ceil((durationMs / 1000) * fps));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const introMs = cfg.intro.enabled ? cfg.intro.durationMs : 0;
  const outroMs = cfg.outro.enabled ? cfg.outro.durationMs : 0;
  const bed = cfg.export.background || "#02050B";

  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs VideoEncoder required (use Chrome or Edge).");
  }

  opts.onProgress?.({ pct: 0, stage: "verifying", detail: "Checking 1080×1920 + pixel-exact blit…" });
  const fidelity = await verifyRecordingFidelity(video);

  opts.onProgress?.({ pct: 4, stage: "preparing", detail: "Capturing brand intro…" });

  let introImg: HTMLImageElement | null = null;
  let outroImg: HTMLImageElement | null = null;

  if (cfg.intro.enabled) {
    opts.setOverlay("intro");
    await opts.waitForPaint();
    await new Promise((r) => setTimeout(r, 900));
    await opts.waitForPaint();
    introImg = await captureOverlay(opts.overlayHost, cfg.intro.transparent);
  }

  opts.onProgress?.({ pct: 6, stage: "preparing", detail: "Capturing brand outro…" });
  if (cfg.outro.enabled) {
    opts.setOverlay("outro");
    await opts.waitForPaint();
    await new Promise((r) => setTimeout(r, 1200));
    await opts.waitForPaint();
    outroImg = await captureOverlay(opts.overlayHost, false);
  }
  opts.setOverlay("none");
  await opts.waitForPaint();

  opts.onProgress?.({ pct: 8, stage: "preparing", detail: "Configuring H.264 encoder…" });

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas unsupported");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: CANVAS_W, height: CANVAS_H },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  const codecCandidates = ["avc1.640028", "avc1.4d0028", "avc1.42001f"];
  let configured = false;
  for (const codec of codecCandidates) {
    const config: VideoEncoderConfig = {
      codec,
      width: CANVAS_W,
      height: CANVAS_H,
      bitrate,
      framerate: fps,
    };
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) {
      encoder.configure(support.config ?? config);
      configured = true;
      break;
    }
  }
  if (!configured) {
    throw new Error("This browser cannot encode H.264 MP4. Use Chrome or Edge.");
  }

  video.pause();

  for (let i = 0; i < frameCount; i++) {
    if (encoderError) throw encoderError;
    const elapsedMs = Math.min(durationMs, (i / fps) * 1000);

    clearFrame(ctx, bed);

    if (elapsedMs < introMs) {
      const p = introMs > 0 ? elapsedMs / introMs : 1;
      if (introImg) drawOverlayMotion(ctx, introImg, Math.min(1, p * 1.35));
    } else if (elapsedMs < introMs + videoMs) {
      const vt = videoTimeAt(elapsedMs, video.duration, cfg);
      await seekVideo(video, vt);
      // Same function as preview — 1:1 from uploaded MP4.
      blitRecordingFrame(ctx, video);
    } else {
      const outroElapsed = elapsedMs - introMs - videoMs;
      const p = outroMs > 0 ? outroElapsed / outroMs : 1;
      if (outroImg) drawOverlayMotion(ctx, outroImg, Math.min(1, p * 1.8));
    }

    const stamp = i * frameDurationUs;
    const frame = new VideoFrame(canvas, { timestamp: stamp, duration: frameDurationUs });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    opts.onProgress?.({
      pct: 8 + Math.round(((i + 1) / frameCount) * 88),
      stage: "rendering",
      detail: `Frame ${i + 1}/${frameCount} · blitRecordingFrame 1:1`,
    });
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  opts.setOverlay("none");
  opts.onProgress?.({ pct: 96, stage: "encoding", detail: "Flushing encoder…" });
  await encoder.flush();
  encoder.close();

  opts.onProgress?.({ pct: 98, stage: "muxing", detail: "Writing MP4…" });
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  const name = opts.filename ?? `${cfg.export.filename}.mp4`;
  downloadBlob(blob, name.endsWith(".mp4") ? name : `${name}.mp4`);
  opts.onProgress?.({ pct: 100, stage: "done", detail: "MP4 ready · pixel gate passed" });
  return fidelity;
}

/** Dump one middle frame PNG via the shared blit pipeline. */
export async function exportMiddleFramePng(
  video: HTMLVideoElement,
  filename = "reel-middle-frame.png",
): Promise<FidelityReport> {
  const report = await verifyRecordingFidelity(video);
  const snap = snapshotRecordingFrame(video);
  await new Promise<void>((resolve, reject) => {
    snap.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG export failed"));
        return;
      }
      downloadBlob(blob, filename);
      resolve();
    }, "image/png");
  });
  return report;
}
