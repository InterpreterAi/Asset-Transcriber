/**
 * Trial · Soniox X only.
 *
 * Display-only: remove spaces that sit inside a phone number so the digits
 * can be read and copied as one number. Does not convert spoken words to
 * digits, does not strip hyphens/plus/parens, and does not touch years,
 * money, counts, or short number lists.
 */

const ASCII_DIGIT = /[0-9]/;
const ARABIC_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/;
const CURRENCY_OR_COMMA = /[$€£¥₹,\u066C]/;
const PHONE_PUNCT = /[\s().\-\u00A0\u2009\u202F+]/;
const LEADING_MARK_RE = /((?:\+|00)\s*|\(\s*)$/;

type Piece = { kind: "d" | "s"; text: string };

function isDigit(ch: string): boolean {
  return ASCII_DIGIT.test(ch) || ARABIC_DIGIT.test(ch);
}

function tokenize(text: string): Piece[] {
  const pieces: Piece[] = [];
  let i = 0;
  while (i < text.length) {
    if (isDigit(text[i]!)) {
      let j = i + 1;
      while (j < text.length && isDigit(text[j]!)) j += 1;
      pieces.push({ kind: "d", text: text.slice(i, j) });
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < text.length && !isDigit(text[j]!)) j += 1;
    pieces.push({ kind: "s", text: text.slice(i, j) });
    i = j;
  }
  return pieces;
}

function joinPieces(pieces: readonly Piece[]): string {
  return pieces.map((p) => p.text).join("");
}

function digitCount(pieces: readonly Piece[]): number {
  let n = 0;
  for (const p of pieces) {
    if (p.kind === "d") n += p.text.length;
  }
  return n;
}

function digitGroups(pieces: readonly Piece[]): string[] {
  return pieces.filter((p) => p.kind === "d").map((p) => p.text);
}

function isYearList(groups: string[]): boolean {
  return groups.length >= 2 && groups.every((g) => g.length === 4);
}

function isNanpGrouping(lens: number[]): boolean {
  const key = lens.join("-");
  return (
    key === "3-3-4" ||
    key === "3-7" ||
    key === "10" ||
    key === "1-3-3-4" ||
    key === "1-3-7" ||
    key === "1-10"
  );
}

function startsWithPlusOr00(span: string): boolean {
  const t = span.trim();
  return t.startsWith("+") || t.startsWith("00");
}

function startsWithTrunkZero(groups: string[]): boolean {
  const first = groups[0];
  if (!first) return false;
  const ch = first[0];
  return ch === "0" || ch === "\u0660" || ch === "\u06F0";
}

function onlyPhoneChars(span: string): boolean {
  return [...span].every((ch) => isDigit(ch) || PHONE_PUNCT.test(ch));
}

function looksLikePhone(pieces: readonly Piece[]): boolean {
  const span = joinPieces(pieces);
  if (!/[\s\u00A0\u2009\u202F]/.test(span)) return false;
  if (span.includes(",") || span.includes("\u066C")) return false;
  if (!onlyPhoneChars(span)) return false;
  const groups = digitGroups(pieces);
  const digits = digitCount(pieces);
  if (digits < 7 || digits > 15) return false;
  if (isYearList(groups)) return false;
  if (groups.every((g) => g.length === 1) && digits >= 7) return true;
  if (startsWithPlusOr00(span) && digits >= 8) return true;
  if (startsWithTrunkZero(groups) && digits >= 8) return true;
  if ((digits === 10 || digits === 11) && isNanpGrouping(groups.map((g) => g.length))) return true;
  return false;
}

function stripSpacesOnly(span: string): string {
  return span.replace(/[\s\u00A0\u2009\u202F]+/g, "");
}

/** Longest prefix of `pieces` that is a phone. -1 if none. */
function longestPhonePrefix(pieces: readonly Piece[]): number {
  let best = -1;
  let digits = 0;
  for (let j = 0; j < pieces.length; j++) {
    const piece = pieces[j]!;
    if (piece.kind === "d") {
      digits += piece.text.length;
      if (digits > 15) break;
    } else if (!onlyPhoneChars(piece.text)) {
      break;
    }
    if (looksLikePhone(pieces.slice(0, j + 1))) best = j;
  }
  return best;
}

function lastChar(s: string): string {
  return s.slice(-1);
}

/**
 * Remove spaces inside phone-like digit runs. Idempotent. Leaves every other
 * character (and every non-phone number) unchanged.
 */
export function collapsePhoneNumberSpaces(text: string): string {
  if (!text) return text;
  const pieces = tokenize(text);
  let i = 0;
  let out = "";
  while (i < pieces.length) {
    const piece = pieces[i]!;

    if (piece.kind === "s") {
      const lead = piece.text.match(LEADING_MARK_RE)?.[1] ?? "";
      if (!lead || pieces[i + 1]?.kind !== "d" || CURRENCY_OR_COMMA.test(lastChar(piece.text.slice(0, piece.text.length - lead.length)))) {
        out += piece.text;
        i += 1;
        continue;
      }
      const keep = piece.text.slice(0, piece.text.length - lead.length);
      const span = [{ kind: "s" as const, text: lead }, ...pieces.slice(i + 1)];
      const end = longestPhonePrefix(span);
      if (end < 0) {
        out += piece.text;
        i += 1;
        continue;
      }
      out += keep + stripSpacesOnly(joinPieces(span.slice(0, end + 1)));
      i += end + 1;
      continue;
    }

    if (CURRENCY_OR_COMMA.test(lastChar(out))) {
      out += piece.text;
      i += 1;
      continue;
    }

    const end = longestPhonePrefix(pieces.slice(i));
    if (end >= 0) {
      out += stripSpacesOnly(joinPieces(pieces.slice(i, i + end + 1)));
      i += end + 1;
      continue;
    }

    out += piece.text;
    i += 1;
  }
  return out;
}

/** Collapse a final+partial pair without joining a phone across the live split unless needed. */
export function collapsePhoneParts(finalText: string, partialText: string): { final: string; partial: string } {
  const joined = collapsePhoneNumberSpaces(`${finalText}${partialText}`);
  const a = collapsePhoneNumberSpaces(finalText);
  const b = collapsePhoneNumberSpaces(partialText);
  if (joined === `${a}${b}`) return { final: a, partial: b };
  return { final: joined, partial: "" };
}
