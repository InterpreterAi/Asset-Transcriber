/**
 * Morsy Chunk V3 Translation Engine — multi-language rebuild.
 * Faithful "mirror" translation. All 31 pairs. Drop-proof. Western digits enforced.
 */

import { openai } from "./openai-client.js";
import {
  applyMorsyChunkV3EntityMask,
  restoreMorsyChunkV3EntityMask,
} from "./morsy-chunk-v3-entity-mask.js";
import { logger } from "./logger.js";

const chunkV3ServerDiagEnabled = () =>
  String(process.env.MORSY_CHUNK_V3_DIAG ?? "").trim() === "1";

const LANG_NAMES: Record<string, string> = {
  ar: "Arabic",
  bg: "Bulgarian",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  fa: "Persian (Farsi)",
  fi: "Finnish",
  fr: "French",
  de: "German",
  el: "Greek",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  nb: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  so: "Somali",
  es: "Spanish",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? LANG_NAMES[code?.toLowerCase()] ?? code;
}

export interface MorsyChunkV3TranslationResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

const DIGIT_MAP: Record<string, string> = {};
function registerDigits(zeroCodePoint: number) {
  for (let i = 0; i < 10; i++) {
    DIGIT_MAP[String.fromCodePoint(zeroCodePoint + i)] = String(i);
  }
}
registerDigits(0x0660);
registerDigits(0x06f0);
registerDigits(0x0966);
registerDigits(0x09e6);
registerDigits(0x0ce6);
registerDigits(0x0e50);
registerDigits(0xff10);

export function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    out += DIGIT_MAP[ch] ?? ch;
  }
  return out;
}

export function buildMorsyChunkV3SystemPrompt(sourceName: string, targetName: string): string {
  return `You are a professional medical interpreter translating ${sourceName} into ${targetName}.

Translate the user's text faithfully and completely. This is a live medical call — accuracy and completeness are critical.

RULES:
1. Translate the ENTIRE text. Never omit, skip, summarize, or shorten anything.
2. Preserve grammatical tense exactly: past stays past, present stays present, future stays future. Completed actions remain completed (e.g. "I reviewed" must stay past tense in ${targetName}, never present). Never shift tense for fluency.
3. Use natural word order for ${targetName} within each clause. Fluency must NOT change tense, clinical meaning, numbers, dates, dosages, measurements, lab values, blood pressure readings, or entity identity.
4. Write ALL numbers using Western Arabic numerals (0,1,2,3,4,5,6,7,8,9) ONLY. Never use Arabic-Indic, Persian, Devanagari, or any other digit script — even when translating into ${targetName}.
5. If the text contains NUM_1, NUM_2, … tokens, copy each token exactly in place. Never modify, infer, round, estimate, reorder, or omit numerical values inside those tokens.
6. Preserve EXACTLY (do not translate or alter): all numbers, dates, times, dosages, measurements, units (mg/dL, %, mmHg, bpm, kg, mL, etc.), names, emails, phone numbers, and IDs. Keep numbers in the same order they appear in the source.
7. Never refuse. Never apologize. Never output an explanation, note, or the original ${sourceName} text.
8. Output ONLY the ${targetName} translation — nothing else.`;
}

export function buildMorsyChunkV3FallbackPrompt(sourceName: string, targetName: string): string {
  return (
    `Translate this ${sourceName} text into ${targetName}. ` +
    `Preserve tense exactly (past stays past). ` +
    `Use only Western numerals (0-9). ` +
    `If NUM_1, NUM_2, … appear, copy each token exactly in place. ` +
    `Preserve all numbers, units, dates, and names exactly. ` +
    `Output only the ${targetName} translation, nothing else.`
  );
}

export function validateChunkV3Input(text: string): string {
  if (!text || text.trim().length < 3) return "";
  return text.trim();
}

function isBadOutput(output: string, sourceText: string): boolean {
  const t = output.trim();
  if (t.length === 0) return true;

  const lower = t.toLowerCase();
  const refusalSignals = [
    "i cannot help",
    "i can't help",
    "i'm sorry",
    "i am sorry",
    "sorry, i can",
    "no text provided",
    "as an ai",
    "i cannot translate",
  ];
  if (t.length < 60 && refusalSignals.some((s) => lower.includes(s))) return true;

  if (/\bNUM_\d+\b/.test(t)) return true;
  if (/__(NUM|UNIT|NAME)_\d+__/.test(t)) return true;
  if (t === sourceText.trim()) return true;

  return false;
}

export async function translateMorsyChunkV3Sentence(args: {
  text: string;
  sourceLang: string;
  targetLang: string;
}): Promise<MorsyChunkV3TranslationResult> {
  const text = validateChunkV3Input(args.text);
  if (text === "") return { text: "", promptTokens: 0, completionTokens: 0 };

  const sourceName = langName(args.sourceLang);
  const targetName = langName(args.targetLang);

  let promptTokens = 0;
  let completionTokens = 0;

  const entityMask = applyMorsyChunkV3EntityMask(text);
  const maskedText = entityMask.masked.trim();

  const estTokens = Math.min(2000, Math.max(256, text.length * 3));

  let lastOpenAiRaw = "";
  let attemptCount = 0;

  async function call(systemPrompt: string): Promise<string> {
    attemptCount += 1;
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: estTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: maskedText },
      ],
    });
    promptTokens += resp.usage?.prompt_tokens ?? 0;
    completionTokens += resp.usage?.completion_tokens ?? 0;
    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    lastOpenAiRaw = raw;
    return restoreMorsyChunkV3EntityMask(raw, entityMask.slotToLiteral);
  }

  let translated = await call(buildMorsyChunkV3SystemPrompt(sourceName, targetName));

  if (isBadOutput(translated, text)) {
    translated = await call(buildMorsyChunkV3SystemPrompt(sourceName, targetName));
  }

  if (isBadOutput(translated, text)) {
    translated = await call(buildMorsyChunkV3FallbackPrompt(sourceName, targetName));
  }

  if (isBadOutput(translated, text)) {
    if (chunkV3ServerDiagEnabled()) {
      logger.info(
        {
          msg: "morsy_chunk_v3_diag",
          outcome: "bad_output_empty",
          sourceLang: args.sourceLang,
          targetLang: args.targetLang,
          rawChunk: text,
          maskedChunk: maskedText,
          openAiRaw: lastOpenAiRaw,
          restoredChunk: translated,
          normalizedChunk: "",
          attemptCount,
        },
        "Morsy chunk V3 diagnostic",
      );
    }
    return { text: "", promptTokens, completionTokens };
  }

  const restoredChunk = translated.trim();
  translated = normalizeDigits(restoredChunk);

  if (chunkV3ServerDiagEnabled()) {
    logger.info(
      {
        msg: "morsy_chunk_v3_diag",
        outcome: "ok",
        sourceLang: args.sourceLang,
        targetLang: args.targetLang,
        rawChunk: text,
        maskedChunk: maskedText,
        openAiRaw: lastOpenAiRaw,
        restoredChunk,
        normalizedChunk: translated,
        attemptCount,
      },
      "Morsy chunk V3 diagnostic",
    );
  }

  return { text: translated, promptTokens, completionTokens };
}
