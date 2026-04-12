import { callLibreTranslate } from "./libretranslate.js";

/**
 * Basic / Professional / trial-libre: LibreTranslate only — public mirrors when
 * `LIBRETRANSLATE_URL` is unset, or your self-hosted instance when set.
 * Same upstream masking as Platinum (phrases, glossary, protected terms; digits expanded for Libre).
 *
 * Multi-sentence inputs: Argos/Libre often returns only the first clause in one call — we split on
 * sentence boundaries, translate each fragment, then join (same idea as full coverage, no OpenAI).
 */

const SENTENCE_BOUNDARY_RE = /(?<=[.!?؟。！？])\s+/u;

function expandNumPlaceholdersToDigits(text: string, slotToDigits: Map<number, string>): string {
  if (slotToDigits.size === 0) return text;
  let out = text;
  const slots = [...slotToDigits.entries()].sort((a, b) => b[0] - a[0]);
  for (const [n, digits] of slots) {
    out = out.replace(new RegExp(`NUM_${n}(?!\\d)`, "g"), () => digits);
  }
  return out;
}

function splitIntoSentences(s: string): string[] {
  const t = s.trim();
  if (!t) return [];
  const parts = t.split(SENTENCE_BOUNDARY_RE).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

/** Small gap between Libre calls on free public hosts to reduce 429s. */
const LIBRE_CHUNK_GAP_MS = 45;

async function translateLibreSentenceWise(plain: string, source: string, target: string): Promise<string> {
  const sentences = splitIntoSentences(plain);
  if (sentences.length <= 1) {
    return callLibreTranslate(plain, source, target);
  }
  const outs: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const sent = sentences[i]!;
    const seg = await callLibreTranslate(sent, source, target);
    outs.push(seg.trim());
    if (i < sentences.length - 1 && LIBRE_CHUNK_GAP_MS > 0) {
      await new Promise<void>(r => setTimeout(r, LIBRE_CHUNK_GAP_MS));
    }
  }
  return outs.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export async function translateBasicProfessional(
  text: string,
  source: string,
  target: string,
  slotToDigits: Map<number, string>,
): Promise<string> {
  const hasNums = slotToDigits.size > 0;
  const plain = hasNums ? expandNumPlaceholdersToDigits(text, slotToDigits) : text;
  return translateLibreSentenceWise(plain, source, target);
}
