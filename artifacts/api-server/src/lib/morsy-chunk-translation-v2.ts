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

export function buildMorsyChunkV2ContinuationSystemPrompt(tgtName: string): string {
  return (
    `${buildMorsyChunkV2SystemPrompt(tgtName)}\n\n` +
    `CONTINUATION:\n` +
    `You are continuing an existing translation.\n` +
    `The previous source and previous translation are provided only as context.\n` +
    `Translate ONLY the new source delta.\n` +
    `Do not repeat concepts already translated.\n` +
    `Do not rewrite previous output.\n` +
    `Return only the translation for the new delta.`
  );
}

function buildContinuationUserMessage(args: {
  deltaMasked: string;
  previousSourceContext?: string;
  previousTranslationContext?: string;
}): string {
  const prevSrc = args.previousSourceContext?.trim() ?? "";
  const prevTr = args.previousTranslationContext?.trim() ?? "";
  const delta = args.deltaMasked.trim();
  if (!prevSrc && !prevTr) return delta;
  return (
    `PREVIOUS SOURCE (context only — do not translate):\n${prevSrc}\n\n` +
    `PREVIOUS TRANSLATION (context only — do not repeat):\n${prevTr}\n\n` +
    `NEW SOURCE DELTA (translate only this):\n${delta}`
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
  previousSourceContext?: string;
  previousTranslationContext?: string;
  /** Full-stable shadow reference — uses whole-text prompt, not continuation. */
  shadowFullStable?: boolean;
}): Promise<MorsyChunkV2TranslationResult> {
  const numMask = applyMorsyCleanNumberProtection(args.text);
  const useContinuation =
    !args.shadowFullStable &&
    Boolean(args.previousSourceContext?.trim() || args.previousTranslationContext?.trim());
  const systemPrompt = useContinuation
    ? buildMorsyChunkV2ContinuationSystemPrompt(args.tgtName)
    : buildMorsyChunkV2SystemPrompt(args.tgtName);
  const userMessage = useContinuation
    ? buildContinuationUserMessage({
        deltaMasked: numMask.masked.trim(),
        previousSourceContext: args.previousSourceContext,
        previousTranslationContext: args.previousTranslationContext,
      })
    : numMask.masked.trim();

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
