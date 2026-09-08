/**
 * Written-script families for same-speaker row splits.
 * LID tags alone must not open rows (flicker); clear script flips may.
 */

export type WrittenScriptFamily = "latin" | "arabic" | "cjk" | "hebrew";

/** Dominant writing system, or null when too short / mixed to decide. */
export function writtenScriptFamily(text: string): WrittenScriptFamily | null {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length;
  const hebrew = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const cjk = (text.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) ?? []).length;
  const total = arabic + latin + hebrew + cjk;
  if (total < 2) return null;
  if (arabic / total >= 0.6) return "arabic";
  if (hebrew / total >= 0.6) return "hebrew";
  if (cjk / total >= 0.6) return "cjk";
  if (latin / total >= 0.6) return "latin";
  return null;
}

/** True when committed row text and the new token clearly use different scripts. */
export function rowBreaksForWrittenScript(
  committedText: string,
  tokenText: string,
): boolean {
  const rowScript = writtenScriptFamily(committedText);
  const tokScript = writtenScriptFamily(tokenText);
  if (!rowScript || !tokScript) return false;
  return rowScript !== tokScript;
}
