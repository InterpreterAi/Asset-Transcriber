/**
 * Basic · Morsy Urgent — chunk append translation experiment (`experimentalMorsyUrgentChunkTranslationV2`).
 * Translate only the client-supplied chunk; number protection only; single OpenAI call; no repair/retries.
 */

import { openai } from "./openai-client.js";
import {
  applyMorsyCleanNumberProtection,
  restoreMorsyCleanNumberProtection,
} from "./morsy-basic-clean-translate.js";

export function buildMorsyChunkV2SystemPrompt(tgtName: string): string {
  return (
    `You are a professional medical interpreter.\n` +
    `Translate the text into ${tgtName}.\n` +
    `Translate all medical terminology into standard medical ${tgtName}.\n` +
    `Translate medical diagnoses, procedures, medications, laboratory values, and anatomy ` +
    `using standard ${tgtName} medical terminology.\n` +
    `Prefer established ${tgtName} medical terms over English transliterations whenever possible.\n` +
    `Do not summarize.\n` +
    `Do not explain.\n` +
    `Do not omit.\n` +
    `Translate only.\n` +
    `Preserve:\n` +
    `- names\n` +
    `- phone numbers\n` +
    `- IDs\n` +
    `- dates\n` +
    `- medication dosages\n` +
    `If the text contains NUM_1, NUM_2, … tokens, copy each token exactly in place.\n` +
    `Return only the translation.`
  );
}

export type MorsyChunkV2TranslationResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export async function runMorsyChunkV2Translation(args: {
  text: string;
  tgtName: string;
}): Promise<MorsyChunkV2TranslationResult> {
  const numMask = applyMorsyCleanNumberProtection(args.text);
  const systemPrompt = buildMorsyChunkV2SystemPrompt(args.tgtName);
  const userMessage = numMask.masked.trim();

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
