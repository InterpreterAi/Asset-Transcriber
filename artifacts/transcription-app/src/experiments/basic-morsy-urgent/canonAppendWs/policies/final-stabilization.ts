import { joinCanonText } from "../types/canon-token";
import type { PaintBuffer } from "../types/transcript";
import type { CanonUtterance } from "../types/canon-utterance";

import { MIN_STRUCTURAL_FINAL_CHARS } from "./segmentation-constants";

export function paintMeanConfidence(paint: PaintBuffer): number | null {
  let sum = 0;
  let n = 0;
  for (const t of paint.tokens) {
    if (typeof t.confidence === "number" && Number.isFinite(t.confidence)) {
      sum += t.confidence;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

function fullHypothesis(au: CanonUtterance | null, paint: PaintBuffer): string {
  const committed = au?.committedText ?? "";
  const tail = au?.mutableTail ?? joinCanonText(paint.tokens);
  if (au) return committed + tail;
  return joinCanonText(paint.tokens);
}

/** Defer structural final when paint hypothesis extends/corrects it (Jess → Jessica). */
export function finalSupersededByPaint(
  finalTok: { text: string },
  paint: PaintBuffer,
  active: CanonUtterance | null,
): boolean {
  const hyp = fullHypothesis(active, paint);
  const f = finalTok.text;
  if (!hyp.length || !f.length) return false;

  if (hyp.startsWith(f) && hyp.length > f.length) return true;

  const overlapAtEnd = hyp.endsWith(f) && hyp.length > f.length;
  if (overlapAtEnd && f.length < MIN_STRUCTURAL_FINAL_CHARS) return true;

  return false;
}
