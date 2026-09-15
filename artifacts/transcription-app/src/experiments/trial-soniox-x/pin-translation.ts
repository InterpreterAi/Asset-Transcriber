/**
 * Trial · Soniox X only.
 *
 * Soniox context cannot hold the whole interpreter list. After tokens arrive,
 * pin the translation column to the exact glossary wording when that source
 * phrase is in the Original. Does not rewrite the original column.
 */
import type { GlossaryTerm } from "./interpreter-glossary";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSurface(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phrasePattern(phrase: string): RegExp {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return /(?!)/u;
  const body = words.map(escapeRegex).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{M}])${body}(?![\\p{L}\\p{M}])`, "iu");
}

function phraseIn(text: string, phrase: string): boolean {
  const p = phrase.trim();
  if (p.length < 2) return false;
  return phrasePattern(p).test(normalizeSurface(text));
}

function lettersOnly(s: string): string {
  return normalizeSurface(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function originalIsOnlyPhrase(original: string, source: string): boolean {
  const o = lettersOnly(original);
  const s = lettersOnly(source);
  return o.length >= 2 && o === s;
}

function originalEndsWithPhrase(original: string, source: string): boolean {
  const o = lettersOnly(original);
  const s = lettersOnly(source);
  if (!s || o.length < s.length) return false;
  return o === s || o.endsWith(` ${s}`) || o.endsWith(` a ${s}`) || o.endsWith(` an ${s}`) || o.endsWith(` the ${s}`);
}

function stripSourceKeepPunct(text: string, source: string, target: string): string {
  return text.replace(phrasePattern(source), target);
}

function translationHasPreferred(text: string, preferred: string): boolean {
  return phraseIn(text, preferred) || text.normalize("NFC").includes(preferred.normalize("NFC"));
}

function replaceTrailingGuess(translation: string, preferred: string): string {
  const punct = translation.match(/[\s.!?،؛]+$/u)?.[0] ?? "";
  const body = translation.slice(0, translation.length - punct.length);
  const next = body.replace(/[^\s]+(?:\s+[^\s]+){0,1}$/u, preferred.trim());
  return `${next}${punct}`;
}

function shouldPinSource(source: string): boolean {
  const t = source.trim();
  if (t.length >= 4) return true;
  if (/^[A-Z]{3,8}$/.test(t) || t === "D&C") return true;
  return false;
}

function dedupeAdjacentPreferred(text: string, preferred: string): string {
  const p = preferred.trim();
  if (p.length < 2) return text;
  const esc = escapeRegex(p);
  return text.replace(new RegExp(`(${esc})(\\s+${esc})+`, "gu"), "$1");
}

export function applyExactGlossaryPins(
  original: string,
  translation: string,
  pairs: readonly GlossaryTerm[],
): string {
  if (!translation.trim() || !original.trim() || pairs.length === 0) return translation;

  const ranked = [...pairs]
    .filter((p) => shouldPinSource(p.source) && p.target.trim().length >= 2)
    .sort((a, b) => b.source.length - a.source.length);

  let out = translation;
  for (const { source, target } of ranked) {
    if (!phraseIn(original, source)) continue;

    out = stripSourceKeepPunct(out, source, target);
    out = dedupeAdjacentPreferred(out, target);

    if (originalIsOnlyPhrase(original, source)) {
      return target;
    }

    if (!translationHasPreferred(out, target) && originalEndsWithPhrase(original, source)) {
      out = replaceTrailingGuess(out, target);
    }
  }

  return out;
}
