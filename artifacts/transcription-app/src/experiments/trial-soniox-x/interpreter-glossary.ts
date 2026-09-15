/**
 * Trial · Soniox X interpreter glossary.
 *
 * Official Soniox context (session start only):
 * https://soniox.com/docs/stt/concepts/context
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 *
 * English is the pivot. Each pair is `en-<lang>` with `{ "en", "<lang>" }`.
 * We emit both directions as translation_terms (highest-value first).
 * English pack words must NOT go in `terms` or `text` — those pull live LID
 * onto English so later Arabic is written as English or dropped.
 * Hard limit ~10,000 chars.
 */
import type { SonioxStartContext } from "./stable-dialect-context";
import pack from "./interpreter-glossary.json";

export const SONIOX_X_CONTEXT_SAFE_CHARS = 9_800;

export type GlossaryTerm = { source: string; target: string };
type PackEntry = Record<string, string>;
type PackFile = { pairs: Record<string, PackEntry[]> };

const PACK = pack as PackFile;

const US_SPELLING: Record<string, string[]> = {
  anaesthesia: ["anesthesia"],
  anaesthesiologist: ["anesthesiologist"],
  anaesthesiology: ["anesthesiology"],
  gynaecologist: ["gynecologist"],
  faeces: ["feces"],
  "caesarian section": ["cesarean section"],
};

const CLINICAL_SINGLE = new Set(
  [
    "stroke",
    "seizure",
    "diabetes",
    "asthma",
    "epilepsy",
    "defibrillator",
    "hemorrhage",
    "miscarriage",
    "ultrasound",
    "hysterectomy",
    "episiotomy",
    "endometriosis",
    "mammogram",
    "mammography",
    "vasectomy",
    "prostate",
    "meningitis",
    "pneumonia",
    "measles",
    "mumps",
    "rubella",
    "tetanus",
    "polio",
    "malaria",
    "jaundice",
    "anesthesia",
    "anaesthesia",
    "insulin",
    "penicillin",
    "ibuprofen",
    "nebulizer",
    "sonogram",
    "colonoscopy",
    "endoscopy",
    "laparoscopy",
    "appendectomy",
    "appendicitis",
    "asphyxia",
    "emphysema",
    "tuberculosis",
    "andropause",
  ].map((w) => w.toLowerCase()),
);

const LOW_VALUE = new Set(
  [
    "blood",
    "pain",
    "health",
    "rest",
    "hurt",
    "weight",
    "height",
    "nurse",
    "cold",
    "flu",
    "cough",
    "drop",
    "drops",
    "tube",
    "shot",
    "pills",
    "back",
    "hair",
    "hands",
    "heart",
    "eye",
    "ear",
    "mouth",
    "neck",
    "chest",
    "arms",
    "legs",
    "finger",
    "teeth",
    "lips",
    "pressure",
    "breath",
    "sweat",
    "symptoms",
    "patch",
    "block",
    "birth",
    "egg",
    "grip",
    "lice",
    "mucus",
    "rash",
    "tummy",
    "canal",
    "duct",
    "limb",
    "tract",
    "waist",
    "fit",
  ].map((w) => w.toLowerCase()),
);

const RECOGNITION_ABBR =
  /^(ER|CT|MRI|CPR|ECG|EEG|CBC|CAT|IUD|DTP|BCG|FSH|PMS|LOP|ELISA|SGOT|IGE|D&C|WBC|RBC|IVF)$/;

function langBase(code: string): string {
  return (code || "").split("-")[0]?.toLowerCase() ?? "";
}

/** `en-ar` when the workspace pair includes English; otherwise null (no pack yet). */
export function englishPivotPairKey(langA: string, langB: string): string | null {
  const a = langBase(langA);
  const b = langBase(langB);
  if (!a || !b || a === b) return null;
  if (a === "en") return `en-${b}`;
  if (b === "en") return `en-${a}`;
  return null;
}

function otherLangFromPairKey(pairKey: string): string | null {
  const m = /^en-([a-z]{2})$/.exec(pairKey);
  return m?.[1] ?? null;
}

function rowScore(en: string): number {
  const t = en.trim();
  if (RECOGNITION_ABBR.test(t) || /^[A-Z]{3,8}$/.test(t)) return 120;
  if (/^(sonogram|ultrasound|mammogram|mammography)$/i.test(t)) return 115;
  if (CLINICAL_SINGLE.has(t.toLowerCase())) return 90;
  if (/^[A-Z]{2,8}\s+\S/.test(t)) return 50;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words >= 3) return 85;
  if (words === 2) return 60;
  if (LOW_VALUE.has(t.toLowerCase())) return 8;
  return 36;
}

function isRecognitionPin(en: string): boolean {
  const t = en.trim();
  return RECOGNITION_ABBR.test(t) || /^[A-Z]{3,8}$/.test(t);
}

function uniqueRows(rows: PackEntry[], other: string): { en: string; tgt: string }[] {
  const out: { en: string; tgt: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const en = `${row.en ?? ""}`.trim();
    const tgt = `${row[other] ?? ""}`.trim();
    if (!en || !tgt) continue;
    const k = en.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ en, tgt });
    if (CLINICAL_SINGLE.has(k) && en !== k) {
      out.push({ en: k, tgt });
    }
    for (const alias of US_SPELLING[k] ?? []) {
      if (seen.has(alias.toLowerCase())) continue;
      seen.add(alias.toLowerCase());
      out.push({ en: alias, tgt });
    }
  }
  out.sort((a, b) => rowScore(b.en) - rowScore(a.en) || a.en.localeCompare(b.en));
  return out;
}

export function packTermsForPair(
  langA: string,
  langB: string,
): {
  translationTerms: GlossaryTerm[];
  recognitionPins: string[];
  glossaryLines: string[];
} {
  const key = englishPivotPairKey(langA, langB);
  const other = key ? otherLangFromPairKey(key) : null;
  const rows = key ? uniqueRows(PACK.pairs[key] ?? [], other ?? "") : [];

  const translationTerms: GlossaryTerm[] = [];
  const recognitionPins: string[] = [];
  const glossaryLines: string[] = [];
  const seenPin = new Set<string>();

  for (const row of rows) {
    translationTerms.push({ source: row.en, target: row.tgt });
    translationTerms.push({ source: row.tgt, target: row.en });
    if (!LOW_VALUE.has(row.en.toLowerCase())) {
      glossaryLines.push(`${row.en}=${row.tgt}`);
    }
    if (isRecognitionPin(row.en) && !seenPin.has(row.en.toLowerCase())) {
      seenPin.add(row.en.toLowerCase());
      recognitionPins.push(row.en);
    }
  }

  return { translationTerms, recognitionPins, glossaryLines };
}

/** Full list for client-side exact pins — not limited by Soniox 10k. User glossary first. */
export function displayPinPairs(
  langA: string,
  langB: string,
  userEntries: ReadonlyArray<{
    term?: string;
    translation?: string;
    sourceLanguage?: string | null;
    targetLanguage?: string | null;
  }>,
): GlossaryTerm[] {
  const user = userGlossaryToTerms(userEntries, langA, langB);
  const pack = packTermsForPair(langA, langB).translationTerms;
  const out: GlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const t of [...user, ...pack]) {
    const k = `${t.source.toLowerCase()}->${t.target}`;
    if (seen.has(k)) continue;
    if (LOW_VALUE.has(t.source.toLowerCase())) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function userGlossaryToTerms(
  entries: ReadonlyArray<{
    term?: string;
    translation?: string;
    sourceLanguage?: string | null;
    targetLanguage?: string | null;
  }>,
  langA: string,
  langB: string,
): GlossaryTerm[] {
  const a = langBase(langA);
  const b = langBase(langB);
  const out: GlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const row of entries) {
    const srcLang = langBase(row.sourceLanguage ?? a);
    const tgtLang = langBase(row.targetLanguage ?? b);
    const belongs =
      (srcLang === a && tgtLang === b) ||
      (srcLang === b && tgtLang === a) ||
      (!row.sourceLanguage && !row.targetLanguage);
    if (!belongs) continue;
    const source = `${row.term ?? ""}`.trim();
    const target = `${row.translation ?? ""}`.trim();
    if (!source || !target) continue;
    const k = `${source}->${target}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ source, target });
    const back = `${target}->${source}`;
    if (!seen.has(back)) {
      seen.add(back);
      out.push({ source: target, target: source });
    }
  }
  return out;
}

function contextChars(ctx: SonioxStartContext): number {
  return JSON.stringify(ctx).length;
}

function cloneContext(dialect: SonioxStartContext): SonioxStartContext {
  return {
    ...(dialect.general ? { general: dialect.general.map((kv) => ({ ...kv })) } : {}),
    ...(dialect.text ? { text: dialect.text } : {}),
    ...(dialect.terms ? { terms: [...dialect.terms] } : {}),
    ...(dialect.translation_terms ? { translation_terms: dialect.translation_terms.map((t) => ({ ...t })) } : {}),
  };
}

function withHealthcareTopic(ctx: SonioxStartContext): void {
  if (!ctx.general) ctx.general = [];
  const domain = ctx.general.find((kv) => kv.key === "domain");
  if (domain) domain.value = "Healthcare interpretation";
  if (!ctx.general.some((kv) => kv.key === "topic")) {
    ctx.general.push({
      key: "topic",
      value: "Medical interpreting: hospitals, clinics, and common clinical terms",
    });
  }
}

function fits(ctx: SonioxStartContext): boolean {
  return contextChars(ctx) <= SONIOX_X_CONTEXT_SAFE_CHARS;
}

function isPriorityPairStart(term: GlossaryTerm): boolean {
  const src = term.source.trim();
  return (
    isRecognitionPin(src) ||
    /^(sonogram|ultrasound|mammogram|mammography|stroke)$/i.test(src)
  );
}

/** Latin/English-only strings. Putting these in `terms` locks STT onto English. */
export function isLatinOnlyRecognitionTerm(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  return /^[A-Za-z0-9&.,;:+/'()%°.\-\s]+$/.test(t);
}

function addPackPairs(
  ctx: SonioxStartContext,
  packTerms: GlossaryTerm[],
  seen: Set<string>,
  includedSources: Set<string>,
  userSources: Set<string>,
  predicate: (start: GlossaryTerm) => boolean,
): void {
  ctx.translation_terms = ctx.translation_terms ?? [];
  for (let i = 0; i < packTerms.length; i += 2) {
    const start = packTerms[i];
    if (!start || !predicate(start)) continue;
    const batch = packTerms
      .slice(i, i + 2)
      .filter((t) => !seen.has(`${t.source}->${t.target}`) && !userSources.has(t.source));
    if (batch.length === 0) continue;
    const before = ctx.translation_terms.length;
    ctx.translation_terms.push(...batch);
    if (!fits(ctx)) {
      ctx.translation_terms.length = before;
      break;
    }
    for (const t of batch) {
      seen.add(`${t.source}->${t.target}`);
      includedSources.add(t.source);
    }
  }
}

/** Dialect first, then user glossary (kept longest), then built-in pack; trim pack if over budget. */
export function mergeSonioxXInterpreterContext(args: {
  dialect: SonioxStartContext;
  packTerms: GlossaryTerm[];
  packPins: string[];
  packLines?: string[];
  userTerms: GlossaryTerm[];
}): SonioxStartContext {
  const ctx = cloneContext(args.dialect);
  if (args.packTerms.length > 0) withHealthcareTopic(ctx);

  ctx.translation_terms = [...(ctx.translation_terms ?? []), ...args.userTerms];
  if (!fits(ctx)) ctx.translation_terms = [...args.userTerms];

  const seen = new Set((ctx.translation_terms ?? []).map((t) => `${t.source}->${t.target}`));
  const includedSources = new Set((ctx.translation_terms ?? []).map((t) => t.source));
  const userSources = new Set(args.userTerms.map((t) => t.source));

  addPackPairs(ctx, args.packTerms, seen, includedSources, userSources, isPriorityPairStart);

  // Recognition `terms` stay in the pair's non-English script (dialect particles +
  // a short list of Arabic/Spanish/… pack sources). English MRI/CPR pins and
  // glossary `text` dumps make Soniox treat later Arabic as English. packPins /
  // packLines are ignored here on purpose. Cap pack terms so translation_terms
  // still fit.
  void args.packPins;
  void args.packLines;
  const MAX_NON_ENGLISH_PACK_TERMS = 48;
  const terms: string[] = [...(ctx.terms ?? [])].filter((t) => !isLatinOnlyRecognitionTerm(t));
  const seenTerm = new Set(terms.map((t) => t.toLowerCase()));
  let addedPackTerms = 0;
  for (const row of args.packTerms) {
    if (addedPackTerms >= MAX_NON_ENGLISH_PACK_TERMS) break;
    const src = row.source.trim();
    if (!src || isLatinOnlyRecognitionTerm(src)) continue;
    if (seenTerm.has(src.toLowerCase())) continue;
    seenTerm.add(src.toLowerCase());
    terms.push(src);
    ctx.terms = terms;
    if (!fits(ctx)) {
      terms.pop();
      break;
    }
    addedPackTerms += 1;
  }
  if (terms.length > 0) ctx.terms = terms;
  else delete ctx.terms;

  if (!ctx.text) delete ctx.text;

  addPackPairs(ctx, args.packTerms, seen, includedSources, userSources, (start) => !isPriorityPairStart(start));
  if (ctx.translation_terms && ctx.translation_terms.length === 0) delete ctx.translation_terms;

  return ctx;
}
