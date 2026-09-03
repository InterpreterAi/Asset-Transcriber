/**
 * Soniox real-time STT rejects unknown `language_hints` values with WebSocket/errors
 * (e.g. "Invalid language hint" / 400). Hints MUST be subset of ISO codes Soniox documents.
 *
 * Source of truth (sync periodically): https://soniox.com/docs/stt/concepts/supported-languages
 *
 * Workspace languages can include codes Soniox does **not** STT‑support yet (e.g. Somali `so`).
 * Those map to the nearest documented STT proxy (e.g. `so` → `sw`). English in the same pair is
 * left to Soniox auto-detection (no explicit `en` hint) so the proxy bias is not drowned out.
 *
 * Arabic: Soniox documents a single `ar` code covering MSA + regional dialects (Egyptian, Levantine,
 * Gulf, Maghrebi/Darija including Moroccan, Algerian, Tunisian). There are no separate dialect hint
 * codes — keep using `ar` and bias via interpreter STT context instead.
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
 * Stable Soniox bilingual order — independent of UI picker A/B slots.
 *
 * The workspace UI is bidirectional (A ↔ B). Soniox `language_hints` order and
 * `translation.two_way.language_a/b` are NOT — putting Arabic (or any non-English)
 * first biases STT/LID so Arabic speech can land as English text. en↔ar and ar↔en
 * must configure Soniox identically.
 *
 * Rule: when English is in the pair, English is always Soniox language_a / first
 * hint. Otherwise sort by Soniox hint ISO so fa↔ar and ar↔fa match.
 */
export function stableSonioxBilingualOrder(pair: { a: string; b: string }): {
  a: string;
  b: string;
} {
  const ba = baseIso(pair.a);
  const bb = baseIso(pair.b);
  if (ba === bb) return { a: pair.a, b: pair.b };
  if (ba === "en") return { a: pair.a, b: pair.b };
  if (bb === "en") return { a: pair.b, b: pair.a };
  const ha = workspaceLangToSonioxHint(pair.a) ?? ba;
  const hb = workspaceLangToSonioxHint(pair.b) ?? bb;
  if (ha < hb) return { a: pair.a, b: pair.b };
  if (hb < ha) return { a: pair.b, b: pair.a };
  // Same Soniox hint (rare) — keep workspace codes but still deterministic via base ISO.
  return ba <= bb ? { a: pair.a, b: pair.b } : { a: pair.b, b: pair.a };
}

/**
 * Builds `language_hints` for Soniox WebSocket config.
 *
 * Hint order is derived from {@link stableSonioxBilingualOrder} so swapping the
 * workspace A/B selectors does not change STT bias.
 *
 * When the pair includes an STT-proxy language (Somali → `sw`), we send **only** the proxy hint.
 * Soniox still auto-detects English without an explicit `en` hint; stacking `en` + `sw` was
 * drowning Somali-side speech on production en↔so sessions.
 */
export function buildSonioxLanguageHints(pair: { a: string; b: string }): string[] {
  const ordered = stableSonioxBilingualOrder(pair);
  const hasProxy = pairUsesSonioxSttProxyLang(pair);

  if (hasProxy) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lang of [ordered.a, ordered.b]) {
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
  for (const lang of [ordered.a, ordered.b, "en"]) {
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
      maxEndpointDelayMs: 2500,
    };
  }
  return {
    enableLanguageIdentification: true,
    maxEndpointDelayMs: 2500,
  };
}

const ARABIC_SCRIPT_BASES = new Set(["ar", "fa", "ur"]);
const CJK_SCRIPT_BASES = new Set(["zh", "ja", "ko"]);

/**
 * Tag the original from what was written, not from a flickering LID code.
 * Does not rewrite text. Latin↔Latin pairs keep the Soniox tag.
 */
export function lockPairLanguageFromWrittenText(
  text: string,
  lid: string | undefined,
  pair: { a: string; b: string },
): string | undefined {
  const lidBase = lid?.trim().split("-")[0]?.toLowerCase() || undefined;
  const a = pair.a.split("-")[0]!.toLowerCase();
  const b = pair.b.split("-")[0]!.toLowerCase();
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latinChars = (text.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length;
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const cjkChars = (text.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) ?? []).length;
  const total = arabicChars + latinChars + hebrewChars + cjkChars;
  if (total < 4) return lidBase;

  const uniqueSide = (pred: (code: string) => boolean): string | undefined => {
    const hits = [a, b].filter(pred);
    return hits.length === 1 ? hits[0] : undefined;
  };

  if (arabicChars / total >= 0.6) {
    const only = uniqueSide((c) => ARABIC_SCRIPT_BASES.has(c));
    if (only) return only;
  }
  if (hebrewChars / total >= 0.6) {
    const only = uniqueSide((c) => c === "he");
    if (only) return only;
  }
  if (cjkChars / total >= 0.6) {
    const only = uniqueSide((c) => CJK_SCRIPT_BASES.has(c));
    if (only) return only;
  }
  if (latinChars / total >= 0.6) {
    const only = uniqueSide(
      (c) => !ARABIC_SCRIPT_BASES.has(c) && c !== "he" && !CJK_SCRIPT_BASES.has(c),
    );
    if (only) return only;
  }
  return lidBase;
}
