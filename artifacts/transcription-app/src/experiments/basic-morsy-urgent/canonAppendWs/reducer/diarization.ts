import type { SpeakerVote } from "../types/speakers";

import { DIARIZATION_MAJORITY_RATIO, DIARIZATION_WINDOW_MS } from "../types/speakers";

export function pushSpeakerVote(
  window: SpeakerVote[],
  speakerId: string,
  nowMs: number,
): SpeakerVote[] {
  const next = window.filter(v => nowMs - v.timestamp <= DIARIZATION_WINDOW_MS);
  next.push({ speakerId, timestamp: nowMs });
  return next;
}

export function resolveMajoritySpeaker(window: SpeakerVote[]): string | null {
  if (window.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of window) {
    counts.set(v.speakerId, (counts.get(v.speakerId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  if (!best) return null;
  return bestN / window.length >= DIARIZATION_MAJORITY_RATIO ? best : null;
}
