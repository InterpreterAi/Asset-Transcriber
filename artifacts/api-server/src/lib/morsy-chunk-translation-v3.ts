/**
 * Morsy Chunk V3 Translation Engine — fresh implementation only.
 * No context buffer. Current sentence only. English → Arabic.
 */

import { openai } from "./openai-client.js";

export const MORSY_CHUNK_V3_SYSTEM_PROMPT = `You are a professional medical interpreter. You translate English to Arabic.

RULES:

1. Translate EVERY word into Arabic. NEVER keep English words.
2. NEVER translate names, email addresses, phone numbers, or IDs. Copy them exactly as they appear.
3. NEVER translate medical units (mg/dL, %, mmHg, bpm, kg, etc.). Copy them exactly.
4. Translate numbers exactly in the same order they appear. Do not reorder.
5. If you do not understand a word, keep it as-is in English but mark it with [UNKNOWN].
6. Do not say "Sorry I cannot help" or any refusal. You must always translate.
7. Do not output empty text. Do not output "No text provided". Do not output "I cannot help".
8. Output only the translation. No extra text. No explanations.`;

const MORSY_CHUNK_V3_FALLBACK_SYSTEM_PROMPT =
  "You are a translator. Translate English to Arabic. Output only the translation.";

export type MorsyChunkV3Mask = {
  maskedText: string;
  emails: string[];
  units: string[];
  numbers: string[];
};

export type MorsyChunkV3TranslationResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export function validateChunkV3Input(text: string): string {
  if (!text || text.trim().length === 0) {
    return "";
  }
  if (text.trim().length < 3) {
    return "";
  }
  return text;
}

export function maskChunkV3Preservations(text: string): MorsyChunkV3Mask {
  const emailRegex = /\b[\w.-]+@[\w.-]+\.\w+\b/g;
  const emails: string[] = [];
  let maskedText = text.replace(emailRegex, (match) => {
    emails.push(match);
    return `__EMAIL_${emails.length - 1}__`;
  });

  const unitRegex = /\b(mg\/dL|%|mmHg|bpm|kg|mL|mg|g|L)\b/g;
  const units: string[] = [];
  maskedText = maskedText.replace(unitRegex, (match) => {
    units.push(match);
    return `__UNIT_${units.length - 1}__`;
  });

  const numberRegex = /\b\d+(?:\.\d+)?\b/g;
  const numbers: string[] = [];
  maskedText = maskedText.replace(numberRegex, (match) => {
    numbers.push(match);
    return `__NUM_${numbers.length - 1}__`;
  });

  return { maskedText, emails, units, numbers };
}

export function restoreChunkV3Preservations(
  translated: string,
  mask: Pick<MorsyChunkV3Mask, "emails" | "units" | "numbers">,
): string {
  let out = translated;
  out = out.replace(/__NUM_(\d+)__/g, (_, idx) => mask.numbers[parseInt(idx, 10)] ?? "");
  out = out.replace(/__UNIT_(\d+)__/g, (_, idx) => mask.units[parseInt(idx, 10)] ?? "");
  out = out.replace(/__EMAIL_(\d+)__/g, (_, idx) => mask.emails[parseInt(idx, 10)] ?? "");
  return out;
}

export function chunkV3NeedsFallback(translated: string): boolean {
  if (!translated || translated.length < 3) return true;
  const lower = translated.toLowerCase();
  return (
    lower.includes("cannot help") ||
    lower.includes("sorry") ||
    lower.includes("no text")
  );
}

export async function translateMorsyChunkV3Sentence(args: {
  text: string;
  sourceLang: string;
  targetLang: string;
}): Promise<MorsyChunkV3TranslationResult> {
  const text = validateChunkV3Input(args.text);
  if (text === "") {
    return { text: "", promptTokens: 0, completionTokens: 0 };
  }
  const mask = maskChunkV3Preservations(text);

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: MORSY_CHUNK_V3_SYSTEM_PROMPT },
      { role: "user", content: mask.maskedText },
    ],
  });

  let promptTokens = resp.usage?.prompt_tokens ?? 0;
  let completionTokens = resp.usage?.completion_tokens ?? 0;

  let translated = resp.choices[0]?.message?.content?.trim() ?? "";
  translated = restoreChunkV3Preservations(translated, mask);

  if (chunkV3NeedsFallback(translated)) {
    const fallbackResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: MORSY_CHUNK_V3_FALLBACK_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    promptTokens += fallbackResponse.usage?.prompt_tokens ?? 0;
    completionTokens += fallbackResponse.usage?.completion_tokens ?? 0;
    translated = fallbackResponse.choices[0]?.message?.content?.trim() || text;
  }

  return {
    text: translated.trim(),
    promptTokens,
    completionTokens,
  };
}
