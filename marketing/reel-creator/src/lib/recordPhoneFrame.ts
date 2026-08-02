import { toPng } from "html-to-image";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export const RECORD_W = 1080;
export const RECORD_H = 1920;
export const RECORD_FPS = 60;
export const RECORD_BITRATE = 16_000_000;

export type PhoneRecordProgress = {
  elapsedMs: number;
  frames: number;
};

type ActiveRecording = {
  stop: () => Promise<Blob>;
};

/**
 * Record a DOM node (the real Admin Marketing Demo phone frame) to
 * H.264 MP4 at 1080×1920 / 60fps via WebCodecs.
 *
 * Uses the same dimensions the Reel Creator expects for 1:1 blit.
 * Does not recreate UI — captures the live element as rendered.
 */
export async function startPhoneFrameRecording(
  element: HTMLElement,
  opts?: {
    fps?: number;
    bitrate?: number;
    onProgress?: (p: PhoneRecordProgress) => void;
  },
): Promise<ActiveRecording> {
  const fps = opts?.fps ?? RECORD_FPS;
  const bitrate = opts?.bitrate ?? RECORD_BITRATE;
  const frameDurationUs = Math.round(1_000_000 / fps);

  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs VideoEncoder required (Chrome or Edge).");
  }

  // Force the live phone frame to exact export pixels while recording (no crop later).
  const prev = {
    width: element.style.width,
    height: element.style.height,
    maxWidth: element.style.maxWidth,
    maxHeight: element.style.maxHeight,
    minWidth: element.style.minWidth,
    minHeight: element.style.minHeight,
  };
  element.style.width = `${RECORD_W}px`;
  element.style.height = `${RECORD_H}px`;
  element.style.maxWidth = `${RECORD_W}px`;
  element.style.maxHeight = `${RECORD_H}px`;
  element.style.minWidth = `${RECORD_W}px`;
  element.style.minHeight = `${RECORD_H}px`;

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = document.createElement("canvas");
  canvas.width = RECORD_W;
  canvas.height = RECORD_H;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: RECORD_W, height: RECORD_H },
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
      width: RECORD_W,
      height: RECORD_H,
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
    restoreStyles(element, prev);
    throw new Error("This browser cannot encode H.264. Use Chrome or Edge.");
  }

  let stopped = false;
  let frameIndex = 0;
  let lastBitmap: ImageBitmap | null = null;
  const startedAt = performance.now();
  let captureBusy = false;

  const captureOnce = async () => {
    if (captureBusy) return;
    captureBusy = true;
    try {
      const dataUrl = await toPng(element, {
        width: RECORD_W,
        height: RECORD_H,
        pixelRatio: 1,
        cacheBust: false,
        // Never bake Record/Stop chrome into the MP4
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.closest("[data-reel-capture-ui]");
        },
        style: {
          transform: "none",
          width: `${RECORD_W}px`,
          height: `${RECORD_H}px`,
        },
      });
      const img = await loadImage(dataUrl);
      if (lastBitmap) lastBitmap.close();
      lastBitmap = await createImageBitmap(img);
    } catch {
      /* keep last frame */
    } finally {
      captureBusy = false;
    }
  };

  // Kick first capture
  await captureOnce();

  const tick = async () => {
    if (stopped) return;
    if (encoderError) {
      stopped = true;
      return;
    }

    const elapsedMs = performance.now() - startedAt;
    const expectedFrame = Math.floor((elapsedMs / 1000) * fps);

    // Refresh live pixels as often as capture allows
    void captureOnce();

    while (frameIndex <= expectedFrame && !stopped) {
      ctx.fillStyle = "#02050B";
      ctx.fillRect(0, 0, RECORD_W, RECORD_H);
      if (lastBitmap) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(lastBitmap, 0, 0, RECORD_W, RECORD_H);
      }
      const stamp = frameIndex * frameDurationUs;
      const frame = new VideoFrame(canvas, { timestamp: stamp, duration: frameDurationUs });
      encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
      frame.close();
      frameIndex++;
      opts?.onProgress?.({ elapsedMs, frames: frameIndex });
    }

    if (!stopped) {
      window.setTimeout(() => void tick(), Math.max(4, Math.floor(1000 / fps / 2)));
    }
  };

  void tick();

  return {
    stop: async () => {
      stopped = true;
      // Encode a few trailing frames with the last bitmap
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "#02050B";
        ctx.fillRect(0, 0, RECORD_W, RECORD_H);
        if (lastBitmap) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(lastBitmap, 0, 0, RECORD_W, RECORD_H);
        }
        const stamp = frameIndex * frameDurationUs;
        const frame = new VideoFrame(canvas, { timestamp: stamp, duration: frameDurationUs });
        encoder.encode(frame, { keyFrame: false });
        frame.close();
        frameIndex++;
      }

      await encoder.flush();
      encoder.close();
      if (lastBitmap) lastBitmap.close();
      muxer.finalize();
      restoreStyles(element, prev);

      if (encoderError) throw encoderError;
      if (frameIndex < 1) throw new Error("Recording produced no frames.");

      return new Blob([target.buffer], { type: "video/mp4" });
    },
  };
}

function restoreStyles(
  el: HTMLElement,
  prev: Record<string, string>,
) {
  el.style.width = prev.width;
  el.style.height = prev.height;
  el.style.maxWidth = prev.maxWidth;
  el.style.maxHeight = prev.maxHeight;
  el.style.minWidth = prev.minWidth;
  el.style.minHeight = prev.minHeight;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
