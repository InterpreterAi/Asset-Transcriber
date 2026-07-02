/**
 * Soniox real-time STT rejects unknown `language_hints` values with WebSocket/errors
 * (e.g. "Invalid language hint" / 400). Hints MUST be subset of ISO codes Soniox documents.
 *
 * Source of truth (sync periodically): https://soniox.com/docs/stt/concepts/supported-languages
 *
 * Workspace languages can include codes Soniox does **not** STT‑support yet (e.g. Somali `so`).
 * Those map to the nearest documented STT proxy (e.g. `so` → `sw`). English in the same pair is
 * left to Soniox auto-detection (no explicit `en` hint) so the proxy bias is not drowned out.
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

/**
 * Workspace languages missing from Soniox STT docs — use closest documented hint.
 * Somali (`so`) is not listed; Swahili (`sw`) is the nearest East-African Latin-script STT model.
 */
const WORKSPACE_STT_PROXY_HINT: Record<string, string> = {
  so: "sw",
};

function baseIso(code: string): string {
  return (code || "en").split("-")[0]!.toLowerCase();
}

/** True when the pair includes a workspace language that uses an STT proxy (e.g. Somali). */
export function pairUsesSonioxSttProxyLang(pair: { a: string; b: string }): boolean {
  return (
    WORKSPACE_STT_PROXY_HINT[baseIso(pair.a)] != null ||
    WORKSPACE_STT_PROXY_HINT[baseIso(pair.b)] != null
  );
}

/** Map a workspace language tag to Soniox’s STT hint code, or null if no proxy/doc match. */
export function workspaceLangToSonioxHint(code: string): string | null {
  const base = baseIso(code);
  const proxy = WORKSPACE_STT_PROXY_HINT[base];
  if (proxy && SONIOX_STT_DOC_LANGUAGE_CODES.has(proxy)) return proxy;
  const normalized = WORKSPACE_BASE_TO_SONIOX_HINT[base] ?? base;
  return SONIOX_STT_DOC_LANGUAGE_CODES.has(normalized) ? normalized : null;
}

/**
 * Normalize workspace picker language codes to Soniox realtime-safe ISO tags.
 * Returns a supported Soniox code whenever possible; falls back to `en`.
 */
export function workspaceLangToSonioxRealtimeCode(code: string): string {
  const mapped = workspaceLangToSonioxHint(code);
  if (mapped) return mapped;
  const base = baseIso(code);
  return base || "en";
}

/** True when a Soniox tag matches a workspace pair member (incl. STT proxies such as `sw` → `so`). */
export function sonioxHintCorrespondsToWorkspaceLang(
  sonioxHint: string,
  workspaceCode: string,
): boolean {
  const h = baseIso(sonioxHint);
  const w = baseIso(workspaceCode);
  if (h === w) return true;
  const mapped = workspaceLangToSonioxHint(workspaceCode);
  return mapped !== null && h === mapped;
}

/** Map Soniox hint onto exactly one pair member when unambiguous (proxy-aware). */
export function workspacePairMemberForSonioxHint(
  sonioxHint: string,
  pair: { a: string; b: string },
): string | null {
  const a = sonioxHintCorrespondsToWorkspaceLang(sonioxHint, pair.a);
  const b = sonioxHintCorrespondsToWorkspaceLang(sonioxHint, pair.b);
  if (a && !b) return pair.a;
  if (b && !a) return pair.b;
  return null;
}

/**
 * Builds `language_hints` for Soniox WebSocket config.
 *
 * When the pair includes an STT-proxy language (Somali → `sw`), we send **only** the proxy hint.
 * Soniox still auto-detects English without an explicit `en` hint; stacking `en` + `sw` was
 * drowning Somali-side speech on production en↔so sessions.
 */
export function buildSonioxLanguageHints(pair: { a: string; b: string }): string[] {
  const hasProxy = pairUsesSonioxSttProxyLang(pair);

  if (hasProxy) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lang of [pair.a, pair.b]) {
      const h = workspaceLangToSonioxHint(lang);
      if (!h || seen.has(h)) continue;
      // Skip explicit English — auto-detect handles the English party.
      if (h === "en") continue;
      seen.add(h);
      out.push(h);
    }
    if (out.length > 0) return out;
  }

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

/** Extra realtime session fields when STT-proxy languages need different Soniox tuning. */
export function sonioxRealtimeSessionTuning(
  pair: { a: string; b: string },
  _opts?: { morsyUrgent?: boolean },
): {
  enableLanguageIdentification: boolean;
  maxEndpointDelayMs: number;
} {
  if (pairUsesSonioxSttProxyLang(pair)) {
    return {
      // LID can over-lock Latin/Latin pairs onto English before any text lands.
      enableLanguageIdentification: false,
      maxEndpointDelayMs: 1000,
    };
  }
  return {
    enableLanguageIdentification: true,
    maxEndpointDelayMs: 1000,
  };
}
