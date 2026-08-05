/**
 * Reel Creator only — translate + TTS for marketing reels.
 * TTS: ElevenLabs with-timestamps (`eleven_turbo_v2_5`) when ELEVENLABS_API_KEY is set,
 * else OpenAI tts-1 with estimated word timings. Returns JSON `{ audioBase64, words }`.
 * Do NOT import transcription / Soniox / workspace translate stacks here.
 */
import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

/** Short UI ids → ElevenLabs voice_id + OpenAI fallback voice. */
const ELEVEN_VOICES: Record<
  string,
  { elevenLabsId: string; openai: "onyx" | "nova" | "alloy" | "echo" | "fable" | "shimmer" }
> = {
  adam: { elevenLabsId: "pNInz6obpgDQGcFmaJgB", openai: "onyx" },
  rachel: { elevenLabsId: "21m00Tcm4TlvDq8ikWAM", openai: "nova" },
  antoni: { elevenLabsId: "ErXwobaYiN019PkySvjV", openai: "echo" },
  josh: { elevenLabsId: "TxGEqnHWrfWFTfGW9XjX", openai: "onyx" },
  bella: { elevenLabsId: "EXAVITQu4vr4xnSDxMaL", openai: "shimmer" },
  // Legacy OpenAI names still accepted
  onyx: { elevenLabsId: "pNInz6obpgDQGcFmaJgB", openai: "onyx" },
  nova: { elevenLabsId: "21m00Tcm4TlvDq8ikWAM", openai: "nova" },
  alloy: { elevenLabsId: "ErXwobaYiN019PkySvjV", openai: "alloy" },
  echo: { elevenLabsId: "ErXwobaYiN019PkySvjV", openai: "echo" },
  fable: { elevenLabsId: "TxGEqnHWrfWFTfGW9XjX", openai: "fable" },
  shimmer: { elevenLabsId: "EXAVITQu4vr4xnSDxMaL", openai: "shimmer" },
};

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

/** Plain-text pause cues (keeps character→word alignment intact). */
function applyPlainPauses(text: string): string {
  return text
    .replace(/([.!?])(\s+|$)/g, "$1 … ")
    .replace(/,(?=\s)/g, ",  ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lighter pacing for short brand lines — avoid rushed ellipsis spam. */
function applyBrandPauses(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.\s+/g, ". ")
    .trim();
}

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
    const word = buf.trim();
    if (word) words.push({ word, start: wStart, end: Math.max(wStart + 0.04, wEnd) });
    buf = "";
    started = false;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
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
): Promise<ElevenTimestampResult> {
  const model = process.env.ELEVENLABS_MODEL?.trim() || "eleven_turbo_v2_5";
  // Plain text (punctuation pauses) so alignment maps to spoken words — no SSML tags.
  const spoken = (pacing === "brand" ? applyBrandPauses(text) : applyPlainPauses(text)).slice(
    0,
    5000,
  );
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`;
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
- outroVoiceover ← full spoken narration with CLEAR sentence breaks:
  1) "InterpreterAI." (brand name first — never translate)
  2) translation of "Stay focused on the conversation."
  3) translation of "We'll handle the words."
  4) translation of "Supports 62 languages."
  5) translation of "Start your free trial now."
  CRITICAL: Keep "InterpreterAI" and "app.interpreterai.org" exactly — never translate brand/domain.
  Do NOT use InterpreterAI.org (dead domain). Do NOT merge slogan lines into one rushed sentence.

NEVER translate or alter: InterpreterAI, app.interpreterai.org, logo references.
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
      `InterpreterAI. ${outroLine1} ${outroLine2} Supports 62 languages. Start your free trial now.`;
    outroVoiceover = outroVoiceover
      .replace(/handle the rest/gi, "handle the words")
      .replace(/\bwe will\b/gi, "We'll")
      .replace(/Start your free trial at\s+app\.interpreterai\.org[.!]?/gi, "Start your free trial now.")
      .replace(/(^|[^a-z.])interpreterai\.org\b/gi, "$1app.interpreterai.org")
      .replace(/\bapp\.app\.interpreterai\.org\b/gi, "app.interpreterai.org");
    if (!/^interpreter\s*ai/i.test(outroVoiceover)) {
      outroVoiceover = `InterpreterAI. ${outroVoiceover}`;
    }
    if (!/start your free trial now/i.test(outroVoiceover)) {
      outroVoiceover = `${outroVoiceover.trim()} Start your free trial now.`;
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
  // Brand spots stay natural — never rush OpenAI fallback above 1.0×.
  if (pacing === "brand") speed = Math.min(1, speed);

  const wantJson =
    body.withTimestamps === true ||
    body.withTimestamps === "true" ||
    String(req.headers.accept || "").includes("application/json");

  const elevenKey = getElevenLabsApiKey();
  if (elevenKey) {
    try {
      const result = await synthesizeElevenLabsWithTimestamps(
        elevenKey,
        voice.elevenLabsId,
        input,
        pacing,
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
  const spoken = (pacing === "brand" ? applyBrandPauses(input) : applyPlainPauses(input)).slice(
    0,
    4096,
  );
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
- Locked Universal Brand Outro (do not rewrite structure): "Stay focused on the conversation." / "We'll handle the words." / "Supports 62 languages." / "Start your free trial now."
- Never invent alternate outros — the brand sequence is permanent. Domain must be app.interpreterai.org.`,
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
        "InterpreterAI. Stay focused on the conversation. We'll handle the words. Supports 62 languages. Start your free trial now.",
      voiceover:
        "InterpreterAI. Stay focused on the conversation. We'll handle the words. Supports 62 languages. Start your free trial now.",
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

const GENERATE_SERIES = new Set([
  "medical",
  "legal",
  "conference",
  "immigration",
  "education",
]);

type GeneratedStoryboard = {
  hookScript: string;
  hookScenes: string[];
  workspaceScript: { speakerA: string[]; speakerB: string[] };
  outroVoiceover: string;
};

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

function normalizeGeneratedStoryboard(
  parsed: Record<string, unknown>,
  prompt: string,
): GeneratedStoryboard {
  const hookScript = (typeof parsed.hookScript === "string" ? parsed.hookScript : "")
    .trim()
    .split(/\s+/)
    .slice(0, 80)
    .join(" ");
  const hookScenes = cleanLines(parsed.hookScenes, 3, [
    "stressed professional typing laptop office",
    "close up hands typing keyboard fast",
    "clock ticking office deadline",
  ]).map((q) => q.split(/\s+/).slice(0, 8).join(" "));
  const ws = (parsed.workspaceScript ?? {}) as Record<string, unknown>;
  const speakerA = cleanLines(ws.speakerA, 2, [
    "The patient says the pain started three days ago.",
    "Please confirm the dosage before we continue.",
  ]);
  const speakerB = cleanLines(ws.speakerB, 2, [
    "El paciente dice que el dolor comenzó hace tres días.",
    "Por favor confirme la dosis antes de continuar.",
  ]);
  const outroVoiceover =
    (typeof parsed.outroVoiceover === "string" ? parsed.outroVoiceover.trim() : "") ||
    "InterpreterAI. Interpret smarter. Work better. Start your free trial today.";
  return {
    hookScript:
      hookScript ||
      `Interpreters everywhere are losing hours every day. ${prompt.split(/\s+/).slice(0, 12).join(" ")}`,
    hookScenes,
    workspaceScript: { speakerA, speakerB },
    outroVoiceover,
  };
}

async function generateStoryboardEn(
  client: OpenAI,
  prompt: string,
  series: string,
  outroVoiceover: string,
): Promise<GeneratedStoryboard> {
  const completion = await client.chat.completions.create({
    model: generateModel(),
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior short-form creative director for InterpreterAI — live interpretation, transcription and translation across 62 languages for professional interpreters.

From the user's one-line reel prompt, write a 35-second vertical reel storyboard.
The reel is fixed: 2s brand intro → 8s hook (stock footage + energetic voiceover) → live workspace demo → brand outro.

Return STRICT JSON ONLY with exactly these keys:
{
  "hookScript": "Energetic spoken hook voiceover. HARD LIMIT 18 words so it fits 8 seconds of speech (absolute max 80). Punchy, scroll-stopping. No hashtags, no emoji.",
  "hookScenes": ["2-4 short Pexels stock-video search queries matching the hook, e.g. 'stressed person typing laptop'"],
  "workspaceScript": {
    "speakerA": ["exactly 2 realistic spoken lines from the human speaker in a ${series} interpretation call, English"],
    "speakerB": ["exactly 2 AI translation outputs matching speakerA line by line, English"]
  },
  "outroVoiceover": "${outroVoiceover.replace(/"/g, "'")}"
}

Rules:
- hookScript directly dramatizes the user's prompt (pain → tension → promise). Include a concrete number when natural. It MUST be speakable within 8 seconds (max 18 words).
- hookScenes are literal stock-footage searches (people, hands, screens, clocks) — no brand names.
- workspaceScript must read like a real ${series} conversation an interpreter handles.
- Echo outroVoiceover exactly as given — do not rewrite it.
- English only in this response.`,
      },
      { role: "user", content: JSON.stringify({ prompt, series }) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return normalizeGeneratedStoryboard(parsed, prompt);
}

/** Translate hookScript, speakerB and outroVoiceover; speakerA stays English. */
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
        content: `You translate InterpreterAI reel copy into language code "${language}".
Return STRICT JSON ONLY: { "hookScript": "...", "speakerB": ["...", "..."], "outroVoiceover": "..." }.
Translate naturally for spoken voiceover. NEVER translate the brand name "InterpreterAI" or the domain "app.interpreterai.org".
hookScript MUST be speakable in 8 seconds: adapt and compress rather than translating literally — HARD LIMIT 18 words. Keep the punch and any concrete numbers.
speakerB must stay aligned line-by-line with the given array. No hashtags, no emoji.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          hookScript: en.hookScript,
          speakerB: en.workspaceScript.speakerB,
          outroVoiceover: en.outroVoiceover,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const speakerB = cleanLines(parsed.speakerB, 2, en.workspaceScript.speakerB);
  return {
    hookScript:
      (typeof parsed.hookScript === "string" && parsed.hookScript.trim()) || en.hookScript,
    hookScenes: en.hookScenes,
    workspaceScript: { speakerA: en.workspaceScript.speakerA, speakerB },
    outroVoiceover:
      (typeof parsed.outroVoiceover === "string" && parsed.outroVoiceover.trim()) ||
      en.outroVoiceover,
  };
}

type PexelsVideoFile = {
  link?: string;
  width?: number;
  height?: number;
  file_type?: string;
  quality?: string;
};

type PexelsVideo = {
  duration?: number;
  video_files?: PexelsVideoFile[];
};

/** First portrait MP4 rendition ≤1080 wide from a video ≤15s long. */
function pickPexelsFile(videos: PexelsVideo[]): string | null {
  for (const video of videos) {
    if (typeof video.duration === "number" && video.duration > 15) continue;
    const files = (video.video_files ?? [])
      .filter(
        (f) =>
          typeof f.link === "string" &&
          (f.file_type ?? "").includes("mp4") &&
          typeof f.width === "number" &&
          f.width <= 1080,
      )
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    if (files.length > 0) return files[0]!.link!;
  }
  return null;
}

async function searchPexelsFootage(apiKey: string, queries: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const query of queries.slice(0, 4)) {
    try {
      const params = new URLSearchParams({
        query,
        orientation: "portrait",
        per_page: "6",
      });
      const res = await fetch(`https://api.pexels.com/videos/search?${params.toString()}`, {
        headers: { Authorization: apiKey },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { videos?: PexelsVideo[] };
      const link = pickPexelsFile(data.videos ?? []);
      if (link && !urls.includes(link)) urls.push(link);
    } catch {
      /* skip this query */
    }
  }
  return urls;
}

/**
 * POST /api/reel-builder/generate — one prompt → full 35s reel package.
 * Storyboard (OpenAI) is required; Pexels footage and ElevenLabs audio degrade
 * gracefully to providerStatus "unavailable" without blocking generation.
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
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 8) {
    res.status(400).json({ error: "prompt required (min 8 characters)" });
    return;
  }
  const language =
    typeof body.language === "string" && body.language.trim() ? body.language.trim() : "en";
  const seriesRaw = typeof body.series === "string" ? body.series.trim().toLowerCase() : "";
  const series = GENERATE_SERIES.has(seriesRaw) ? seriesRaw : "medical";
  const outroVoiceover =
    (typeof body.outroVoiceover === "string" && body.outroVoiceover.trim()) ||
    "InterpreterAI. Interpret smarter. Work better. Start your free trial today.";

  const providerStatus: Record<string, string> = {
    storyboard: "ok",
    footage: "unavailable",
    voice: "unavailable",
  };

  // 1) OpenAI storyboard (required)
  let storyboardEn: GeneratedStoryboard;
  let storyboard: GeneratedStoryboard;
  try {
    const client = createReelOpenAI(openaiKey);
    storyboardEn = await generateStoryboardEn(client, prompt, series, outroVoiceover);
    storyboard =
      language === "en"
        ? storyboardEn
        : await translateGeneratedStoryboard(client, storyboardEn, language).catch((e) => {
            console.error("[reel-builder/generate] translate failed:", formatOpenAiError(e));
            providerStatus.translation = "unavailable";
            return storyboardEn;
          });
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/generate] storyboard error:", detail);
    res.status(502).json({ error: `Storyboard generation failed: ${detail}` });
    return;
  }

  // 2) Pexels footage (optional)
  let footageUrls: string[] = [];
  const pexelsKey = process.env.PEXELS_API_KEY?.trim();
  if (pexelsKey) {
    try {
      footageUrls = await searchPexelsFootage(pexelsKey, storyboard.hookScenes);
      if (footageUrls.length > 0) providerStatus.footage = "ok";
    } catch (e) {
      console.error("[reel-builder/generate] pexels error:", e);
    }
  }

  // 3+4) ElevenLabs hook + outro voiceovers (optional)
  let audioBase64: string | null = null;
  let words: WordTimestamp[] = [];
  let outroAudioBase64: string | null = null;
  let outroWords: WordTimestamp[] = [];
  const elevenKey = getElevenLabsApiKey();
  if (elevenKey) {
    try {
      const hookTts = await synthesizeElevenLabsWithTimestamps(
        elevenKey,
        GENERATE_VOICE_ID,
        storyboard.hookScript,
        "default",
        { ...GENERATE_VOICE_SETTINGS },
      );
      audioBase64 = hookTts.audio.toString("base64");
      words = hookTts.words;
      providerStatus.voice = "ok";
    } catch (e) {
      console.error("[reel-builder/generate] hook TTS failed:", e);
    }
    try {
      const outroTts = await synthesizeElevenLabsWithTimestamps(
        elevenKey,
        GENERATE_VOICE_ID,
        storyboard.outroVoiceover,
        "brand",
        { ...GENERATE_VOICE_SETTINGS },
      );
      outroAudioBase64 = outroTts.audio.toString("base64");
      outroWords = outroTts.words;
    } catch (e) {
      console.error("[reel-builder/generate] outro TTS failed:", e);
      if (!audioBase64) providerStatus.voice = "unavailable";
    }
  }

  res.json({
    prompt,
    language,
    series,
    storyboard,
    storyboardEn,
    footageUrls,
    audioBase64,
    words,
    outroAudioBase64,
    outroWords,
    mimeType: "audio/mpeg",
    providerStatus,
  });
});

export default router;
