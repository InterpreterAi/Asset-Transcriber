import type { RequestHandler } from "express";

/**
 * Standard hardening headers. CSP connect-src includes Soniox RT WS and translation fallbacks.
 * Paddle overlay checkout loads https://cdn.paddle.com/paddle/v2/paddle.js and iframes buy.paddle.com.
 */
export function buildContentSecurityPolicy(isProd: boolean): string {
  const parts = [
    "default-src 'self'",
    "script-src 'self' https://cdn.paddle.com https://sandbox-cdn.paddle.com https://public.profitwell.com",
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' wss://stt-rt.soniox.com https://api.mymemory.translated.net https://lingva.ml https://lingva.garudalinux.org https:",
    "frame-src 'self' https://buy.paddle.com https://sandbox-buy.paddle.com https://*.paddle.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://buy.paddle.com https://sandbox-buy.paddle.com",
    "object-src 'none'",
  ];
  if (isProd) {
    parts.push("upgrade-insecure-requests");
  }
  return parts.join("; ");
}

export const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains; preload");
  }

  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy(isProd));
  next();
};
