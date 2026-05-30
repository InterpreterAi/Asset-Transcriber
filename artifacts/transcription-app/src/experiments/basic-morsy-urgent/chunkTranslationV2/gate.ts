/** Basic · Morsy Urgent — append-only chunk translation experiment (localStorage opt-in). */
export const MORSY_CHUNK_TRANSLATION_V2_LS = "interpreterai_morsy_chunk_translation_v2";

export function readMorsyChunkTranslationV2Experiment(): boolean {
  try {
    return (
      typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(MORSY_CHUNK_TRANSLATION_V2_LS) === "1"
    );
  } catch {
    return false;
  }
}

export function writeMorsyChunkTranslationV2Experiment(enabled: boolean): void {
  try {
    globalThis.localStorage.setItem(MORSY_CHUNK_TRANSLATION_V2_LS, enabled ? "1" : "0");
  } catch {
    /* storage */
  }
}
