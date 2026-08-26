/**
 * Chunk-v2 Soniox medical term pack (vaccines + LLS UK ISA glossary).
 * Pair-scoped only — used by getInterpreterContext for Trial/Basic/Professional
 * chunk-v2 native translation sessions. Does not affect /translate stacks.
 */

import type { SonioxContextTerm } from "./interpreter-context";
import packJson from "../data/chunk-v2-medical-term-pack.json";

type PackEntry = {
  en: string;
  abbr?: string[];
  translations: Record<string, string>;
  kind?: string;
  sourceRaw?: string | null;
};

type MedicalTermPack = {
  version: number;
  languages: string[];
  vaccines: PackEntry[];
  isaTerms: PackEntry[];
};

const pack = packJson as MedicalTermPack;

/** Soft cap for personal+builtin translation_terms added from this pack (per direction merge). */
const MAX_PACK_TRANSLATION_TERMS = 280;
/** Soft cap for extra EN recognition pins from this pack. */
const MAX_PACK_EN_PINS = 220;

function baseLang(code: string): string {
  return (code || "").trim().split("-")[0]!.toLowerCase();
}

/** Resolve pack translation key for a workspace language code (exact then base). */
function packLangKey(workspaceCode: string): string | null {
  const raw = (workspaceCode || "").trim();
  if (!raw) return null;
  if (raw in (pack.vaccines[0]?.translations ?? {}) || pack.languages.includes(raw)) {
    // Prefer exact catalog code when present on any entry / languages list
  }
  if (pack.languages.includes(raw)) return raw;
  // zh-CN / zh-TW must stay distinct
  if (raw.toLowerCase() === "zh-cn") return "zh-CN";
  if (raw.toLowerCase() === "zh-tw") return "zh-TW";
  const base = baseLang(raw);
  const hit = pack.languages.find((l) => baseLang(l) === base);
  return hit ?? null;
}

function translationFor(entry: PackEntry, langKey: string): string | null {
  const t = entry.translations[langKey];
  if (typeof t === "string" && t.trim() && t.trim() !== entry.en) return t.trim();
  return null;
}

function pushUnique(
  out: SonioxContextTerm[],
  seen: Set<string>,
  source: string,
  target: string,
): boolean {
  const s = source.trim();
  const t = target.trim();
  if (!s || !t || s === t) return false;
  const key = `${s}->${t}`;
  if (seen.has(key)) return false;
  seen.add(key);
  out.push({ source: s, target: t });
  return true;
}

function pushPin(pins: string[], seen: Set<string>, term: string): void {
  const t = term.trim();
  if (t.length < 2) return;
  const k = t.toLowerCase();
  if (seen.has(k)) return;
  seen.add(k);
  pins.push(t);
}

/**
 * Build pair-scoped Soniox context additions from the vaccine + ISA pack.
 * Prefer vaccines, then ISA terms that have a real non-English translation.
 */
export function buildChunkV2MedicalPackContext(
  langA: string,
  langB: string,
): { terms: string[]; translation_terms: SonioxContextTerm[] } {
  const aKey = packLangKey(langA);
  const bKey = packLangKey(langB);
  const aIsEn = baseLang(langA) === "en";
  const bIsEn = baseLang(langB) === "en";

  const pins: string[] = [];
  const pinSeen = new Set<string>();
  const translationTerms: SonioxContextTerm[] = [];
  const termSeen = new Set<string>();

  // Phase 1: vaccines first (higher priority), then ISA glossary terms.
  const ordered: PackEntry[] = [...pack.vaccines, ...pack.isaTerms];

  for (const entry of ordered) {
    if (pins.length < MAX_PACK_EN_PINS) {
      pushPin(pins, pinSeen, entry.en);
      for (const ab of entry.abbr ?? []) pushPin(pins, pinSeen, ab);
      if (entry.sourceRaw) pushPin(pins, pinSeen, entry.sourceRaw);
    }

    if (translationTerms.length >= MAX_PACK_TRANSLATION_TERMS) continue;

    const trA = aKey && !aIsEn ? translationFor(entry, aKey) : null;
    const trB = bKey && !bIsEn ? translationFor(entry, bKey) : null;

    // en ↔ L2
    if (aIsEn && trB) {
      pushUnique(translationTerms, termSeen, entry.en, trB);
      for (const ab of entry.abbr ?? []) pushUnique(translationTerms, termSeen, ab, trB);
      pushUnique(translationTerms, termSeen, trB, entry.en);
    } else if (bIsEn && trA) {
      pushUnique(translationTerms, termSeen, entry.en, trA);
      for (const ab of entry.abbr ?? []) pushUnique(translationTerms, termSeen, ab, trA);
      pushUnique(translationTerms, termSeen, trA, entry.en);
    } else if (trA && trB) {
      // L2 ↔ L3: map via both local forms when available
      pushUnique(translationTerms, termSeen, trA, trB);
      pushUnique(translationTerms, termSeen, trB, trA);
    } else if (trA) {
      pushUnique(translationTerms, termSeen, entry.en, trA);
      pushUnique(translationTerms, termSeen, trA, entry.en);
    } else if (trB) {
      pushUnique(translationTerms, termSeen, entry.en, trB);
      pushUnique(translationTerms, termSeen, trB, entry.en);
    }
  }

  return {
    terms: pins.slice(0, MAX_PACK_EN_PINS),
    translation_terms: translationTerms.slice(0, MAX_PACK_TRANSLATION_TERMS),
  };
}

export function chunkV2MedicalPackStats(): {
  vaccines: number;
  isaTerms: number;
  languages: number;
} {
  return {
    vaccines: pack.vaccines.length,
    isaTerms: pack.isaTerms.length,
    languages: pack.languages.length,
  };
}
