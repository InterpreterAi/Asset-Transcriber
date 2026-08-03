/**
 * Reel Creator only — OpenAI translate + TTS for marketing reels.
 * Do NOT import transcription / Soniox / workspace translate stacks here.
 *
 * Uses a fresh OpenAI client per request from process.env.OPENAI_API_KEY
 * (avoids stale module-level "placeholder" / Replit proxy that may not support TTS).
 */
import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const VOICES = new Set(["onyx", "nova", "alloy", "echo"]);

function reelBuilderAuthorized(req: { headers: Record<string, unknown> }): boolean {
  const required = process.env.REEL_BUILDER_API_KEY?.trim();
  if (!required) return true; // open when unset (local marketing); set key in prod
  const got =
    (typeof req.headers["x-reel-builder-key"] === "string"
      ? req.headers["x-reel-builder-key"]
      : "") || "";
  return got === required;
}

/** Read OpenAI key at call time (after env-bootstrap). */
function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

function createReelOpenAI(apiKey: string): OpenAI {
  // Direct OpenAI only — reel TTS/translate must not use Replit proxy base URL.
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
          content: `You translate InterpreterAI marketing reel scripts. Return JSON only with keys:
hook, problem, solution, result, captions, outroLine1, outroLine2.
Translate into language code "${targetLanguage}". Keep tone punchy for short vertical video.
outroLine1 must be the translation of: "Stay focused on the conversation."
outroLine2 must be the translation of: "We'll handle the words."
Preserve meaning; do not add hashtags.`,
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

    res.json({
      hook: parsed.hook ?? hook,
      problem: parsed.problem ?? problem,
      solution: parsed.solution ?? solution,
      result: parsed.result ?? result,
      captions: parsed.captions ?? captions,
      outroLine1: parsed.outroLine1 ?? "Stay focused on the conversation.",
      outroLine2: parsed.outroLine2 ?? "We'll handle the words.",
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

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    console.error("[reel-builder/tts] OPENAI_API_KEY is missing in environment variables");
    res.status(400).json({ error: "OPENAI_API_KEY is missing in environment variables" });
    return;
  }

  const body = req.body ?? {};
  // Accept single `text` or concatenate `segments` array from the client.
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

  const voiceRaw = typeof body.voice === "string" ? body.voice.trim().toLowerCase() : "onyx";
  const voice = VOICES.has(voiceRaw) ? voiceRaw : "onyx";

  const payload = {
    model: "tts-1" as const,
    voice: voice as "onyx" | "nova" | "alloy" | "echo",
    input: input.slice(0, 4096),
    response_format: "mp3" as const,
  };

  try {
    const client = createReelOpenAI(apiKey);
    const speech = await client.audio.speech.create(payload);
    const buf = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    const detail = formatOpenAiError(e);
    console.error("[reel-builder/tts] OpenAI TTS failed:", detail);
    console.error("[reel-builder/tts] payload:", {
      model: payload.model,
      voice: payload.voice,
      response_format: payload.response_format,
      inputLength: payload.input.length,
      hasApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey.slice(0, 7),
    });
    if (e && typeof e === "object") {
      console.error("[reel-builder/tts] raw error:", e);
    }
    res.status(500).json({ error: detail || "TTS failed" });
  }
});

export default router;
