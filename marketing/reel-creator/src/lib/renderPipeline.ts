import { CANVAS_H, CANVAS_W } from "./config";

export type FidelityReport = {
  ok: boolean;
  errors: string[];
  srcW: number;
  srcH: number;
  mismatchedPixels: number;
  firstMismatch: { x: number; y: number; ch: number; src: number; out: number } | null;
};

/** Recording must already be the export canvas size — no scale, crop, or zoom. */
export function assertExactCanvasSize(video: HTMLVideoElement): void {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    throw new Error("Recording is not ready (missing video dimensions).");
  }
  if (w !== CANVAS_W || h !== CANVAS_H) {
    throw new Error(
      `EXPORT/PREVIEW ABORT — recording is ${w}×${h}, required ${CANVAS_W}×${CANVAS_H}. ` +
        `Re-record /admin/demo-marketing at exactly ${CANVAS_W}×${CANVAS_H}. ` +
        `No scaling, crop, or zoom is applied.`,
    );
  }
}

/**
 * Sole middle-segment render path for preview AND export.
 * Draws the current decoded video frame at native 1:1 — no scale, crop, zoom, or filter.
 */
export function blitRecordingFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  assertExactCanvasSize(video);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

export function clearFrame(
  ctx: CanvasRenderingContext2D,
  color: string,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

/** Snapshot the current video frame into a native-size canvas (1:1). */
export function snapshotRecordingFrame(video: HTMLVideoElement): HTMLCanvasElement {
  assertExactCanvasSize(video);
  const c = document.createElement("canvas");
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const ctx = c.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
  return c;
}

/**
 * Pixel-exact gate: blitRecordingFrame(output) must match a direct snapshot of the MP4 frame.
 * Any single-channel difference → fail (export must abort).
 */
export function verifyRecordingFrameExact(
  video: HTMLVideoElement,
): FidelityReport {
  assertExactCanvasSize(video);

  const reference = snapshotRecordingFrame(video);

  const out = document.createElement("canvas");
  out.width = CANVAS_W;
  out.height = CANVAS_H;
  const ctx = out.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported");
  clearFrame(ctx, "#000000");
  blitRecordingFrame(ctx, video);

  const a = reference.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const b = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

  let mismatchedPixels = 0;
  let firstMismatch: FidelityReport["firstMismatch"] = null;
  const errors: string[] = [];

  for (let i = 0; i < a.data.length; i += 4) {
    const dr = a.data[i]! - b.data[i]!;
    const dg = a.data[i + 1]! - b.data[i + 1]!;
    const db = a.data[i + 2]! - b.data[i + 2]!;
    if (dr !== 0 || dg !== 0 || db !== 0) {
      mismatchedPixels++;
      if (!firstMismatch) {
        const pix = i / 4;
        const x = pix % CANVAS_W;
        const y = Math.floor(pix / CANVAS_W);
        const ch = dr !== 0 ? 0 : dg !== 0 ? 1 : 2;
        firstMismatch = {
          x,
          y,
          ch,
          src: a.data[i + ch]!,
          out: b.data[i + ch]!,
        };
        errors.push(
          `Pixel mismatch at (${x},${y}) ch${ch}: recording=${firstMismatch.src} blit=${firstMismatch.out}`,
        );
      }
    }
  }

  if (mismatchedPixels > 0) {
    errors.unshift(
      `FIDELITY FAIL — preview/export blit differs from uploaded MP4 by ${mismatchedPixels} pixel(s). Export aborted.`,
    );
  }

  return {
    ok: mismatchedPixels === 0,
    errors,
    srcW: CANVAS_W,
    srcH: CANVAS_H,
    mismatchedPixels,
    firstMismatch,
  };
}

export async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const target = Math.min(Math.max(0, timeSec), Math.max(0, video.duration - 0.001));
  if (Math.abs(video.currentTime - target) < 0.001) return;
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("Video seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onErr);
    video.currentTime = target;
  });
}
