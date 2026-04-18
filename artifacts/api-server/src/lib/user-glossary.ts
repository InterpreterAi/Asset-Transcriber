/**
 * Personal glossary: source matching for prompt hints + strict post-processing on translation output.
 * Does not modify transcription (STT).
 */

export type UserGlossaryRow = { term: string; translation: string };

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Comma-separated source aliases (e.g. "heart attack, cardiac arrest"). */
export function parseGlossaryVariations(termField: string): string[] {
  return termField
    .split(",")
    .map(t => t.trim())
    .filter(t => t.length >= 2);
}

/**
 * Relaxed source match: every whitespace-delimited word in the variation must appear
 * somewhere in the normalized source (substring). More forgiving than one contiguous phrase.
 */
export function glossarySourceMatchesSourceText(normalizedLowerText: string, variation: string): boolean {
  const v = variation.toLowerCase().trim();
  if (v.length < 2) return false;
  const words = v.split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) {
    return normalizedLowerText.includes(v);
  }
  return words.every(w => normalizedLowerText.includes(w));
}

/** Lines for the OpenAI prompt: one hint per matched variation. */
export function buildUserGlossaryHintLines(entries: UserGlossaryRow[], phraseNormalized: string): string[] {
  const lower = phraseNormalized.toLowerCase();
  const hints: string[] = [];
  for (const entry of entries) {
    for (const v of parseGlossaryVariations(entry.term)) {
      if (glossarySourceMatchesSourceText(lower, v)) {
        hints.push(`"${v}" → "${entry.translation}"`);
      }
    }
  }
  return hints;
}

function buildReplacePattern(variation: string): RegExp | null {
  const v = variation.trim();
  if (v.length < 2) return null;
  const esc = escapeRegex(v);
  // Word boundaries work for typical Latin/ASCII phrases; fallback for other scripts.
  const mostlyAsciiWords = /^[\s\w'.-]+$/u.test(v) && /[A-Za-z]/.test(v);
  if (mostlyAsciiWords) {
    return new RegExp(`\\b${esc}\\b`, "gi");
  }
  return new RegExp(esc, "gi");
}

/**
 * Deterministic replacements on model output (longest phrases first). Records which
 * variation strings were applied (at least one match each).
 */
export function applyUserGlossaryStrict(
  outputText: string,
  entries: UserGlossaryRow[],
  appliedOut: string[],
): string {
  type Pair = { variation: string; translation: string };
  const pairs: Pair[] = [];
  for (const e of entries) {
    for (const v of parseGlossaryVariations(e.term)) {
      pairs.push({ variation: v, translation: e.translation });
    }
  }
  pairs.sort((a, b) => b.variation.length - a.variation.length);

  let result = outputText;
  const appliedSet = new Set<string>();

  for (const { variation, translation } of pairs) {
    const pattern = buildReplacePattern(variation);
    if (!pattern) continue;
    const before = result;
    result = result.replace(pattern, () => translation);
    if (result !== before) appliedSet.add(variation);
  }

  appliedOut.length = 0;
  for (const v of appliedSet) appliedOut.push(v);
  return result;
}

function translationPresentInOutput(haystack: string, needle: string): boolean {
  const n = needle.trim();
  if (n.length < 2) return true;
  // ASCII-only needles: case-insensitive check (handles EN leaks vs correct casing).
  if (/^[\x00-\x7F]+$/.test(n)) {
    return haystack.toLowerCase().includes(n.toLowerCase());
  }
  return haystack.includes(n);
}

/**
 * Source-aware fallback: if the segment matched a glossary source variation but the
 * preferred translation does not appear in the model output (paraphrase / no leak),
 * append missing translations in one lightweight pass (no extra model calls).
 */
export function ensureGlossaryTranslationsFromSource(
  outputText: string,
  phraseNormalized: string,
  entries: UserGlossaryRow[],
  appliedOut: string[],
): string {
  const srcLower = phraseNormalized.toLowerCase();
  const toInject: string[] = [];
  const seenLower = new Set<string>();

  for (const e of entries) {
    const trans = e.translation.trim();
    if (trans.length < 2) continue;

    let sourceHit = false;
    for (const v of parseGlossaryVariations(e.term)) {
      if (glossarySourceMatchesSourceText(srcLower, v)) {
        sourceHit = true;
        break;
      }
    }
    if (!sourceHit) continue;

    if (translationPresentInOutput(outputText, trans)) continue;

    const dedupe = trans.toLowerCase();
    if (seenLower.has(dedupe)) continue;
    seenLower.add(dedupe);
    toInject.push(trans);
  }

  if (toInject.length === 0) return outputText;

  const base = outputText.trimEnd();
  const spacer = base.length > 0 ? " " : "";
  const injected = `${base}${spacer}${toInject.join(" ")}`.trim();
  for (const t of toInject) {
    appliedOut.push(t);
  }
  return injected;
}
