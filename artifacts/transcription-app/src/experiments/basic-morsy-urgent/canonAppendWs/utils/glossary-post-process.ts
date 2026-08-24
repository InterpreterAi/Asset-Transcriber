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

function looksArabic(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
}

/** Strip Arabic clitics (ب/ال/و/…) and collapse elongated ا so بالتعب ↔ تعبااان can match. */
function arabicMatchCore(s: string): string {
  let t = s.normalize("NFC").replace(/\u0640/g, "");
  let guard = 0;
  while (guard++ < 6) {
    if (t.startsWith("ال") && t.length > 3) {
      t = t.slice(2);
      continue;
    }
    if (/^[وفبلك]/.test(t) && t.length > 3) {
      t = t.slice(1);
      continue;
    }
    break;
  }
  return t.replace(/ا{2,}/g, "ا");
}

function graphemeLen(s: string): number {
  return [...s.normalize("NFC")].length;
}

function longestCommonPrefixGraphemes(a: string, b: string): number {
  const ca = [...a.normalize("NFC")];
  const cb = [...b.normalize("NFC")];
  let i = 0;
  const n = Math.min(ca.length, cb.length);
  while (i < n && ca[i] === cb[i]) i++;
  return i;
}

function longestCommonSuffixGraphemes(a: string, b: string): number {
  const ca = [...a.normalize("NFC")];
  const cb = [...b.normalize("NFC")];
  let i = 0;
  const n = Math.min(ca.length, cb.length);
  while (i < n && ca[ca.length - 1 - i] === cb[cb.length - 1 - i]) i++;
  return i;
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

function preserveCaseReplace(match: string, replacement: string): string {
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
 * Replace MT words that are stem/clitic variants of the preferred glossary target
 * (e.g. بالتعب / التعب → تعبااان) instead of appending at sentence end.
 */
function replaceSimilarPreferredInPlace(outputText: string, preferred: string): string {
  const T = preferred.trim();
  if (T.length < 2 || /\s/.test(T)) return outputText;
  const prefAr = looksArabic(T);
  const Tcore = prefAr ? arabicMatchCore(T) : T;
  if (Tcore.length < 2) return outputText;

  type Tok = { start: number; end: number; raw: string };
  const tokens: Tok[] = [];
  const re = /[\p{L}\p{M}][\p{L}\p{M}'’\-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(outputText)) !== null) {
    tokens.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
  }

  const lenT = graphemeLen(Tcore);
  const hits: Tok[] = [];

  for (const t of tokens) {
    const raw = t.raw;
    if (raw === T) continue;
    if (prefAr !== looksArabic(raw)) continue;

    const wCore = prefAr ? arabicMatchCore(raw) : raw;
    if (wCore.length < 2) continue;
    if (wCore === Tcore) {
      hits.push(t);
      continue;
    }

    const lenW = graphemeLen(wCore);
    if (lenW < 3) continue;
    const lcp = longestCommonPrefixGraphemes(wCore, Tcore);
    const lcs = longestCommonSuffixGraphemes(wCore, Tcore);
    const bestEdge = Math.max(lcp, lcs);
    const ratio = bestEdge / Math.max(lenW, lenT, 1);

    const minRatio = prefAr ? 0.4 : 0.5;
    const minEdge = prefAr ? 3 : 4;
    if (ratio < minRatio || bestEdge < minEdge) continue;
    if (lenW > lenT * 1.85 && ratio < 0.62) continue;
    if (lenT > lenW * 1.85 && ratio < 0.62) continue;
    hits.push(t);
  }

  if (hits.length === 0) return outputText;

  hits.sort((a, b) => b.start - a.start);
  let out = outputText;
  for (const t of hits) {
    out = out.slice(0, t.start) + T + out.slice(t.end);
  }
  return out;
}

/**
 * Enforce personal glossary on Soniox native (chunk-v2) translation text.
 * 1) Replace leaked source phrases in the translation with preferred targets.
 * 2) When the spoken original matched a glossary source but the preferred target
 *    is still missing, replace same-script MT cognates/stems in place
 *    (بالتعب → تعبااان). Append only as last resort for non-Arabic targets.
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
    result = result.replace(re, (match) => preserveCaseReplace(match, tgt));
  }

  if (!original) return result;

  for (const { source, target } of sorted) {
    const src = source.trim();
    const tgt = target.trim();
    if (!src || !tgt) continue;
    if (!sourceSpokenInOriginal(original, src)) continue;
    if (translationContainsPreferred(result, tgt)) continue;

    const beforeSimilar = result;
    result = replaceSimilarPreferredInPlace(result, tgt);
    if (result !== beforeSimilar && translationContainsPreferred(result, tgt)) continue;

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
        return preserveCaseReplace(match, tgt);
      });
      if (inlined) break;
    }
    if (inlined) continue;

    // Match server: Arabic (and Spanish) prefer in-place only — never sentence-end append.
    if (looksArabic(tgt)) continue;

    if (!translationContainsPreferred(result, tgt)) {
      const tail = result.trimEnd();
      result = `${tail}${tail.length > 0 ? " " : ""}${tgt}`.trim();
    }
  }

  return result;
}
