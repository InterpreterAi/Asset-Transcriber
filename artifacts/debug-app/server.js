import express from "express";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// ── API keys — set these as environment variables ──────────────────────────
const SONIOX_API_KEY = process.env.SONIOX_API_KEY || "YOUR_SONIOX_API_KEY";
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
             ? (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "placeholder")
             : (process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY"),
});

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ── GET /api/soniox-key ────────────────────────────────────────────────────
// Returns the Soniox API key so the browser can open a direct WebSocket.
app.get("/api/soniox-key", (req, res) => {
  res.json({ apiKey: SONIOX_API_KEY });
});

// ── POST /api/translate ───────────────────────────────────────────────────
// Translates a finalized segment using OpenAI gpt-4o-mini.
// Returns { translated, latencyMs } for debug timing.
app.post("/api/translate", async (req, res) => {
  const t0 = Date.now();
  const { text, srcLang, tgtLang } = req.body;

  if (!text?.trim() || !srcLang || !tgtLang) {
    return res.status(400).json({ error: "text, srcLang, and tgtLang are required" });
  }

  const srcBase = srcLang.split("-")[0];
  const tgtBase = tgtLang.split("-")[0];
  if (srcBase === tgtBase) {
    return res.json({ translated: text, latencyMs: 0, skipped: true });
  }

  const LANG_NAMES = {
    ar:"Arabic", bg:"Bulgarian", "zh-CN":"Chinese (Simplified)", "zh-TW":"Chinese (Traditional)",
    hr:"Croatian", cs:"Czech", da:"Danish", nl:"Dutch", en:"English", fa:"Persian (Farsi)",
    fi:"Finnish", fr:"French", de:"German", el:"Greek", he:"Hebrew", hi:"Hindi",
    hu:"Hungarian", id:"Indonesian", it:"Italian", ja:"Japanese", ko:"Korean",
    ms:"Malay", nb:"Norwegian", pl:"Polish", pt:"Portuguese", ro:"Romanian",
    ru:"Russian", sk:"Slovak", es:"Spanish", sv:"Swedish", th:"Thai",
    tr:"Turkish", uk:"Ukrainian", ur:"Urdu", vi:"Vietnamese",
  };
  const srcName = LANG_NAMES[srcLang] || srcLang;
  const tgtName = LANG_NAMES[tgtLang] || tgtLang;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional simultaneous interpreter. Translate the following ${srcName} text to ${tgtName}. Return ONLY the translation — no explanations, no quotation marks, no extra text.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }, { signal: controller.signal });

    clearTimeout(timeout);
    const translated = completion.choices[0]?.message?.content?.trim() ?? "";
    const latencyMs  = Date.now() - t0;
    res.json({ translated, latencyMs });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    if (err.name === "AbortError") {
      return res.status(503).json({ error: "Translation timed out (12s)", latencyMs });
    }
    res.status(503).json({ error: err.message || "Translation failed", latencyMs });
  }
});

app.listen(PORT, () => {
  console.log(`[debug-app] listening on http://localhost:${PORT}`);
  console.log(`[debug-app] SONIOX_API_KEY: ${SONIOX_API_KEY === "YOUR_SONIOX_API_KEY" ? "⚠️  NOT SET" : "✓ configured"}`);
  console.log(`[debug-app] OPENAI_API_KEY: ${process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ? "✓ configured" : "⚠️  NOT SET"}`);
});
