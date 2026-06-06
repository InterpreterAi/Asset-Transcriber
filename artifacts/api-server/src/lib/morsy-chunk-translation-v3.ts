/**
 * Morsy Chunk V3 Translation Engine — sentence poll path only.
 * No context buffer. No repetition. Single OpenAI call per sentence.
 */

import { openai } from "./openai-client.js";

export type MorsyChunkV3TranslationResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export async function translateMorsyChunkV3Sentence(args: {
  text: string;
  sourceLang: string;
  targetLang: string;
}): Promise<MorsyChunkV3TranslationResult> {
  const systemPrompt =
    `You are a professional medical interpreter.\n` +
    `Translate the following ${args.sourceLang} text into ${args.targetLang}.\n` +
    `You must translate EVERY word. NEVER keep ${args.sourceLang} words in the output.\n` +
    `Translate all medical terminology into standard medical ${args.targetLang}.\n` +
    `Do not summarize. Do not explain. Do not omit. Translate only.\n` +
    `Return only the translation.`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: args.text },
    ],
  });

  const raw = resp.choices[0]?.message?.content?.trim() ?? "";
  return {
    text: raw,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0,
  };
}
