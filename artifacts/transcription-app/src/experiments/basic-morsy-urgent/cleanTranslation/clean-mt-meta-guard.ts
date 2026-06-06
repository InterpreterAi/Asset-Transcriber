/**
 * Detect Clean MT model meta/refusal replies (any language) — never paint these in the UI.
 * Keep patterns aligned with api-server `isMorsyCleanBadOutput`.
 */
export function isCleanMtMetaOrRefusalTranslation(translated: string, sourceText = ""): boolean {
  const t = translated.trim();
  if (!t) return false;
  const s = sourceText.trim();
  const lower = t.toLowerCase();

  const refusalLatin = [
    "i cannot help",
    "i can't help",
    "i'm sorry",
    "i am sorry",
    "sorry, i can",
    "no text provided",
    "as an ai",
    "i cannot translate",
    "unable to translate",
    "cannot translate",
    "please provide",
    "provide a complete",
    "provide the complete",
    "provide full text",
    "provide the full",
    "complete text for translation",
    "full text for translation",
    "error in the provided",
    "error in the text",
    "there seems to be an error",
    "there is an error in",
    "incomplete text",
    "missing text",
    "no text to translate",
    "text is incomplete",
    "not enough text",
  ];
  if (t.length < 220 && refusalLatin.some((sig) => lower.includes(sig))) return true;

  const refusalAr =
    /خطأ\s*في\s*النص|النص\s*المقدم|نص\s*كامل|يرجى\s*تقديم|لا\s*يمكن\s*الترجمة|لا\s*أستطيع\s*الترجمة|النص\s*غير\s*مكتمل|نص\s*غير\s*كامل/u.test(
      t,
    );
  if (refusalAr) return true;

  const refusalEs =
    /\b(lo siento|no puedo traducir|texto incompleto|proporcione el texto|error en el texto)\b/i.test(t);
  if (refusalEs) return true;

  const refusalFr =
    /\b(je suis d[ée]sol[ée]|je ne peux pas traduire|texte incomplet|veuillez fournir|erreur dans le texte)\b/i.test(
      t,
    );
  if (refusalFr) return true;

  if (/\bNUM_\d+\b/.test(t)) return true;

  if (s && t === s) return true;

  return false;
}
