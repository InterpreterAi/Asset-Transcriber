import cors from "cors";
import type { CorsOptions } from "cors";

/**
 * Browser CORS allowlist for credentialed `/api/*` calls.
 *
 * - Production: only `CORS_ALLOWED_ORIGINS` (comma-separated) or default `https://app.interpreterai.org`.
 * - Further hardening: put the public app behind Cloudflare (Bot Fight / rate limits / WAF rules).
 *   This middleware cannot replace edge WAF; it only validates `Origin` for browser XHR/fetch.
 *
 * Note: the realtime STT WebSocket goes directly to Soniox (`wss://stt-rt.soniox.com/...`) with a
 * short-lived server-minted key — not upgradeable through this Express app. Protect `/api/transcription/token`
 * with auth + rate limits (see `transcriptionTokenLimiter`).
 */
const DEFAULT_PRODUCTION_ORIGINS = ["https://app.interpreterai.org"];

const DEV_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function productionAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_PRODUCTION_ORIGINS;
}

/**
 * Production: only configured origins (default https://app.interpreterai.org).
 * Development: localhost / 127.0.0.1 / ::1 with any port, plus any CORS_ALLOWED_ORIGINS entries.
 */
export function createProductionCorsMiddleware(): ReturnType<typeof cors> {
  const allowedProd = productionAllowedOrigins();

  const options: CorsOptions = {
    credentials: true,
    origin(origin, callback) {
      if (process.env.NODE_ENV === "development") {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (DEV_ORIGIN_RE.test(origin)) {
          callback(null, true);
          return;
        }
        if (allowedProd.length && allowedProd.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, true);
        return;
      }

      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedProd.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  };

  return cors(options);
}
