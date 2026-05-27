import { joinCanonText, type CanonToken, type TranscriptRow } from "../types/canon-token";
import type { CanonUtterance } from "../types/canon-utterance";

/** Flatten low-level segments into display-order committed + hypothesis tail tokens. */
export function rollupSegmentsToTokens(segments: TranscriptRow[]): { committed: CanonToken[]; live: CanonToken[] } {
  const committed: CanonToken[] = [];
  const live: CanonToken[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    committed.push(...s.committedTokens);
    if (!s.finalized) {
      live.push(...s.liveTokens);
      break;
    }
  }
  return { committed, live };
}

export function syncCanonUtteranceRollup(u: CanonUtterance): CanonUtterance {
  const { committed, live } = rollupSegmentsToTokens(u.segments);
  let start = u.start_ms;
  let end = u.end_ms;
  const allToks = [...committed, ...live];
  for (const t of allToks) {
    if (typeof t.start_ms === "number") start = start === undefined ? t.start_ms : Math.min(start, t.start_ms);
    if (typeof t.end_ms === "number") end = end === undefined ? t.end_ms : Math.max(end, t.end_ms);
  }
  const out: CanonUtterance = {
    ...u,
    committedTokens: committed,
    liveTokens: live,
  };
  if (start !== undefined) out.start_ms = start;
  if (end !== undefined) out.end_ms = end;
  return out;
}

/** Single synthetic tail row for silence / punctuation gates over the active utterance. */
export function syntheticTailFromUtterance(u: CanonUtterance): TranscriptRow {
  const { committed, live } = rollupSegmentsToTokens(u.segments);
  let sp = u.speaker?.trim();
  let lg = u.language?.trim();
  for (const seg of [...u.segments].reverse()) {
    if (!sp && seg.speaker?.trim()) sp = seg.speaker!.trim();
    if (!lg && seg.language?.trim()) lg = seg.language!.trim();
    if (sp && lg) break;
  }

  let openedWall = u.utteranceOpenedWallMs;
  const openSeg = [...u.segments].reverse().find(s => !s.finalized);
  const ob = openSeg?.openedWallMs;
  if (openedWall === undefined || (typeof ob === "number" && ob < openedWall)) {
    openedWall = ob ?? openedWall;
  }

  return {
    row_id: `${u.utterance_id}-rollup-gate`,
    speaker: sp || undefined,
    language: lg || undefined,
    committedTokens: committed,
    liveTokens: live,
    finalized: false,
    openedWallMs: openedWall,
  };
}

export function mergedCommittedAndLiveText(u: CanonUtterance): string {
  const { committed, live } = rollupSegmentsToTokens(u.segments);
  return joinCanonText([...committed, ...live]);
}
