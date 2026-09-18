/**
 * Trial · Soniox X interpreter glossary.
 *
 * Official Soniox context (session start only):
 * https://soniox.com/docs/stt/concepts/context
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 *
 * English is the pivot. Each pair is `en-<lang>` with `{ "en", "<lang>" }`.
 * We emit both directions as translation_terms (highest-value first) and
 * remaining pairs as compact `text` glossary lines. Hard limit ~10,000 chars.
 */
import type { SonioxStartContext } from "./stable-dialect-context";
import pack from "./interpreter-glossary.json";
import { meaningLockPinPairs } from "./meaning-locks";

export const SONIOX_X_CONTEXT_SAFE_CHARS = 9_600;

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
 * Tiny auto-insurance / accident priority set — must stay small so medical + legal
 * still fit under the ~9.6k Soniox budget. Screenshot-critical claim language only.
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

/** English demonyms for interpreter handoff lines (same idea as chunk-v2 STT bias). */
const DEMONYM_BY_BASE: Record<string, string> = {
  ar: "Arabic",
  es: "Spanish",
  en: "English",
  fr: "French",
  de: "German",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  he: "Hebrew",
  fa: "Persian",
  so: "Somali",
  it: "Italian",
  nl: "Dutch",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
};

/**
 * Call-opening phrases Soniox X was missing (chunk-v2 has these). Without them,
 * STT latches onto "thank you for calling our…" / "UR3" instead of
 * "you're through to the … interpreter".
 *
 * Deliberately omit "thank you for calling…" terms — those pull Soniox toward
 * the wrong handoff line the user keeps seeing.
 */
export function buildInterpreterIntroTerms(langA: string, langB: string): string[] {
  const demonyms = [
    ...new Set(
      [langBase(langA), langBase(langB), "ar", "es"]
        .map((c) => DEMONYM_BY_BASE[c])
        .filter((d): d is string => Boolean(d)),
    ),
  ];
  const terms: string[] = [];
  for (const d of demonyms) {
    terms.push(
      `you're through to the ${d} interpreter`,
      `you are through to the ${d} interpreter`,
      `through to the ${d} interpreter`,
      `${d} interpreter`,
    );
  }
  terms.push(
    "you're through to the interpreter",
    "you are through to the interpreter",
    "you're through",
    "you are through",
    "interpreter",
  );
  return terms;
}

function withInterpreterCallFraming(ctx: SonioxStartContext, langA: string, langB: string): void {
  if (!ctx.general) ctx.general = [];
  const domain = ctx.general.find((kv) => kv.key === "domain");
  if (domain) {
    domain.value = "Telephone and video interpreting (including medical)";
  } else {
    ctx.general.unshift({
      key: "domain",
      value: "Telephone and video interpreting (including medical)",
    });
  }

  const opening = ctx.general.find((kv) => kv.key === "call_opening");
  const openingValue =
    "Handoff line: you're through to the [language] interpreter (or you are through). " +
    "Never write UR3 or thank you for calling our crew/team for that line. " +
    "Each utterance is independent — do not reuse a previous wrong transcript.";
  if (opening) opening.value = openingValue;
  else ctx.general.push({ key: "call_opening", value: openingValue });

  const intro = buildInterpreterIntroTerms(langA, langB);
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const t of [...intro, ...(ctx.terms ?? [])]) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    terms.push(t);
  }
  if (terms.length > 0) ctx.terms = terms;
}

function withHealthcareTopic(ctx: SonioxStartContext): void {
  if (!ctx.general) ctx.general = [];
  // Keep telephone-interpreting domain; only add clinical topic if missing.
  if (!ctx.general.some((kv) => kv.key === "topic")) {
    ctx.general.push({
      key: "topic",
      value:
        "Live interpreter call — introductions first; medical, legal, and auto-insurance terms when spoken",
    });
  }
}

function fits(ctx: SonioxStartContext, reserve = 0): boolean {
  return contextChars(ctx) <= SONIOX_X_CONTEXT_SAFE_CHARS - reserve;
}

/** Chars reserved so intro handoff terms still fit after the medical pack. */
const INTRO_CONTEXT_RESERVE = 500;

function isPriorityPairStart(term: GlossaryTerm): boolean {
  const src = term.source.trim();
  return (
    LEGAL_PRIORITY.has(src.toLowerCase()) ||
    AUTO_PRIORITY.has(src.toLowerCase()) ||
    isRecognitionPin(src) ||
    /^(sonogram|ultrasound|mammogram|mammography|stroke)$/i.test(src)
  );
}

function addPackPairs(
  ctx: SonioxStartContext,
  packTerms: GlossaryTerm[],
  seen: Set<string>,
  includedSources: Set<string>,
  userSources: Set<string>,
  predicate: (start: GlossaryTerm) => boolean,
  reserve = 0,
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
    if (!fits(ctx, reserve)) {
      // Skip this pair and keep trying — a longer term must not block shorter priority pins.
      ctx.translation_terms.length = before;
      continue;
    }
    for (const t of batch) {
      seen.add(`${t.source}->${t.target}`);
      includedSources.add(t.source);
    }
  }
}

/** Dialect first, then medical pack (with reserve), then interpreter intro handoff bias. */
export function mergeSonioxXInterpreterContext(args: {
  dialect: SonioxStartContext;
  packTerms: GlossaryTerm[];
  packPins: string[];
  packLines?: string[];
  userTerms: GlossaryTerm[];
  langA: string;
  langB: string;
}): SonioxStartContext {
  const ctx = cloneContext(args.dialect);
  if (args.packTerms.length > 0) withHealthcareTopic(ctx);

  ctx.translation_terms = [...(ctx.translation_terms ?? []), ...args.userTerms];
  if (!fits(ctx, INTRO_CONTEXT_RESERVE)) ctx.translation_terms = [...args.userTerms];

  const seen = new Set((ctx.translation_terms ?? []).map((t) => `${t.source}->${t.target}`));
  const includedSources = new Set((ctx.translation_terms ?? []).map((t) => t.source));
  const userSources = new Set(args.userTerms.map((t) => t.source));

  addPackPairs(
    ctx,
    args.packTerms,
    seen,
    includedSources,
    userSources,
    isPriorityPairStart,
    INTRO_CONTEXT_RESERVE,
  );

  const terms: string[] = [...(ctx.terms ?? [])];
  const seenTerm = new Set(terms.map((t) => t.toLowerCase()));
  for (const pin of args.packPins) {
    if (!includedSources.has(pin) && !isRecognitionPin(pin)) continue;
    if (seenTerm.has(pin.toLowerCase())) continue;
    seenTerm.add(pin.toLowerCase());
    terms.push(pin);
    ctx.terms = terms;
    if (!fits(ctx, INTRO_CONTEXT_RESERVE)) {
      terms.pop();
      break;
    }
  }
  if (terms.length > 0) ctx.terms = terms;
  else delete ctx.terms;

  const baseText = ctx.text ?? "";
  const header =
    "Bidirectional medical glossary (either side is source). Use the paired wording only; never keep the English word in the non-English translation.";
  const extra: string[] = [];
  for (const line of args.packLines ?? []) {
    const en = line.split("=")[0] ?? "";
    if (!en || includedSources.has(en)) continue;
    const lead = /^([A-Z]{2,8}|D&C)\s+/.exec(en);
    if (lead && includedSources.has(lead[1])) continue;
    extra.push(line);
    ctx.text = [baseText, header, extra.join("\n")].filter(Boolean).join("\n");
    if (!fits(ctx, INTRO_CONTEXT_RESERVE)) {
      extra.pop();
      ctx.text = extra.length > 0 ? [baseText, header, extra.join("\n")].filter(Boolean).join("\n") : baseText || undefined;
      break;
    }
  }
  if (!ctx.text) delete ctx.text;

  addPackPairs(
    ctx,
    args.packTerms,
    seen,
    includedSources,
    userSources,
    (start) => !isPriorityPairStart(start),
    INTRO_CONTEXT_RESERVE,
  );

  // Intro handoff bias last so medical pack keeps its slot — still prepended in terms.
  withInterpreterCallFraming(ctx, args.langA, args.langB);
  const protectedSources = new Set(
    [
      ...LEGAL_PRIORITY,
      ...AUTO_PRIORITY,
      "sonogram",
      "ultrasound",
      "mammogram",
      "mammography",
      "stroke",
      "cpr",
      "mri",
      "ecg",
      "iud",
    ],
  );
  while (!fits(ctx) && (ctx.translation_terms?.length ?? 0) > args.userTerms.length) {
    const terms = ctx.translation_terms!;
    let idx = terms.length - 1;
    while (idx >= 0 && protectedSources.has(terms[idx]!.source.trim().toLowerCase())) {
      idx -= 1;
    }
    if (idx < 0) break;
    terms.splice(idx, 1);
  }
  while (!fits(ctx) && (ctx.terms?.length ?? 0) > buildInterpreterIntroTerms(args.langA, args.langB).length) {
    ctx.terms!.pop();
  }

  if (ctx.translation_terms && ctx.translation_terms.length === 0) delete ctx.translation_terms;

  return ctx;
}
