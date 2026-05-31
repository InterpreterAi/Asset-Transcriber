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
  const isArabicTarget = tgtName.trim().toLowerCase() === "arabic";
  const arabicMedicalScriptRule = isArabicTarget
    ? `When the target language is Arabic, write all medical terminology in Arabic script (Modern Standard Arabic medical usage). ` +
      `Do NOT leave English Latin-letter medical words, diagnoses, procedures, lab names, or findings in the output.\n` +
      `Examples that MUST be fully translated into standard Arabic medical terms — never left in English: ` +
      `heart failure, coronary artery disease, hyperlipidemia, atrial fibrillation, creatinine, BNP, HbA1c, ` +
      `and similar diagnoses, procedures, tests, lab values, and clinical findings.\n` +
      `For laboratory markers and acronyms (e.g. BNP, HbA1c, MRI, CT), use the established Arabic medical term; ` +
      `do not output the bare English acronym or English disease name unless it is a proper name or proprietary brand.\n`
    : `Do NOT leave source-language medical words in Latin letters when a standard ${tgtName} medical equivalent exists.\n`;

  return (
    `You are a professional medical interpreter.\n` +
    `Translate the text into ${tgtName}.\n` +
    `Translate ALL medical terminology into standard medical ${tgtName} whenever a standard translation exists.\n` +
    arabicMedicalScriptRule +
    `Translate medical diagnoses, procedures, medications, laboratory values, test names, anatomy, and clinical findings ` +
    `using standard ${tgtName} medical terminology.\n` +
    `Never leave untranslated English medical terms in ${tgtName} output.\n` +
    `Do not summarize.\n` +
    `Do not explain.\n` +
    `Do not omit.\n` +
    `Translate only.\n` +
    `Preserve only:\n` +
    `- personal names\n` +
    `- phone numbers\n` +
    `- IDs\n` +
    `- dates\n` +
    `- medication dosages (numbers/units)\n` +
    `- NUM_1, NUM_2, … tokens exactly as given\n` +
    `If the text contains NUM_1, NUM_2, … tokens, copy each token exactly in place.\n` +
    `Return only the translation in ${tgtName}.`
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
