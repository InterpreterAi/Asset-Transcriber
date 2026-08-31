import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingPlanType } from "./paypal.js";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Live credential prefixes win over PADDLE_ENV=sandbox (that combo 403s on sandbox-api). */
export function inferPaddleEnvironment(opts: {
  env?: string;
  apiKey?: string;
  clientToken?: string;
}): "sandbox" | "live" {
  const key = (opts.apiKey ?? "").trim();
  const token = (opts.clientToken ?? "").trim();
  if (token.startsWith("live_") || key.startsWith("pdl_live_")) return "live";
  if (token.startsWith("test_")) return "sandbox";
  const explicit = (opts.env ?? "").trim().toLowerCase();
  if (explicit === "live" || explicit === "production") return "live";
  return "sandbox";
}

export function paddleApiKeyLooksLikeClientToken(key: string): boolean {
  const k = key.trim();
  return k.startsWith("live_") || k.startsWith("test_");
}

export function paddleApiKeyKind(key: string): string {
  const k = key.trim();
  if (!k) return "missing";
  if (k.startsWith("pdl_live_")) return "pdl_live";
  if (k.startsWith("pdl_sdbx_")) return "pdl_sdbx";
  if (k.startsWith("pdl_")) return "pdl";
  if (k.startsWith("live_")) return "client_token_live";
  if (k.startsWith("test_")) return "client_token_test";
  return "unknown";
}

export function isCompletedPaddleTransactionStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "completed" || s === "paid" || s === "billed";
}

export function extractPaddleCustomerId(data: unknown): string {
  const rec = asRecord(data);
  return typeof rec.customer_id === "string" ? rec.customer_id.trim() : "";
}

export function extractPaddleSubscriptionId(data: unknown): string {
  const rec = asRecord(data);
  if (typeof rec.subscription_id === "string" && rec.subscription_id.trim()) return rec.subscription_id.trim();
  if (typeof rec.id === "string" && rec.id.trim().startsWith("sub_")) return rec.id.trim();
  return "";
}

export function extractPaddleTransactionStatus(data: unknown): string {
  const rec = asRecord(data);
  return typeof rec.status === "string" ? rec.status.trim().toLowerCase() : "";
}

export function extractPaddleCustomUserId(data: unknown): number {
  const rec = asRecord(data);
  const custom = asRecord(rec.custom_data);
  const raw = custom.user_id ?? custom.userId ?? custom.userID;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function extractPaddleCustomPlan(data: unknown): BillingPlanType | null {
  const rec = asRecord(data);
  const custom = asRecord(rec.custom_data);
  const raw = String(custom.plan_type ?? custom.planType ?? "").trim().toLowerCase();
  if (raw === "basic" || raw === "professional" || raw === "platinum") return raw;
  return null;
}

export function extractPaddlePriceId(data: unknown): string {
  const rec = asRecord(data);
  const items = Array.isArray(rec.items) ? rec.items : [];
  for (const item of items) {
    const row = asRecord(item);
    const price = asRecord(row.price);
    const id = typeof price.id === "string" ? price.id : typeof row.price_id === "string" ? row.price_id : "";
    if (id) return id;
  }
  return "";
}

export function billingPlanFromAllowlistedPriceIds(
  priceId: string | null | undefined,
  allowlist: { basic: string; professional: string },
): BillingPlanType | null {
  const id = (priceId ?? "").trim();
  if (!id) return null;
  if (allowlist.basic && id === allowlist.basic) return "basic";
  if (allowlist.professional && id === allowlist.professional) return "professional";
  return null;
}

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) + octet;
  }
  return n >>> 0;
}

/** True IPv4 CIDR match, including non-/32 ranges. IPv6-mapped IPv4 (`::ffff:a.b.c.d`) is accepted. */
export function ipMatchesCidrList(ip: string, cidrs: string[]): boolean {
  const clean = ip.replace(/^::ffff:/i, "").trim();
  const ipNum = ipv4ToInt(clean);
  if (ipNum === null || cidrs.length === 0) return false;
  return cidrs.some((cidr) => {
    const [base, bitsRaw] = cidr.split("/");
    const bits = bitsRaw === undefined || bitsRaw === "" ? 32 : Number(bitsRaw);
    const baseNum = ipv4ToInt((base ?? "").trim());
    if (baseNum === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipNum & mask) === (baseNum & mask);
  });
}

export function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader || !rawBody) return false;
  let ts = "";
  const h1s: string[] = [];
  for (const part of signatureHeader.split(";")) {
    const [k, ...rest] = part.split("=");
    const v = rest.join("=").trim();
    if (k?.trim() === "ts") ts = v;
    if (k?.trim() === "h1" && v) h1s.push(v);
  }
  if (!ts || h1s.length === 0) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || !/^\d+$/.test(ts)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return h1s.some((h1) => {
    const got = Buffer.from(h1, "utf8");
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
  });
}

export function paddleCanceledAccessStillActive(opts: {
  subscriptionStatus?: string | null;
  subscriptionPeriodEndsAt?: Date | string | null;
  now?: Date;
}): boolean {
  const status = (opts.subscriptionStatus ?? "").trim().toLowerCase();
  if (status !== "canceled" && status !== "cancelled") return false;
  const endRaw = opts.subscriptionPeriodEndsAt;
  if (!endRaw) return false;
  const end = endRaw instanceof Date ? endRaw : new Date(endRaw);
  if (!Number.isFinite(end.getTime())) return false;
  return end.getTime() > (opts.now ?? new Date()).getTime();
}

/**
 * Ownership for return-sync: authenticated session must match Paddle custom_data.user_id
 * or an already-linked paddle_customer_id. Query params are not evidence.
 */
export function paddleTransactionBelongsToUser(
  data: unknown,
  user: { id: number; paddleCustomerId?: string | null },
): boolean {
  const customUserId = extractPaddleCustomUserId(data);
  if (Number.isFinite(customUserId)) return customUserId === user.id;
  const customerId = extractPaddleCustomerId(data);
  const linked = (user.paddleCustomerId ?? "").trim();
  return Boolean(linked && customerId && linked === customerId);
}
