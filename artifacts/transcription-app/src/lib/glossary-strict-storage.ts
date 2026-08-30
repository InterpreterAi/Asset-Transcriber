/** Client preference: server-side strict glossary replacement on translated text (default on). */
const GLOSSARY_STRICT_STORAGE_KEY = "interpreterai_glossary_strict";

/** Fired after personal glossary create/update/delete so live sessions can reload entries. */
export const GLOSSARY_CHANGED_EVENT = "interpreterai:glossary-changed";

export function emitGlossaryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GLOSSARY_CHANGED_EVENT));
}

export function readGlossaryStrictEnabled(): boolean {
  return true;
}

export function writeGlossaryStrictEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(GLOSSARY_STRICT_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
