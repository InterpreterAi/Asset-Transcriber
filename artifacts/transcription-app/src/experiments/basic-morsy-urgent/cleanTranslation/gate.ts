/** Basic · Morsy Urgent — clean translation experiment (localStorage opt-in). */
export const MORSY_BASIC_CLEAN_TRANSLATION_LS = "interpreterai_morsy_basic_clean_translation";

export function readMorsyBasicCleanTranslationExperiment(): boolean {
  try {
    return (
      typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(MORSY_BASIC_CLEAN_TRANSLATION_LS) === "1"
    );
  } catch {
    return false;
  }
}

export function writeMorsyBasicCleanTranslationExperiment(enabled: boolean): void {
  try {
    globalThis.localStorage.setItem(MORSY_BASIC_CLEAN_TRANSLATION_LS, enabled ? "1" : "0");
  } catch {
    /* storage */
  }
}
