/**
 * Display-only number cleanup for Soniox X Original / Translation text.
 * - Spelled cardinals (EN / ES) → digits
 * - Phone-like digit runs: strip spaces and commas so the number can be copied & dialed
 *
 * Does not rewrite non-numeric wording.
 */

const EN_ONES: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const EN_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const EN_SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  million: 1_000_000,
};

const ES_ONES: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
};

const ES_TENS: Record<string, number> = {
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const ES_VEINTI: Record<string, number> = {
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintiún: 21,
  veintidos: 22,
  veintidós: 22,
  veintitres: 23,
  veintitrés: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintiséis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const ES_HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

function langBase(code: string | undefined): string {
  return (code ?? "").split("-")[0]?.toLowerCase() ?? "";
}

function normalizeToken(raw: string): string {
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’']/g, "");
}

/** Phone-like digit runs (7–15 digits) with spaces/commas → contiguous digits. */
export function collapsePhoneSeparators(text: string): string {
  if (!text) return text;
  return text.replace(/\d+(?:[\s,]+\d+){1,}/g, (match) => {
    const groups = match.trim().split(/[\s,]+/).filter(Boolean);
    if (groups.length < 2) return match;
    // Leave year lists alone: "2020, 2021" / "2020 2021"
    if (groups.every((g) => /^\d{4}$/.test(g))) return match;
    const digits = groups.join("");
    if (!/^\d+$/.test(digits)) return match;
    if (digits.length < 7 || digits.length > 15) return match;
    return digits;
  });
}

type WordNumLang = "en" | "es";

function isEnNumberWord(tok: string): boolean {
  const t = normalizeToken(tok);
  if (t === "and") return true;
  return t in EN_ONES || t in EN_TENS || t in EN_SCALES;
}

function isEsNumberWord(tok: string): boolean {
  const t = normalizeToken(tok);
  if (t === "y") return true;
  return (
    t in ES_ONES ||
    t in ES_TENS ||
    t in ES_VEINTI ||
    t in ES_HUNDREDS ||
    t === "mil" ||
    t === "millon" ||
    t === "millón" ||
    t === "millones"
  );
}

function parseEnValue(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let saw = false;
  for (const raw of words) {
    const w = normalizeToken(raw);
    if (w === "and") continue;
    if (w in EN_ONES) {
      current += EN_ONES[w]!;
      saw = true;
      continue;
    }
    if (w in EN_TENS) {
      current += EN_TENS[w]!;
      saw = true;
      continue;
    }
    if (w === "hundred") {
      current = (current || 1) * 100;
      saw = true;
      continue;
    }
    if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      saw = true;
      continue;
    }
    if (w === "million") {
      total += (current || 1) * 1_000_000;
      current = 0;
      saw = true;
      continue;
    }
    return null;
  }
  if (!saw) return null;
  return total + current;
}

function parseEsValue(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let saw = false;
  for (const raw of words) {
    const w = normalizeToken(raw);
    if (w === "y") continue;
    if (w in ES_VEINTI) {
      current += ES_VEINTI[w]!;
      saw = true;
      continue;
    }
    if (w in ES_ONES) {
      current += ES_ONES[w]!;
      saw = true;
      continue;
    }
    if (w in ES_TENS) {
      current += ES_TENS[w]!;
      saw = true;
      continue;
    }
    if (w in ES_HUNDREDS) {
      current += ES_HUNDREDS[w]!;
      saw = true;
      continue;
    }
    if (w === "mil") {
      total += (current || 1) * 1000;
      current = 0;
      saw = true;
      continue;
    }
    if (w === "millon" || w === "millón" || w === "millones") {
      total += (current || 1) * 1_000_000;
      current = 0;
      saw = true;
      continue;
    }
    return null;
  }
  if (!saw) return null;
  return total + current;
}

/**
 * Split keeping separators so we can rebuild the string.
 * Tokens are either whitespace runs, punctuation runs, or word/digit chunks.
 */
function tokenizeForNumbers(text: string): string[] {
  return text.match(/[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?|\d+|[^\sA-Za-zÀ-ÿ\d]+|\s+/g) ?? [text];
}

function isWordToken(tok: string): boolean {
  return /^[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?$/.test(tok);
}

function spokenNumbersToDigits(text: string, lang: WordNumLang): string {
  const tokens = tokenizeForNumbers(text);
  const isNum = lang === "en" ? isEnNumberWord : isEsNumberWord;
  const parse = lang === "en" ? parseEnValue : parseEsValue;
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (!isWordToken(tok) || !isNum(tok)) {
      out.push(tok);
      i += 1;
      continue;
    }

    // Collect a run of number words (allowing only whitespace between them).
    const wordRun: string[] = [];
    let j = i;
    let end = i;
    while (j < tokens.length) {
      const t = tokens[j]!;
      if (isWordToken(t) && isNum(t)) {
        // Leading connector alone is not a number start.
        const n = normalizeToken(t);
        if (wordRun.length === 0 && (n === "and" || n === "y")) break;
        wordRun.push(t);
        end = j;
        j += 1;
        continue;
      }
      if (/^\s+$/.test(t) && wordRun.length > 0) {
        // Peek: only keep whitespace if another number word follows.
        let k = j + 1;
        while (k < tokens.length && /^\s+$/.test(tokens[k]!)) k += 1;
        if (k < tokens.length && isWordToken(tokens[k]!) && isNum(tokens[k]!)) {
          j += 1;
          continue;
        }
      }
      break;
    }

    // Drop trailing connectors ("and" / "y") that aren't part of a value.
    while (wordRun.length > 0) {
      const last = normalizeToken(wordRun[wordRun.length - 1]!);
      if (last === "and" || last === "y") {
        wordRun.pop();
        // Walk end back to the last kept word token index.
        while (end > i && (!isWordToken(tokens[end]!) || normalizeToken(tokens[end]!) === "and" || normalizeToken(tokens[end]!) === "y" || /^\s+$/.test(tokens[end]!))) {
          end -= 1;
        }
        continue;
      }
      break;
    }

    const value = wordRun.length > 0 ? parse(wordRun) : null;
    if (value == null || !Number.isFinite(value)) {
      out.push(tok);
      i += 1;
      continue;
    }

    out.push(String(value));
    i = end + 1;
  }

  return out.join("");
}

/**
 * Format transcript text for interpreter copy/read:
 * spelled EN/ES cardinals → digits; phone digit runs lose spaces/commas.
 */
export function formatTranscriptNumbers(text: string, langCode?: string): string {
  if (!text) return text;
  const base = langBase(langCode);
  let out = text;
  if (base === "es") {
    out = spokenNumbersToDigits(out, "es");
  } else if (base === "en" || base === "") {
    // Default to English word map when language is unknown / English.
    out = spokenNumbersToDigits(out, "en");
  }
  out = collapsePhoneSeparators(out);
  return out;
}
