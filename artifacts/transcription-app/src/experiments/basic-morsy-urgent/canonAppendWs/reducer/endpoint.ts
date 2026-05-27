import type { EngineState } from "../types/transcript";

/** Formatting cleanup allowed ONLY when snapshotting leftover hypothesis at endpoint. */
export function normalizeEndpointText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Soniox endpoint = utterance boundary — NOT a transcript row recycler.
 * Committed prefix stays append-only; only hypothesis resets.
 */
export function applyEndpointFlush(state: EngineState, nowMs: number): EngineState {
  let committedInternal = [...state.committedInternal];

  for (const p of state.pendingStableTokens) {
    committedInternal.push({
      ...p,
      stagedSinceMs: undefined,
    });
  }

  const hypo = normalizeEndpointText(state.hypothesisText);
  if (hypo.length > 0) {
    committedInternal.push({
      id: `hypo-end-${state.lastFrameSeq}-${nowMs}`,
      joinedText: hypo,
    });
  }

  return {
    ...state,
    committedInternal,
    pendingStableTokens: [],
    committedVisibleIndex: committedInternal.length,
    hypothesisTokens: [],
    hypothesisText: "",
    endpointState: { active: true, lastEndpointMs: nowMs },
  };
}
