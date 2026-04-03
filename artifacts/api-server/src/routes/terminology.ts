import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { openai } from "../lib/openai-client.js";

const router = Router();

// ── Language code → readable name map ────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: "English", ar: "Arabic", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ru: "Russian", zh: "Chinese",
  "zh-CN": "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)",
  ja: "Japanese", ko: "Korean", hi: "Hindi", fa: "Persian",
  he: "Hebrew", tr: "Turkish", pl: "Polish", nl: "Dutch",
  sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
  cs: "Czech", hu: "Hungarian", ro: "Romanian", bg: "Bulgarian",
  hr: "Croatian", sk: "Slovak", uk: "Ukrainian", ur: "Urdu",
  vi: "Vietnamese", th: "Thai", ms: "Malay", id: "Indonesian",
  el: "Greek", nb: "Norwegian",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

// ── POST /api/terminology/search ──────────────────────────────────────────────
// Accepts { term, sourceLang, targetLang }
// Returns  { results: TermResult[] }
// Nothing is stored — this is a stateless reference lookup only.
router.post("/search", requireAuth, async (req, res) => {
  const { term, sourceLang, targetLang } = req.body as {
    term?: string;
    sourceLang?: string;
    targetLang?: string;
  };

  if (!term?.trim() || !sourceLang || !targetLang) {
    res.status(400).json({ error: "term, sourceLang, and targetLang are required" });
    return;
  }

  const trimmed = term.trim().slice(0, 120);
  const src = langName(sourceLang);
  const tgt = langName(targetLang);

  const systemPrompt = `You are a professional terminology reference tool for certified interpreters. \
You provide accurate medical, legal, and general terminology translations between languages. \
You do NOT store any information. This is a stateless lookup only.

When given a term in ${src}, provide:
1. The most accurate translation in ${tgt} (prefer clinical/legal standard over colloquial)
2. The domain classification: "medical", "legal", or "general"
3. A short contextual note if useful (e.g. anatomical region, legal concept, alternative term) — max 1 short sentence
4. If the term has multiple common variants or domain-specific translations, list up to 3 as separate results

Respond ONLY with valid JSON in this exact shape (no extra text):
{
  "results": [
    {
      "source": "<the original term>",
      "translation": "<translation in ${tgt}>",
      "domain": "medical|legal|general",
      "note": "<optional short note or empty string>"
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmed },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { results?: unknown[] };
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    res.json({ results });
  } catch (err) {
    req.log.warn({ err }, "Terminology lookup failed");
    res.status(502).json({ error: "Terminology service unavailable" });
  }
});

export default router;
