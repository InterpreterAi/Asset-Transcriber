/**
 * Browser-side fallback when the app API (`/api/transcription/translate`) is unreachable
 * (e.g. Railway paused) or returns OpenAI/configuration errors.
 *
 * Uses public translation endpoints (MyMemory, then Lingva mirrors). Quality may differ
 * from the primary OpenAI path; content is sent to those third parties only as a fallback.
 */

function baseLang(code: string): string {
  const c = (code.split("-")[0] ?? "en").trim();
  return c.toLowerCase() || "en";
}

const DEFAULT_LINGVA_HOSTS = [
  "https://lingva.ml",
  "https://lingva.garudalinux.org",
];

function lingvaHosts(): string[] {
  const custom = import.meta.env.VITE_TRANSLATION_FALLBACK_LINGVA_HOST?.trim();
  if (custom) return [custom.replace(/\/$/, ""), ...DEFAULT_LINGVA_HOSTS];
  return DEFAULT_LINGVA_HOSTS;
}

async function tryMyMemory(
  text: string,
  src: string,
  tgt: string,
  signal: AbortSignal,
): Promise<string> {
  const q = text.slice(0, 450);
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(tgt)}`;
  const r = await fetch(url, { signal, mode: "cors" });
  if (!r.ok) return "";
  const d = (await r.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
    matches?: unknown;
  };
  if (d.responseStatus !== 200 || !d.responseData?.translatedText) return "";
  return d.responseData.translatedText.trim();
}

async function tryLingva(
  text: string,
  src: string,
  tgt: string,
  signal: AbortSignal,
): Promise<string> {
  const chunk = text.slice(0, 500);
  const encoded = encodeURIComponent(chunk);
  for (const host of lingvaHosts()) {
    try {
      const url = `${host}/api/v1/${encodeURIComponent(src)}/${encodeURIComponent(tgt)}/${encoded}`;
      const r = await fetch(url, { signal, mode: "cors" });
      if (!r.ok) continue;
      const d = (await r.json()) as { translation?: string };
      const out = d.translation?.trim() ?? "";
      if (out) return out;
    } catch {
      /* next host */
    }
  }
  return "";
}

/**
 * Returns translated text, or "" if all public fallbacks fail.
 */
export async function fetchPublicFallbackTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const t = text.trim();
  if (t.length < 2) return "";

  const src = baseLang(sourceLang);
  const tgt = baseLang(targetLang);
  if (src === tgt) return t;

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 12_000);
  const signal = controller.signal;

  try {
    const mm = await tryMyMemory(t, src, tgt, signal);
    if (mm) return mm;

    const lv = await tryLingva(t, src, tgt, signal);
    if (lv) return lv;
  } catch {
    return "";
  } finally {
    clearTimeout(to);
  }
  return "";
}
