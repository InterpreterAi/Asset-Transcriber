/**
 * Fast canvas painter for fixed InterpreterAI outro export.
 */

import {
  loadInterpreterAIOutroAssets,
  paintInterpreterAIOutroFrame,
  type InterpreterAIOutroAssets,
} from "@/lib/interpreterAIOutro";
import type { OutroLayerDocument } from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import { LOCKED_OUTRO_FADE_BLACK_SEC, LOCKED_OUTRO_MIN_SEC, type UniversalOutroCopy } from "@/lib/universalBrandOutro";

export type LockedOutroPaintAssets = InterpreterAIOutroAssets;

export async function loadLockedOutroPaintAssets(): Promise<LockedOutroPaintAssets> {
  return loadInterpreterAIOutroAssets();
}

let scratchCanvas: HTMLCanvasElement | null = null;
function getScratch(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = 1080;
    scratchCanvas.height = 1920;
  }
  const sctx = scratchCanvas.getContext("2d");
  if (!sctx) throw new Error("Canvas unsupported");
  return { canvas: scratchCanvas, ctx: sctx };
}

/** Paint one fixed outro frame into ctx (dest size = width×height, source art is 1080×1920). */
export function paintLockedOutroFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    assets: LockedOutroPaintAssets;
    /** @deprecated Ignored — brand copy is locked. */
    copy?: UniversalOutroCopy;
    /** @deprecated Ignored — layout is fixed. */
    layout?: OutroLayerDocument;
    /** @deprecated */
    displayLang?: string;
    /** @deprecated */
    rtl?: boolean;
    localTime: number;
    durationSec: number;
    phraseTimings?: OutroPhraseTiming[];
    syncToPhrases?: boolean;
    width: number;
    height: number;
  },
) {
  const stageW = 1080;
  const stageH = 1920;
  const dur = Math.max(LOCKED_OUTRO_MIN_SEC, opts.durationSec || LOCKED_OUTRO_MIN_SEC);
  const direct = opts.width === stageW && opts.height === stageH;
  const { ctx: g } = direct ? { ctx } : getScratch();
  if (!direct) g.setTransform(1, 0, 0, 1, 0, 0);

  paintInterpreterAIOutroFrame(g, {
    assets: opts.assets,
    localTimeSec: Math.max(0, opts.localTime),
    stageW,
    stageH,
  });

  const t = Math.max(0, opts.localTime);
  const fadeStart = dur - LOCKED_OUTRO_FADE_BLACK_SEC;
  const fadeBlack = t >= fadeStart ? Math.min(1, (t - fadeStart) / LOCKED_OUTRO_FADE_BLACK_SEC) : 0;
  if (fadeBlack > 0) {
    g.fillStyle = `rgba(0,0,0,${fadeBlack})`;
    g.fillRect(0, 0, stageW, stageH);
  }

  if (!direct) {
    ctx.drawImage(getScratch().canvas, 0, 0, opts.width, opts.height);
  }
}
