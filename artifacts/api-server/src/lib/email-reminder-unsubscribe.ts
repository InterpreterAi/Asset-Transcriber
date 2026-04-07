import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./authEnv.js";

const PAYLOAD_PREFIX = "email-reminders:";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

/** HMAC-signed token; no expiry (invalidates if SESSION_SECRET rotates). */
export function signEmailReminderUnsubscribeToken(userId: number): string {
  const secret = getSessionSecret();
  const sig = createHmac("sha256", secret).update(`${PAYLOAD_PREFIX}${userId}`).digest("hex");
  return Buffer.from(`${userId}:${sig}`, "utf8").toString("base64url");
}

export function verifyEmailReminderUnsubscribeToken(token: string): number | null {
  let raw: string;
  try {
    raw = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const idStr = raw.slice(0, colon);
  const sig = raw.slice(colon + 1);
  const userId = Number(idStr);
  if (!Number.isInteger(userId) || userId < 1 || !/^[0-9a-f]+$/i.test(sig)) return null;

  const secret = getSessionSecret();
  const expectedHex = createHmac("sha256", secret).update(`${PAYLOAD_PREFIX}${userId}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return userId;
}

export function buildEmailReminderUnsubscribeUrl(appBaseUrl: string, userId: number): string {
  const base = normalizeBaseUrl(appBaseUrl);
  const tok = signEmailReminderUnsubscribeToken(userId);
  return `${base}/api/email-preferences/unsubscribe-reminders?token=${encodeURIComponent(tok)}`;
}
