/** Studio reel canvas aspect ratio. */

export type ReelAspectRatio = "9:16" | "16:9";

export type ReelCanvasSize = { width: number; height: number };

export function canvasSizeForAspect(ratio: ReelAspectRatio): ReelCanvasSize {
  return ratio === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
}

export function previewSizeForAspect(ratio: ReelAspectRatio): ReelCanvasSize {
  return ratio === "16:9" ? { width: 480, height: 270 } : { width: 270, height: 480 };
}

export function normalizeAspectRatio(raw: unknown): ReelAspectRatio {
  return raw === "16:9" ? "16:9" : "9:16";
}
