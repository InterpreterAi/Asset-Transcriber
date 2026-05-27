import { joinCanonText } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

export type RowProjection = {
  row_id: string;
  speaker?: string;
  language?: string;
  committedText: string;
  liveText: string;
  finalized: boolean;
};

/** Full-document projection derived from reducer state only. */
export type TranscriptProjection = {
  rows: RowProjection[];
  /** Convenience: flattened multi-line transcript for exporters / callers. */
  liveCombined: string;
};

/** Project reducer state → render model (committed finals + **this-response** NF tail — never cross-frame hypothesis append). */
export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const rows: RowProjection[] = [];

  for (const r of state.rows) {
    const committedText = joinCanonText(r.committedTokens);
    const liveText = r.finalized ? "" : joinCanonText(r.liveTokens);
    if (!committedText.length && !liveText.length) continue;

    rows.push({
      row_id: r.row_id,
      speaker: r.speaker,
      language: r.language,
      committedText,
      liveText,
      finalized: r.finalized,
    });
  }

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");

  return { rows, liveCombined };
}
