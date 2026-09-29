/**
 * Trial · Soniox X interpreter glossary.
 *
 * Official Soniox context (session start only):
 * https://soniox.com/docs/stt/concepts/context
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 *
 * English is the pivot. Each pair is `en-<lang>` with `{ "en", "<lang>" }`.
 * Soniox receives only a small core slice as translation_terms (user glossary
 * first, then a fixed medical/legal/insurance core, then everyday call words for
 * pairs that have a curated list). The full pack is applied
 * on screen by `displayPinPairs`. Large English glossary dumps in `text`/`terms`
 * pull live language detection onto English, so none are sent.
 */
import type { SonioxStartContext } from "./stable-dialect-context";
import pack from "./interpreter-glossary.json";
import { meaningLockPinPairs } from "./meaning-locks";

/** Soniox hard limit is ~10,000 chars; only a very large personal glossary can approach it. */
export const SONIOX_X_CONTEXT_SAFE_CHARS = 9_600;
/** Budget for everything except the personal glossary, which is never trimmed for budget. */
export const SONIOX_X_CONTEXT_TARGET_CHARS = 4_000;
/** Max shared-pack pairs (each sent both directions). */
export const SONIOX_X_MAX_PACK_PAIRS = 30;
/** Budget ceiling once everyday call words are added (EN↔AR only). */
export const SONIOX_X_COMMON_CONTEXT_CHARS = 7_000;

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

/** Highest-priority legal pins — kept small so medical abbreviations still fit. */
const LEGAL_PRIORITY = new Set(
  [
    "immigration status",
    "felony",
    "misdemeanor",
    "pro bono",
    "attorney",
    "lawyer",
    "asylum",
    "deportation",
    "green card",
    "visa",
    "restraining order",
    "power of attorney",
    "public defender",
    "legal aid",
  ].map((w) => w.toLowerCase()),
);

const LEGAL_SINGLE = new Set(
  [
    ...LEGAL_PRIORITY,
    "naturalization",
    "immigration court",
    "court",
    "judge",
    "hearing",
    "trial",
    "bail",
    "warrant",
    "subpoena",
    "affidavit",
    "guilty",
    "not guilty",
    "sentence",
    "probation",
    "parole",
    "plaintiff",
    "defendant",
    "witness",
    "testimony",
    "evidence",
    "charges",
    "indictment",
    "conviction",
    "appeal",
    "lawsuit",
    "settlement",
    "divorce",
    "notary",
    "client",
    "confidentiality",
    "arrest",
    "prosecutor",
    "legal office",
    "consulate",
    "passport",
    "undocumented",
  ].map((w) => w.toLowerCase()),
);

/**
 * Tiny auto-insurance / accident priority set used to order the on-screen pin list.
 * Screenshot-critical claim language only.
 */
const AUTO_PRIORITY = new Set(
  [
    "car insurance",
    "car accident",
    "insurance claim",
    "hit and run",
    "police report",
    "deductible",
    "at fault",
    "policy number",
  ].map((w) => w.toLowerCase()),
);

/** Absolute must-keep auto pins (tests + OPI claim intake). Packed before other auto. */
const AUTO_CRITICAL = new Set(
  ["car insurance", "car accident", "insurance claim"].map((w) => w.toLowerCase()),
);

const AUTO_SINGLE = new Set(
  [
    ...AUTO_PRIORITY,
    "auto insurance",
    "claim number",
    "traffic accident",
    "not at fault",
    "total loss",
    "liability insurance",
    "collision coverage",
    "comprehensive coverage",
    "premium",
    "liability",
    "collision",
    "rear-end collision",
    "fender bender",
    "accident report",
    "tow truck",
    "roadside assistance",
    "rental car",
    "body shop",
    "repair shop",
    "totaled",
    "estimate",
    "adjuster",
    "insurance adjuster",
    "license plate",
    "driver's license",
    "registration",
    "vin",
    "airbag",
    "seat belt",
    "whiplash",
    "bodily injury",
    "property damage",
    "uninsured motorist",
    "underinsured motorist",
    "no-fault insurance",
    "glass coverage",
    "windshield",
    "bumper",
    "tire",
    "engine",
    "transmission",
    "brake",
    "speed limit",
    "traffic ticket",
    "dui",
    "dmv",
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
  if (RECOGNITION_ABBR.test(t) || /^[A-Z]{3,8}$/.test(t)) return 130;
  if (/^(sonogram|ultrasound|mammogram|mammography|stroke)$/i.test(t)) return 125;
  // Pack claim-intake auto pins ahead of broader legal so "Car insurance" survives budget.
  if (AUTO_CRITICAL.has(t.toLowerCase())) return 119;
  if (LEGAL_PRIORITY.has(t.toLowerCase())) return 118;
  if (AUTO_PRIORITY.has(t.toLowerCase())) return 116;
  if (LEGAL_SINGLE.has(t.toLowerCase())) return 95;
  if (AUTO_SINGLE.has(t.toLowerCase())) return 93;
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
  const locks = meaningLockPinPairs(langA, langB);
  const out: GlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const t of [...user, ...locks, ...pack]) {
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

function fits(ctx: SonioxStartContext, limit: number): boolean {
  return contextChars(ctx) <= limit;
}

/**
 * Core shared-pack slice sent to Soniox, interleaved medical / legal / insurance so
 * the budget trims every domain evenly. Matched case-insensitively on the English side.
 */
const CORE_PACK_ORDER = [
  "CPR",
  "MRI",
  "ER",
  "sonogram",
  "stroke",
  "immigration status",
  "felony",
  "pro bono",
  "attorney",
  "car insurance",
  "car accident",
  "insurance claim",
  "CT",
  "ECG",
  "IUD",
  "asylum",
  "deportation",
  "police report",
  "deductible",
  "EEG",
  "CBC",
  "ultrasound",
  "mammogram",
  "misdemeanor",
  "green card",
  "restraining order",
  "at fault",
  "policy number",
  "DUI",
  "DMV",
  "power of attorney",
  "VIN",
].map((w) => w.toLowerCase());

/**
 * Everyday medical / dental / legal call words that the pack does not cover,
 * English → فصحى. Sent to Soniox only (English → Arabic), never pinned on screen,
 * so they cannot clash with pack pins.
 */
const COMMON_CALL_TERMS: Readonly<Record<string, readonly GlossaryTerm[]>> = {
  ar: [
    { source: "cavities", target: "تسوس الأسنان" },
    { source: "cavity", target: "تسوس في السن" },
    { source: "floss", target: "خيط الأسنان" },
    { source: "flossing", target: "استخدام خيط الأسنان" },
    { source: "toothbrush", target: "فرشاة الأسنان" },
    { source: "toothpaste", target: "معجون الأسنان" },
    { source: "dentist", target: "طبيب الأسنان" },
    { source: "gums", target: "اللثة" },
    { source: "fluoride", target: "الفلورايد" },
    { source: "candy", target: "الحلوى" },
    { source: "sweets", target: "الحلويات" },
    { source: "appointment", target: "موعد" },
    { source: "follow-up appointment", target: "موعد المتابعة" },
    { source: "pharmacy", target: "الصيدلية" },
    { source: "side effects", target: "الآثار الجانبية" },
    { source: "referral", target: "إحالة" },
    { source: "specialist", target: "طبيب مختص" },
    { source: "pediatrician", target: "طبيب الأطفال" },
    { source: "primary care doctor", target: "طبيب الرعاية الأولية" },
    { source: "urgent care", target: "مركز الرعاية العاجلة" },
    { source: "vaccine", target: "لقاح" },
    { source: "vaccines", target: "اللقاحات" },
    { source: "blood sugar", target: "نسبة السكر في الدم" },
    { source: "nausea", target: "غثيان" },
    { source: "vomiting", target: "تقيؤ" },
    { source: "swelling", target: "تورم" },
    { source: "constipation", target: "إمساك" },
    { source: "pregnant", target: "حامل" },
    { source: "pregnancy", target: "الحمل" },
    { source: "dose", target: "جرعة" },
    { source: "over the counter", target: "دون وصفة طبية" },
    { source: "ointment", target: "مرهم" },
    { source: "x-ray", target: "أشعة سينية" },
    { source: "lab results", target: "نتائج التحاليل" },
    { source: "chest pain", target: "ألم في الصدر" },
    { source: "urine sample", target: "عينة بول" },
    { source: "stool sample", target: "عينة براز" },
    { source: "court date", target: "موعد الجلسة" },
    { source: "lease", target: "عقد الإيجار" },
    { source: "landlord", target: "مالك العقار" },
    { source: "eviction", target: "الإخلاء" },
    { source: "signature", target: "التوقيع" },
    { source: "consent form", target: "نموذج الموافقة" },
    { source: "date of birth", target: "تاريخ الميلاد" },
    { source: "social security number", target: "رقم الضمان الاجتماعي" },
    { source: "case number", target: "رقم القضية" },
    { source: "insurance card", target: "بطاقة التأمين" },
    { source: "copay", target: "الدفعة المشتركة" },
    { source: "Medicaid", target: "ميديكيد" },
    { source: "Medicare", target: "ميديكير" },
  ],
};

/** Everyday call words for an English pair; empty for pairs without a curated list. */
export function commonCallTermsForPair(langA: string, langB: string): readonly GlossaryTerm[] {
  const key = englishPivotPairKey(langA, langB);
  const other = key ? otherLangFromPairKey(key) : null;
  return (other && COMMON_CALL_TERMS[other]) || [];
}

/** `[en→tgt, tgt→en]` batches from the pack, in CORE_PACK_ORDER. */
function corePackBatches(packTerms: readonly GlossaryTerm[]): GlossaryTerm[][] {
  const byEnglish = new Map<string, number>();
  for (let i = 0; i + 1 < packTerms.length; i += 2) {
    const k = packTerms[i]!.source.trim().toLowerCase();
    if (!byEnglish.has(k)) byEnglish.set(k, i);
  }
  const batches: GlossaryTerm[][] = [];
  for (const en of CORE_PACK_ORDER) {
    const i = byEnglish.get(en);
    if (i === undefined) continue;
    batches.push([packTerms[i]!, packTerms[i + 1]!]);
  }
  return batches;
}

/**
 * Short pair context + translation_terms: personal glossary first (never trimmed for
 * budget), then standard-phrase pins, then the core pack slice, then everyday call
 * words. A source is sent once, so Soniox never sees two targets for the same wording.
 */
export function mergeSonioxXInterpreterContext(args: {
  dialect: SonioxStartContext;
  packTerms: GlossaryTerm[];
  userTerms: GlossaryTerm[];
  langA: string;
  langB: string;
}): SonioxStartContext {
  const ctx = cloneContext(args.dialect);
  const phraseTerms = ctx.translation_terms ?? [];
  const out: GlossaryTerm[] = [];
  const sources = new Set<string>();
  ctx.translation_terms = out;

  const tryAdd = (batch: readonly GlossaryTerm[], limit: number): boolean => {
    const fresh: GlossaryTerm[] = [];
    const batchSources = new Set<string>();
    for (const t of batch) {
      const k = t.source.trim().toLowerCase();
      if (!k || !t.target.trim() || sources.has(k) || batchSources.has(k)) continue;
      batchSources.add(k);
      fresh.push(t);
    }
    if (fresh.length === 0) return false;
    out.push(...fresh);
    if (!fits(ctx, limit)) {
      out.length -= fresh.length;
      return false;
    }
    for (const t of fresh) sources.add(t.source.trim().toLowerCase());
    return true;
  };

  for (const t of args.userTerms) tryAdd([t], SONIOX_X_CONTEXT_SAFE_CHARS);
  for (const t of phraseTerms) tryAdd([t], SONIOX_X_CONTEXT_TARGET_CHARS);
  let packPairs = 0;
  for (const batch of corePackBatches(args.packTerms)) {
    if (packPairs >= SONIOX_X_MAX_PACK_PAIRS) break;
    if (tryAdd(batch, SONIOX_X_CONTEXT_TARGET_CHARS)) packPairs += 1;
  }
  for (const t of commonCallTermsForPair(args.langA, args.langB)) {
    tryAdd([t], SONIOX_X_COMMON_CONTEXT_CHARS);
  }

  if (out.length === 0) delete ctx.translation_terms;
  return ctx;
}
