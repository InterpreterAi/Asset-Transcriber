/**
 * Reel Creator only — translate + TTS for marketing reels.
 * TTS: ElevenLabs with-timestamps (`eleven_turbo_v2_5`) when ELEVENLABS_API_KEY is set,
 * else OpenAI tts-1 with estimated word timings. Returns JSON `{ audioBase64, words }`.
 * Do NOT import transcription / Soniox / workspace translate stacks here.
 */
import { Router, type IRouter } from "express";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import {
  ensureVeoMp4WebReady,
  generateGoogleVeoFootage,
  getGoogleAiApiKey,
  isSafeVeoFootageFilename,
  veoFootageFilePath,
  type FootageProviderId,
} from "../lib/googleVeoFootage.js";
import {
  buildSearchQueryVariants,
  createFootageDiversityContext,
  extractStockQueryFromScenario,
  inferComposition,
  isProductScreenRecording,
  markCandidateUsed,
  pickAlternateComposition,
  pickBestUnusedCandidate,
  type FootageDiversityContext,
  type FootageSceneMetadata,
  type FootageSelectionStatus,
  type PexelsVideo,
} from "../lib/pexelsFootageDiversity.js";
import {
  applyWorkspaceDeliveryText,
  prepareTtsForElevenLabs,
  sanitizeTtsInput,
  workspaceElevenLabsSettings,
  type WorkspaceTtsDelivery,
} from "../lib/reel-tts-text.js";
import { ELEVEN_VOICES, parseWorkspaceDelivery } from "../lib/eleven-voices.js";

const router: IRouter = Router();

const OPENAI_VOICES = new Set(["onyx", "nova", "alloy", "echo", "fable", "shimmer"]);

const ELEVEN_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.85,
  style: 0.2,
  use_speaker_boost: true,
} as const;

/** Calmer brand-spot delivery (outro / slogan reads). */
const ELEVEN_BRAND_VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.18,
  use_speaker_boost: true,
} as const;

/** Locked slogan voice — same tip + assurance read regardless of outro speaker pick. */
const LOCKED_SLOGAN_ELEVEN_VOICE_ID =
  process.env.ELEVENLABS_SLOGAN_VOICE_ID?.trim() || ELEVEN_VOICES.rachel.elevenLabsId;

/** Phrase 1 — professional SaaS tip / advisory tone. */
const ELEVEN_SLOGAN_TIP_SETTINGS = {
  stability: 0.58,
  similarity_boost: 0.82,
  style: 0.28,
  use_speaker_boost: true,
} as const;

/** Phrase 2 — warm assurance / “we’ve got you” tone. */
const ELEVEN_SLOGAN_ASSURANCE_SETTINGS = {
  stability: 0.66,
  similarity_boost: 0.84,
  style: 0.14,
  use_speaker_boost: true,
} as const;

export { sanitizeTtsInput } from "../lib/reel-tts-text.js";

export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

type CharAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** Collapse ElevenLabs character alignment into word-level timestamps. */
export function alignmentToWordTimestamps(alignment: CharAlignment | null | undefined): WordTimestamp[] {
  if (!alignment?.characters?.length) return [];
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];
  const words: WordTimestamp[] = [];
  let buf = "";
  let wStart = 0;
  let wEnd = 0;
  let started = false;

  const flush = () => {
    const word = buf
      .trim()
      .replace(/\u2026/g, "")
      .replace(/^[.!?,:;…\-–—]+|[.!?,:;…\-–—]+$/g, "")
      .trim();
    if (word) words.push({ word, start: wStart, end: Math.max(wStart + 0.04, wEnd) });
    buf = "";
    started = false;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
    if (ch === "\u2026" || ch === "…") {
      flush();
      continue;
    }
    const s = typeof starts[i] === "number" ? starts[i]! : wEnd;
    const e = typeof ends[i] === "number" ? ends[i]! : s;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (!started) {
      wStart = s;
      started = true;
    }
    buf += ch;
    wEnd = e;
  }
  flush();
  return words;
}

/** Even word timing fallback (OpenAI / missing alignment). */
export function estimateWordTimestamps(text: string, durationSec: number): WordTimestamp[] {
  const parts = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return [];
  const d = Math.max(0.35, durationSec);
  // Weight by character length for slightly better sync than equal slots
  const weights = parts.map((w) => Math.max(1, w.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "").length || 1));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return parts.map((word, i) => {
    const span = (weights[i]! / sum) * d;
    const start = t;
    const end = i === parts.length - 1 ? d : t + span;
    t = end;
    return { word, start, end };
  });
}

type ElevenTimestampResult = {
  audio: Buffer;
  words: WordTimestamp[];
  mimeType: string;
};

async function synthesizeElevenLabsWithTimestamps(
  apiKey: string,
  voiceId: string,
  text: string,
  pacing: "default" | "brand" = "default",
  settingsOverride?: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  },
  languageCode?: string,
): Promise<ElevenTimestampResult> {
  const model = process.env.ELEVENLABS_MODEL?.trim() || "eleven_turbo_v2_5";
  const spoken = prepareTtsForElevenLabs(text, languageCode, pacing);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`;
  const lang = elevenLabsLanguageCode(languageCode);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: spoken,
      model_id: model,
      ...(lang ? { language_code: lang } : {}),
      voice_settings: {
        ...(settingsOverride ??
          (pacing === "brand" ? ELEVEN_BRAND_VOICE_SETTINGS : ELEVEN_VOICE_SETTINGS)),
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs with-timestamps failed: ${errText.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    audio_base64?: string;
    alignment?: CharAlignment | null;
    normalized_alignment?: CharAlignment | null;
  };
  if (!data.audio_base64) {
    throw new Error("ElevenLabs response missing audio_base64");
  }
  const audio = Buffer.from(data.audio_base64, "base64");
  const fromAlign = alignmentToWordTimestamps(data.normalized_alignment ?? data.alignment);
  const finalWords =
    fromAlign.length > 0
      ? fromAlign
      : estimateWordTimestamps(spoken, Math.max(1, spoken.split(/\s+/).length / 2.5));
  return { audio, words: finalWords, mimeType: "audio/mpeg" };
}

function reelBuilderAuthorized(req: { headers: Record<string, unknown> }): boolean {
  const required = process.env.REEL_BUILDER_API_KEY?.trim();
  if (!required) return true;
  const got =
    (typeof req.headers["x-reel-builder-key"] === "string"
      ? req.headers["x-reel-builder-key"]
      : "") || "";
  return got === required;
}

function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

function getElevenLabsApiKey(): string | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  return key || null;
}

/** ISO 639-1 for ElevenLabs turbo v2.5 — workspace ORIGINAL lines only. */
function elevenLabsLanguageCode(lang?: string): string | undefined {
  const c = (lang ?? "").trim().toLowerCase();
  if (!c) return undefined;
  if (c.startsWith("zh")) return "zh";
  if (c.startsWith("pt")) return "pt";
  if (c.startsWith("en")) return "en";
  if (c.startsWith("es")) return "es";
  if (c.startsWith("fr")) return "fr";
  if (c.startsWith("de")) return "de";
  if (c.startsWith("ar")) return "ar";
  if (c.startsWith("ja")) return "ja";
  if (c.startsWith("ko")) return "ko";
  if (c.startsWith("it")) return "it";
  if (c.startsWith("hi")) return "hi";
  if (c.startsWith("ru")) return "ru";
  if (c.startsWith("tr")) return "tr";
  if (c.startsWith("pl")) return "pl";
  if (c.startsWith("nl")) return "nl";
  if (c.startsWith("sv")) return "sv";
  if (c.startsWith("vi")) return "vi";
  if (c.startsWith("id")) return "id";
  if (c.startsWith("he")) return "he";
  if (c.startsWith("fa")) return "fa";
  if (c.startsWith("uk")) return "uk";
  if (c.startsWith("ro")) return "ro";
  if (c.startsWith("cs")) return "cs";
  if (c.startsWith("da")) return "da";
  if (c.startsWith("fi")) return "fi";
  if (c.startsWith("el")) return "el";
  if (c.startsWith("hu")) return "hu";
  if (c.startsWith("nb")) return "no";
  if (c.startsWith("th")) return "th";
  const base = c.split("-")[0];
  return base && base.length === 2 ? base : undefined;
}

function createReelOpenAI(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

function formatOpenAiError(e: unknown): string {
  if (!e || typeof e !== "object") return String(e);
  const err = e as {
    message?: string;
    status?: number;
    code?: string;
    type?: string;
    error?: { message?: string; type?: string; code?: string };
  };
  const parts = [
    err.message,
    err.error?.message,
    err.status != null ? `status=${err.status}` : null,
    err.code ?? err.error?.code,
    err.type ?? err.error?.type,
  ].filter(Boolean);
  return parts.join(" | ") || String(e);
}

function parseStudioVoiceIds(body: Record<string, unknown>) {
  return {
    hookVoiceId: typeof body.hookVoiceId === "string" ? body.hookVoiceId.trim() : "rachel",
    productPayoffVoiceId:
      typeof body.productPayoffVoiceId === "string"
        ? body.productPayoffVoiceId.trim()
        : typeof body.hookVoiceId === "string"
          ? body.hookVoiceId.trim()
          : "rachel",
    workspaceSpeakerAVoiceId:
      typeof body.workspaceSpeakerAVoiceId === "string"
        ? body.workspaceSpeakerAVoiceId.trim()
        : "adam",
    workspaceSpeakerBVoiceId:
      typeof body.workspaceSpeakerBVoiceId === "string"
        ? body.workspaceSpeakerBVoiceId.trim()
        : "elli",
    outroVoiceId: typeof body.outroVoiceId === "string" ? body.outroVoiceId.trim() : "rachel",
    workspaceSpeakerADelivery: parseWorkspaceDelivery(body.workspaceSpeakerADelivery ?? "professional"),
    workspaceSpeakerBDelivery: parseWorkspaceDelivery(body.workspaceSpeakerBDelivery ?? "hesitant_lep"),
    workspaceThirdSpeakerDelivery: parseWorkspaceDelivery(body.workspaceThirdSpeakerDelivery ?? "professional"),
  };
}

function elevenLabsIdForVoice(raw: unknown, fallback = "rachel"): string {
  return resolveVoice(raw ?? fallback).elevenLabsId;
}

function resolveVoice(raw: unknown): {
  key: string;
  elevenLabsId: string;
  openai: "onyx" | "nova" | "alloy" | "echo" | "fable" | "shimmer";
} {
  const v = typeof raw === "string" ? raw.trim() : "rachel";
  const lower = v.toLowerCase();
  if (ELEVEN_VOICES[lower]) {
    return { key: lower, ...ELEVEN_VOICES[lower]! };
  }
  // Allow passing a raw ElevenLabs voice_id
  if (/^[a-zA-Z0-9]{16,}$/.test(v)) {
    return { key: v, elevenLabsId: v, openai: "nova" };
  }
  return { key: "rachel", ...ELEVEN_VOICES.rachel! };
}

router.post("/translate", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    console.error("[reel-builder/translate] OPENAI_API_KEY is missing in environment variables");
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }

  const {
    targetLanguage,
    hook = "",
    problem = "",
    solution = "",
    result = "",
    captions = "",
  } = req.body ?? {};

  if (!targetLanguage || typeof targetLanguage !== "string") {
    res.status(400).json({ error: "targetLanguage required" });
    return;
  }

  try {
    const client = createReelOpenAI(apiKey);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You translate InterpreterAI marketing reel scripts for the Universal Brand Outro + content beats.
Return JSON only with keys:
hook, problem, solution, result, captions, outroLine1, outroLine2, outroCtaHeadline, outroVoiceover.

Translate into language code "${targetLanguage}". Keep tone calm, confident, professional.

LOCKED OUTRO — translate ONLY these English source lines:
- outroLine1 ← "Stay focused on the conversation."
- outroLine2 ← "We'll handle the words."
- outroCtaHeadline ← "Start Free Trial"
- outroVoiceover ← full spoken narration with CLEAR sentence breaks (do NOT start with brand name):
  1) translation of "Stay focused on the conversation."
  2) translation of "We'll handle the words."
  3) translation of "Supports sixty-two languages."
  4) translation of "Start your free trial."
  5) "InterpreterAI.org." (keep exactly — never translate)
  CRITICAL: Keep "InterpreterAI.org" exactly at the end. Logo handles brand — never speak "InterpreterAI" at the start.

NEVER translate or alter: InterpreterAI, InterpreterAI.org, logo references.
Do not invent alternate CTAs. Preserve meaning; no hashtags.`,
        },
        {
          role: "user",
          content: JSON.stringify({ hook, problem, solution, result, captions }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(raw) as Record<string, string>;
    } catch {
      res.status(502).json({ error: "Invalid model JSON", raw });
      return;
    }

    const outroLine1 = parsed.outroLine1 ?? "Stay focused on the conversation.";
    let outroLine2 = (parsed.outroLine2 ?? "We'll handle the words.")
      .replace(/handle the rest/gi, "handle the words")
      .replace(/\bwe will\b/gi, "We'll");
    if (/rest/i.test(outroLine2) && !/words/i.test(outroLine2)) {
      outroLine2 = "We'll handle the words.";
    }
    const outroCtaHeadline = parsed.outroCtaHeadline ?? "Start Free Trial";
    let outroVoiceover =
      parsed.outroVoiceover?.trim() ||
      `Stay focused on the conversation. We'll handle the words. Supports sixty-two languages. Start your free trial. InterpreterAI.org.`;
    outroVoiceover = outroVoiceover
      .replace(/handle the rest/gi, "handle the words")
      .replace(/\bwe will\b/gi, "We'll")
      .replace(/^interpreter\s*ai[.!]?\s+/i, "")
      .replace(/start your free trial now/gi, "Start your free trial.")
      .replace(/Start your free trial at\s+app\.interpreterai\.org[.!]?/gi, "Start your free trial.");
    if (!/interpreterai\.org/i.test(outroVoiceover)) {
      outroVoiceover = `${outroVoiceover.trim()} InterpreterAI.org.`;
    }

    res.json({
      hook: parsed.hook ?? hook,
      problem: parsed.problem ?? problem,
      solution: parsed.solution ?? solution,
      result: parsed.result ?? result,
      captions: parsed.captions ?? captions,
      outroLine1,
      outroLine2,
      outroCtaHeadline,
      outroVoiceover,
      targetLanguage,
    });
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/translate] OpenAI error:", detail, e);
    res.status(500).json({ error: detail });
  }
});

router.post("/tts", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body ?? {};
  let input = "";
  if (typeof body.text === "string" && body.text.trim()) {
    input = body.text.trim();
  } else if (Array.isArray(body.segments)) {
    input = body.segments
      .map((s: unknown) => (typeof s === "string" ? s : ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  if (!input) {
    res.status(400).json({ error: "text required (or non-empty segments array)" });
    return;
  }

  const voice = resolveVoice(body.voice);
  let speed = 1;
  if (typeof body.speed === "number" && Number.isFinite(body.speed)) {
    speed = Math.min(1.25, Math.max(0.75, body.speed));
  } else if (typeof body.speed === "string") {
    const n = Number(body.speed);
    if (Number.isFinite(n)) speed = Math.min(1.25, Math.max(0.75, n));
  }
  const pacing: "default" | "brand" =
    body.pacing === "brand" || body.brandPacing === true ? "brand" : "default";
  const delivery = parseWorkspaceDelivery(body.delivery);
  // Brand spots stay natural — never rush OpenAI fallback above 1.0×.
  if (pacing === "brand") speed = Math.min(1, speed);

  const wantJson =
    body.withTimestamps === true ||
    body.withTimestamps === "true" ||
    String(req.headers.accept || "").includes("application/json");

  const deliverySettings =
    delivery !== "default" ? workspaceElevenLabsSettings(delivery) : undefined;

  const elevenKey = getElevenLabsApiKey();
  if (elevenKey) {
    try {
      const ttsInput =
        delivery === "default" ? input : applyWorkspaceDeliveryText(input, delivery);
      const result = await synthesizeElevenLabsWithTimestamps(
        elevenKey,
        voice.elevenLabsId,
        ttsInput,
        pacing,
        deliverySettings,
        typeof body.language === "string"
          ? body.language
          : typeof body.language_code === "string"
            ? body.language_code
            : undefined,
      );
      if (wantJson) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Reel-TTS-Provider", "elevenlabs");
        res.json({
          provider: "elevenlabs",
          mimeType: result.mimeType,
          audioBase64: result.audio.toString("base64"),
          words: result.words,
          word_timestamps: result.words,
        });
        return;
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Reel-TTS-Provider", "elevenlabs");
      res.setHeader("X-Reel-Word-Timestamps", encodeURIComponent(JSON.stringify(result.words)));
      res.send(result.audio);
      return;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("[reel-builder/tts] ElevenLabs failed, trying OpenAI fallback:", detail);
    }
  }

  const openaiKey = getOpenAiApiKey();
  if (!openaiKey) {
    console.error(
      "[reel-builder/tts] No ELEVENLABS_API_KEY (or ElevenLabs failed) and OPENAI_API_KEY is missing",
    );
    res.status(400).json({
      error: elevenKey
        ? "ElevenLabs TTS failed and OPENAI_API_KEY is missing for fallback"
        : "ELEVENLABS_API_KEY or OPENAI_API_KEY required for TTS",
    });
    return;
  }

  const openaiVoice = OPENAI_VOICES.has(voice.openai) ? voice.openai : "nova";
  const langCode =
    typeof body.language === "string"
      ? body.language
      : typeof body.language_code === "string"
        ? body.language_code
        : undefined;
  const spoken = prepareTtsForElevenLabs(input, langCode, pacing).slice(0, 4096);
  const payload = {
    model: "tts-1" as const,
    voice: openaiVoice,
    input: spoken,
    response_format: "mp3" as const,
    speed: pacing === "brand" ? Math.min(0.95, speed) : speed,
  };

  try {
    const client = createReelOpenAI(openaiKey);
    const speech = await client.audio.speech.create(payload);
    const buf = Buffer.from(await speech.arrayBuffer());
    // OpenAI has no alignment — estimate from ~150 wpm adjusted by speed
    const estDur = Math.max(0.8, spoken.split(/\s+/).filter(Boolean).length / (2.5 * speed));
    const words = estimateWordTimestamps(spoken, estDur);
    if (wantJson) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Reel-TTS-Provider", "openai");
      res.json({
        provider: "openai",
        mimeType: "audio/mpeg",
        audioBase64: buf.toString("base64"),
        words,
        word_timestamps: words,
      });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Reel-TTS-Provider", "openai");
    res.setHeader("X-Reel-Word-Timestamps", encodeURIComponent(JSON.stringify(words)));
    res.send(buf);
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/tts] OpenAI TTS failed:", detail);
    res.status(500).json({ error: detail || "TTS failed" });
  }
});

/** Batch: generate alternate viral script variations (Reel Builder only). */
router.post("/variations", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }
  const body = req.body ?? {};
  const count = Math.min(5, Math.max(2, Number(body.count) || 3));
  const hook = typeof body.hook === "string" ? body.hook : "";
  const problem = typeof body.problem === "string" ? body.problem : "";
  const solution = typeof body.solution === "string" ? body.solution : "";
  const result = typeof body.result === "string" ? body.result : "";
  const captions = typeof body.captions === "string" ? body.captions : "";
  if (!hook && !problem) {
    res.status(400).json({ error: "hook or problem required" });
    return;
  }
  try {
    const client = createReelOpenAI(apiKey);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write high-converting SaaS short-form reel scripts for InterpreterAI (live 62-language interpretation).
Rotate across frameworks when producing variations:
1) POV Pain Point — relatable struggle → manual typing nightmare → AI automation → ROI
2) Us vs Them — handwritten/manual typing vs instant 62-language live AI
3) Shocking Industry Stat — error rate / lost hours → InterpreterAI solution
Return JSON: { "variations": [ { "hook", "problem", "solution", "result", "captions", "framework" } ] }
Produce exactly ${count} distinct variations. Punchy spoken lines, 8–22 words per field. Include at least one concrete stat or number in result or hook. No hashtags.`,
        },
        {
          role: "user",
          content: JSON.stringify({ seed: { hook, problem, solution, result, captions }, count }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { variations?: unknown };
    const list = Array.isArray(parsed.variations) ? parsed.variations : [];
    const variations = list.slice(0, count).map((v) => {
      const row = (v && typeof v === "object" ? v : {}) as Record<string, string>;
      return {
        hook: row.hook || hook,
        problem: row.problem || problem,
        solution: row.solution || solution,
        result: row.result || result,
        captions: row.captions || captions,
        framework: row.framework || "pov_pain",
      };
    });
    res.json({ variations });
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/variations] error:", detail);
    res.status(500).json({ error: detail });
  }
});

const SCRIPT_FRAMEWORKS = {
  pov_pain: {
    id: "pov_pain",
    label: "POV Pain Point",
    brief:
      "Framework 1 — POV Pain Point: Relatable interpreter struggle → Manual typing nightmare → AI automation reveal → Clear ROI / time saved.",
  },
  us_vs_them: {
    id: "us_vs_them",
    label: "Us vs Them",
    brief:
      "Framework 2 — Us vs Them: Handwritten / manual typing chaos vs Instant 62-language live AI transcription with InterpreterAI.",
  },
  shocking_stat: {
    id: "shocking_stat",
    label: "Shocking Industry Stat",
    brief:
      "Framework 3 — Shocking Industry Stat: Open with error rate / lost hours / cost, then InterpreterAI as the fix with a crisp proof number.",
  },
} as const;

type FrameworkKey = keyof typeof SCRIPT_FRAMEWORKS;

function resolveFramework(raw: unknown): FrameworkKey {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "auto";
  if (v === "pov" || v === "pov_pain" || v === "pain") return "pov_pain";
  if (v === "us_vs_them" || v === "us-vs-them" || v === "versus") return "us_vs_them";
  if (v === "shocking_stat" || v === "stat" || v === "stats") return "shocking_stat";
  const keys = Object.keys(SCRIPT_FRAMEWORKS) as FrameworkKey[];
  return keys[Math.floor(Math.random() * keys.length)]!;
}

/**
 * High-converting SaaS ad script engine.
 * POST /api/reel-builder/script
 */
router.post("/script", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }
  const body = req.body ?? {};
  const frameworkKey = resolveFramework(body.framework ?? body.frameworkId ?? "auto");
  const fw = SCRIPT_FRAMEWORKS[frameworkKey];
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const series = typeof body.series === "string" ? body.series.trim() : "";
  const targetLanguage =
    typeof body.targetLanguage === "string" && body.targetLanguage.trim()
      ? body.targetLanguage.trim()
      : "en";
  const seed = {
    hook: typeof body.hook === "string" ? body.hook : "",
    problem: typeof body.problem === "string" ? body.problem : "",
    solution: typeof body.solution === "string" ? body.solution : "",
    result: typeof body.result === "string" ? body.result : "",
  };

  try {
    const client = createReelOpenAI(apiKey);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior SaaS performance creative for InterpreterAI — live interpretation / 62-language transcription for professional interpreters.

Write ONE vertical-video ad script using this framework exclusively:
${fw.brief}

Structure JSON keys exactly:
{
  "framework": "${fw.id}",
  "frameworkLabel": "${fw.label}",
  "hook": "...",
  "problem": "...",
  "solution": "...",
  "result": "...",
  "captions": "optional on-screen supporting line"
}

Rules:
- Spoken lines: punchy, 8–22 words each. No hashtags. No emoji.
- Language: write in target language code "${targetLanguage}" (if not en, fully translate).
- Include at least one concrete measurable proof (e.g. "62 languages", "10 hours saved", "100% focus back", dollar or percent).
- Solution + Result should imply live product proof (workspace / live transcription), not vague claims.
- Hook must stop the scroll in under 3 seconds of reading.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            product: "InterpreterAI",
            framework: fw.id,
            topic: topic || undefined,
            series: series || undefined,
            seed: Object.values(seed).some(Boolean) ? seed : undefined,
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(raw) as Record<string, string>;
    } catch {
      res.status(502).json({ error: "Invalid model JSON", raw });
      return;
    }
    res.json({
      framework: fw.id,
      frameworkLabel: fw.label,
      hook: parsed.hook || seed.hook || "",
      problem: parsed.problem || seed.problem || "",
      solution: parsed.solution || seed.solution || "",
      result: parsed.result || seed.result || "",
      captions: parsed.captions || "",
      targetLanguage,
    });
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/script] error:", detail);
    res.status(500).json({ error: detail });
  }
});

/**
 * Creative Studio V2 — full commercial storyboard package.
 * POST /api/reel-builder/storyboard
 */
router.post("/storyboard", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }
  const body = req.body ?? {};
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "interpreters_2026";
  const campaignName = typeof body.campaignName === "string" ? body.campaignName : "Interpreters";
  const commercialBrief =
    typeof body.commercialBrief === "string" ? body.commercialBrief.trim() : "";
  if (commercialBrief.length < 8) {
    res.status(400).json({
      error:
        "Commercial Brief is required — write an idea or paste a full script to control the commercial.",
    });
    return;
  }
  const campaignBrief =
    typeof body.campaignBrief === "string" && body.campaignBrief.trim()
      ? body.campaignBrief.trim()
      : commercialBrief;
  const templateId = typeof body.templateId === "string" ? body.templateId : "commercial_30";
  const framework =
    typeof body.framework === "string" ? body.framework : resolveFramework(body.framework);
  const language =
    typeof body.language === "string" && body.language.trim() ? body.language.trim() : "en";
  const voiceId = typeof body.voiceId === "string" ? body.voiceId : "rachel";

  try {
    const client = createReelOpenAI(apiKey);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior SaaS creative director for InterpreterAI (live interpretation / 62 languages).
Craft level: Loom / Linear / Arc / Notion / Vercel / Stripe marketing films (NOT their branding).

The Commercial Brief is SOURCE MATERIAL ONLY.
You MUST interpret it — never parse, split, quote, or paste it.

HARD FORBIDDEN:
- Copying any sentence, clause, or distinctive phrase from the Commercial Brief into title, headlines, narration, captions, or shot notes
- Using the brief as on-screen text
- "Preserving wording" by splitting the user's prompt into scenes

REQUIRED PIPELINE (do this mentally, then output JSON):
1) Interpret the brief (intent, audience, offer, tension)
2) Write a COMPLETE continuous marketing script (no dead air, no "...")
3) Write scene narration that connects end-to-end (Hook → Problem → Product Reveal → Product Proof/Benefits)
4) Write ONE short headline per scene (max 8 words) — typography SUPPORTS visuals, never replaces them
5) Write captions synced to narration
6) Visual objective every scene: workspace / stock / motion_graphics / product close-up / feature callout
7) Camera: pan, slowZoom, punch-in, hold — always purposeful motion
8) Workspace is the HERO for product reveal + proof (large on screen)
9) Transitions + motion between beats
10) Emit the final storyboard

HARD STYLE RULES:
- Never create text-only black slides
- Never leave empty narration unless the user explicitly asked for silence
- Pauses under 0.5s only, always covered by UI motion
- Resemble Loom / Linear / Vercel / Stripe pacing — continuous engagement

Detect inputKind only to understand intent. Even if the brief contains a full script, REWRITE it as a premium commercial — do not reuse lines.

Return JSON ONLY:
{
  "title": "short original title",
  "inputKind": "full_script|bullet_points|rough_idea|product_announcement|feature_notes|marketing_brief",
  "marketingScript": "original full spoken commercial as one polished paragraph",
  "pipeline": {
    "hook": "original VO beat 1",
    "problem": "original VO beat 2",
    "solution": "original VO beat 3",
    "result": "original VO beat 4",
    "captions": "short original caption line"
  },
  "scenes": [
    {
      "index": 1,
      "headline": "original on-screen line, max 8 words",
      "subhead": "optional original support, max 12 words",
      "narration": "original spoken line matching pipeline beat",
      "caption": "short original caption",
      "visualDescription": "what we see — creative director note",
      "assetType": "workspace|stock|motion_graphics|typography",
      "cameraMovement": "e.g. Locked hold / Slow push-in",
      "motion": "fade|slideUp|scale|blurIn|zoom",
      "camera": "hold|slowZoom",
      "transition": "soft transition description",
      "voiceTiming": "e.g. VO 1.0s–3.0s",
      "background": "bg mood",
      "textAnimation": "type motion description",
      "workspacePlacement": "none|split|full|corner",
      "brollPlacement": "none|under|side",
      "overlays": ["asset hints"],
      "shotNotes": "same spirit as visualDescription",
      "statLabel": "optional stat like 62 Languages"
    }
  ],
  "cta": "Start Your Free Trial",
  "outro": {
    "line1": "Stay focused on the conversation.",
    "line2": "We'll handle the words."
  },
  "shotList": ["original shot 1", "original shot 2", "..."],
  "fullScript": "same as marketingScript"
}

Rules:
- Exactly 4 content scenes (indexes 1–4) = Hook, Problem, Product Reveal, Product Proof/Benefits.
- pipeline.solution = Product Reveal narration; pipeline.result = Proof/Benefits narration.
- Scenes 1,3,4 should usually be assetType "workspace". Scene 2 may be stock/motion_graphics over dimmed workspace.
- Every narration line must be a complete spoken sentence (no "..." placeholders).
- Punchy, cinematic, minimal. No hashtags, emoji, or neon language.
- Include at least one concrete number when it fits (62 languages, hours, trial days).
- Always include CTA + branded outro lines.
- Language: write all copy in language code "${language}".
- Framework intent: ${framework}.
- Locked Universal Brand Outro (do not rewrite structure): "Stay focused on the conversation." / "We'll handle the words." / "SUPPORTS 62 LANGUAGES" / "Start Free Trial" / spoken URL "InterpreterAI.org." at end — never lead with brand name.
- Never invent alternate outros — the brand sequence is permanent.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            campaignId,
            campaignName,
            campaignBrief,
            commercialBrief,
            templateId,
            product: "InterpreterAI",
            instruction:
              "Interpret commercialBrief as source material only. Write an original commercial. Never copy the brief into storyboard copy.",
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: {
      title?: string;
      inputKind?: string;
      marketingScript?: string;
      pipeline?: {
        hook?: string;
        problem?: string;
        solution?: string;
        result?: string;
        captions?: string;
      };
      scenes?: Array<Record<string, string | number | string[]>>;
      shotList?: string[];
      fullScript?: string;
      cta?: string;
      outro?: { line1?: string; line2?: string };
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      res.status(502).json({ error: "Invalid model JSON", raw });
      return;
    }

    const windows = [
      { role: "hook", label: "Scene 01", start: 1.0, end: 3.0 },
      { role: "problem", label: "Scene 02", start: 3.0, end: 7.0 },
      { role: "product", label: "Scene 03", start: 7.0, end: 18.0 },
      { role: "benefits", label: "Scene 04", start: 18.0, end: 26.0 },
    ] as const;
    const aiScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const storyboard = windows.map((w, i) => {
      const src =
        aiScenes.find((s) => Number(s.index) === i + 1) ||
        aiScenes[i] ||
        {};
      const pipelineKeys = ["hook", "problem", "solution", "result"] as const;
      const pipelineLine = parsed.pipeline?.[pipelineKeys[i]!];
      const scrub = (value: string) => {
        const v = value.trim();
        if (!v || /^[.…\s\-–—]+$/.test(v)) return "";
        const b = commercialBrief.toLowerCase().replace(/\s+/g, " ");
        const n = v.toLowerCase().replace(/\s+/g, " ");
        if (n === b) return "";
        if (n.length >= 24 && (b.includes(n) || n.includes(b))) return "";
        return v;
      };
      const fallbackNarration = [
        "High-stakes conversations move without pause.",
        "Manual notes steal focus when every spoken turn matters.",
        "InterpreterAI keeps the workspace live — transcription and translation in one place.",
        "Stay with the speaker. Let the workspace handle the words.",
      ] as const;
      const headline =
        scrub(String(src.headline || "")) ||
        ["The call won't wait.", "Presence fades first.", "Live words. Full presence.", "Stay with the speaker."][i]!;
      const narration =
        scrub(String(src.narration || src.voiceover || pipelineLine || "")) ||
        scrub(String(pipelineLine || "")) ||
        fallbackNarration[i]!;
      const captionLine =
        scrub(String(src.caption || src.captionLine || "")) || headline;
      const assetTypeRaw = String(src.assetType || "").toLowerCase();
      // Content beats never ship as typography-only black slides.
      const assetType = ["workspace", "stock", "motion_graphics"].includes(assetTypeRaw)
        ? assetTypeRaw
        : w.role === "problem"
          ? "stock"
          : "workspace";
      const words = captionLine.split(/\s+/).filter(Boolean);
      const dur = w.end - w.start;
      const captions = words.map((word, wi) => ({
        text: word,
        start: w.start + (wi / Math.max(1, words.length)) * dur * 0.85,
        end: w.start + ((wi + 1) / Math.max(1, words.length)) * dur * 0.85,
      }));
      const n = i + 1;
      const visualDescription =
        scrub(String(src.visualDescription || src.shotNotes || "")) ||
        (w.role === "problem"
          ? `${w.label} — dimmed workspace + tension B-roll, never text-only.`
          : `${w.label} — workspace hero with purposeful camera motion.`);
      const cameraMovement =
        String(src.cameraMovement || "").trim() ||
        (w.role === "product"
          ? "Punch-in on live workspace"
          : w.role === "benefits"
            ? "Slow proof zoom"
            : w.role === "hook"
              ? "Gentle pan across workspace"
              : "Hold with UI motion");
      const enterMotion = String(src.motion || "").trim();
      const enter =
        enterMotion === "slideUp" ||
        enterMotion === "scale" ||
        enterMotion === "blurIn" ||
        enterMotion === "zoom"
          ? enterMotion
          : i % 2 === 0
            ? "fade"
            : "slideUp";
      const overlays = [
        String(src.textAnimation || `Text anim ${String(n).padStart(2, "0")}`),
        assetType,
        ...(src.statLabel ? [String(src.statLabel).trim()] : []),
      ];
      return {
        id: `scene_${n}`,
        role: w.role,
        label: w.label,
        start: w.start,
        end: w.end,
        duration: dur,
        headline,
        subhead: src.subhead ? scrub(String(src.subhead)) || undefined : undefined,
        narration,
        voiceover: narration,
        backgroundAssetId: `bg_${String(((i * 3) % 20) + 1).padStart(2, "0")}`,
        background: String(src.background || `Background ${String(((i * 3) % 20) + 1).padStart(2, "0")}`),
        animation: String(src.textAnimation || `Text anim ${String(n).padStart(2, "0")}`),
        textAnimId: `text_${String(n).padStart(2, "0")}`,
        transition: String(src.transition || `Transition ${String(n).padStart(2, "0")}`),
        transitionInId: `tr_${String(n).padStart(2, "0")}`,
        openerId: `open_${String(n).padStart(2, "0")}`,
        closerId: `close_${String(n).padStart(2, "0")}`,
        statCardId: src.statLabel ? `stat_${String(((i * 2) % 20) + 1).padStart(2, "0")}` : undefined,
        iconAnimId: assetType === "workspace" ? `icon_${String(n).padStart(2, "0")}` : undefined,
        motion: {
          enter,
          exit: "fade",
          camera:
            String(src.camera || "") === "slowZoom" ||
            w.role === "product" ||
            w.role === "benefits"
              ? "slowZoom"
              : "hold",
          sfx: i === 0 ? "soft_whoosh" : undefined,
        },
        overlays,
        captions,
        captionLine,
        visualDescription,
        assetType,
        cameraMovement,
        voiceTiming:
          String(src.voiceTiming || "").trim() ||
          `VO ${w.start.toFixed(1)}s–${w.end.toFixed(1)}s · ${dur.toFixed(1)}s pad`,
        workspacePlacement:
          String(src.workspacePlacement || "") ||
          (assetType === "workspace"
            ? w.role === "problem"
              ? "corner"
              : "full"
            : w.role === "problem"
              ? "corner"
              : "none"),
        brollPlacement:
          String(src.brollPlacement || "") ||
          (assetType === "stock" ? "under" : "none"),
        shotNotes: visualDescription,
        statLabel: src.statLabel ? String(src.statLabel).trim() : undefined,
      };
    });

    // Intro + outro fixed brand scenes
    const intro = {
      id: "scene_intro",
      role: "intro",
      label: "Brand open",
      start: 0,
      end: 1.0,
      duration: 1.0,
      headline: "InterpreterAI",
      subhead: "Stay focused on the conversation.",
      narration: "",
      voiceover: "",
      backgroundAssetId: "bg_01",
      background: "Soft charcoal",
      animation: "Soft fade reveal",
      textAnimId: "text_01",
      transition: "Crossfade soft",
      transitionInId: "tr_01",
      openerId: "open_01",
      closerId: "close_01",
      motion: { enter: "fade", exit: "fade", camera: "hold" },
      overlays: ["Brand wordmark"],
      captions: [],
      captionLine: "",
      shotNotes: "Black. Logo. Tiny glow. Tagline. Max 1s.",
    };
    const outro = {
      id: "scene_outro",
      role: "outro",
      label: "Universal Brand Outro",
      start: 26.0,
      end: 30.0,
      duration: 4.0,
      headline: "Stay focused on the conversation.",
      subhead: "We'll handle the words.",
      narration:
        "Stay focused on the conversation. We'll handle the words. Supports sixty-two languages. Start your free trial. InterpreterAI.org.",
      voiceover:
        "Stay focused on the conversation. We'll handle the words. Supports sixty-two languages. Start your free trial. InterpreterAI.org.",
      backgroundAssetId: "bg_08",
      background: "Premium dark gradient",
      animation: "Locked brand sequence",
      textAnimId: "text_20",
      transition: "Clean join",
      transitionInId: "tr_12",
      openerId: "open_12",
      closerId: "close_20",
      motion: { enter: "fade", exit: "fade", camera: "hold" },
      overlays: ["Logo", "62 languages", "CTA", "app.interpreterai.org", "QR"],
      captions: [],
      captionLine: "Start Free Trial",
      shotNotes:
        "Locked Universal Brand Outro — 3D master, 62 languages, CTA, app.interpreterai.org, QR, fade black.",
    };

    const fullScript =
      parsed.marketingScript ||
      parsed.fullScript ||
      storyboard.map((s) => s.narration).filter(Boolean).join(" ");

    const allowedKinds = new Set([
      "full_script",
      "bullet_points",
      "rough_idea",
      "product_announcement",
      "feature_notes",
      "marketing_brief",
    ]);
    const inputKind = allowedKinds.has(String(parsed.inputKind || ""))
      ? String(parsed.inputKind)
      : "rough_idea";

    const scrubTitle = (value: string) => {
      const v = value.trim();
      const b = commercialBrief.toLowerCase().replace(/\s+/g, " ");
      const n = v.toLowerCase().replace(/\s+/g, " ");
      if (!v || n === b || (n.length >= 24 && (b.includes(n) || n.includes(b)))) {
        return `${campaignName} · Commercial`;
      }
      return v;
    };

    res.json({
      id: `sb_${Date.now()}`,
      campaignId,
      templateId,
      title: scrubTitle(String(parsed.title || `${campaignName} · Commercial`)),
      language,
      voiceId,
      totalDuration: 30,
      commercialBrief,
      inputKind,
      marketingScript: fullScript,
      script: {
        full: fullScript,
        scenes: storyboard.map((s) => s.narration),
      },
      storyboard: [intro, ...storyboard, outro],
      shotList: Array.isArray(parsed.shotList)
        ? parsed.shotList.map(String)
        : storyboard.map((s) => s.shotNotes),
      cta: {
        primary: typeof parsed.cta === "string" && parsed.cta.trim()
          ? parsed.cta.trim()
          : "Start your free trial",
        secondary: "7 Days Free · 2 Hours Daily",
        url: "https://app.interpreterai.org/invite?ref=1&u=admin",
      },
      translation: {
        language,
        tagline1: "Stay focused on the conversation.",
        tagline2: "We'll handle the words.",
      },
      exportHints: {
        width: 1080,
        height: 1920,
        fps: 30,
        filename: `${campaignId}_${templateId}_commercial.mp4`,
      },
    });
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/storyboard] error:", detail);
    res.status(500).json({ error: detail });
  }
});

/* ------------------------------------------------------------------ */
/* Focused Creative Studio — one-prompt 35s reel generation            */
/* ------------------------------------------------------------------ */

/** Fixed voice for generated reels (Adam — deep male). Overridable via env. */
const GENERATE_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID?.trim() || "pNInz6obpgDQGcFmaJgB";

/** Spec voice settings for the focused studio (hook + outro reads). */
const GENERATE_VOICE_SETTINGS = {
  stability: 0.3,
  similarity_boost: 0.75,
  style: 0.5,
  use_speaker_boost: true,
} as const;

/** Match marketing/reel-creator workspaceVoSync — pause between speakers. */
const WORKSPACE_EXCHANGE_GAP_SEC = 0.32;
const WORKSPACE_THIRD_SPEAKER_GAP_SEC = 0.48;

function workspaceExchangeGapSec(
  exchanges: Array<{ speaker?: string; thirdSpeakerVoiceId?: string }> | undefined,
  exchangeIndex: number,
): number {
  if (exchangeIndex <= 0) return 0;
  const ex = exchanges?.[exchangeIndex];
  const isThird = ex?.speaker === "C" || !!ex?.thirdSpeakerVoiceId?.trim();
  return isThird ? WORKSPACE_THIRD_SPEAKER_GAP_SEC : WORKSPACE_EXCHANGE_GAP_SEC;
}

const GENERATE_SERIES = new Set([
  "medical",
  "legal",
  "conference",
  "immigration",
  "education",
]);

function generateModel(): string {
  return process.env.REEL_OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function cleanLines(raw: unknown, count: number, fallback: string[]): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, count);
  while (out.length < count) out.push(fallback[out.length] ?? fallback[0]!);
  return out;
}

type HookClipInput = {
  scenario: string;
  sayLine: string;
};

type ProductPayoffInput = {
  sayLine: string;
  scenario: string;
  headline?: string;
  supportingText?: string;
  enabled?: boolean;
};

type WorkspaceExchange = {
  id: string;
  speaker: "A" | "B" | "C";
  thirdSpeakerVoiceId?: string;
  original: string;
  translation: string;
  originalLang: string;
  translationLang: string;
  startFrac: number;
  endFrac: number;
  translationStartFrac: number;
};

type WorkspacePayload = {
  sourceLang: string;
  targetLang: string;
  exchanges: WorkspaceExchange[];
};

type OutroCopyPayload = {
  line1: string;
  line2: string;
  ctaHeadline: string;
  languagesLine: string;
  ctaSubline: string;
  voiceover: string;
};

type GeneratedStoryboard = {
  hookScript: string;
  hookScenes: string[];
  workspace: WorkspacePayload;
  productPayoff?: ProductPayoffInput;
  outroVoiceover: string;
  outroCopy?: OutroCopyPayload;
};

const LOCKED_OUTRO_VO_EN =
  "Stay focused on the conversation. We'll handle the words. Supports sixty-two languages. Start your free trial. InterpreterAI.org.";

const DEFAULT_EXCHANGES_EN: Omit<WorkspaceExchange, "id">[] = [
  {
    speaker: "A",
    original: "Can you confirm they started the medication three days ago?",
    translation: "¿Puede confirmar que comenzó la medicación hace tres días?",
    originalLang: "en",
    translationLang: "es",
    startFrac: 0.04,
    endFrac: 0.34,
    translationStartFrac: 0.55,
  },
  {
    speaker: "B",
    original: "Sí, comenzó el lunes por la mañana, dosis de 10 miligramos.",
    translation: "Yes, they started Monday morning, ten milligram dose.",
    originalLang: "es",
    translationLang: "en",
    startFrac: 0.36,
    endFrac: 0.66,
    translationStartFrac: 0.55,
  },
  {
    speaker: "A",
    original: "Perfect. I'll note the allergy to penicillin before we continue.",
    translation: "Perfecto. Anotaré la alergia a la penicilina antes de continuar.",
    originalLang: "en",
    translationLang: "es",
    startFrac: 0.68,
    endFrac: 0.96,
    translationStartFrac: 0.5,
  },
];

let exchangeId = 0;
function newExId(): string {
  exchangeId += 1;
  return `wx-${exchangeId}`;
}

function stripWorkspaceRolePrefix(text: string): string {
  let t = text.trim();
  const re =
    /^(?:doctor|patient|nurse|provider|clinician|pharmacist|attorney|counsel|client|physician|interpreter)\s*[:\-–—]\s*/i;
  for (let i = 0; i < 3; i++) {
    const next = t.replace(re, "").trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/^\[(?:doctor|patient|nurse|provider|clinician|client)\]\s*/i, "").trim();
}

function normalizeExchanges(raw: unknown, sourceLang: string, targetLang: string): WorkspaceExchange[] {
  const langA = sourceLang || "en";
  let langB = targetLang || "es";
  if (langB === langA) langB = langA === "en" ? "es" : "en";

  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_EXCHANGES_EN.map((x, i) => {
      const speaker = i % 2 === 0 ? "A" : "B";
      const originalLang = speaker === "A" ? langA : langB;
      const translationLang = speaker === "A" ? langB : langA;
      return {
        ...x,
        id: newExId(),
        speaker,
        originalLang,
        translationLang,
      };
    });
  }
  const n = raw.length;
  const span = 0.92 / Math.max(1, n);
  return raw.slice(0, 8).map((item, i) => {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const thirdSpeakerVoiceId =
      typeof r.thirdSpeakerVoiceId === "string" ? r.thirdSpeakerVoiceId.trim() : "";
    const rawSpeaker = String(r.speaker ?? "").toUpperCase();
    const useThird = !!thirdSpeakerVoiceId || rawSpeaker === "C";
    const keptLang =
      typeof r.originalLang === "string" &&
      (r.originalLang === langA || r.originalLang === langB)
        ? r.originalLang
        : null;
    const defaultSpeaker: "A" | "B" = i % 2 === 0 ? "A" : "B";
    let speaker: "A" | "B" | "C";
    let originalLang: string;
    if (useThird) {
      speaker = "C";
      originalLang = keptLang ?? (i % 2 === 0 ? langA : langB);
    } else if (rawSpeaker === "A" || rawSpeaker === "B") {
      speaker = rawSpeaker;
      originalLang = speaker === "A" ? langA : langB;
    } else if (keptLang) {
      originalLang = keptLang;
      speaker = keptLang === langA ? "A" : "B";
    } else {
      speaker = defaultSpeaker;
      originalLang = defaultSpeaker === "A" ? langA : langB;
    }
    const translationLang = originalLang === langA ? langB : langA;
    return {
      id: typeof r.id === "string" ? r.id : newExId(),
      speaker,
      thirdSpeakerVoiceId: useThird ? thirdSpeakerVoiceId || undefined : undefined,
      original: stripWorkspaceRolePrefix(String(r.original ?? "")),
      translation: stripWorkspaceRolePrefix(String(r.translation ?? "")),
      originalLang,
      translationLang,
      startFrac: typeof r.startFrac === "number" ? r.startFrac : 0.04 + i * span,
      endFrac: typeof r.endFrac === "number" ? r.endFrac : 0.04 + (i + 1) * span,
      translationStartFrac: typeof r.translationStartFrac === "number" ? r.translationStartFrac : 0.55,
    };
  });
}

function parseHookClips(raw: unknown): HookClipInput[] | null {
  if (!Array.isArray(raw)) return null;
  const clips = raw
    .map((item) => {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        scenario: String(o.scenario ?? "").trim(),
        sayLine: String(o.sayLine ?? "").trim(),
      };
    })
    .filter((c) => c.scenario.length >= 4 && c.sayLine.length >= 3)
    .slice(0, 6);
  return clips.length > 0 ? clips : null;
}

function parseProductPayoff(raw: unknown): ProductPayoffInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sayLine = String(o.sayLine ?? "").trim();
  const scenario = String(o.scenario ?? "").trim();
  if (sayLine.length < 8 || scenario.length < 8) return null;
  return {
    sayLine,
    scenario,
    headline: typeof o.headline === "string" ? o.headline.trim() : undefined,
    supportingText: typeof o.supportingText === "string" ? o.supportingText.trim() : undefined,
    enabled: o.enabled !== false,
  };
}

function defaultProductPayoff(series: string): ProductPayoffInput {
  const benefits: Record<string, string> = {
    medical:
      "InterpreterAI keeps both sides of the conversation clear in real time, so you can stay focused on interpreting instead of trying to keep up.",
    legal:
      "See original speech and translation together — so you never lose legal nuance mid-deposition.",
    conference:
      "Follow both sides of the conversation without constantly switching between screens.",
    immigration:
      "Keep terminology visible while interpreting — so nothing gets lost in a high-stakes interview.",
    education:
      "Spend less time trying to catch every word and more time helping students participate.",
  };
  const sayLine =
    benefits[series] ??
    "InterpreterAI keeps both sides of the conversation clear in real time, so you can stay focused on interpreting.";
  return {
    sayLine,
    scenario:
      "Professional interpreter confidently continuing a remote call, premium SaaS commercial close-up. Use PRODUCT_SCREEN_RECORDING for the workspace portion; Pexels stock for the human payoff shot.",
    enabled: true,
  };
}

function hookBriefFromClips(clips: HookClipInput[]): string {
  return clips
    .map((c, i) => `Clip ${i + 1} footage: ${c.scenario}. Say: "${c.sayLine}"`)
    .join("\n");
}

/** Studio skipVoice builds — use authored hook clips + workspace; no OpenAI storyboard pass. */
function buildStudioStoryboardFromBody(
  body: Record<string, unknown>,
  hookClips: HookClipInput[],
  sourceLang: string,
  targetLang: string,
): GeneratedStoryboard {
  const workspace =
    parseWorkspaceFromBody(body.workspace, sourceLang, targetLang) ??
    applyInterpreterSpeakerPattern({
      sourceLang,
      targetLang,
      exchanges: [],
    });
  const outroVoiceover =
    typeof body.outroVoiceover === "string" && body.outroVoiceover.trim()
      ? body.outroVoiceover.trim()
      : LOCKED_OUTRO_VO_EN;
  const productPayoff =
    parseProductPayoff(body.productPayoff) ??
    (body.includeProductPayoff === false ? undefined : defaultProductPayoff(String(body.series ?? "medical")));
  return {
    hookScript: hookClips.map((c) => c.sayLine).join(" "),
    hookScenes: hookClips.map((c) => c.scenario),
    workspace,
    productPayoff,
    outroVoiceover,
  };
}

/** Split translated hook VO back into one line per clip. */
function splitHookScriptToClips(fullScript: string, count: number, fallback: string[]): string[] {
  const trimmed = fullScript.trim();
  if (!trimmed || count <= 0) return fallback;
  const parts = trimmed
    .split(/(?<=[.!?؟。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= count) return parts.slice(0, count);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= count) {
    const per = Math.ceil(words.length / count);
    return Array.from({ length: count }, (_, i) => {
      const chunk = words.slice(i * per, (i + 1) * per).join(" ").trim();
      return chunk || fallback[i] || "";
    });
  }
  return fallback.map((fb, i) => parts[i] || fb);
}

function parseWorkspaceFromBody(
  raw: unknown,
  sourceLang: string,
  targetLang: string,
): WorkspacePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const ws = raw as Record<string, unknown>;
  const langA = typeof ws.sourceLang === "string" ? ws.sourceLang : sourceLang;
  const langB = typeof ws.targetLang === "string" ? ws.targetLang : targetLang;
  const exchanges = normalizeExchanges(ws.exchanges, langA, langB);
  if (exchanges.length === 0) return null;
  return applyInterpreterSpeakerPattern({
    sourceLang: langA,
    targetLang: langB,
    exchanges,
  });
}

/** Preserve Studio Blue/Yellow/Pink + originalLang — never force A/B by row index. */
function applyInterpreterSpeakerPattern(ws: WorkspacePayload): WorkspacePayload {
  const langA = ws.sourceLang || "en";
  let langB = ws.targetLang || "es";
  if (langB === langA) langB = langA === "en" ? "es" : "en";

  let prevOriginalLang: string | null = null;

  const exchanges = ws.exchanges.map((x) => {
    const thirdVoice = x.thirdSpeakerVoiceId?.trim();
    const useThird = !!thirdVoice || x.speaker === "C";

    let originalLang: string;
    let speaker: "A" | "B" | "C";

    const keptLang =
      x.originalLang === langA || x.originalLang === langB ? x.originalLang : null;

    if (useThird) {
      if (keptLang) {
        originalLang = keptLang;
      } else if (prevOriginalLang === langA) {
        originalLang = langB;
      } else if (prevOriginalLang === langB) {
        originalLang = langA;
      } else {
        originalLang = langB;
      }
      speaker = "C";
    } else if (keptLang) {
      originalLang = keptLang;
      speaker = keptLang === langA ? "A" : "B";
    } else if (x.speaker === "A" || x.speaker === "B") {
      speaker = x.speaker;
      originalLang = speaker === "A" ? langA : langB;
    } else if (prevOriginalLang === langA) {
      originalLang = langB;
      speaker = "B";
    } else if (prevOriginalLang === langB) {
      originalLang = langA;
      speaker = "A";
    } else {
      originalLang = langA;
      speaker = "A";
    }

    const translationLang = originalLang === langA ? langB : langA;
    prevOriginalLang = originalLang;

    return {
      ...x,
      speaker,
      thirdSpeakerVoiceId: useThird ? thirdVoice || x.thirdSpeakerVoiceId : undefined,
      originalLang,
      translationLang,
    };
  });

  return { sourceLang: langA, targetLang: langB, exchanges };
}

/** Align exchange typing windows with packed workspace VO clip timings. */
function syncWorkspaceExchangeFracs(
  exchanges: WorkspaceExchange[],
  clips: Array<{ startSec: number; words: WordTimestamp[]; exchangeIndex?: number }>,
  segmentSec = 15,
): WorkspaceExchange[] {
  const clipByExchange = new Map<number, (typeof clips)[number]>();
  clips.forEach((clip, i) => {
    const idx =
      typeof clip.exchangeIndex === "number" && clip.exchangeIndex >= 0 ? clip.exchangeIndex : i;
    clipByExchange.set(idx, clip);
  });
  return exchanges.map((ex, i) => {
    const clip = clipByExchange.get(i);
    if (!clip) return ex;
    const dur = clipSpeechEndSec(clip.words);
    const startFrac = Math.min(0.98, clip.startSec / segmentSec);
    const endFrac = Math.min(1, (clip.startSec + dur) / segmentSec);
    const speechEndFrac = Math.min(0.98, (clip.startSec + dur) / segmentSec);
    return {
      ...ex,
      startFrac,
      endFrac: Math.max(startFrac + 0.05, endFrac),
      translationStartFrac: Math.min(0.95, speechEndFrac),
    };
  });
}

/** Legacy flat prompt — used as hook VO verbatim when hookClips are not supplied. */
function resolveHookScript(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function normalizeGeneratedStoryboard(
  parsed: Record<string, unknown>,
  prompt: string,
  sourceLang: string,
  targetLang: string,
  series: string,
  hookClips: HookClipInput[] | null = null,
): GeneratedStoryboard {
  const hookScenes = hookClips
    ? hookClips.map((c) => c.scenario)
    : normalizeHookScenes(parsed.hookScenes, prompt, series);
  const hookScript = hookClips
    ? hookClips.map((c) => c.sayLine).join(" ")
    : resolveHookScript(prompt);
  const ws = (parsed.workspace ?? parsed.workspaceScript ?? {}) as Record<string, unknown>;
  const exchanges = normalizeExchanges(ws.exchanges, sourceLang, targetLang);
  const productPayoff =
    parseProductPayoff(parsed.productPayoff) ?? defaultProductPayoff(series);
  return {
    hookScript,
    hookScenes,
    workspace: applyInterpreterSpeakerPattern({
      sourceLang: typeof ws.sourceLang === "string" ? ws.sourceLang : sourceLang,
      targetLang: typeof ws.targetLang === "string" ? ws.targetLang : targetLang,
      exchanges,
    }),
    productPayoff,
    outroVoiceover: LOCKED_OUTRO_VO_EN,
  };
}

const SERIES_PEXELS_CONTEXT: Record<string, string> = {
  medical: "hospital clinic doctor nurse patient chart EMR",
  legal: "courtroom lawyer attorney deposition legal office",
  conference: "business conference keynote audience presenter stage",
  immigration: "immigration office passport interview documents",
  education: "classroom teacher student lecture campus",
};

/** Turn OpenAI hookScenes + user prompt into detailed portrait Pexels queries. */
function normalizeHookScenes(raw: unknown, prompt: string, series: string): string[] {
  const fromAi: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) fromAi.push(item.trim());
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const q =
          (typeof o.query === "string" && o.query.trim()) ||
          (typeof o.search === "string" && o.search.trim()) ||
          [o.subject, o.action, o.setting, o.mood, o.vertical]
            .filter((v) => typeof v === "string" && v.trim())
            .join(" ")
            .trim();
        if (q) fromAi.push(q);
      }
    }
  }
  const derived = buildPexelsQueriesFromPrompt(prompt, series);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const q of [...fromAi, ...derived]) {
    const norm = q.trim().replace(/\s+/g, " ");
    if (!norm || seen.has(norm.toLowerCase())) continue;
    seen.add(norm.toLowerCase());
    merged.push(norm);
  }
  return merged.slice(0, 6);
}

/** Derive concrete portrait search strings from the user's hook script. */
function buildPexelsQueriesFromPrompt(prompt: string, series: string): string[] {
  const ctx = SERIES_PEXELS_CONTEXT[series] ?? "professional office business";
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can",
    "this", "that", "these", "those", "every", "day", "hours", "hour", "minute", "minutes",
  ]);
  const keywords = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 8);
  const kw = keywords.length > 0 ? keywords.join(" ") : ctx;
  return [
    `vertical portrait 9:16 ${kw} ${ctx} cinematic b-roll smartphone`,
    `close up hands typing laptop ${kw} vertical phone footage`,
    `stressed professional ${kw} office vertical portrait cinematic`,
    `vertical ${ctx} ${kw} modern office phone screen`,
  ];
}

function clipSpeechEndSec(words: WordTimestamp[], audio?: Buffer, fallbackSec = 2): number {
  let dur = fallbackSec;
  if (words.length > 0) {
    dur = Math.max(0.35, words[words.length - 1]!.end + 0.04);
  }
  if (audio && audio.length > 0) {
    const estSec = (audio.length * 8) / 128000;
    if (estSec > 0.05) dur = Math.min(dur, estSec);
  }
  return dur;
}

/** Rough VO length before TTS — prefer Pexels clips long enough for the spoken line. */
function estimateSayLineDurationSec(sayLine: string, language = "en"): number {
  const text = sayLine.trim();
  if (!text) return 2;
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const wps = language === "en" ? 2.35 : 2.05;
  const fromWords = words / wps;
  const fromChars = chars / (language === "en" ? 14 : 12);
  return Math.max(1.2, Math.min(12, Math.max(fromWords, fromChars) + 0.35));
}

function clipDurationSec(words: WordTimestamp[], audio?: Buffer, fallbackSec = 2): number {
  return clipSpeechEndSec(words, audio, fallbackSec);
}

/** Split spoken outro into phrase chunks (sentence boundaries). */
function splitOutroPhrases(text: string): string[] {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?؟。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/** Single TTS call — punctuation controls pause between phrases (saves ElevenLabs credits). */
function formatOutroForSingleTts(text: string, phraseGapSec: number): string {
  const trimmed = sanitizeTtsInput(text);
  const phrases = splitOutroPhrases(trimmed);
  if (phrases.length <= 1) return trimmed;
  const gap = Math.max(0, phraseGapSec);
  if (gap <= 0.08) return phrases.join(", ");
  if (gap <= 0.22) return phrases.join(". ");
  return phrases.join(".  ");
}

/** Pack workspace exchange TTS — hold after speech for translation reveal, then gap before next speaker. */
function packWorkspaceVoClips(
  clips: Array<{ audioBase64: string; words: WordTimestamp[]; exchangeIndex: number }>,
  exchanges?: Array<{ speaker?: string; thirdSpeakerVoiceId?: string; translation?: string }>,
): Array<{ audioBase64: string; startSec: number; exchangeIndex: number; durationSec?: number }> {
  const sorted = [...clips].sort((a, b) => a.exchangeIndex - b.exchangeIndex);
  let cursor = 0;
  const out: Array<{ audioBase64: string; startSec: number; exchangeIndex: number; durationSec?: number }> = [];
  for (const clip of sorted) {
    cursor += workspaceExchangeGapSec(exchanges, clip.exchangeIndex);
    const audio = Buffer.from(clip.audioBase64, "base64");
    const speechDur = clipSpeechEndSec(clip.words, audio);
    // Match client TRANS_TAIL_HOLD_SEC (0.24) so preview schedule and packed startSec stay aligned.
    const holdSec = 0.24;
    out.push({
      audioBase64: clip.audioBase64,
      startSec: cursor,
      exchangeIndex: clip.exchangeIndex,
      durationSec: speechDur,
    });
    cursor += speechDur + holdSec;
  }
  return out;
}

type HookVoClipPayload = {
  audioBase64: string;
  startSec: number;
  durationSec: number;
  footageUrl: string;
  sayLine: string;
  scenario: string;
  words: WordTimestamp[];
  footageStatus?: FootageSelectionStatus;
  pexelsVideoId?: number;
  composition?: string;
  footageMetadata?: FootageSceneMetadata;
};

type ProductPayoffVoClipPayload = {
  audioBase64: string;
  startSec: number;
  durationSec: number;
  footageUrl: string;
  sayLine: string;
  scenario: string;
  headline?: string;
  supportingText?: string;
  words: WordTimestamp[];
  footageStatus?: FootageSelectionStatus;
  pexelsVideoId?: number;
  composition?: string;
  footageMetadata?: FootageSceneMetadata;
};

/** Pack hook clip TTS + Pexels footage — duration follows voiceover, not a fixed 10s cap. */
function packHookVoClips(
  clips: Array<{
    audioBase64: string;
    words: WordTimestamp[];
    footageUrl: string;
    sayLine: string;
    scenario: string;
  }>,
): HookVoClipPayload[] {
  let cursor = 0;
  const out: HookVoClipPayload[] = [];
  for (const clip of clips) {
    const audio = Buffer.from(clip.audioBase64, "base64");
    const durationSec = clipSpeechEndSec(clip.words, audio);
    out.push({
      audioBase64: clip.audioBase64,
      startSec: cursor,
      durationSec,
      footageUrl: clip.footageUrl,
      sayLine: clip.sayLine,
      scenario: clip.scenario,
      words: clip.words,
    });
    cursor += durationSec;
  }
  return out;
}

async function generateStoryboardEn(
  client: OpenAI,
  brief: string,
  series: string,
  sourceLang: string,
  targetLang: string,
  hookClips: HookClipInput[] | null,
): Promise<GeneratedStoryboard> {
  const hookMode = hookClips !== null;
  const completion = await client.chat.completions.create({
    model: generateModel(),
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: hookMode
          ? `You are a senior short-form creative director for InterpreterAI — live interpretation, transcription and translation across 62 languages.

The user supplied 3 hook clips (footage scenario + spoken line each). Hook voiceover and Pexels queries are already set — do NOT rewrite them.
Write workspace dialogue for the 15s live demo segment AND one Product Payoff scene (benefit statement after the workspace).

Return STRICT JSON ONLY:
{
  "workspace": {
    "sourceLang": "${sourceLang}",
    "targetLang": "${targetLang}",
    "exchanges": [
      {
        "speaker": "A or B (alternate — blue bar vs yellow bar)",
        "original": "spoken line in originalLang",
        "translation": "interpretation in translationLang",
        "originalLang": "language code of original",
        "translationLang": "language code of translation"
      }
    ]
  },
  "productPayoff": {
    "sayLine": "One concise persuasive benefit for the interpreter — WHY they should care. Do NOT repeat workspace dialogue.",
    "scenario": "Footage description. Use PRODUCT_SCREEN_RECORDING for real InterpreterAI workspace portions. Pexels stock for human/supporting shots. Alternate visual composition from hook scenes.",
    "headline": "optional short on-screen headline",
    "supportingText": "optional supporting line"
  }
}

Rules:
- workspace: exactly 3 exchanges for a ${series} interpretation call.
- productPayoff: ONE scene between workspace demo and brand outro. Translate the demonstrated feature into a clear benefit. Vary benefit angle by topic (speed, dual-language visibility, terminology, context, etc.).
- productPayoff.scenario must NOT request the same Pexels subject as every hook clip — use a different visual composition (hands, wide shot, listening, etc.).
- Speaker A (blue bar): ORIGINAL must be in ${sourceLang}; TRANSLATION must be in ${targetLang}.
- Speaker B (yellow bar): ORIGINAL must be in ${targetLang}; TRANSLATION must be in ${sourceLang}.
- Rows alternate A → B → A. Never put ${sourceLang} text in yellow's ORIGINAL column.
- Realistic dialogue matching the hook topic. Steady natural phrasing (no stutter dots).
- Never prefix lines with Doctor, Patient, Nurse, or other role labels — speaker color bars indicate turns.
- Do not repeat "doctor" and "patient" in every line; write natural conversation.
- Write originals in the correct language for each speaker — not English unless that is the speaker's language.`
          : `You are a senior short-form creative director for InterpreterAI — live interpretation, transcription and translation across 62 languages.

From the user's reel prompt, write workspace dialogue and **detailed Pexels video search queries** for the hook b-roll.
Fixed timeline: hook (portrait stock footage + user's exact voiceover script) → 15s live workspace demo → Product Payoff benefit scene → brand outro. NO intro.
The hook voiceover text is supplied by the user verbatim — do NOT generate or rewrite hookScript.

Return STRICT JSON ONLY:
{
  "hookScenes": [
    "Detailed Pexels portrait 9:16 query — subject + action + setting + mood + vertical"
  ],
  "workspace": {
    "sourceLang": "${sourceLang}",
    "targetLang": "${targetLang}",
    "exchanges": [
      {
        "speaker": "A or B (alternate — blue bar vs yellow bar)",
        "original": "spoken line in originalLang",
        "translation": "interpretation in translationLang",
        "originalLang": "language code of original",
        "translationLang": "language code of translation"
      }
    ]
  },
  "productPayoff": {
    "sayLine": "One concise persuasive benefit — WHY the interpreter should care",
    "scenario": "Footage description with varied composition. PRODUCT_SCREEN_RECORDING for workspace; Pexels for human shots.",
    "headline": "optional on-screen headline",
    "supportingText": "optional supporting line"
  }
}

Rules:
- Do NOT output hookScript — the user's prompt is the hook voiceover exactly.
- hookScenes: 3–4 queries. Each 8–14 words. Must include: vertical OR portrait OR 9:16, the subject (person/profession), the action (typing, talking, stressed, etc.), setting (hospital, court, office), mood (cinematic, urgent, calm). Derive visuals directly from the user's prompt topic — e.g. medical interpreters → hospital nurse typing charts; legal → attorney in deposition. Each query must describe a DIFFERENT visual composition — never repeat the same subject/action.
- productPayoff: ONE benefit scene after workspace. Do NOT repeat workspace dialogue. Vary the benefit angle by reel topic.
- workspace: exactly 3 exchanges for a ${series} interpretation call.
- Speaker A (blue bar): ORIGINAL in ${sourceLang}; TRANSLATION in ${targetLang}.
- Speaker B (yellow bar): ORIGINAL in ${targetLang}; TRANSLATION in ${sourceLang}.
- Rows alternate A → B → A. Never put ${sourceLang} in yellow's ORIGINAL column.
- Realistic dialogue, steady natural phrasing (no stutter dots).
- Never prefix lines with Doctor, Patient, Nurse, or other role labels — speaker color bars indicate turns.
- Do not repeat "doctor" and "patient" in every line; write natural conversation.
- Write originals in the correct language for each speaker.`,
      },
      {
        role: "user",
        content: JSON.stringify({ prompt: brief, series, sourceLang, targetLang, hookClips }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return normalizeGeneratedStoryboard(parsed, brief, sourceLang, targetLang, series, hookClips);
}

/** Translate hook VO, product payoff, and outro — workspace ORIGINAL lines stay in Lang A / Lang B as authored. */
async function translateGeneratedStoryboard(
  client: OpenAI,
  en: GeneratedStoryboard,
  language: string,
): Promise<GeneratedStoryboard> {
  const completion = await client.chat.completions.create({
    model: generateModel(),
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You translate InterpreterAI reel hook voiceover, product payoff benefit line, and outro copy into language code "${language}".
Return STRICT JSON ONLY:
{
  "hookScript": "...",
  "productPayoffSayLine": "translation of the product payoff benefit voiceover (if provided)",
  "outroLine1": "translation of Stay focused on the conversation.",
  "outroLine2": "translation of We'll handle the words.",
  "outroLanguagesLine": "translation of SUPPORTS 62 LANGUAGES",
  "outroCtaHeadline": "translation of Start Free Trial",
  "outroCtaSubline": "translation of 7 days free · No credit card",
  "outroVoiceover": "full spoken outro VO — five phrases: headline, subhead, languages, CTA, then InterpreterAI.org at the end. Do NOT start with the brand name."
}
NEVER translate "InterpreterAI" or "InterpreterAI.org".
Numbers must be fully spelled out as spoken words in ${language} — never bare digits (e.g. write the spoken form of 62 and 7, not "62" or "7").
For the languages line, the count is always sixty-two (62) — use the natural spoken form in ${language}, not digit-by-digit.
hookScript: translate the user's original hook voiceover faithfully — same meaning, speakable in ~10 seconds.
productPayoffSayLine: translate the benefit statement faithfully — one concise persuasive sentence.
Do NOT translate workspace dialogue — that is handled separately in a bilingual language pair.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          hookScript: en.hookScript,
          productPayoffSayLine: en.productPayoff?.sayLine ?? "",
          outroEn: LOCKED_OUTRO_VO_EN,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const line1 = String(parsed.outroLine1 ?? "Stay focused on the conversation.").trim();
  const line2 = String(parsed.outroLine2 ?? "We'll handle the words.").trim();
  const outroVoiceover =
    (typeof parsed.outroVoiceover === "string" && parsed.outroVoiceover.trim()) ||
    `${line1} ${line2} Supports sixty-two languages. Start your free trial. InterpreterAI.org.`;
  const productPayoffSayLine =
    typeof parsed.productPayoffSayLine === "string" ? parsed.productPayoffSayLine.trim() : "";
  return {
    hookScript:
      (typeof parsed.hookScript === "string" && parsed.hookScript.trim()) || en.hookScript,
    hookScenes: en.hookScenes,
    workspace: applyInterpreterSpeakerPattern(en.workspace),
    productPayoff: en.productPayoff
      ? {
          ...en.productPayoff,
          sayLine: productPayoffSayLine || en.productPayoff.sayLine,
        }
      : undefined,
    outroVoiceover,
    outroCopy: {
      line1,
      line2,
      ctaHeadline: String(parsed.outroCtaHeadline ?? "Start Free Trial").trim(),
      languagesLine: String(parsed.outroLanguagesLine ?? "Supports 62 languages").trim(),
      ctaSubline: String(parsed.outroCtaSubline ?? "7 days free · No credit card").trim(),
      voiceover: outroVoiceover,
    },
  };
}

const FALLBACK_PEXELS_QUERIES = [
  "vertical portrait 9:16 professional typing laptop office cinematic",
  "stressed business person phone vertical smartphone footage",
  "portrait medical office doctor chart vertical b-roll",
];

/** Veo-only continuity helper — Pexels uses diversity system instead. */
const CONTINUITY_TOKEN_RE =
  /\b(nurse|doctor|physician|patient|lawyer|attorney|interpreter|teacher|student|woman|man|person|professional|staff|clerk|receptionist|hospital|clinic|office|courtroom|classroom|corridor|desk|laptop|same)\b/gi;

function extractContinuityTokens(scenario: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of scenario.toLowerCase().matchAll(CONTINUITY_TOKEN_RE)) {
    if (m[1]) tokens.add(m[1].toLowerCase());
  }
  return tokens;
}

function scenariosShareContinuity(baseScenario: string, nextScenario: string): boolean {
  const a = extractContinuityTokens(baseScenario);
  const b = extractContinuityTokens(nextScenario);
  if (a.size === 0 || b.size === 0) return false;
  for (const t of a) {
    if (b.has(t)) return true;
  }
  return false;
}

async function fetchPexelsVideos(apiKey: string, query: string): Promise<PexelsVideo[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const params = new URLSearchParams({
      query: q,
      orientation: "portrait",
      per_page: "15",
      size: "medium",
    });
    const res = await fetch(`https://api.pexels.com/videos/search?${params.toString()}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      console.warn("[reel-builder/pexels] search failed:", res.status, q.slice(0, 60));
      return [];
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    return data.videos ?? [];
  } catch (e) {
    console.warn("[reel-builder/pexels] query error:", q.slice(0, 40), e);
    return [];
  }
}

/** Diversity-aware Pexels selection — never reuses video IDs within one reel. */
async function searchPexelsDiverseFootage(
  apiKey: string,
  scenario: string,
  series: string,
  ctx: FootageDiversityContext,
  sceneId: string,
  minDurationSec = 0,
): Promise<{ url: string; metadata: FootageSceneMetadata }> {
  if (isProductScreenRecording(scenario) && !extractStockQueryFromScenario(scenario)) {
    return {
      url: "",
      metadata: {
        sceneId,
        footageType: "product_recording",
        searchQueries: [],
        status: "product_recording",
      },
    };
  }

  const stockScenario = extractStockQueryFromScenario(scenario) || scenario.trim();
  const preferred = inferComposition(stockScenario);
  const target = pickAlternateComposition(preferred, ctx.lastComposition);
  const queries = buildSearchQueryVariants(stockScenario, ctx.sceneIndex, series, target);

  const pooled: PexelsVideo[] = [];
  for (const query of queries) {
    const batch = await fetchPexelsVideos(apiKey, query);
    for (const v of batch) pooled.push(v);
    const candidate = pickBestUnusedCandidate(pooled, ctx, stockScenario, minDurationSec);
    if (candidate) {
      markCandidateUsed(ctx, candidate);
      return {
        url: candidate.link,
        metadata: {
          sceneId,
          footageType: "pexels",
          searchQueries: queries,
          pexelsVideoId: candidate.videoId,
          sourceUrl: candidate.link,
          composition: candidate.composition,
          stockDurationSec: candidate.stockDurationSec,
          status: "ok",
        },
      };
    }
  }

  return {
    url: "",
    metadata: {
      sceneId,
      footageType: "none",
      searchQueries: queries,
      status: "footage_needed",
    },
  };
}

/** Legacy batch hook search — diversity enforced across all queries. */
async function searchPexelsFootage(
  apiKey: string,
  queries: string[],
  prompt: string,
  series: string,
): Promise<string[]> {
  const ctx = createFootageDiversityContext();
  const urls: string[] = [];
  const derived = buildPexelsQueriesFromPrompt(prompt, series);
  const allQueries = [...queries, ...derived, ...FALLBACK_PEXELS_QUERIES];
  const seen = new Set<string>();
  for (const query of allQueries) {
    if (urls.length >= 6) break;
    const q = query.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    const { url } = await searchPexelsDiverseFootage(apiKey, q, series, ctx, `legacy-${urls.length}`);
    if (url) urls.push(url);
  }
  return urls;
}

/** One portrait HD clip — editorial diversity, no continuity reuse. */
async function searchPexelsOneFootage(
  apiKey: string,
  scenario: string,
  series: string,
  ctx: FootageDiversityContext,
  sceneId: string,
  minDurationSec = 0,
): Promise<{ url: string; metadata: FootageSceneMetadata }> {
  return searchPexelsDiverseFootage(apiKey, scenario, series, ctx, sceneId, minDurationSec);
}

function parseFootageProvider(raw: unknown): FootageProviderId {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "google_veo" || v === "google" || v === "veo" || v === "google_ai") {
    return "google_veo";
  }
  return "pexels";
}

/** One Veo-generated clip for a hook scene (same continuity rules as Pexels). */
async function searchGoogleVeoOneFootage(
  apiKey: string,
  scenario: string,
  series: string,
  opts?: {
    clipIndex?: number;
    continuityScenario?: string;
    preferUrl?: string;
  },
): Promise<string | null> {
  if (
    opts?.clipIndex &&
    opts.clipIndex > 0 &&
    opts.preferUrl &&
    opts.continuityScenario &&
    scenariosShareContinuity(opts.continuityScenario, scenario)
  ) {
    return opts.preferUrl;
  }
  const ctx = SERIES_PEXELS_CONTEXT[series] ?? "professional office business";
  return generateGoogleVeoFootage(apiKey, scenario, ctx);
}

/** Public cache for Veo MP4s — same-origin via /api proxy in dev. */
router.get("/footage/:filename", (req, res, next) => {
  const filename = String(req.params.filename ?? "");
  if (!isSafeVeoFootageFilename(filename)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const filePath = veoFootageFilePath(filename);
  if (!filePath || !existsSync(filePath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  ensureVeoMp4WebReady(filePath);

  let fileSize: number;
  try {
    fileSize = statSync(filePath).size;
  } catch (err) {
    next(err);
    return;
  }

  const commonHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
  };

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.status(416).set(commonHeaders).set("Content-Range", `bytes */${fileSize}`).end();
      return;
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).set(commonHeaders).set("Content-Range", `bytes */${fileSize}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...commonHeaders,
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": String(chunkSize),
    });
    const stream = createReadStream(filePath, { start, end });
    stream.on("error", (err) => next(err));
    stream.pipe(res);
    return;
  }

  res.writeHead(200, {
    ...commonHeaders,
    "Content-Length": String(fileSize),
  });
  const stream = createReadStream(filePath);
  stream.on("error", (err) => next(err));
  stream.pipe(res);
});

/** Public bundled hook b-roll when bundled hook b-roll exists under marketing/reel-creator/public/media/. */
function resolveLocalHookBrollPublicUrl(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../../../marketing/reel-creator/public/media/hook-broll.mp4"),
    join(process.cwd(), "marketing/reel-creator/public/media/hook-broll.mp4"),
    join(process.cwd(), "../marketing/reel-creator/public/media/hook-broll.mp4"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return "/media/hook-broll.mp4";
  }
  return null;
}

/**
 * ElevenLabs TTS for hook clips, workspace exchanges, and translated outro.
 * Shared by POST /voiceover (once) and POST /generate (when skipVoice is false).
 */
async function synthesizeReelVoiceovers(opts: {
  hookClips: HookClipInput[] | null;
  hookScript: string;
  workspace: GeneratedStoryboard["workspace"];
  productPayoff?: ProductPayoffInput | null;
  includeProductPayoff?: boolean;
  outroVoiceover: string;
  language: string;
  includeHook?: boolean;
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  outroPhraseGapSec?: number;
  hookVoiceId?: string;
  productPayoffVoiceId?: string;
  workspaceSpeakerAVoiceId?: string;
  workspaceSpeakerBVoiceId?: string;
  workspaceSpeakerADelivery?: WorkspaceTtsDelivery;
  workspaceSpeakerBDelivery?: WorkspaceTtsDelivery;
  workspaceThirdSpeakerDelivery?: WorkspaceTtsDelivery;
  outroVoiceId?: string;
}): Promise<{
  hookVoClips: HookVoClipPayload[];
  hookDurationSec: number;
  productPayoffVoClip: ProductPayoffVoClipPayload | null;
  productPayoffDurationSec: number;
  audioBase64: string | null;
  words: WordTimestamp[];
  workspaceVoClips: Array<{
    audioBase64: string;
    startSec: number;
    durationSec: number;
    words: WordTimestamp[];
  }>;
  outroAudioBase64: string | null;
  outroPhraseClips: Array<{
    audioBase64: string;
    words: WordTimestamp[];
    durationSec: number;
  }>;
  outroWords: WordTimestamp[];
  workspace: GeneratedStoryboard["workspace"];
  voiceStatus: string;
}> {
  const includeWorkspace = opts.includeWorkspace !== false;
  const includeOutro = opts.includeOutro !== false;
  const includeHook = opts.includeHook !== false;
  const includeProductPayoff =
    opts.includeProductPayoff !== false && opts.productPayoff?.enabled !== false && !!opts.productPayoff;
  const speakerADelivery = opts.workspaceSpeakerADelivery ?? "professional";
  const speakerBDelivery = opts.workspaceSpeakerBDelivery ?? "hesitant_lep";
  const thirdDelivery = opts.workspaceThirdSpeakerDelivery ?? "professional";
  let hookVoClips: HookVoClipPayload[] = [];
  let productPayoffVoClip: ProductPayoffVoClipPayload | null = null;
  let productPayoffDurationSec = 0;
  let audioBase64: string | null = null;
  let words: WordTimestamp[] = [];
  let workspaceVoClips: Array<{
    audioBase64: string;
    startSec: number;
    durationSec: number;
    words: WordTimestamp[];
  }> = [];
  let outroAudioBase64: string | null = null;
  let outroPhraseClips: Array<{
    audioBase64: string;
    words: WordTimestamp[];
    durationSec: number;
  }> = [];
  let outroWords: WordTimestamp[] = [];
  let hookDurationSec = 0;
  let workspace = applyInterpreterSpeakerPattern(opts.workspace);
  let voiceStatus = "unavailable";

  const elevenKey = getElevenLabsApiKey();
  if (!elevenKey) {
    return {
      hookVoClips,
      hookDurationSec,
      productPayoffVoClip,
      productPayoffDurationSec,
      audioBase64,
      words,
      workspaceVoClips,
      outroAudioBase64,
      outroPhraseClips,
      outroWords,
      workspace,
      voiceStatus,
    };
  }

  const hookElevenId = elevenLabsIdForVoice(opts.hookVoiceId, "rachel");
  const payoffElevenId = elevenLabsIdForVoice(
    opts.productPayoffVoiceId ?? opts.hookVoiceId,
    "rachel",
  );
  const speakerAElevenId = elevenLabsIdForVoice(opts.workspaceSpeakerAVoiceId, "adam");
  const speakerBElevenId = elevenLabsIdForVoice(opts.workspaceSpeakerBVoiceId, "elli");
  const outroElevenId = elevenLabsIdForVoice(opts.outroVoiceId, "rachel");

  try {
    if (includeHook && opts.hookClips) {
      const hookSayLines =
        opts.language === "en"
          ? opts.hookClips.map((c) => c.sayLine)
          : splitHookScriptToClips(
              opts.hookScript,
              opts.hookClips.length,
              opts.hookClips.map((c) => c.sayLine),
            );
      const hookRaw: Array<{
        audioBase64: string;
        words: WordTimestamp[];
        footageUrl: string;
        sayLine: string;
        scenario: string;
      }> = [];
      for (let i = 0; i < opts.hookClips.length; i++) {
        const clip = opts.hookClips[i]!;
        const sayLine = hookSayLines[i]?.trim() || clip.sayLine;
        try {
          const tts = await synthesizeElevenLabsWithTimestamps(
            elevenKey,
            hookElevenId,
            sayLine,
            "default",
            { ...GENERATE_VOICE_SETTINGS },
            opts.language !== "en" ? opts.language : undefined,
          );
          hookRaw.push({
            audioBase64: tts.audio.toString("base64"),
            words: tts.words,
            footageUrl: "",
            sayLine,
            scenario: clip.scenario,
          });
          voiceStatus = "ok";
        } catch (e) {
          console.error("[reel-builder/voice] hook clip TTS failed:", e);
        }
      }
      hookVoClips = packHookVoClips(hookRaw);
      if (hookVoClips.length > 0) {
        const last = hookVoClips[hookVoClips.length - 1]!;
        hookDurationSec = last.startSec + last.durationSec + 0.08;
        words = hookVoClips.flatMap((c) =>
          c.words.map((w) => ({
            word: w.word,
            start: w.start + c.startSec,
            end: w.end + c.startSec,
          })),
        );
        audioBase64 = hookVoClips[0]?.audioBase64 ?? null;
      }
    } else if (includeHook) {
      const hookTts = await synthesizeElevenLabsWithTimestamps(
        elevenKey,
        hookElevenId,
        opts.hookScript,
        "default",
        { ...GENERATE_VOICE_SETTINGS },
        opts.language !== "en" ? opts.language : undefined,
      );
      audioBase64 = hookTts.audio.toString("base64");
      words = hookTts.words;
      voiceStatus = "ok";
    }
  } catch (e) {
    console.error("[reel-builder/voice] hook TTS failed:", e);
  }

  if (includeWorkspace) {
    const workspaceRaw: Array<{ audioBase64: string; words: WordTimestamp[]; exchangeIndex: number }> = [];
    const workspaceTtsFailures: string[] = [];
    for (let exIdx = 0; exIdx < workspace.exchanges.length; exIdx++) {
      const ex = workspace.exchanges[exIdx]!;
      const line = ex.original?.trim();
      if (!line) continue;
      const isThird =
        !!ex.thirdSpeakerVoiceId?.trim() || ex.speaker === "C";
      const primaryVoiceId = isThird
        ? elevenLabsIdForVoice(ex.thirdSpeakerVoiceId, "antoni")
        : ex.speaker === "B"
          ? speakerBElevenId
          : speakerAElevenId;
      const fallbackVoiceId = isThird
        ? elevenLabsIdForVoice("antoni", "antoni")
        : ex.speaker === "B"
          ? elevenLabsIdForVoice("elli", "elli")
          : elevenLabsIdForVoice("adam", "adam");
      const delivery: WorkspaceTtsDelivery = isThird
        ? thirdDelivery
        : ex.speaker === "B"
          ? speakerBDelivery
          : speakerADelivery;
      const lineForTts = applyWorkspaceDeliveryText(line, delivery);
      const settings = workspaceElevenLabsSettings(delivery);
      try {
        let clip: ElevenTimestampResult;
        try {
          clip = await synthesizeElevenLabsWithTimestamps(
            elevenKey,
            primaryVoiceId,
            lineForTts,
            "default",
            settings,
            ex.originalLang,
          );
        } catch (firstErr) {
          const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
          if (primaryVoiceId !== fallbackVoiceId && /voice_not_found|not found/i.test(msg)) {
            console.warn(
              `[reel-builder/voice] workspace exchange ${exIdx} voice ${primaryVoiceId} missing — retry ${fallbackVoiceId}`,
            );
            clip = await synthesizeElevenLabsWithTimestamps(
              elevenKey,
              fallbackVoiceId,
              lineForTts,
              "default",
              settings,
              ex.originalLang,
            );
          } else {
            throw firstErr;
          }
        }
        workspaceRaw.push({
          audioBase64: clip.audio.toString("base64"),
          words: clip.words,
          exchangeIndex: exIdx,
        });
        if (voiceStatus !== "ok") voiceStatus = "ok";
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error(`[reel-builder/voice] workspace line TTS failed (exchange ${exIdx}):`, e);
        workspaceTtsFailures.push(`exchange ${exIdx + 1}: ${detail.slice(0, 160)}`);
      }
    }
    if (
      workspace.exchanges.some((ex) => ex.original?.trim()) &&
      workspaceRaw.length < workspace.exchanges.filter((ex) => ex.original?.trim()).length
    ) {
      throw new Error(
        `Workspace voiceover incomplete — missing dialogue audio (${workspaceTtsFailures.join("; ") || "unknown"}). Pick a different speaker voice and regenerate.`,
      );
    }
    workspaceVoClips = packWorkspaceVoClips(workspaceRaw, workspace.exchanges).map((clip) => {
      const raw = workspaceRaw.find((r) => r.exchangeIndex === clip.exchangeIndex);
      const clipWords = raw?.words ?? [];
      const audio = raw?.audioBase64 ? Buffer.from(raw.audioBase64, "base64") : undefined;
      return {
        ...clip,
        durationSec: clipDurationSec(clipWords, audio),
        words: clipWords,
      };
    });

    if (workspaceRaw.length > 0) {
      const workspaceSegmentSec =
        workspaceVoClips.reduce((max, c) => Math.max(max, c.startSec + (c.durationSec ?? 2)), 0) +
        0.08;
      const synced = syncWorkspaceExchangeFracs(
        workspace.exchanges,
        workspaceVoClips,
        Math.max(3, workspaceSegmentSec),
      );
      workspace = { ...workspace, exchanges: synced };
    }
  }

  if (includeProductPayoff && opts.productPayoff) {
    const payoff = opts.productPayoff;
    const sayLine = payoff.sayLine.trim();
    if (sayLine) {
      try {
        const tts = await synthesizeElevenLabsWithTimestamps(
          elevenKey,
          payoffElevenId,
          sayLine,
          "default",
          { ...GENERATE_VOICE_SETTINGS },
          opts.language !== "en" ? opts.language : undefined,
        );
        const audio = tts.audio;
        const durationSec = clipSpeechEndSec(tts.words, audio);
        productPayoffVoClip = {
          audioBase64: tts.audio.toString("base64"),
          startSec: 0,
          durationSec,
          footageUrl: "",
          sayLine,
          scenario: payoff.scenario,
          headline: payoff.headline,
          supportingText: payoff.supportingText,
          words: tts.words,
        };
        productPayoffDurationSec = durationSec + 0.08;
        if (voiceStatus !== "ok") voiceStatus = "ok";
      } catch (e) {
        console.error("[reel-builder/voice] product payoff TTS failed:", e);
      }
    }
  }

  if (includeOutro && opts.outroVoiceover.trim()) {
    const outroLang = opts.language !== "en" ? opts.language : "en";
    const phrases = splitOutroPhrases(opts.outroVoiceover.trim());
    try {
      for (let i = 0; i < phrases.length; i++) {
        const phrase = phrases[i]!;
        const isSloganTip = i === 0;
        const isSloganAssurance = i === 1;
        const voiceId =
          isSloganTip || isSloganAssurance ? LOCKED_SLOGAN_ELEVEN_VOICE_ID : outroElevenId;
        const settings = isSloganTip
          ? ELEVEN_SLOGAN_TIP_SETTINGS
          : isSloganAssurance
            ? ELEVEN_SLOGAN_ASSURANCE_SETTINGS
            : ELEVEN_BRAND_VOICE_SETTINGS;
        const tts = await synthesizeElevenLabsWithTimestamps(
          elevenKey,
          voiceId,
          phrase,
          "brand",
          { ...settings },
          outroLang,
        );
        const audio = tts.audio;
        const durationSec = clipSpeechEndSec(tts.words, audio);
        outroPhraseClips.push({
          audioBase64: audio.toString("base64"),
          words: tts.words,
          durationSec,
        });
      }
      if (outroPhraseClips.length === 1) {
        outroAudioBase64 = outroPhraseClips[0]!.audioBase64;
        outroWords = outroPhraseClips[0]!.words;
      } else if (outroPhraseClips.length > 1) {
        // Client stitches phrase clips — keeps slogan voice locked separately from CTA phrases.
        outroAudioBase64 = null;
        outroWords = [];
      }
      if (outroPhraseClips.length > 0 && voiceStatus !== "ok") voiceStatus = "ok";
    } catch (e) {
      console.error("[reel-builder/voice] outro TTS failed:", e);
    }
  }

  return {
    hookVoClips,
    hookDurationSec,
    productPayoffVoClip,
    productPayoffDurationSec,
    audioBase64,
    words,
    workspaceVoClips,
    outroAudioBase64,
    outroPhraseClips,
    outroWords,
    workspace,
    voiceStatus,
  };
}

/**
 * POST /api/reel-builder/voiceover — generate all reel voiceovers once (ElevenLabs).
 * Call before POST /generate with skipVoice so credits are not spent on every reel build.
 */
router.post("/voiceover", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!getElevenLabsApiKey()) {
    res.status(400).json({ error: "ELEVENLABS_API_KEY is missing — voiceover requires ElevenLabs" });
    return;
  }

  try {
  const body = req.body ?? {};
  const hookClips = parseHookClips(body.hookClips);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const includeWorkspace = body.includeWorkspace !== false;
  const includeOutro = body.includeOutro !== false;
  const includeHook = body.includeHook !== false;
  const includeProductPayoff = body.includeProductPayoff !== false;
  if (includeHook) {
    if (!hookClips && prompt.length < 8) {
      res.status(400).json({
        error: "hookClips (1–6 clips with scenario + sayLine) or prompt (min 8 characters) required",
      });
      return;
    }
  } else if (!includeWorkspace && !includeOutro && !includeProductPayoff) {
    res.status(400).json({
      error: "Enable at least one segment (workspace, outro, or product payoff) when hook is off",
    });
    return;
  }

  const language =
    typeof body.language === "string" && body.language.trim() ? body.language.trim() : "en";
  const sourceLang =
    typeof body.sourceLang === "string" && body.sourceLang.trim() ? body.sourceLang.trim() : "en";
  const targetLang =
    typeof body.targetLang === "string" && body.targetLang.trim()
      ? body.targetLang.trim()
      : language === "en"
        ? "es"
        : "en";
  const productPayoff =
    parseProductPayoff(body.productPayoff) ??
    (includeProductPayoff ? defaultProductPayoff("medical") : null);
  const outroVoiceoverInput =
    typeof body.outroVoiceover === "string" && body.outroVoiceover.trim()
      ? body.outroVoiceover.trim()
      : LOCKED_OUTRO_VO_EN;

  let workspace = parseWorkspaceFromBody(body.workspace, sourceLang, targetLang);
  if (!workspace) {
    workspace = applyInterpreterSpeakerPattern({
      sourceLang,
      targetLang,
      exchanges: [],
    });
  } else {
    workspace = applyInterpreterSpeakerPattern(workspace);
  }
  if (includeWorkspace && workspace.exchanges.length === 0) {
    res.status(400).json({
      error: "Add at least one workspace exchange, or uncheck “Include workspace dialogue”",
    });
    return;
  }
  let hookScript = includeHook
    ? hookClips
      ? hookClips.map((c) => c.sayLine).join(" ")
      : prompt
    : "";
  let outroVoiceover = outroVoiceoverInput;

  const openaiKey = getOpenAiApiKey();
  if (language !== "en" && openaiKey) {
    try {
      const client = createReelOpenAI(openaiKey);
      const enBoard: GeneratedStoryboard = {
        hookScript,
        hookScenes: hookClips?.map((c) => c.scenario) ?? [],
        workspace,
        outroVoiceover: outroVoiceoverInput,
      };
      const translated = await translateGeneratedStoryboard(client, enBoard, language);
      hookScript = translated.hookScript;
      outroVoiceover = translated.outroVoiceover;
      // workspace stays in Lang A / Lang B — only hook + outro were translated
    } catch (e) {
      console.error("[reel-builder/voiceover] translate failed:", formatOpenAiError(e));
    }
  }

  const outroPhraseGapSec =
    typeof body.outroPhraseGapSec === "number" && Number.isFinite(body.outroPhraseGapSec)
      ? Math.max(0, Math.min(0.65, body.outroPhraseGapSec))
      : 0.12;
  const studioVoices = parseStudioVoiceIds(body as Record<string, unknown>);

  const voice = await synthesizeReelVoiceovers({
    hookClips,
    hookScript,
    workspace,
    productPayoff,
    includeProductPayoff,
    outroVoiceover,
    language,
    includeHook,
    includeWorkspace,
    includeOutro,
    outroPhraseGapSec,
    ...studioVoices,
  });

  const hasAnyVo =
    (includeHook && voice.hookVoClips.length > 0) ||
    (includeWorkspace && voice.workspaceVoClips.length > 0) ||
    (includeProductPayoff && voice.productPayoffVoClip) ||
    (includeOutro && (voice.outroAudioBase64 || voice.outroPhraseClips.length > 0));
  if (!hasAnyVo) {
    res.status(502).json({
      error: "Voiceover synthesis failed — check ElevenLabs quota and API key",
    });
    return;
  }

  res.json({
    language,
    hookScript,
    hookVoClips: voice.hookVoClips,
    hookDurationSec: voice.hookDurationSec,
    productPayoffVoClip: voice.productPayoffVoClip,
    productPayoffDurationSec: voice.productPayoffDurationSec,
    productPayoff,
    includeProductPayoff,
    audioBase64: voice.audioBase64,
    words: voice.words,
    workspaceVoClips: voice.workspaceVoClips,
    outroAudioBase64: voice.outroAudioBase64,
    outroPhraseClips: voice.outroPhraseClips,
    outroWords: voice.outroWords,
    workspace: voice.workspace,
    outroVoiceover,
    includeWorkspace,
    includeOutro,
    includeHook,
    providerStatus: {
      voice: voice.voiceStatus,
      workspaceVo: includeWorkspace ? (voice.workspaceVoClips.length > 0 ? "ok" : "partial") : "skipped",
      outroVo: includeOutro ? (voice.outroAudioBase64 || voice.outroPhraseClips.length > 0 ? "ok" : "partial") : "skipped",
    },
  });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[reel-builder/voiceover] unhandled:", detail);
    res.status(500).json({ error: detail || "Voiceover failed" });
  }
});

/**
 * POST /api/reel-builder/generate — one prompt → full 35s reel package.
 * Storyboard (OpenAI) is required; Pexels footage and ElevenLabs audio degrade
 * gracefully to providerStatus "unavailable" without blocking generation.
 * Pass skipVoice: true when voiceovers were already generated via POST /voiceover.
 */
router.post("/generate", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const openaiKey = getOpenAiApiKey();
  if (!openaiKey) {
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }

  const body = req.body ?? {};
  const hookClips = parseHookClips(body.hookClips);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const includeHook = body.includeHook !== false;
  const includeWorkspace = body.includeWorkspace !== false;
  const includeOutro = body.includeOutro !== false;
  const includeProductPayoff = body.includeProductPayoff !== false;
  if (includeHook) {
    if (!hookClips && prompt.length < 8) {
      res.status(400).json({
        error: "hookClips (1–6 clips with scenario + sayLine) or prompt (min 8 characters) required",
      });
      return;
    }
  } else if (!includeWorkspace && !includeOutro && !includeProductPayoff) {
    res.status(400).json({
      error: "Enable at least one segment (workspace, outro, or product payoff) when hook is off",
    });
    return;
  }
  const brief = hookClips ? hookBriefFromClips(hookClips) : prompt || "workspace reel";
  const language =
    typeof body.language === "string" && body.language.trim() ? body.language.trim() : "en";
  const seriesRaw = typeof body.series === "string" ? body.series.trim().toLowerCase() : "";
  const series = GENERATE_SERIES.has(seriesRaw) ? seriesRaw : "medical";
  const sourceLang =
    typeof body.sourceLang === "string" && body.sourceLang.trim() ? body.sourceLang.trim() : "en";
  const targetLang =
    typeof body.targetLang === "string" && body.targetLang.trim()
      ? body.targetLang.trim()
      : language === "en"
        ? "es"
        : "en";

  const providerStatus: Record<string, string> = {
    storyboard: "ok",
    footage: "unavailable",
    voice: "unavailable",
  };

  const skipVoice = body.skipVoice === true;

  // 1) Storyboard — skip OpenAI when studio already authored hook clips + cached VO
  let storyboardEn: GeneratedStoryboard;
  let storyboard: GeneratedStoryboard;
  if (skipVoice) {
    storyboardEn = buildStudioStoryboardFromBody(body, hookClips ?? [], sourceLang, targetLang);
    storyboard = storyboardEn;
    if (language !== "en") {
      try {
        const client = createReelOpenAI(openaiKey);
        storyboard = await translateGeneratedStoryboard(client, storyboardEn, language).catch((e) => {
          console.error("[reel-builder/generate] translate failed:", formatOpenAiError(e));
          providerStatus.translation = "unavailable";
          return storyboardEn;
        });
      } catch (e) {
        console.error("[reel-builder/generate] translate client error:", formatOpenAiError(e));
        providerStatus.translation = "unavailable";
      }
    }
  } else {
    try {
      const client = createReelOpenAI(openaiKey);
      storyboardEn = await generateStoryboardEn(
        client,
        brief,
        series,
        sourceLang,
        targetLang,
        hookClips,
      );
      storyboard =
        language === "en"
          ? storyboardEn
          : await translateGeneratedStoryboard(client, storyboardEn, language).catch((e) => {
              console.error("[reel-builder/generate] translate failed:", formatOpenAiError(e));
              providerStatus.translation = "unavailable";
              return storyboardEn;
            });

      const userWorkspace = parseWorkspaceFromBody(body.workspace, sourceLang, targetLang);
      if (userWorkspace) {
        storyboard = { ...storyboard, workspace: userWorkspace };
        storyboardEn = { ...storyboardEn, workspace: userWorkspace };
      }
    } catch (e) {
      const detail = formatOpenAiError(e);
      console.error("[reel-builder/generate] storyboard error:", detail);
      res.status(502).json({ error: `Storyboard generation failed: ${detail}` });
      return;
    }
  }

  const userProductPayoff = parseProductPayoff(body.productPayoff);
  if (userProductPayoff) {
    storyboard = { ...storyboard, productPayoff: userProductPayoff };
    storyboardEn = { ...storyboardEn, productPayoff: userProductPayoff };
  } else if (!includeProductPayoff) {
    storyboard = { ...storyboard, productPayoff: undefined };
    storyboardEn = { ...storyboardEn, productPayoff: undefined };
  }

  // 2) Hook footage + 3) voice — per-clip when hookClips supplied
  let footageUrls: string[] = [];
  let hookVoClips: HookVoClipPayload[] = [];
  const localHook = hookClips ? null : resolveLocalHookBrollPublicUrl();
  const footageProvider = parseFootageProvider(body.footageProvider);
  const pexelsKey = process.env.PEXELS_API_KEY?.trim();
  const googleKey = getGoogleAiApiKey();
  providerStatus.footageProvider = footageProvider;
  console.info(
    `[reel-builder/generate] footageProvider=${footageProvider} hookClips=${hookClips?.length ?? 0} skipVoice=${skipVoice}`,
  );

  if (includeHook && localHook) {
    footageUrls = [localHook];
    providerStatus.footage = "ok";
    providerStatus.footageSource = "local";
  } else if (includeHook && !hookClips && footageProvider === "pexels" && pexelsKey) {
    try {
      footageUrls = await searchPexelsFootage(
        pexelsKey,
        storyboard.hookScenes,
        brief,
        series,
      );
      if (footageUrls.length > 0) {
        providerStatus.footage = "ok";
        providerStatus.footageSource = "pexels";
      }
    } catch (e) {
      console.error("[reel-builder/generate] pexels error:", e);
    }
  }

  const hookFootageUrls: string[] = [];
  let hookFootageMetadata: FootageSceneMetadata[] = [];
  let productPayoffFootageUrl = "";
  let productPayoffFootageMeta: FootageSceneMetadata | null = null;
  const pexelsDiversityCtx = createFootageDiversityContext();
  if (hookClips && includeHook && footageProvider === "google_veo") {
    if (!googleKey) {
      providerStatus.footage = "unavailable";
      providerStatus.footageError =
        "GOOGLE_AI_API_KEY missing — add it to .env (Gemini API key from Google AI Studio).";
    } else {
      let firstScenario = "";
      let firstUrl = "";
      for (let i = 0; i < hookClips.length; i++) {
        const clip = hookClips[i]!;
        try {
          console.info(
            `[reel-builder/generate] Veo clip ${i + 1}/${hookClips.length}…`,
            clip.scenario.slice(0, 80),
          );
          const url =
            (await searchGoogleVeoOneFootage(googleKey, clip.scenario, series, {
              clipIndex: i,
              continuityScenario: firstScenario,
              preferUrl: firstUrl,
            })) ?? "";
          hookFootageUrls.push(url);
          if (url) {
            providerStatus.footage = "ok";
            providerStatus.footageSource = "google_veo";
            if (i === 0) {
              firstScenario = clip.scenario;
              firstUrl = url;
            }
          }
        } catch (e) {
          hookFootageUrls.push("");
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[reel-builder/generate] veo clip error:", msg);
          providerStatus.footage = "unavailable";
          providerStatus.footageError = msg;
        }
      }
    }
  } else if (hookClips && includeHook && footageProvider === "pexels" && pexelsKey) {
    for (let i = 0; i < hookClips.length; i++) {
      const clip = hookClips[i]!;
      try {
        const minDur = estimateSayLineDurationSec(clip.sayLine, language);
        const { url, metadata } = await searchPexelsOneFootage(
          pexelsKey,
          clip.scenario,
          series,
          pexelsDiversityCtx,
          `hook-${i}`,
          minDur,
        );
        hookFootageMetadata.push(metadata);
        hookFootageUrls.push(url);
        if (url) {
          providerStatus.footage = "ok";
          providerStatus.footageSource = "pexels";
        } else if (metadata.status === "footage_needed") {
          providerStatus[`footageNeeded_hook_${i}`] = clip.scenario.slice(0, 80);
        }
      } catch (e) {
        hookFootageUrls.push("");
        console.error("[reel-builder/generate] pexels clip error:", e);
      }
    }
    providerStatus.footageMetadata = JSON.stringify(hookFootageMetadata);

    const payoff = storyboard.productPayoff;
    if (includeProductPayoff && payoff?.enabled !== false && payoff?.scenario) {
      try {
        const payoffMinDur = estimateSayLineDurationSec(payoff.sayLine, language);
        const { url, metadata } = await searchPexelsOneFootage(
          pexelsKey,
          payoff.scenario,
          series,
          pexelsDiversityCtx,
          "product-payoff",
          payoffMinDur,
        );
        productPayoffFootageUrl = url;
        productPayoffFootageMeta = metadata;
        if (!url && metadata.status === "footage_needed") {
          providerStatus.footageNeeded_productPayoff = payoff.scenario.slice(0, 80);
        }
      } catch (e) {
        console.error("[reel-builder/generate] product payoff pexels error:", e);
      }
    }
  } else if (hookClips && includeHook && footageProvider === "pexels" && !pexelsKey) {
    providerStatus.footage = "unavailable";
    providerStatus.footageError = "PEXELS_API_KEY missing in environment.";
  }

  // Per-clip hook footage (index-aligned with hookClips).
  if (hookFootageUrls.length > 0) {
    footageUrls = [...hookFootageUrls];
  }

  // skipVoice: client merges cached VO — still return per-clip footage URLs aligned by index.
  if (skipVoice && includeHook && hookClips && hookFootageUrls.length > 0) {
    hookVoClips = hookClips.map((clip, i) => {
      const meta = hookFootageMetadata[i];
      return {
        audioBase64: "",
        startSec: 0,
        durationSec: 0,
        footageUrl: hookFootageUrls[i] ?? "",
        sayLine: clip.sayLine,
        scenario: clip.scenario,
        words: [],
        footageStatus: meta?.status,
        pexelsVideoId: meta?.pexelsVideoId,
        composition: meta?.composition,
        footageMetadata: meta,
      };
    });
  }

  let productPayoffVoClip: ProductPayoffVoClipPayload | null = null;
  let productPayoffDurationSec = 0;

  let audioBase64: string | null = null;
  let words: WordTimestamp[] = [];
  let workspaceVoClips: Array<{
    audioBase64: string;
    startSec: number;
    durationSec: number;
    words: WordTimestamp[];
  }> = [];
  let outroAudioBase64: string | null = null;
  let outroPhraseClips: Array<{
    audioBase64: string;
    words: WordTimestamp[];
    durationSec: number;
  }> = [];
  let outroWords: WordTimestamp[] = [];
  let hookDurationSec = 10;

  if (!skipVoice) {
    const genPhraseGap =
      typeof body.outroPhraseGapSec === "number" && Number.isFinite(body.outroPhraseGapSec)
        ? Math.max(0, Math.min(0.65, body.outroPhraseGapSec))
        : 0.12;
    const studioVoices = parseStudioVoiceIds(body as Record<string, unknown>);
    const voice = await synthesizeReelVoiceovers({
      hookClips,
      hookScript: storyboard.hookScript,
      workspace: storyboard.workspace,
      productPayoff: storyboard.productPayoff,
      includeProductPayoff,
      outroVoiceover: storyboard.outroVoiceover,
      language,
      includeHook,
      includeWorkspace,
      includeOutro,
      outroPhraseGapSec: genPhraseGap,
      ...studioVoices,
    });
    hookVoClips = voice.hookVoClips.map((clip, i) => {
      const meta = hookFootageMetadata[i];
      return {
        ...clip,
        footageUrl: hookFootageUrls[i] ?? "",
        footageStatus: meta?.status ?? clip.footageStatus,
        pexelsVideoId: meta?.pexelsVideoId ?? clip.pexelsVideoId,
        composition: meta?.composition ?? clip.composition,
        footageMetadata: meta ?? clip.footageMetadata,
      };
    });
    hookDurationSec = voice.hookDurationSec;
    productPayoffVoClip = voice.productPayoffVoClip
      ? {
          ...voice.productPayoffVoClip,
          footageUrl: productPayoffFootageUrl,
          footageStatus: productPayoffFootageMeta?.status,
          pexelsVideoId: productPayoffFootageMeta?.pexelsVideoId,
          composition: productPayoffFootageMeta?.composition,
          footageMetadata: productPayoffFootageMeta ?? undefined,
        }
      : null;
    productPayoffDurationSec = voice.productPayoffDurationSec;
    audioBase64 = voice.audioBase64;
    words = voice.words;
    workspaceVoClips = voice.workspaceVoClips;
    outroAudioBase64 = voice.outroAudioBase64;
    outroPhraseClips = voice.outroPhraseClips;
    outroWords = voice.outroWords;
    if (voice.voiceStatus === "ok") providerStatus.voice = "ok";
    if (voice.workspace.exchanges !== storyboard.workspace.exchanges) {
      storyboard = { ...storyboard, workspace: voice.workspace };
      storyboardEn = { ...storyboardEn, workspace: voice.workspace };
    }
  }

  res.json({
    prompt: brief,
    language,
    series,
    storyboard,
    storyboardEn,
    footageUrls,
    hookVoClips,
    hookDurationSec,
    audioBase64,
    words,
    workspaceVoClips,
    outroAudioBase64,
    outroPhraseClips,
    outroWords,
    includeWorkspace,
    includeOutro,
    includeHook,
    includeProductPayoff,
    productPayoff: storyboard.productPayoff,
    productPayoffVoClip,
    productPayoffDurationSec,
    mimeType: "audio/mpeg",
    providerStatus,
  });
});

/**
 * POST /api/reel-builder/translate-reel — after English reel is approved, translate hook + outro
 * voiceover/subtitles only. Workspace dialogue stays in the authored Lang A / Lang B pair.
 */
router.post("/translate-reel", async (req, res) => {
  if (!reelBuilderAuthorized(req as never)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const openaiKey = getOpenAiApiKey();
  if (!openaiKey) {
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }
  if (!getElevenLabsApiKey()) {
    res.status(400).json({ error: "ELEVENLABS_API_KEY is missing — translated voiceover requires ElevenLabs" });
    return;
  }

  const body = req.body ?? {};
  const targetLanguage =
    typeof body.targetLanguage === "string" && body.targetLanguage.trim()
      ? body.targetLanguage.trim()
      : "";
  if (!targetLanguage || targetLanguage === "en") {
    res.status(400).json({ error: "targetLanguage required (non-English language code)" });
    return;
  }

  const hookClips = parseHookClips(body.hookClips);
  if (!hookClips || hookClips.length === 0) {
    res.status(400).json({ error: "hookClips (1–6 clips with scenario + sayLine) required" });
    return;
  }

  const includeOutro = body.includeOutro !== false;
  const outroVoiceoverInput =
    typeof body.outroVoiceover === "string" && body.outroVoiceover.trim()
      ? body.outroVoiceover.trim()
      : LOCKED_OUTRO_VO_EN;
  const sourceLang =
    typeof body.sourceLang === "string" && body.sourceLang.trim() ? body.sourceLang.trim() : "en";
  const targetLang =
    typeof body.targetLang === "string" && body.targetLang.trim()
      ? body.targetLang.trim()
      : "es";
  let workspace = parseWorkspaceFromBody(body.workspace, sourceLang, targetLang);
  if (!workspace) {
    workspace = applyInterpreterSpeakerPattern({
      sourceLang,
      targetLang,
      exchanges: [],
    });
  } else {
    workspace = applyInterpreterSpeakerPattern(workspace);
  }

  const outroPhraseGapSec =
    typeof body.outroPhraseGapSec === "number" && Number.isFinite(body.outroPhraseGapSec)
      ? Math.max(0, Math.min(0.65, body.outroPhraseGapSec))
      : 0.12;
  const studioVoices = parseStudioVoiceIds(body as Record<string, unknown>);

  try {
    const client = createReelOpenAI(openaiKey);
    const enBoard: GeneratedStoryboard = {
      hookScript: hookClips.map((c) => c.sayLine).join(" "),
      hookScenes: hookClips.map((c) => c.scenario),
      workspace,
      productPayoff: parseProductPayoff(body.productPayoff) ?? undefined,
      outroVoiceover: outroVoiceoverInput,
    };
    const translated = await translateGeneratedStoryboard(client, enBoard, targetLanguage);
    const translatedSayLines = splitHookScriptToClips(
      translated.hookScript,
      hookClips.length,
      hookClips.map((c) => c.sayLine),
    );
    const translatedHookClips = hookClips.map((c, i) => ({
      scenario: c.scenario,
      sayLine: translatedSayLines[i]?.trim() || c.sayLine,
    }));

    const includeProductPayoff =
      body.includeProductPayoff !== false && translated.productPayoff?.enabled !== false;
    const voice = await synthesizeReelVoiceovers({
      hookClips: translatedHookClips,
      hookScript: translated.hookScript,
      workspace,
      productPayoff: translated.productPayoff,
      outroVoiceover: translated.outroVoiceover,
      language: targetLanguage,
      includeWorkspace: false,
      includeOutro,
      includeProductPayoff,
      outroPhraseGapSec,
      ...studioVoices,
    });

    if (voice.hookVoClips.length === 0) {
      res.status(502).json({
        error: "Hook voiceover synthesis failed — check ElevenLabs quota and API key",
      });
      return;
    }

    res.json({
      targetLanguage,
      hookClips: translatedHookClips,
      hookScript: translated.hookScript,
      hookVoClips: voice.hookVoClips,
      hookDurationSec: voice.hookDurationSec,
      audioBase64: voice.audioBase64,
      words: voice.words,
      productPayoff: translated.productPayoff,
      productPayoffVoClip: voice.productPayoffVoClip,
      productPayoffDurationSec: voice.productPayoffDurationSec,
      outroAudioBase64: voice.outroAudioBase64,
      outroWords: voice.outroWords,
      outroVoiceover: translated.outroVoiceover,
      outroCopy: translated.outroCopy,
      includeOutro,
      includeProductPayoff,
    });
  } catch (e) {
    console.error("[reel-builder/translate-reel] error:", formatOpenAiError(e), e);
    res.status(502).json({
      error: e instanceof Error ? e.message : "Translate reel failed",
    });
  }
});

export default router;
