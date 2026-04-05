import { logger } from "./logger.js";

/**
 * Cloudflare Turnstile siteverify.
 * When TURNSTILE_SECRET_KEY is unset, returns ok=true only in non-production (local dev).
 */
export async function verifyTurnstileForSignup(
  token: string | undefined,
  remoteip: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("TURNSTILE_SECRET_KEY is required in production for signup");
      return { ok: false, error: "Signup verification is not configured. Please contact support." };
    }
    return { ok: true };
  }

  if (!token?.trim()) {
    return { ok: false, error: "Please complete the verification challenge." };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token.trim());
    if (remoteip) body.set("remoteip", remoteip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success === true) return { ok: true };

    logger.warn({ errorCodes: data["error-codes"] }, "Turnstile verification failed");
    return { ok: false, error: "Verification failed. Please try again." };
  } catch (err) {
    logger.error({ err }, "Turnstile siteverify request failed");
    return { ok: false, error: "Verification service unavailable. Please try again." };
  }
}
