import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

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

  try {
    const langPair = `${sourceLang || "autodetect"}|${targetLang}`;
    const encoded = encodeURIComponent(text.trim().slice(0, 500));
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langPair}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Translation API error");

    const data = (await response.json()) as {
      responseStatus: number;
      responseData: { translatedText: string };
    };

    if (data.responseStatus !== 200) {
      throw new Error("Translation failed");
    }

    res.json({ translatedText: data.responseData.translatedText });
  } catch (err) {
    req.log.warn({ err }, "Translation error");
    res.status(502).json({ error: "Translation service unavailable" });
  }
});

export default router;
