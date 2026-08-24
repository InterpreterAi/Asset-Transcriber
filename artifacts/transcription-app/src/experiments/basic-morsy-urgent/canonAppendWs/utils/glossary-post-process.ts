import type { SonioxContextTerm } from "../ws/interpreter-context";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLoose(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when every whitespace word of `needle` appears somewhere in `hay` (substring). */
function sourceSpokenInOriginal(original: string, source: string): boolean {
  const hay = normalizeLoose(original);
  const words = normalizeLoose(source)
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) {
    const v = normalizeLoose(source);
    return v.length >= 2 && hay.includes(v);
  }
  return words.every((w) => hay.includes(w));
}

function translationContainsPreferred(translation: string, target: string): boolean {
  const t = target.trim();
  if (t.length < 2) return true;
  if (/^[\x00-\x7F]+$/.test(t)) {
    return normalizeLoose(translation).includes(normalizeLoose(t));
  }
  return translation.normalize("NFC").includes(t.normalize("NFC"));
}

function preserveCase(match: string, replacement: string): string {
  if (match.toUpperCase() === match && match.toLowerCase() !== match) {
    return replacement.toUpperCase();
  }
  if (
    match[0] === match[0]?.toUpperCase() &&
    match[0] !== match[0]?.toLowerCase()
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Enforce personal glossary on Soniox native (chunk-v2) translation text.
 * 1) Replace leaked source phrases in the translation with preferred targets.
 * 2) When the spoken original matched a glossary source but the preferred target
 *    is still missing, replace the longest source leak again / inject preferred
 *    wording in place when a shorter wrong form of the preferred first token appears.
 */
export function applyGlossaryPostProcess(
  text: string,
  terms: readonly SonioxContextTerm[],
  originalText?: string,
): string {
  if (!terms.length || !text.trim()) return text;

  const sorted = [...terms]
    .filter((t) => `${t.source ?? ""}`.trim() && `${t.target ?? ""}`.trim())
    .sort((a, b) => `${b.source}`.length - `${a.source}`.length);

  let result = text;
  const original = (originalText ?? "").trim();

  for (const { source, target } of sorted) {
    const src = source.trim();
    const tgt = target.trim();
    if (!src || !tgt) continue;

    const escaped = escapeRegex(src);
    const re = new RegExp(
      `(?<![\\w\\u00C0-\\u024F\\u0600-\\u06FF])${escaped}(?![\\w\\u00C0-\\u024F\\u0600-\\u06FF])`,
      "gi",
    );
    result = result.replace(re, (match) => preserveCase(match, tgt));
  }

  if (!original) return result;

  for (const { source, target } of sorted) {
    const src = source.trim();
    const tgt = target.trim();
    if (!src || !tgt) continue;
    if (!sourceSpokenInOriginal(original, src)) continue;
    if (translationContainsPreferred(result, tgt)) continue;

    // Preferred missing after leak pass: try replacing the first preferred token's
    // close Latin/Arabic lookalikes is too risky — instead replace any remaining
    // exact source leak (already done) and, if still missing, swap the first
    // whitespace token of a wrong English/Latin leak of `src` when present as a
    // whole-phrase failure: inject preferred by replacing the shortest source alias.
    const words = src.split(/\s+/).filter((w) => w.length >= 4);
    let inlined = false;
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const wr = new RegExp(
        `(?<![\\w\\u00C0-\\u024F\\u0600-\\u06FF])${escapeRegex(w)}(?![\\w\\u00C0-\\u024F\\u0600-\\u06FF])`,
        "gi",
      );
      if (!wr.test(result)) continue;
      wr.lastIndex = 0;
      result = result.replace(wr, (match) => {
        inlined = true;
        return preserveCase(match, tgt);
      });
      if (inlined) break;
    }
    if (inlined) continue;

    // Last resort: if preferred is still absent, place it where the source phrase
    // would have been by appending once (Soniox already finished the sentence).
    if (!translationContainsPreferred(result, tgt)) {
      const tail = result.trimEnd();
      result = `${tail}${tail.length > 0 ? " " : ""}${tgt}`.trim();
    }
  }

  return result;
}
