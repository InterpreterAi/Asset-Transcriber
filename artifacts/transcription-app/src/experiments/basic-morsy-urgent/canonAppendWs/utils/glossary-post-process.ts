/**
 * Chunk-v2 translation column post-process.
 *
 * - Does NOT rewrite Original / STT text (callers pass translation only).
 * - Does NOT force-replace personal glossary aliases client-side (upstream
 *   Soniox `translation_terms` already carry saved glossary entries).
 * - DOES lock leaked dialect/slang in the translation into the official
 *   standard of the target (Arabic الفصحى, standard English, etc.).
 * - DOES apply a tiny critical-medical safety net (e.g. cholesterol≠فقر الدم)
 *   when the Original proves which EN lemma was spoken.
 */
import type { ChunkV2GlossaryEntry } from "./chunk-v2-glossary";
import { normalizeChunkV2StandardRegister } from "./chunk-v2-standard-register";
import { applyCriticalMedicalNativeRepair } from "./critical-medical-terms";

export type GlossaryPostProcessOpts = {
  originalText?: string;
  rowSourceLanguage?: string;
  langA?: string;
  langB?: string;
};

function asEntries(terms: unknown): ChunkV2GlossaryEntry[] {
  if (!Array.isArray(terms)) return [];
  return terms.filter(
    (t): t is ChunkV2GlossaryEntry =>
      !!t &&
      typeof t === "object" &&
      typeof (t as ChunkV2GlossaryEntry).target === "string" &&
      (t as ChunkV2GlossaryEntry).target.trim().length > 0,
  );
}

function targetLangFromPair(
  rowSourceLanguage: string,
  langA: string,
  langB: string,
): string {
  const src = rowSourceLanguage.split("-")[0]!.toLowerCase();
  const a = langA.split("-")[0]!.toLowerCase();
  const b = langB.split("-")[0]!.toLowerCase();
  if (src === a) return b;
  if (src === b) return a;
  return b;
}

export function applyGlossaryPostProcess(
  text: string,
  terms?: unknown,
  opts?: unknown,
): string {
  if (!text.trim()) return text;
  const o =
    opts && typeof opts === "object" ? (opts as GlossaryPostProcessOpts) : {};
  if (!o.rowSourceLanguage || !o.langA || !o.langB) {
    // Without direction context, leave Soniox text unchanged (never guess).
    return text;
  }

  const entries = asEntries(terms);
  const protectedPhrases = entries.map((e) => e.target.trim()).filter(Boolean);

  let out = normalizeChunkV2StandardRegister(text, {
    rowSourceLanguage: o.rowSourceLanguage,
    langA: o.langA,
    langB: o.langB,
    protectedPhrases,
  });

  if (o.originalText?.trim()) {
    const targetLang = targetLangFromPair(o.rowSourceLanguage, o.langA, o.langB);
    out = applyCriticalMedicalNativeRepair(out, o.originalText, targetLang);
  }

  return out;
}
