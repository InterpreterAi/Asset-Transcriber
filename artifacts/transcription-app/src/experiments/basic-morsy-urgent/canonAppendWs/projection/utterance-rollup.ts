import { joinCanonText } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

/** Active display text for silence / stabilization gates (committed structural + paint). */
export function mergedActiveDisplayText(state: EngineState): string {
  const committed = joinCanonText(state.activeUtterance?.committedTokens ?? []);
  const paint = joinCanonText(state.paint.tokens);
  return committed + paint;
}
