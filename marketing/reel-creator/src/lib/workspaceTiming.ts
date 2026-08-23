/** Workspace + reel timing constants — no imports from generatedReel (breaks cycles). */

import type { TimedWord } from "@/lib/kineticCaptions";

export const WORKSPACE_POST_VO_HOLD_SEC = 1.5;

export const WORKSPACE_EXCHANGE_GAP_SEC = 0.32;

export const WORKSPACE_THIRD_SPEAKER_GAP_SEC = 0.48;

export function speechTrimSecFromWords(
  words: TimedWord[],
  fallbackSec = 2,
  measuredCap?: number,
): number {
  let dur = fallbackSec;
  if (words.length > 0) {
    dur = Math.max(0.35, words[words.length - 1]!.end + 0.04);
  }
  if (typeof measuredCap === "number" && measuredCap > 0.05) {
    dur = Math.min(dur, measuredCap);
  }
  return dur;
}
