import { utteranceVisibleText } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

export function mergedActiveDisplayText(state: EngineState): string {
  const au = state.activeUtterance;
  return au ? utteranceVisibleText(au) : "";
}
