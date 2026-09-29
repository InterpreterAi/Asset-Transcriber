/**
 * Trial · Soniox X only. Display-only, Original column, finalized text only.
 *
 * Soniox formats spoken phone numbers as `555-123-4567`, `555.123.4567`, or with
 * extra spaces. Join such numbers into one digit run. Only separators between
 * digits are removed — digits are never added, changed, or reordered. Decimals,
 * doses, dates, times, money, blood pressure, IPs, ZIP codes, and letter+digit
 * codes are left alone. Anything ambiguous is left exactly as Soniox wrote it.
 */

const DIGIT = "[0-9\\u0660-\\u0669\\u06F0-\\u06F9]";
const SPACE = "[ \\u00A0\\u202F]";
const SEP = `(?:${SPACE}{0,2}[-.]${SPACE}{0,2}|${SPACE}{1,2})`;
const GROUP = `\\(?${DIGIT}{1,4}\\)?`;

const CANDIDATE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}$€£¥₹.,/:\\-+])(\\+?${GROUP}(?:${SEP}${GROUP}){1,5})(?![\\p{L}\\p{N}%°/:]|[.,\\-]${DIGIT})`,
  "gu",
);
const DIGIT_RUN_RE = new RegExp(`${DIGIT}+`, "gu");

function shouldJoin(match: string): boolean {
  const groups = match.match(DIGIT_RUN_RE) ?? [];
  if (groups.length < 2) return false;
  const lens = groups.map((g) => g.length);
  const digits = lens.reduce((n, len) => n + len, 0);
  const seps = match.replace(/[()]/g, "").split(DIGIT_RUN_RE).slice(1, -1);
  const hasDash = seps.some((s) => s.includes("-"));
  const dotCount = seps.filter((s) => s.includes(".")).length;
  const plus = match.startsWith("+");

  // Parentheses may wrap only the first group: "(555) 123-4567".
  const opens = (match.match(/\(/g) ?? []).length;
  const closes = (match.match(/\)/g) ?? []).length;
  if (opens !== closes || opens > 1) return false;
  if (opens === 1 && !new RegExp(`^\\+?\\(${DIGIT}{1,4}\\)`, "u").test(match)) return false;

  // A single dot between two groups reads as a decimal.
  if (groups.length === 2 && dotCount === 1) return false;

  if (!hasDash && dotCount === 0) {
    // Spaces only: join just unmistakable phone shapes, never plain number lists.
    const shape = lens.join("-");
    return plus ? digits >= 9 && digits <= 15 : shape === "3-3-4" || shape === "1-3-3-4";
  }

  const last = lens[lens.length - 1]!;
  if (digits >= 7 && digits <= 8) {
    // Local number: exactly 3+4 with a dash, e.g. "555-1234".
    return groups.length === 2 && lens[0] === 3 && last === 4 && hasDash;
  }
  if (digits < 9 || digits > 15) return false;
  if (last < 3) return false;
  // At most one short group (country / area prefix), so dates and IPs stay intact.
  return lens.filter((len) => len <= 2).length <= 1;
}

const TRAILING_SPACED_GROUP_RE = new RegExp(`${SPACE}{1,2}\\(?${DIGIT}{1,4}\\)?$`, "u");

function joinDigits(span: string): string {
  const plus = span.startsWith("+") ? "+" : "";
  return plus + (span.match(DIGIT_RUN_RE) ?? []).join("");
}

/** Try the whole candidate, then drop space-separated trailing groups ("… 4567 12 times"). */
function joinCandidate(match: string): string {
  let span = match;
  while (true) {
    if (shouldJoin(span)) return joinDigits(span) + match.slice(span.length);
    const tail = TRAILING_SPACED_GROUP_RE.exec(span);
    if (!tail) return match;
    span = span.slice(0, tail.index);
    if (/[-.(]$/.test(span) || (span.match(DIGIT_RUN_RE) ?? []).length < 2) return match;
  }
}

export function joinPhoneNumberSeparators(text: string): string {
  if (!text) return text;
  return text.replace(CANDIDATE_RE, joinCandidate);
}
