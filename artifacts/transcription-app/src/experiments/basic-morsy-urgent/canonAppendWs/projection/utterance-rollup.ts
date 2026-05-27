import type { EngineState } from "../types/transcript";

/** Active display text for stabilization gates (immutable committed + mutable tail). */
export function mergedActiveDisplayText(state: EngineState): string {
  const au = state.activeUtterance;
  if (au) return au.committedText + au.mutableTail;
  return state.paint.tokens.map(t => t.text).join("");
}
