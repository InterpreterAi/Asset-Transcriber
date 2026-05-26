import type { CommittedToken, EngineState } from "../types/transcript";

/** Formatting cleanup allowed ONLY at endpoint boundary (experiment rule). */
export function normalizeEndpointText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function applyEndpointFlush(state: EngineState, nowMs: number): EngineState {
  const flushed: CommittedToken[] = [...state.committedInternal, ...state.pendingStableTokens];
  const rawLine = flushed.map(t => t.joinedText).join("");
  const normalized = normalizeEndpointText(rawLine);
  const completedSegments =
    normalized.length > 0 ? [...state.completedSegments, normalized] : [...state.completedSegments];

  return {
    ...state,
    completedSegments,
    committedInternal: [],
    pendingStableTokens: [],
    committedVisibleIndex: 0,
    hypothesisTokens: [],
    hypothesisText: "",
    endpointState: { active: true, lastEndpointMs: nowMs },
  };
}

export function promotePendingForEndpoint(pending: CommittedToken[]): CommittedToken[] {
  return pending.slice();
}
