/**
 * Soniox has no mid-session LID reset API. After a long stretch of one pair
 * language, live LID can stay locked until the WebSocket is reopened
 * (what logout accidentally does). We reopen STT on a pause instead.
 *
 * https://soniox.com/docs/stt/concepts/language-identification
 * https://soniox.com/docs/stt/concepts/language-restrictions
 */

export function spokenOriginalLangs(
  tokens: Array<{ text?: string; language?: string; translation_status?: string }>,
): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (!t.text || t.text === "<end>") continue;
    if (t.translation_status === "translation") continue;
    const lang = (t.language ?? "").split("-")[0]?.toLowerCase() ?? "";
    if (lang) out.push(lang);
  }
  return out;
}

export function shouldRefreshSonioxLidAfterMonolingualLock(opts: {
  origLangs: string[];
  langA: string;
  langB: string;
  origCountAtLastRefresh: number;
  minTokens?: number;
}): boolean {
  const a = (opts.langA || "").split("-")[0]!.toLowerCase();
  const b = (opts.langB || "").split("-")[0]!.toLowerCase();
  if (!a || !b || a === b) return false;
  const min = opts.minTokens ?? 40;
  if (opts.origLangs.length < min) return false;
  if (opts.origLangs.length - opts.origCountAtLastRefresh < min) return false;
  const tail = opts.origLangs.slice(-min);
  const uniq = [...new Set(tail)];
  if (uniq.length !== 1) return false;
  const only = uniq[0]!;
  return only === a || only === b;
}
