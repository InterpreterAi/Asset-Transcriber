/**
 * Basic · Morsy Urgent Chunk V2 — RTL/LTR mixed-token paint (rendering only).
 * Does not modify translation text stored for MT; applied at DOM paint time.
 * Canonical island logic lives in `@/lib/wrap-ltr-numbers`.
 */

import {
  groupMedicalMeasurementTokens,
  isolateLtrRunsInRtl,
  isRtlTranslationText,
  wrapMixedLtrWithBdiHtml,
} from "@/lib/wrap-ltr-numbers";

export { groupMedicalMeasurementTokens };

/** Unicode isolates for textContent paint fallback. */
export function applyMorsyChunkV2BidiIsolates(text: string): string {
  return isolateLtrRunsInRtl(text);
}

/** HTML `<bdi dir="ltr">` for Chunk V2 translation paint. */
export function renderMorsyChunkV2BidiHtml(text: string): string {
  return wrapMixedLtrWithBdiHtml(text);
}

/** RTL mixed-token paint (Chunk V2 + Clean MT Arabic/Hebrew output). */
export function shouldMorsyChunkV2BidiPaint(text: string): boolean {
  return isRtlTranslationText(text);
}
