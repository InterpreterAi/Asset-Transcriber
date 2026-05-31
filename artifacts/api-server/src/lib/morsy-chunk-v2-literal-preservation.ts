/**
 * Chunk V2 literal preservation — IDs, phones, lab values, measurements only.
 * Dates, month names, and AM/PM are NOT masked so the model can localize them.
 */

export type MorsyChunkV2LiteralMask = {
  masked: string;
  slotToLiteral: Map<number, string>;
  preservedLiterals: string[];
};

/** Documented patterns (longest / most specific first when matching). */
export const CHUNK_V2_LITERAL_PATTERN_DOCS = [
  {
    name: "phone_us",
    example: "619-834-8912",
    pattern: String.raw`\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b`,
  },
  {
    name: "mrn",
    example: "MRN-8473921",
    pattern: String.raw`\bMRN[-#:\s]?[\w-]+\b`,
  },
  {
    name: "clm",
    example: "CLM-59372-B",
    pattern: String.raw`\bCLM[-#:\s]?[\w-]+\b`,
  },
  {
    name: "inv",
    example: "INV-A59372-B",
    pattern: String.raw`\bINV[-#:\s]?[\w-]+\b`,
  },
  {
    name: "hba1c",
    example: "HbA1c 8.4%",
    pattern: String.raw`\bHbA1c\s+\d+(?:\.\d+)?%?\b`,
  },
  {
    name: "bnp",
    example: "BNP 1482",
    pattern: String.raw`\bBNP\s+\d[\d,]*\b`,
  },
  {
    name: "measurement_with_unit",
    example: "1.8 mg/dL",
    pattern: String.raw`\b\d+(?:\.\d+)?\s*(?:mg/dL|mg/dl|mmol/L|mEq/L|g/dL)\b`,
  },
  {
    name: "percent_in_lab_context",
    example: "8.4%",
    pattern: String.raw`\b\d+(?:\.\d+)?%\b`,
  },
] as const;

const CHUNK_V2_LITERAL_PATTERNS: RegExp[] = CHUNK_V2_LITERAL_PATTERN_DOCS.map(
  (d) => new RegExp(d.pattern, "gi"),
);

export function applyMorsyChunkV2LiteralPreservation(text: string): MorsyChunkV2LiteralMask {
  if (!text.trim()) {
    return { masked: text, slotToLiteral: new Map(), preservedLiterals: [] };
  }

  const slotToLiteral = new Map<number, string>();
  const preservedLiterals: string[] = [];
  const spans: { start: number; end: number; literal: string }[] = [];
  let slot = 1;

  for (const re of CHUNK_V2_LITERAL_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some((s) => start < s.end && end > s.start)) continue;
      spans.push({ start, end, literal: m[0] });
    }
  }

  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start);
    const token = `NUM_${slot}`;
    slotToLiteral.set(slot, span.literal);
    preservedLiterals.push(span.literal);
    slot += 1;
    out += token;
    cursor = span.end;
  }
  out += text.slice(cursor);

  return { masked: out, slotToLiteral, preservedLiterals };
}

export function restoreMorsyChunkV2LiteralPreservation(
  translated: string,
  slotToLiteral: Map<number, string>,
): string {
  if (!translated || slotToLiteral.size === 0) return translated;
  let out = translated;
  const slots = [...slotToLiteral.entries()].sort((a, b) => b[0] - a[0]);
  for (const [n, literal] of slots) {
    out = out.replace(new RegExp(`NUM_${n}(?!\\d)`, "g"), () => literal);
  }
  return out;
}
