import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// ── Language code normalisation ───────────────────────────────────────────────
// Google Translate uses BCP-47 codes; normalise a few common mismatches.
function toGoogleLang(code: string): string {
  const map: Record<string, string> = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    "zh":    "zh-CN",
  };
  return map[code] ?? code;
}

// ── Google Translate (no-key gtx endpoint) ────────────────────────────────────
async function translateGoogle(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const sl = sourceLang ? toGoogleLang(sourceLang) : "auto";
  const tl = toGoogleLang(targetLang);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Google translate HTTP ${res.status}`);
  // Response shape: [ [ [translated, original, ...], ... ], ..., "source_lang" ]
  const data = await res.json() as unknown[][];
  const segments = data[0] as [string, ...unknown[]][];
  const translated = segments.map(s => s[0] ?? "").join("").trim();
  if (!translated) throw new Error("Empty Google translate response");
  return translated;
}

// ── MyMemory fallback ─────────────────────────────────────────────────────────
async function translateMyMemory(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const langPair = `${sourceLang || "en"}|${targetLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${langPair}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json() as { responseStatus: number; responseData: { translatedText: string } };
  if (data.responseStatus !== 200) throw new Error("MyMemory non-200 status");
  return data.responseData.translatedText.trim();
}

router.post("/", requireAuth, async (req, res) => {
  const { text, sourceLang, targetLang } = req.body as {
    text?: string;
    sourceLang?: string;
    targetLang?: string;
  };

  if (!text || !targetLang) {
    res.status(400).json({ error: "text and targetLang are required" });
    return;
  }

  if (!text.trim()) {
    res.json({ translatedText: "" });
    return;
  }

  const src = (sourceLang ?? "").trim();
  const tgt = targetLang.trim();
  const body = text.trim().slice(0, 1000);

  // Try Google first; fall back to MyMemory if Google fails
  try {
    const translated = await translateGoogle(body, src, tgt);
    res.json({ translatedText: translated });
    return;
  } catch (googleErr) {
    req.log.warn({ err: googleErr }, "Google translate failed, trying MyMemory");
  }

  try {
    const translated = await translateMyMemory(body, src, tgt);
    res.json({ translatedText: translated });
  } catch (err) {
    req.log.warn({ err }, "Translation error (all providers failed)");
    res.status(502).json({ error: "Translation service unavailable" });
  }
});

export default router;
