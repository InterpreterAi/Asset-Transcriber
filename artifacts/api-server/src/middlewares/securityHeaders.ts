import type { RequestHandler } from "express";

/**
 * Standard hardening headers. CSP connect-src includes Soniox RT WS and translation fallbacks.
 */
export const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains; preload");
  }

  const parts = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' wss://stt-rt.soniox.com https://api.mymemory.translated.net https://lingva.ml https://lingva.garudalinux.org https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
  ];
  if (isProd) {
    parts.push("upgrade-insecure-requests");
  }
  const csp = parts.join("; ");

  res.setHeader("Content-Security-Policy", csp);
  next();
};
