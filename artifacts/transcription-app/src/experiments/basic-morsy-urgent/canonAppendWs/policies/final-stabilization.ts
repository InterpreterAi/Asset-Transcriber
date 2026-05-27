import type { CanonToken } from "../types/canon-token";
import { joinCanonText } from "../types/canon-token";

import { MIN_STRUCTURAL_FINAL_CHARS } from "./segmentation-constants";
import type { PaintBuffer } from "../types/transcript";

/** Paint-only tail is longer correction of this final (Jess vs Jessica) — defer structural commit. */
export function finalSupersededByPaint(finalTok: CanonToken, paint: PaintBuffer): boolean {
  const p = joinCanonText(paint.tokens);
  const f = finalTok.text;
  if (!p.length || !f.length) return false;

  if (p.startsWith(f) && p.length > f.length) return true;

  const overlapAtEnd = p.endsWith(f) && p.length > f.length;
  if (overlapAtEnd && f.length < MIN_STRUCTURAL_FINAL_CHARS) return true;

  return false;
}

export function paintMeanConfidence(paint: PaintBuffer): number | null {
  if (paint.tokens.length === 0) return null;
  let sum = 0;
  for (const t of paint.tokens) {
    const c = t.confidence;
    sum += typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
  }
  return sum / paint.tokens.length;
}
