import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireJsonObjectBody } from "../middlewares/aiRequestValidation.js";
import { translatePlainMachine } from "../lib/basic-pro-translate.js";

const router = Router();
router.use(requireJsonObjectBody);

function baseLang(code: string | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "auto";
  return c.split("-")[0]!;
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

  const body = text.trim().slice(0, 1000);
  const src = baseLang(sourceLang);
  const tgt = baseLang(targetLang);
  if (!tgt || tgt === "auto") {
    res.status(400).json({ error: "targetLang is required" });
    return;
  }

  const srcTag = sourceLang?.trim() || src;
  const tgtTag = targetLang?.trim() || tgt;

  try {
    const translated = await translatePlainMachine(body, srcTag, tgtTag);
    res.json({ translatedText: translated });
  } catch (err) {
    req.log.warn({ err }, "Machine translation failed");
    res.status(502).json({ error: "Translation service unavailable" });
  }
});

export default router;
