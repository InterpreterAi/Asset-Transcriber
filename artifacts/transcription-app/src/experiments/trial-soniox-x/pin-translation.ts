/**
 * Trial · Soniox X only.
 *
 * Soniox context cannot hold the whole interpreter list. After tokens arrive
 * (final **or** live partial), pin the translation column to the exact glossary
 * wording when that source phrase is already present in the Original.
 * Does not rewrite the original column. Uses the full local pack + user glossary
 * (`displayPinPairs`), not the 9.6k Soniox session slice.
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

/** Arabic possessive / object clitics often glued to glossary stems (كسّكِ, زبي, …). */
const ARABIC_CLITIC_TAIL = "(?:[ككههاهمهننيوا]|كِ|كي|كم|كن|ها|هم|هن|نا|ني|ي)?";

function isMostlyArabic(phrase: string): boolean {
  const ar = (phrase.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (phrase.match(/[A-Za-z]/g) ?? []).length;
  return ar > 0 && ar >= latin;
}

function phrasePattern(phrase: string): RegExp {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return /(?!)/u;
  const arabic = isMostlyArabic(phrase);
  const body = words
    .map((w) => {
      const esc = escapeRegex(w);
      // Allow optional shadda / tatweel drift on Arabic stems.
      return arabic ? esc.replace(/ّ/g, "ّ?") : esc;
    })
    .join("\\s+");
  if (arabic) {
    return new RegExp(`(?<![\\p{L}\\p{M}])${body}${ARABIC_CLITIC_TAIL}(?![\\p{L}\\p{M}])`, "iu");
  }
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
  if (!s || o.length < 2) return false;
  if (o === s) return true;
  // Arabic: "كسّك" / "زبي" count as the stem alone for whole-utterance pins.
  if (isMostlyArabic(source)) {
    const esc = escapeRegex(s).replace(/ّ/g, "ّ?");
    return new RegExp(
      `^${esc}(?:[ككههاهمهننيوا]|كِ|كي|كم|كن|ها|هم|هن|نا|ني|ي)?$`,
      "u",
    ).test(o);
  }
  return false;
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
  if (!t) return false;
  // Arabic vulgar/medical stems are often 2–3 letters (زب، كس، خرا، نيك).
  if (isMostlyArabic(t) && t.length >= 2) return true;
  // Latin: allow 3+ so sex/ass/cum pin; keep short ALL-CAPS acronyms (CT, IV, MRI).
  if (t.length >= 3) return true;
  if (/^[A-Z]{2,8}$/.test(t) || t === "D&C") return true;
  return false;
}

function dedupeAdjacentPreferred(text: string, preferred: string): string {
  const p = preferred.trim();
  if (p.length < 2) return text;
  const esc = escapeRegex(p);
  return text.replace(new RegExp(`(${esc})(\\s+${esc})+`, "gu"), "$1");
}

/**
 * When the original clearly said glossary source A→preferred, but Soniox put a
 * *different* glossary target B in the translation (and B's source was never
 * spoken), swap B → preferred.
 *
 * Fixes: المريء in Original + "appendix" in Translation → "Esophagus".
 */
function replaceCompetingGlossaryTargets(
  translation: string,
  preferred: string,
  original: string,
  pairs: readonly GlossaryTerm[],
): string {
  const pref = preferred.trim();
  if (pref.length < 2 || translationHasPreferred(translation, pref)) return translation;

  const competitors = pairs
    .map((p) => p.target.trim())
    .filter((t) => {
      if (t.length < 3) return false;
      if (t.toLowerCase() === pref.toLowerCase()) return false;
      if (!phraseIn(translation, t)) return false;
      // Keep B only if its own source was also spoken (both terms said).
      const sourcesForTarget = pairs.filter((p) => p.target.trim().toLowerCase() === t.toLowerCase());
      return sourcesForTarget.every((p) => !phraseIn(original, p.source));
    })
    .sort((a, b) => b.length - a.length);

  let out = translation;
  const seenWrong = new Set<string>();
  for (const wrong of competitors) {
    const key = wrong.toLowerCase();
    if (seenWrong.has(key)) continue;
    seenWrong.add(key);
    if (translationHasPreferred(out, pref)) break;
    out = out.replace(phrasePattern(wrong), pref);
  }
  return out;
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

    if (!translationHasPreferred(out, target)) {
      out = replaceCompetingGlossaryTargets(out, target, original, ranked);
    }
  }

  return out;
}
