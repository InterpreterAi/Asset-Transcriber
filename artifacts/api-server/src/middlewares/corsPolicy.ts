import cors from "cors";
import type { CorsOptions } from "cors";

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
