/** Basic · Morsy Urgent — sentence-poll chunk translation V3 (localStorage opt-in). */
export const MORSY_CHUNK_TRANSLATION_V3_LS = "interpreterai_morsy_chunk_translation_v3";

export function readMorsyChunkTranslationV3Experiment(): boolean {
  try {
    return (
      typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(MORSY_CHUNK_TRANSLATION_V3_LS) === "1"
    );
  } catch {
    return false;
  }
}

export function writeMorsyChunkTranslationV3Experiment(enabled: boolean): void {
  try {
    globalThis.localStorage.setItem(MORSY_CHUNK_TRANSLATION_V3_LS, enabled ? "1" : "0");
  } catch {
    /* storage */
  }
}
