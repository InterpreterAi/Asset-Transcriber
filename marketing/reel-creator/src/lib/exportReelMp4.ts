import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { toCanvas } from "html-to-image";

export type ExportProgress = { pct: number; detail: string };

export type ExportSegment = {
  id: string;
  start: number;
  end: number;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function captureStage(
  stage: HTMLElement,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  // Clone is captured without CSS scale — sharp 1:1 pixels, live preview stays scaled.
  return toCanvas(stage, {
    width,
    height,
    pixelRatio: 1,
    cacheBust: false,
    backgroundColor: "#02050B",
    style: {
      transform: "none",
      transformOrigin: "top left",
      width: `${width}px`,
      height: `${height}px`,
    },
  });
}

/**
 * Fast MP4 export for kinetic text reels.
 * ONE DOM snapshot per segment (static slides), then reuse for encode.
 * ~6 captures instead of hundreds.
 */
export async function exportReelMp4(opts: {
  stage: HTMLElement;
  durationSec: number;
  width: number;
  height: number;
  segments: ExportSegment[];
  fps?: number;
  filename?: string;
  seekTo: (tSec: number) => void;
  waitForPaint: () => Promise<void>;
  onProgress?: (p: ExportProgress) => void;
}): Promise<void> {
  const fps = opts.fps ?? 15;
  const { stage, durationSec, width, height, segments } = opts;
  const frameCount = Math.max(1, Math.ceil(durationSec * fps));
  const frameDurationUs = Math.round(1_000_000 / fps);

  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs required — use Chrome or Edge to download MP4.");
  }

  opts.onProgress?.({ pct: 0, detail: "Starting…" });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas unsupported");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
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

  let configured = false;
  for (const codec of ["avc1.4d0028", "avc1.640028", "avc1.42001f"]) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: 6_000_000,
      framerate: fps,
      avc: { format: "avc" },
      hardwareAcceleration: "prefer-hardware",
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        encoder.configure(config);
        configured = true;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!configured) throw new Error("No supported H.264 encoder config.");

  const active = segments.length
    ? segments
    : [{ id: "full", start: 0, end: durationSec }];

  // ── 1) One DOM capture per segment ────────────────────────────────────────
  const snaps: { start: number; end: number; bitmap: ImageBitmap }[] = [];

  for (let s = 0; s < active.length; s++) {
    const seg = active[s]!;
    const mid = (seg.start + seg.end) / 2;
    opts.onProgress?.({
      pct: Math.round(((s + 0.5) / active.length) * 40),
      detail: `Capturing ${seg.id}…`,
    });
    opts.seekTo(mid);
    await opts.waitForPaint();
    await new Promise((r) => setTimeout(r, 30));

    const snap = await captureStage(stage, width, height);
    snaps.push({
      start: seg.start,
      end: seg.end,
      bitmap: await createImageBitmap(snap),
    });
  }

  // ── 2) Stamp each bitmap for its duration ─────────────────────────────────
  opts.onProgress?.({ pct: 45, detail: "Encoding…" });

  let snapIdx = 0;
  for (let i = 0; i < frameCount; i++) {
    if (encoderError) throw encoderError;
    const t = Math.min(durationSec - 0.0001, i / fps);

    while (snapIdx < snaps.length - 1 && t >= snaps[snapIdx]!.end) {
      snapIdx++;
    }
    const snap = snaps[snapIdx] ?? snaps[snaps.length - 1]!;

    ctx.drawImage(snap.bitmap, 0, 0, width, height);

    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    encoder.encode(frame, { keyFrame: i === 0 || i % (fps * 2) === 0 });
    frame.close();

    if (i % 45 === 0 || i === frameCount - 1) {
      opts.onProgress?.({
        pct: 45 + Math.round(((i + 1) / frameCount) * 55),
        detail: `Encoding ${i + 1}/${frameCount}`,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  for (const s of snaps) s.bitmap.close();

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  downloadBlob(blob, opts.filename ?? "interpreterai-reel.mp4");
  opts.onProgress?.({ pct: 100, detail: "Downloaded" });
}
