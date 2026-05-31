/**
 * Basic · Morsy Urgent — chunk append translation (`experimentalMorsyUrgentChunkTranslationV2`).
 * Chunk-sized input; literal preservation for IDs/phones/labs; localized dates/months/times.
 */

import { openai } from "./openai-client.js";
import {
  applyMorsyChunkV2LiteralPreservation,
  restoreMorsyChunkV2LiteralPreservation,
} from "./morsy-chunk-v2-literal-preservation.js";

export function buildMorsyChunkV2SystemPrompt(tgtName: string, isFinalSegment: boolean): string {
  const finalNote = isFinalSegment
    ? "This is the final segment of the utterance — ensure the translation is complete and coherent.\n"
    : "";
  return (
    `You are a professional medical interpreter.\n` +
    finalNote +
    `Translate the text into ${tgtName}.\n` +
    `Return only the translation in ${tgtName}.\n` +
    `Translate every word that is not a protected NUM token into ${tgtName}.\n` +
    `Do not leave English words in the output except inside preserved NUM tokens.\n` +
    `Translate medical terminology (diagnoses, procedures, medications, anatomy, labs) using standard ${tgtName} medical terms.\n` +
    `Translate common phrases fully, including:\n` +
    `- claim number\n` +
    `- invoice number\n` +
    `- insurance claim\n` +
    `Translate month names (e.g. March, May) into ${tgtName}.\n` +
    `Translate date expressions into natural ${tgtName} (keep numeric day/year order readable).\n` +
    `Translate time expressions into ${tgtName}, including AM and PM (do not leave AM/PM in English).\n` +
    `If the text contains NUM_1, NUM_2, … tokens, copy each token exactly in place — these are protected identifiers, phone numbers, and lab values.\n` +
    `Do not summarize.\n` +
    `Do not explain.\n` +
    `Do not omit.\n` +
    `Translate only.`
  );
}

export type MorsyChunkV2TranslationResult = {
  text: string;
  preservedLiterals: string[];
  promptTokens: number;
  completionTokens: number;
};

export async function runMorsyChunkV2Translation(args: {
  text: string;
  tgtName: string;
  isFinalSegment?: boolean;
}): Promise<MorsyChunkV2TranslationResult> {
  const mask = applyMorsyChunkV2LiteralPreservation(args.text);
  const systemPrompt = buildMorsyChunkV2SystemPrompt(args.tgtName, Boolean(args.isFinalSegment));
  const userMessage = mask.masked.trim();

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
    const restored = restoreMorsyChunkV2LiteralPreservation(raw, mask.slotToLiteral);
    return {
      text: restored.trim(),
      preservedLiterals: mask.preservedLiterals,
      promptTokens: resp.usage?.prompt_tokens ?? 0,
      completionTokens: resp.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
