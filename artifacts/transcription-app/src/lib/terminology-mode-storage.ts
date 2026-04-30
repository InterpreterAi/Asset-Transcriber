/** OpenAI terminology behavior mode for translation prompts. */
const TERMINOLOGY_MODE_STORAGE_KEY = "interpreterai_terminology_mode";

export type TerminologyMode = "full" | "hybrid";

export function readTerminologyMode(): TerminologyMode {
  try {
    if (typeof localStorage === "undefined") return "full";
    const v = (localStorage.getItem(TERMINOLOGY_MODE_STORAGE_KEY) ?? "").trim().toLowerCase();
    return v === "hybrid" ? "hybrid" : "full";
  } catch {
    return "full";
  }
}

export function writeTerminologyMode(mode: TerminologyMode): void {
  try {
    localStorage.setItem(TERMINOLOGY_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
