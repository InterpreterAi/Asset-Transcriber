/**
 * Soniox real-time STT rejects unknown `language_hints` values with WebSocket/errors
 * (e.g. "Invalid language hint" / 400). Hints MUST be subset of ISO codes Soniox documents.
 *
 * Source of truth (sync periodically): https://soniox.com/docs/stt/concepts/supported-languages
 *
 * Workspace languages can include codes Soniox does **not** STT‑support yet (e.g. Somali `so`).
 * Those are omitted from hints only; the session still starts with biased hints for supported
 * languages (`enable_language_identification` remains enabled).
 */

/** ISO codes listed on Soniox STT supported-languages doc (as of project sync). */
const SONIOX_STT_DOC_LANGUAGE_CODES = new Set<string>([
  "af", "sq", "ar", "az", "eu", "be", "bn", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl", "en",
  "et", "fi", "fr", "gl", "de", "el", "gu", "he", "hi", "hu", "id", "it", "ja", "kn", "kk", "ko",
  "lv", "lt", "mk", "ms", "ml", "mr", "no", "fa", "pl", "pt", "pa", "ro", "ru", "sr", "sk", "sl",
  "es", "sw", "sv", "tl", "ta", "te", "th", "tr", "uk", "ur", "vi", "cy",
]);

/** Workspace BCP‑47 bases that Soniox documents differently for hints. */
const WORKSPACE_BASE_TO_SONIOX_HINT: Record<string, string> = {
  nb: "no",
  nn: "no",
};

function baseIso(code: string): string {
  return (code || "en").split("-")[0]!.toLowerCase();
}

/** Map a workspace language tag to Soniox’s STT hint code, or null if not in Soniox’s doc set. */
export function workspaceLangToSonioxHint(code: string): string | null {
  const normalized = WORKSPACE_BASE_TO_SONIOX_HINT[baseIso(code)] ?? baseIso(code);
  return SONIOX_STT_DOC_LANGUAGE_CODES.has(normalized) ? normalized : null;
}

/**
 * Builds `language_hints` for Soniox WebSocket config. Drops unsupported workspace codes.
 * Matches prior behavior by always attempting to include English as a bias.
 */
export function buildSonioxLanguageHints(pair: { a: string; b: string }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const lang of [pair.a, pair.b, "en"]) {
    const h = workspaceLangToSonioxHint(lang);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out.length > 0 ? out : ["en"];
}
