/**
 * InterpreterAIOutro — reference plate + continuous ambient motion.
 * No bottom VO captions.
 */

import { paintInterpreterAIOutroAmbient } from "@/lib/interpreterAIOutro/paintAmbient";
import { OUTRO_H, OUTRO_W } from "@/lib/interpreterAIOutro/layout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";

export type InterpreterAIOutroAssets = {
  /** 1080×1920 approved reference plate — exact brand design. */
  plate: CanvasImageSource;
};

export type PaintInterpreterAIOutroFrameOpts = {
  assets: InterpreterAIOutroAssets;
  localTimeSec: number;
  /** @deprecated Unused — kept for API compat. */
  phraseTimings?: OutroPhraseTiming[];
  stageW?: number;
  stageH?: number;
  /** @deprecated Unused — kept for API compat. */
  syncToPhrases?: boolean;
};

/** Paint one frame: reference plate + ambient overlay. */
export function paintInterpreterAIOutroFrame(
  ctx: CanvasRenderingContext2D,
  opts: PaintInterpreterAIOutroFrameOpts,
): void {
  const stageW = opts.stageW ?? OUTRO_W;
  const stageH = opts.stageH ?? OUTRO_H;
  const t = Math.max(0, opts.localTimeSec);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(opts.assets.plate, 0, 0, stageW, stageH);

  paintInterpreterAIOutroAmbient(ctx, t, stageW, stageH);
}

export { INTERPRETER_AI_OUTRO_DURATION_SEC, INTERPRETER_AI_OUTRO_FPS } from "@/lib/interpreterAIOutro/timeline";
export { INTERPRETER_AI_OUTRO_COPY, INTERPRETER_AI_OUTRO_VO } from "@/lib/interpreterAIOutro/lockedCopy";
