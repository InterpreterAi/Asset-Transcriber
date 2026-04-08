import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";
import {
  INTERPRETER_GLOSSARY_LANG_CODES,
  type InterpreterGlossaryLangCode,
} from "./interpreter-glossary.langs.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export type ProtectedTermFileEntry = {
  translations: Partial<Record<InterpreterGlossaryLangCode, string>>;
};

export type ProtectedTermsJsonFile = Record<string, ProtectedTermFileEntry>;

type NormalizedEntry = {
  canonicalKey: string;
  translations: Record<InterpreterGlossaryLangCode, string>;
};

type PhraseMatcher = {
  re: RegExp;
  entryIndex: number;
  quickLatinLower?: string;
};

let loaded = false;
let loadError: Error | null = null;
let phraseMatchers: PhraseMatcher[] = [];
let entries: NormalizedEntry[] = [];
let entryCount = 0;
let phraseSurfaceCount = 0;

function resolveProtectedTermsDataDir(): string {
  const candidates = [
    path.join(MODULE_DIR, "data"),
    path.join(MODULE_DIR, "..", "data"),
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "artifacts", "api-server", "data"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "protected_terms.json"))) return dir;
    } catch {
      /* ignore */
    }
  }
  return path.join(MODULE_DIR, "data");
}

function materializeTranslations(
  canonicalKey: string,
  raw: Partial<Record<InterpreterGlossaryLangCode, string>>,
): Record<InterpreterGlossaryLangCode, string> {
  const en = raw.en?.trim() || canonicalKey;
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

function loadAndIndex(): void {
  const dataDir = resolveProtectedTermsDataDir();
  const fp = path.join(dataDir, "protected_terms.json");
  entries = [];
  const phraseRows: { surface: string; entryIndex: number }[] = [];

  if (!fs.existsSync(fp)) {
    logger.warn({ fp }, "protected_terms.json missing — protected-term masking disabled");
    entries = [];
    phraseMatchers = [];
    entryCount = 0;
    phraseSurfaceCount = 0;
    loaded = true;
    return;
  }

  let raw: ProtectedTermsJsonFile;
  try {
    raw = JSON.parse(fs.readFileSync(fp, "utf8")) as ProtectedTermsJsonFile;
  } catch (e) {
    logger.error({ err: e, fp }, "Failed to parse protected_terms.json");
    entries = [];
    phraseMatchers = [];
    entryCount = 0;
    phraseSurfaceCount = 0;
    loaded = true;
    return;
  }

  for (const [canonicalKey, row] of Object.entries(raw)) {
    if (!row?.translations || typeof row.translations !== "object") continue;
    const translations = materializeTranslations(canonicalKey, row.translations);
    const entryIndex = entries.length;
    entries.push({ canonicalKey, translations });

    const seenSurfaces = new Set<string>();
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
    "Protected terms loaded (in-memory)",
  );
}

export function initProtectedTerms(): void {
  if (loaded) return;
  try {
    loadAndIndex();
  } catch (e) {
    loadError = e instanceof Error ? e : new Error(String(e));
    logger.error({ err: loadError }, "Protected terms failed to load");
    loaded = true;
    phraseMatchers = [];
    entries = [];
  }
}

export type ProtectedMaskResult = {
  masked: string;
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
        start: m.index,
        end: m.index + m[0].length,
        entryIndex,
      });
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));

  const picked: Hit[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    picked.push(h);
    cursor = h.end;
  }
  return picked;
}

function pickTranslationForLang(entry: NormalizedEntry, lang: string): string {
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

export function applyProtectedTermPlaceholders(text: string): ProtectedMaskResult {
  initProtectedTerms();
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
    out += `PROT_${n}`;
    slotToEntryIndex.set(n, h.entryIndex);
    pos = h.end;
  }
  out += text.slice(pos);

  return { masked: out, slotToEntryIndex, hadPlaceholders: true };
}

export function restoreProtectedTermPlaceholders(
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
    const re = new RegExp(`PROT_${slot}(?!\\d)`, "g");
    out = out.replace(re, () => replacement);
  }
  return out;
}

export function protectedPlaceholderPromptRule(maxSlot: number): string {
  if (maxSlot <= 0) return "";
  return (
    `PROTECTED NAME PLACEHOLDERS:\n` +
    `- The user message may contain PROT_1, PROT_2, … (up to PROT_${maxSlot}).\n` +
    `- Each marks a fixed brand, program, or organization name.\n` +
    `- Copy each PROT_n token EXACTLY once in the same position — do not translate, expand, rephrase, or remove it.\n` +
    `- Do not add spaces inside the token (e.g. keep PROT_1, not PROT_ 1).\n\n`
  );
}
