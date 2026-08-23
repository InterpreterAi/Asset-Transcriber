/**
 * Shared outro composition — delegates to fixed InterpreterAIOutro (locked brand asset).
 * Preview, full reel, and MP4 export all use the same deterministic painter.
 */

import {
  loadInterpreterAIOutroAssets,
  paintInterpreterAIOutroFrame,
  INTERPRETER_AI_OUTRO_DURATION_SEC,
  type InterpreterAIOutroAssets,
} from "@/lib/interpreterAIOutro";
import type { OutroLayerDocument } from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import { LOCKED_OUTRO_FADE_BLACK_SEC, LOCKED_OUTRO_MIN_SEC } from "@/lib/universalBrandOutro";

export type OutroPaintAssets = InterpreterAIOutroAssets;

export type PaintOutroCompositionOpts = {
  assets: OutroPaintAssets;
  /** @deprecated Layout ignored — fixed composition only. */
  layout?: OutroLayerDocument;
  /** @deprecated */
  displayLang?: string;
  /** @deprecated */
  rtl?: boolean;
  localTime: number;
  /** @deprecated */
  breathTimeSec?: number;
  durationSec: number;
  phraseTimings?: OutroPhraseTiming[];
  /** When true, plate layers reveal on VO phrase timing. */
  syncToPhrases?: boolean;
  stageW?: number;
  stageH?: number;
};

/** Fixed-brand outro — phrase-synced plate layers + ambient motion. */
export function paintOutroComposition(ctx: CanvasRenderingContext2D, opts: PaintOutroCompositionOpts) {
  const stageW = opts.stageW ?? 1080;
  const stageH = opts.stageH ?? 1920;
  const dur = Math.max(LOCKED_OUTRO_MIN_SEC, opts.durationSec || LOCKED_OUTRO_MIN_SEC);
  const t = Math.max(0, opts.localTime);

  paintInterpreterAIOutroFrame(ctx, {
    assets: opts.assets,
    localTimeSec: t,
    stageW,
    stageH,
  });

  const fadeStart = dur - LOCKED_OUTRO_FADE_BLACK_SEC;
  const fadeBlack = t >= fadeStart ? Math.min(1, (t - fadeStart) / LOCKED_OUTRO_FADE_BLACK_SEC) : 0;
  if (fadeBlack > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fadeBlack})`;
    ctx.fillRect(0, 0, stageW, stageH);
  }
}

export async function loadOutroPaintAssets(): Promise<OutroPaintAssets> {
  return loadInterpreterAIOutroAssets();
}

export { INTERPRETER_AI_OUTRO_DURATION_SEC };
