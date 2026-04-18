/** Client preference: server-side strict glossary replacement on translated text (default on). */
const GLOSSARY_STRICT_STORAGE_KEY = "interpreterai_glossary_strict";

export function readGlossaryStrictEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem(GLOSSARY_STRICT_STORAGE_KEY);
    if (v === null) return true;
    return v !== "0" && v !== "false";
  } catch {
    return true;
  }
}

export function writeGlossaryStrictEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(GLOSSARY_STRICT_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
