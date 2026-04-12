import axios from "axios";
import { logger } from "./logger.js";

const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";

function apiKey(): string | undefined {
  const k = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  return k || undefined;
}

/**
 * Google Cloud Translation API v2 (same pre/post pipeline as Libre for Basic/Professional).
 * Requires GOOGLE_TRANSLATE_API_KEY in the API server environment.
 */
export function isGoogleTranslateConfigured(): boolean {
  return Boolean(apiKey());
}

export async function callGoogleTranslate(text: string, source: string, target: string): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is not set");
  }
  const res = await axios.post<{ data?: { translations?: { translatedText?: string }[] } }>(
    `${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(key)}`,
    {
      q: text,
      source,
      target,
      format: "text",
    },
    {
      timeout: 30_000,
      validateStatus: () => true,
    },
  );

  if (res.status !== 200) {
    const errBody = res.data as { error?: { message?: string; code?: number } } | undefined;
    logger.warn(
      {
        status: res.status,
        googleMessage: errBody?.error?.message,
        googleCode: errBody?.error?.code,
      },
      "Google Translate HTTP error",
    );
    throw new Error(`Google Translate failed: HTTP ${res.status}`);
  }

  const errInBody = (res.data as { error?: { message?: string } } | undefined)?.error;
  if (errInBody?.message) {
    logger.warn({ message: errInBody.message }, "Google Translate error in response body");
    throw new Error("Google Translate API returned an error");
  }

  const out = res.data?.data?.translations?.[0]?.translatedText;
  if (typeof out !== "string" || !out.trim()) {
    throw new Error("Google Translate returned no translatedText");
  }
  return out;
}
