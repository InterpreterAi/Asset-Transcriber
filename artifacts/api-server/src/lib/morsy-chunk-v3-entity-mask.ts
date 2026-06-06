/**
 * Morsy Chunk V3 — atomic entity masking (V3 only).
 * Longest-first span collection; NUM_n tokens restored after OpenAI.
 */

export type MorsyChunkV3EntityMask = {
  masked: string;
  slotToLiteral: Map<number, string>;
};

const EN_MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const MEDICAL_UNITS =
  "mg\\/dL|mg\\/dl|mmol\\/L|mEq\\/L|g\\/dL|mmHg|bpm|mL|kg|mg|g|L";

/** Longest / most specific patterns first; bare digit runs last. */
function chunkV3EntityPatterns(): RegExp[] {
  return [
    new RegExp(`\\b${EN_MONTH}\\s+\\d{1,2},?\\s+\\d{4}\\b`, "gi"),
    /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b(?:MRN|INV|CLM|ID|Acct|Account|Claim|Invoice|Record)[-#:\s]?[A-Z0-9][A-Z0-9-]{2,}\b/gi,
    /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g,
    /\b\d{2,3}\/\d{2,3}(?:\s*mmHg)?\b/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?\b/g,
    new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*(?:${MEDICAL_UNITS})\\b`, "gi"),
    /\b\d+(?:\.\d+)?\s*%/g,
    /\b\d+(?:\.\d+)?\b/g,
  ];
}

export function applyMorsyChunkV3EntityMask(text: string): MorsyChunkV3EntityMask {
  if (!text.trim()) {
    return { masked: text, slotToLiteral: new Map() };
  }

  const slotToLiteral = new Map<number, string>();
  let slot = 1;
  const spans: { start: number; end: number; literal: string }[] = [];

  for (const re of chunkV3EntityPatterns()) {
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
    slot += 1;
    out += token;
    cursor = span.end;
  }
  out += text.slice(cursor);

  return { masked: out, slotToLiteral };
}

export function restoreMorsyChunkV3EntityMask(
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
