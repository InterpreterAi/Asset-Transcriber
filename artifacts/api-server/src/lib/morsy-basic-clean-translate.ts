/**
 * Basic · Morsy Urgent — experimental clean translation path (`experimentalMorsyBasicCleanTranslation`).
 * Minimal preprocessing (number/ID preservation only) → single OpenAI call → trim → restore numbers.
 * No phrase/glossary/protected-term layers, no post-repair, no validation retries.
 */

import { openai } from "./openai-client.js";

export type MorsyCleanNumberMask = {
  masked: string;
  slotToLiteral: Map<number, string>;
  hadPlaceholders: boolean;
};

const MONTH =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|" +
  "Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

/** Preserve phones, IDs, money, dates/times, and digit runs for the clean experiment only. */
export function applyMorsyCleanNumberProtection(text: string): MorsyCleanNumberMask {
  if (!text.trim()) {
    return { masked: text, slotToLiteral: new Map(), hadPlaceholders: false };
  }

  const slotToLiteral = new Map<number, string>();
  let slot = 1;
  const spans: { start: number; end: number; literal: string }[] = [];

  const patterns: RegExp[] = [
    /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b(?:MRN|INV|CLM|ID|Acct|Account|Claim|Invoice|Record)[-#:\s]?[A-Z0-9][A-Z0-9-]{2,}\b/gi,
    /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g,
    new RegExp(`\\b(?:${MONTH})\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, "gi"),
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?\b/g,
    /\b\d+\b/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some(s => start < s.end && end > s.start)) continue;
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

  return {
    masked: out,
    slotToLiteral,
    hadPlaceholders: slotToLiteral.size > 0,
  };
}

export function restoreMorsyCleanNumberProtection(
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

export function buildMorsyBasicCleanSystemPrompt(srcName: string, tgtName: string): string {
  return (
    `You are a professional medical interpreter.\n` +
    `Translate the transcript from ${srcName} into ${tgtName}.\n` +
    `Translate all medical terminology into ${tgtName} whenever a standard translation exists.\n` +
    `Do not summarize.\n` +
    `Do not omit information.\n` +
    `Do not answer the speaker.\n` +
    `Do not explain.\n` +
    `Preserve only:\n` +
    `- names\n` +
    `- IDs\n` +
    `- phone numbers\n` +
    `- invoice numbers\n` +
    `- claim numbers\n` +
    `- dates\n` +
    `- times\n` +
    `If the transcript contains NUM_1, NUM_2, … tokens, copy each token exactly in place.\n` +
    `Return only the translation in ${tgtName}.`
  );
}

export function buildMorsyBasicCleanUserMessage(body: string): string {
  return body.trim();
}

export type MorsyBasicCleanTranslationResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export async function runMorsyBasicCleanTranslation(args: {
  text: string;
  srcName: string;
  tgtName: string;
}): Promise<MorsyBasicCleanTranslationResult> {
  const numMask = applyMorsyCleanNumberProtection(args.text);
  const systemPrompt = buildMorsyBasicCleanSystemPrompt(args.srcName, args.tgtName);
  const userMessage = buildMorsyBasicCleanUserMessage(numMask.masked);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 16_384,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      },
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);
    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const restored = restoreMorsyCleanNumberProtection(raw, numMask.slotToLiteral);
    return {
      text: restored.trim(),
      promptTokens: resp.usage?.prompt_tokens ?? 0,
      completionTokens: resp.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
