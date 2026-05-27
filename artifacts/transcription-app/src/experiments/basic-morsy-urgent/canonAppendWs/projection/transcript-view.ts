import type { CanonUtterance } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

export type RowProjection = {
  row_id: string;
  speaker?: string;
  language?: string;
  committedText: string;
  liveText: string;
  finalized: boolean;
  ownershipLocked?: boolean;
};

export type TranscriptProjection = {
  rows: RowProjection[];
  liveCombined: string;
};

const PAINT_ONLY_ROW_ID = "paint-hypothesis";

function frozenUtteranceRow(u: CanonUtterance): RowProjection | null {
  if (!u.committedText.length) return null;
  return {
    row_id: u.utterance_id,
    speaker: u.speaker,
    language: u.language,
    committedText: u.committedText,
    liveText: "",
    finalized: true,
    ownershipLocked: true,
  };
}

function activeStreamingRow(state: EngineState): RowProjection | null {
  const au = state.activeUtterance;
  if (!au) return null;
  if (!au.committedText.length && !au.mutableTail.length) return null;
  return {
    row_id: au.utterance_id,
    speaker: au.speaker,
    language: au.language,
    committedText: au.committedText,
    liveText: au.mutableTail,
    finalized: false,
    ownershipLocked: au.ownershipLocked,
  };
}

function paintOnlyRow(state: EngineState): RowProjection | null {
  if (state.activeUtterance) return null;
  const liveText = state.paint.tokens.map(t => t.text).join("");
  if (!liveText.length) return null;
  return {
    row_id: PAINT_ONLY_ROW_ID,
    speaker: undefined,
    language: undefined,
    committedText: "",
    liveText,
    finalized: false,
    ownershipLocked: false,
  };
}

/** visible = committedText + mutableTail; committedText is never rewritten in projection. */
export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const rows: RowProjection[] = [];

  for (const fu of state.finalizedUtterances) {
    const pr = frozenUtteranceRow(fu);
    if (pr) rows.push(pr);
  }

  const active = activeStreamingRow(state) ?? paintOnlyRow(state);
  if (active) rows.push(active);

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");
  return { rows, liveCombined };
}
