import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";
import {
  INTERPRETER_GLOSSARY_LANG_CODES,
  type InterpreterGlossaryLangCode,
} from "./interpreter-glossary.langs.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export type GlossaryCategory = "medical" | "legal" | "immigration" | "insurance";

/**
 * Glossary rows are English-led: `translations.en` is the canonical English
 * rendering (spell-out for acronyms). The JSON object key is often a short
 * spoken form (e.g. DHS). At load, every code in INTERPRETER_GLOSSARY_LANG_CODES
 * gets a string — explicit per-language values in JSON, else fallback to `en`.
 * Restore uses the session target language so placeholders become Arabic, French,
 * etc., not the source acronym.
 */
export type GlossaryFileEntry = {
  category: GlossaryCategory;
  translations: Partial<Record<InterpreterGlossaryLangCode, string>>;
};

/** Raw JSON shape per file: canonical key → entry */
export type GlossaryJsonFile = Record<string, GlossaryFileEntry>;

type NormalizedEntry = {
  canonicalKey: string;
  category: GlossaryCategory;
  translations: Record<InterpreterGlossaryLangCode, string>;
};

type PhraseMatcher = {
  re: RegExp;
  entryIndex: number;
  /** Lowercase ASCII surface — skip regex when absent from transcript (Latin source fast path). */
  quickLatinLower?: string;
};

let loaded = false;
let loadError: Error | null = null;
let phraseMatchers: PhraseMatcher[] = [];
let entries: NormalizedEntry[] = [];
let entryCount = 0;
let phraseSurfaceCount = 0;

function resolveGlossaryDataDir(): string {
  const candidates = [
    path.join(MODULE_DIR, "data"),
    path.join(MODULE_DIR, "..", "data"),
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "artifacts", "api-server", "data"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "glossary_medical.json"))) return dir;
    } catch {
      /* ignore */
    }
  }
  return path.join(MODULE_DIR, "data");
}

/** Skip “translation equals English” warnings for short all-caps glosses (often proper nouns / acronyms). */
function isLikelyAcronymOrSymbolEnglishGloss(en: string): boolean {
  const core = en.replace(/[^A-Za-z0-9]/g, "");
  if (core.length <= 1) return true;
  if (core.length <= 12 && core === core.toUpperCase()) return true;
  return false;
}

const MAX_GLOSSARY_GAP_LOG_SAMPLES = 12;

type RawTranslationGap = {
  missingLangs: InterpreterGlossaryLangCode[];
  equalsEnglishLangs: InterpreterGlossaryLangCode[];
};

/** Detect JSON gaps before English fallback materialization (load-time validation). */
export function rawTranslationGapsForEntry(
  canonicalKey: string,
  raw: Partial<Record<InterpreterGlossaryLangCode, string>>,
): RawTranslationGap {
  const en = raw.en?.trim() || canonicalKey.trim();
  const missingLangs: InterpreterGlossaryLangCode[] = [];
  const equalsEnglishLangs: InterpreterGlossaryLangCode[] = [];
  for (const code of INTERPRETER_GLOSSARY_LANG_CODES) {
    if (code === "en") continue;
    const v = raw[code]?.trim();
    if (!v) {
      missingLangs.push(code);
      continue;
    }
    if (v.toLowerCase() === en.toLowerCase() && !isLikelyAcronymOrSymbolEnglishGloss(en)) {
      equalsEnglishLangs.push(code);
    }
  }
  return { missingLangs, equalsEnglishLangs };
}

/** Ensures every workspace language has a restore string; defaults to canonical English. */
function materializeTranslations(
  canonicalKey: string,
  raw: Partial<Record<InterpreterGlossaryLangCode, string>>,
): Record<InterpreterGlossaryLangCode, string> {
  const en = raw.en?.trim() || canonicalKey.trim();
  const out = {} as Record<InterpreterGlossaryLangCode, string>;
  for (const code of INTERPRETER_GLOSSARY_LANG_CODES) {
    const v = raw[code]?.trim();
    out[code] = v && v.length > 0 ? v : en;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePatternRegex(phrase: string): RegExp {
  const esc = escapeRegExp(phrase.trim());
  return new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, "giu");
}

const GLOSSARY_FILES = [
  "glossary_medical.json",
  "glossary_legal.json",
  "glossary_immigration.json",
  "glossary_insurance.json",
] as const;

function loadAndIndex(): void {
  const dataDir = resolveGlossaryDataDir();
  entries = [];
  const phraseRows: { surface: string; entryIndex: number }[] = [];

  for (const fname of GLOSSARY_FILES) {
    const fp = path.join(dataDir, fname);
    if (!fs.existsSync(fp)) {
      logger.warn({ fp }, "Interpreter glossary file missing — skipping");
      continue;
    }
    let raw: GlossaryJsonFile;
    try {
      raw = JSON.parse(fs.readFileSync(fp, "utf8")) as GlossaryJsonFile;
    } catch (e) {
      logger.error({ err: e, fp }, "Failed to parse glossary JSON");
      continue;
    }

    let fileMissingCells = 0;
    let fileEqualsEnCells = 0;
    let fileEntriesWithAnyGap = 0;
    const gapLogSamples: Array<{
      canonicalKey: string;
      missingLangs: InterpreterGlossaryLangCode[];
      equalsEnglishLangs: InterpreterGlossaryLangCode[];
    }> = [];

    for (const [canonicalKey, row] of Object.entries(raw)) {
      if (!row?.translations || typeof row.translations !== "object") continue;
      const category = row.category;
      if (
        category !== "medical" &&
        category !== "legal" &&
        category !== "immigration" &&
        category !== "insurance"
      ) {
        continue;
      }
      const { missingLangs, equalsEnglishLangs } = rawTranslationGapsForEntry(canonicalKey, row.translations);
      if (missingLangs.length > 0 || equalsEnglishLangs.length > 0) {
        fileEntriesWithAnyGap += 1;
        fileMissingCells += missingLangs.length;
        fileEqualsEnCells += equalsEnglishLangs.length;
        if (gapLogSamples.length < MAX_GLOSSARY_GAP_LOG_SAMPLES) {
          gapLogSamples.push({ canonicalKey, missingLangs, equalsEnglishLangs });
        }
      }
      const translations = materializeTranslations(canonicalKey, row.translations);
      const entryIndex = entries.length;
      entries.push({ canonicalKey, category, translations });

      const seenSurfaces = new Set<string>();
      // Match spoken/typed shorthand (e.g. "MRI", "SSI") even when English gloss is spelled out.
      const keyTrim = canonicalKey.trim();
      if (keyTrim.length >= 2) {
        seenSurfaces.add(keyTrim.toLowerCase());
        phraseRows.push({ surface: keyTrim, entryIndex });
      }
      for (const surface of Object.values(translations)) {
        const t = surface.trim();
        if (t.length < 2) continue;
        const dedupe = t.toLowerCase();
        if (seenSurfaces.has(dedupe)) continue;
        seenSurfaces.add(dedupe);
        phraseRows.push({ surface: t, entryIndex });
      }
    }

    const gapCells = fileMissingCells + fileEqualsEnCells;
    if (gapCells > 0) {
      logger.warn(
        {
          msg: "interpreter_glossary_incomplete_translations",
          file: fname,
          path: fp,
          entriesWithGap: fileEntriesWithAnyGap,
          totalCategoryEntries: Object.keys(raw).length,
          missingLanguageCells: fileMissingCells,
          equalsEnglishCells: fileEqualsEnCells,
          samples: gapLogSamples,
        },
        "Interpreter glossary: non-English targets may receive English on TERM_* restore unless each language is populated in JSON",
      );
    }
  }

  phraseRows.sort((a, b) => b.surface.length - a.surface.length);

  phraseMatchers = [];
  for (const { surface, entryIndex } of phraseRows) {
    try {
      const re = phrasePatternRegex(surface);
      const quick =
        /^[\s0-9A-Za-z\-'./]+$/.test(surface) ? surface.trim().toLowerCase() : undefined;
      phraseMatchers.push({ re, entryIndex, quickLatinLower: quick });
    } catch {
      /* skip invalid */
    }
  }

  entryCount = entries.length;
  phraseSurfaceCount = phraseRows.length;
  loaded = true;
  logger.info(
    { dataDir, entryCount, phraseSurfaceCount },
    "Interpreter glossary loaded (in-memory)",
  );
}

/** Read JSON once at process startup — all lookups are in-memory. */
export function initInterpreterGlossaries(): void {
  if (loaded) return;
  try {
    loadAndIndex();
  } catch (e) {
    loadError = e instanceof Error ? e : new Error(String(e));
    logger.error({ err: loadError }, "Interpreter glossary failed to load");
    loaded = true;
    phraseMatchers = [];
    entries = [];
  }
}

export function getInterpreterGlossaryStats(): {
  ok: boolean;
  entryCount: number;
  phraseSurfaceCount: number;
  error: string | null;
} {
  return {
    ok:    !loadError && entryCount > 0,
    entryCount,
    phraseSurfaceCount,
    error: loadError?.message ?? null,
  };
}

export type GlossaryMaskResult = {
  masked: string;
  /** Maps TERM_n slot → glossary entry index */
  slotToEntryIndex: Map<number, number>;
  hadPlaceholders: boolean;
};

type Hit = { start: number; end: number; entryIndex: number };

function pickNonOverlappingMatches(text: string, matchers: PhraseMatcher[]): Hit[] {
  const hits: Hit[] = [];
  const lowered = text.toLowerCase();

  for (const { re, entryIndex, quickLatinLower } of matchers) {
    if (quickLatinLower && !lowered.includes(quickLatinLower)) continue;
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      if (m[0].length === 0) {
        r.lastIndex++;
        continue;
      }
      hits.push({
        start:       m.index,
        end:         m.index + m[0].length,
        entryIndex,
      });
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const picked: Hit[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    picked.push(h);
    cursor = h.end;
  }
  return picked;
}

export function pickTranslationForLang(
  entry: NormalizedEntry,
  lang: string,
): string {
  const full = lang as InterpreterGlossaryLangCode;
  if (INTERPRETER_GLOSSARY_LANG_CODES.includes(full)) {
    const t = entry.translations[full];
    if (t) return t;
  }
  const base = lang.split("-")[0]!.toLowerCase() as InterpreterGlossaryLangCode;
  if (INTERPRETER_GLOSSARY_LANG_CODES.includes(base)) {
    const t = entry.translations[base];
    if (t) return t;
  }
  return entry.translations.en;
}

/**
 * Replace glossary surfaces with TERM_1, TERM_2, … (left-to-right, non-overlapping, longest phrases win).
 */
export function applyGlossaryPlaceholders(text: string): GlossaryMaskResult {
  initInterpreterGlossaries();
  if (!text || entries.length === 0) {
    return { masked: text, slotToEntryIndex: new Map(), hadPlaceholders: false };
  }

  const picked = pickNonOverlappingMatches(text, phraseMatchers);
  if (picked.length === 0) {
    return { masked: text, slotToEntryIndex: new Map(), hadPlaceholders: false };
  }

  const slotToEntryIndex = new Map<number, number>();
  let slot = 1;
  let out = "";
  let pos = 0;

  for (const h of picked) {
    out += text.slice(pos, h.start);
    const n = slot++;
    out += `TERM_${n}`;
    slotToEntryIndex.set(n, h.entryIndex);
    pos = h.end;
  }
  out += text.slice(pos);

  return { masked: out, slotToEntryIndex, hadPlaceholders: true };
}

/**
 * Substitute TERM_n in model output with the correct target-language glossary string.
 * Replaces from highest n downward so TERM_10 is not confused with TERM_1.
 */
export function restoreGlossaryPlaceholders(
  translated: string,
  slotToEntryIndex: Map<number, number>,
  tgtLang: string,
): string {
  if (!translated || slotToEntryIndex.size === 0) return translated;

  const slots = [...slotToEntryIndex.entries()].sort((a, b) => b[0] - a[0]);
  let out = translated;
  for (const [slot, entryIdx] of slots) {
    const entry = entries[entryIdx];
    if (!entry) continue;
    const replacement = pickTranslationForLang(entry, tgtLang);
    const re = new RegExp(`TERM_${slot}(?!\\d)`, "g");
    out = out.replace(re, () => replacement);
  }
  return out;
}

/** System prompt fragment: model must keep TERM_n tokens verbatim when present. */
export function glossaryPlaceholderPromptRule(slotCount: number): string {
  if (slotCount <= 0) return "";
  return (
    `GLOSSARY PLACEHOLDERS:\n` +
    `- The user message may contain tokens TERM_1, TERM_2, … (up to TERM_${slotCount}).\n` +
    `- Copy each token EXACTLY once in the same position in your translation — do not translate, expand, or remove them.\n` +
    `- Do not output the source acronym or your own expansion in place of a token; the server replaces each TERM_n with the correct target-language official form after translation.\n` +
    `- Do not add spaces inside the token (e.g. keep TERM_1, not TERM_ 1).\n\n`
  );
}
