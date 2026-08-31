import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import {
  billingPlanTierDisplayName,
  dbPlanTypeFromPayPalBilling,
  paypalPlanConfig,
  subscriptionPeriodEndFallback,
  type BillingPlanType,
} from "./paypal.js";
import { formatEmailDate } from "./email-template.js";
import { sendSubscriptionConfirmationEmail, sendSubscriptionRenewalEmail } from "./transactional-email.js";
import { TRIAL_DAILY_LIMIT_MINUTES } from "./trial-constants.js";
import {
  billingPlanFromAllowlistedPriceIds,
  extractPaddleCustomerId,
  extractPaddlePriceId,
  extractPaddleSubscriptionId,
  extractPaddleTransactionStatus,
  inferPaddleEnvironment,
  ipMatchesCidrList,
  isCompletedPaddleTransactionStatus,
  paddleApiKeyKind,
  paddleApiKeyLooksLikeClientToken,
  paddleCanceledAccessStillActive,
  paddleTransactionBelongsToUser,
  verifyPaddleSignature,
} from "./paddle-verify.js";

export {
  billingPlanFromAllowlistedPriceIds,
  extractPaddleCustomPlan,
  extractPaddleCustomUserId,
  extractPaddleCustomerId,
  extractPaddlePriceId,
  extractPaddleSubscriptionId,
  extractPaddleTransactionStatus,
  ipMatchesCidrList,
  isCompletedPaddleTransactionStatus,
  paddleCanceledAccessStillActive,
  paddleTransactionBelongsToUser,
  verifyPaddleSignature,
} from "./paddle-verify.js";

export class PaddleApiError extends Error {
  statusCode: number;
  details: unknown;
  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "PaddleApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function envTrim(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function paddleEnvironment(): "sandbox" | "live" {
  return inferPaddleEnvironment({
    env: envTrim("PADDLE_ENV"),
    apiKey: envTrim("PADDLE_API_KEY"),
    clientToken: envTrim("PADDLE_CLIENT_TOKEN"),
  });
}

export function paddleApiCredentialKind(): string {
  return paddleApiKeyKind(paddleApiKey());
}

export function paddleApiBase(): string {
  return paddleEnvironment() === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export function paddleClientToken(): string {
  return envTrim("PADDLE_CLIENT_TOKEN");
}

export function paddleApiKey(): string {
  return envTrim("PADDLE_API_KEY");
}

export function paddleWebhookSecret(): string {
  return envTrim("PADDLE_WEBHOOK_SECRET") || envTrim("PADDLE_NOTIFICATION_SECRET");
}

export function paddlePriceIdForPlan(plan: BillingPlanType): string {
  if (plan === "basic") return envTrim("PADDLE_PRICE_ID_BASIC");
  if (plan === "professional") return envTrim("PADDLE_PRICE_ID_PROFESSIONAL");
  return envTrim("PADDLE_PRICE_ID_PLATINUM");
}

/** Server allowlist: Paddle price ID → public catalog only (Basic $59 / Professional $99). */
export function billingPlanFromPaddlePriceId(priceId: string | null | undefined): BillingPlanType | null {
  return billingPlanFromAllowlistedPriceIds(priceId, {
    basic: envTrim("PADDLE_PRICE_ID_BASIC"),
    professional: envTrim("PADDLE_PRICE_ID_PROFESSIONAL"),
  });
}

export function paddleCheckoutEnabled(): boolean {
  return Boolean(paddleApiKey() && paddleClientToken() && paddlePriceIdForPlan("basic") && paddlePriceIdForPlan("professional"));
}

export function paddlePublicConfig() {
  return {
    enabled: paddleCheckoutEnabled(),
    environment: paddleEnvironment(),
    clientToken: paddleClientToken(),
    prices: {
      basic: paddlePriceIdForPlan("basic") || null,
      professional: paddlePriceIdForPlan("professional") || null,
    },
  };
}

/** Public fields only — safe without a session so `/checkout` can initialize Paddle.js. */
export function paddleJsPublicConfig() {
  const enabled = paddleCheckoutEnabled();
  return {
    enabled,
    environment: paddleEnvironment(),
    clientToken: enabled ? paddleClientToken() : "",
  };
}

export async function paddleFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const key = paddleApiKey();
  if (!key) throw new PaddleApiError("PADDLE_API_KEY is not set", 503);
  const res = await fetch(`${paddleApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Paddle-Version": "1",
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as T;
  if (!res.ok) {
    const errObj = (json as { error?: { detail?: string; code?: string } } | null)?.error;
    const detail = errObj?.detail || `Paddle API ${res.status}`;
    throw new PaddleApiError(detail, res.status, json);
  }
  return json;
}

let cachedIpv4Cidrs: { at: number; cidrs: string[] } | null = null;

export async function fetchPaddleIpv4Cidrs(): Promise<string[]> {
  const now = Date.now();
  if (cachedIpv4Cidrs && now - cachedIpv4Cidrs.at < 6 * 60 * 60 * 1000) return cachedIpv4Cidrs.cidrs;
  try {
    const url = paddleEnvironment() === "live" ? "https://api.paddle.com/ips" : "https://sandbox-api.paddle.com/ips";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Paddle IP list HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { ipv4_cidrs?: string[] } };
    const cidrs = Array.isArray(json.data?.ipv4_cidrs) ? json.data.ipv4_cidrs.filter((c) => typeof c === "string") : [];
    if (cidrs.length) cachedIpv4Cidrs = { at: now, cidrs };
    return cidrs.length ? cidrs : cachedIpv4Cidrs?.cidrs ?? [];
  } catch (err) {
    if (cachedIpv4Cidrs?.cidrs.length) {
      logger.warn({ err }, "Paddle IP allowlist fetch failed — using cached CIDRs");
      return cachedIpv4Cidrs.cidrs;
    }
    throw err;
  }
}

export function clientIpFromRequest(req: { ip?: string; headers: { [key: string]: string | string[] | undefined } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === "string" ? forwarded.split(",")[0] : "";
  const fromHeader = raw.trim();
  return fromHeader || String(req.ip ?? "").trim();
}

export async function assertPaddleWebhookIp(ip: string): Promise<boolean> {
  try {
    const cidrs = await fetchPaddleIpv4Cidrs();
    if (!cidrs.length) {
      logger.warn({ ip }, "Paddle IP allowlist empty after fetch — rejecting (signature already checked)");
      return false;
    }
    const ok = ipMatchesCidrList(ip, cidrs);
    if (!ok) logger.warn({ ip, cidrsCount: cidrs.length }, "Paddle webhook rejected: IP not in CIDR allowlist");
    return ok;
  } catch (err) {
    logger.warn({ err, ip }, "Paddle IP allowlist unavailable — rejecting after signature check");
    return false;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extractPaddlePeriod(data: unknown): { startAt: Date; periodEnd: Date } {
  const rec = asRecord(data);
  const period = asRecord(rec.current_billing_period);
  const startRaw = typeof period.starts_at === "string" ? period.starts_at : typeof rec.started_at === "string" ? rec.started_at : "";
  const endRaw = typeof period.ends_at === "string" ? period.ends_at : "";
  const startAt = startRaw && Number.isFinite(new Date(startRaw).getTime()) ? new Date(startRaw) : new Date();
  const periodEnd =
    endRaw && Number.isFinite(new Date(endRaw).getTime()) ? new Date(endRaw) : subscriptionPeriodEndFallback(startAt);
  return { startAt, periodEnd };
}

export async function activatePaddlePaidUser(opts: {
  userId: number;
  billingPlan: BillingPlanType;
  customerId?: string | null;
  subscriptionId?: string | null;
  startAt: Date;
  periodEnd: Date;
  sendConfirmation: boolean;
  renewalMarker?: string | null;
}): Promise<void> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId)).limit(1);
  if (!user || user.isAdmin) return;

  const plan = paypalPlanConfig(opts.billingPlan);
  const resolvedPlanType = dbPlanTypeFromPayPalBilling(opts.billingPlan);
  await db
    .update(usersTable)
    .set({
      paddleCustomerId: opts.customerId || user.paddleCustomerId || null,
      paddleSubscriptionId: opts.subscriptionId || user.paddleSubscriptionId || null,
      subscriptionStatus: "active",
      subscriptionStartedAt: opts.startAt,
      subscriptionPeriodEndsAt: opts.periodEnd,
      subscriptionCanceledEmailSentAt: null,
      planType: resolvedPlanType,
      dailyLimitMinutes: plan.dailyLimitMinutes,
      subscriptionPlan: opts.billingPlan,
      minutesUsedToday: opts.renewalMarker ? 0 : user.minutesUsedToday,
      lastUsageResetAt: opts.renewalMarker ? new Date() : user.lastUsageResetAt,
    })
    .where(eq(usersTable.id, opts.userId));

  logger.info(
    {
      userId: opts.userId,
      planType: resolvedPlanType,
      subscriptionPlan: opts.billingPlan,
      paddleSubscriptionId: opts.subscriptionId,
    },
    "Paddle subscription activated",
  );

  const em = user.email?.trim().toLowerCase();
  if (!em) return;
  const nextBillingDate = formatEmailDate(opts.periodEnd);
  const planName = billingPlanTierDisplayName(opts.billingPlan);
  const planBenefitsLine =
    opts.billingPlan === "basic" ? "Your Basic plan includes 5 hours of interpretation per day for 30 days." : undefined;

  if (opts.sendConfirmation && !user.subscriptionConfirmationSentAt) {
    const ok = await sendSubscriptionConfirmationEmail(em, planName, nextBillingDate, user.username, user.id, {
      planBenefitsLine,
    });
    if (ok) {
      await db
        .update(usersTable)
        .set({
          subscriptionConfirmationSentAt: new Date(),
          paymentReceiptLastInvoiceId: opts.renewalMarker ?? user.paymentReceiptLastInvoiceId,
        })
        .where(eq(usersTable.id, opts.userId));
    }
    return;
  }

  if (opts.renewalMarker && user.paymentReceiptLastInvoiceId === opts.renewalMarker) return;
  if (opts.renewalMarker && user.subscriptionConfirmationSentAt) {
    await sendSubscriptionRenewalEmail(em, planName, nextBillingDate, user.username, user.id);
    await db
      .update(usersTable)
      .set({ paymentReceiptLastInvoiceId: opts.renewalMarker })
      .where(eq(usersTable.id, opts.userId));
  }
}

export type VerifiedPaddleSyncResult =
  | { ok: true; planType: string; subscriptionPlan: BillingPlanType }
  | { ok: false; pending: true; reason: string };

/**
 * Shared activation for signed webhooks and authenticated return-sync.
 * Plan comes only from the server price-ID allowlist. Return-sync must pass
 * `requireCompleted` + `requireOwnerUserId` so a query param cannot activate.
 */
export async function applyVerifiedPaddleTransaction(opts: {
  data: unknown;
  userId: number;
  requireCompleted: boolean;
  requireOwnerUserId: number | null;
  sendConfirmation: boolean;
  renewalMarker?: string | null;
}): Promise<VerifiedPaddleSyncResult> {
  if (opts.requireCompleted && !isCompletedPaddleTransactionStatus(extractPaddleTransactionStatus(opts.data))) {
    return { ok: false, pending: true, reason: "transaction_not_completed" };
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId)).limit(1);
  if (!user || user.isAdmin) {
    return { ok: false, pending: true, reason: "user_not_eligible" };
  }

  if (opts.requireOwnerUserId != null) {
    if (opts.requireOwnerUserId !== user.id || !paddleTransactionBelongsToUser(opts.data, user)) {
      return { ok: false, pending: true, reason: "owner_mismatch" };
    }
  }

  const billingPlan = billingPlanFromPaddlePriceId(extractPaddlePriceId(opts.data));
  if (!billingPlan) {
    return { ok: false, pending: true, reason: "price_not_allowlisted" };
  }

  const { startAt, periodEnd } = extractPaddlePeriod(opts.data);
  await activatePaddlePaidUser({
    userId: user.id,
    billingPlan,
    customerId: extractPaddleCustomerId(opts.data) || null,
    subscriptionId: extractPaddleSubscriptionId(opts.data) || null,
    startAt,
    periodEnd,
    sendConfirmation: opts.sendConfirmation,
    renewalMarker: opts.renewalMarker ?? null,
  });

  return {
    ok: true,
    planType: dbPlanTypeFromPayPalBilling(billingPlan),
    subscriptionPlan: billingPlan,
  };
}

export async function deactivatePaddlePaidUser(userId: number): Promise<void> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || user.isAdmin) return;
  await db
    .update(usersTable)
    .set({
      planType: "trial-openai",
      dailyLimitMinutes: TRIAL_DAILY_LIMIT_MINUTES,
      subscriptionStatus: "inactive",
      subscriptionPeriodEndsAt: null,
    })
    .where(eq(usersTable.id, userId));
  logger.info({ userId }, "Paddle subscription deactivated; user returned to trial-openai");
}

/** Cancel was requested; paid plan and daily cap stay until `periodEnd`. */
export async function markPaddleCanceledKeepAccess(userId: number, periodEnd: Date): Promise<void> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || user.isAdmin) return;
  await db
    .update(usersTable)
    .set({
      subscriptionStatus: "canceled",
      subscriptionPeriodEndsAt: periodEnd,
    })
    .where(eq(usersTable.id, userId));
  logger.info({ userId, periodEnd: periodEnd.toISOString() }, "Paddle cancel recorded; paid access kept until period end");
}

export async function applyPaddleCancellation(userId: number, data: unknown): Promise<void> {
  const { periodEnd } = extractPaddlePeriod(data);
  if (paddleCanceledAccessStillActive({ subscriptionStatus: "canceled", subscriptionPeriodEndsAt: periodEnd })) {
    await markPaddleCanceledKeepAccess(userId, periodEnd);
    return;
  }
  await deactivatePaddlePaidUser(userId);
}

export async function expireCanceledPaddleAccessIfDue<T extends {
  id: number;
  isAdmin?: boolean | null;
  paddleSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPeriodEndsAt?: Date | null;
  planType: string;
  dailyLimitMinutes: number;
}>(user: T): Promise<T> {
  if (user.isAdmin) return user;
  if (!`${user.paddleSubscriptionId ?? ""}`.trim()) return user;
  const status = (user.subscriptionStatus ?? "").trim().toLowerCase();
  if (status !== "canceled" && status !== "cancelled") return user;
  if (paddleCanceledAccessStillActive(user)) return user;
  await deactivatePaddlePaidUser(user.id);
  return {
    ...user,
    planType: "trial-openai",
    dailyLimitMinutes: TRIAL_DAILY_LIMIT_MINUTES,
    subscriptionStatus: "inactive",
    subscriptionPeriodEndsAt: null,
  };
}

export async function cancelPaddleSubscription(
  subscriptionId: string,
  opts?: { effectiveFrom?: "immediately" | "next_billing_period" },
): Promise<boolean> {
  const id = subscriptionId.trim();
  if (!id) return false;
  const effectiveFrom = opts?.effectiveFrom ?? "immediately";
  try {
    await paddleFetch(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ effective_from: effectiveFrom }),
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/canceled|cancelled|not found/i.test(msg)) return true;
    throw err;
  }
}

export async function createPaddleCheckoutTransaction(opts: {
  planType: BillingPlanType;
  userId: number;
  email: string | null;
  customerId: string | null;
  successUrl: string;
}): Promise<{ checkoutUrl: string; transactionId: string }> {
  const key = paddleApiKey();
  if (paddleApiKeyLooksLikeClientToken(key)) {
    throw new PaddleApiError(
      "PADDLE_API_KEY is a client-side token (live_/test_). Use the server API key (pdl_…) for checkout.",
      503,
    );
  }
  const priceId = paddlePriceIdForPlan(opts.planType);
  if (!priceId) throw new PaddleApiError(`Paddle price is not configured for ${opts.planType}`, 503);
  const body: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    collection_mode: "automatic",
    currency_code: "USD",
    custom_data: { user_id: String(opts.userId), plan_type: opts.planType },
    checkout: { url: opts.successUrl },
  };
  if (opts.customerId) body.customer_id = opts.customerId;
  else if (opts.email) body.customer = { email: opts.email };
  const json = await paddleFetch<{ data?: { id?: string; checkout?: { url?: string } } }>("/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const checkoutUrl = json.data?.checkout?.url ?? "";
  const transactionId = json.data?.id ?? "";
  if (!checkoutUrl) throw new PaddleApiError("Paddle did not return a checkout URL", 502, json);
  return { checkoutUrl, transactionId };
}

export async function createPaddlePortalUrl(customerId: string): Promise<string> {
  const json = await paddleFetch<{ data?: { urls?: { general?: { overview?: string } } } }>(
    `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    { method: "POST", body: JSON.stringify({}) },
  );
  const url = json.data?.urls?.general?.overview ?? "";
  if (!url) throw new PaddleApiError("Paddle portal URL missing", 502, json);
  return url;
}

export async function listPaddleCustomerInvoices(customerId: string): Promise<
  Array<{ id: string; createdAt: string; currency: string; amount: string; status: string }>
> {
  const json = await paddleFetch<{ data?: unknown[] }>(
    `/transactions?customer_id=${encodeURIComponent(customerId)}&status=completed,billed,paid`,
  );
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .map((raw) => {
      const t = asRecord(raw);
      const details = asRecord(t.details);
      const totals = asRecord(details.totals);
      const id = typeof t.invoice_number === "string" && t.invoice_number ? t.invoice_number : String(t.id ?? "");
      const created = typeof t.billed_at === "string" ? t.billed_at : typeof t.created_at === "string" ? t.created_at : "";
      const currency = typeof totals.currency_code === "string" ? totals.currency_code : "USD";
      const minor = Number(totals.grand_total ?? totals.total ?? 0);
      const amount = Number.isFinite(minor) ? (minor / 100).toFixed(2) : "0.00";
      const status = typeof t.status === "string" ? t.status : "completed";
      if (!id || !created) return null;
      return { id, createdAt: new Date(created).toISOString(), currency, amount, status };
    })
    .filter((x): x is { id: string; createdAt: string; currency: string; amount: string; status: string } => Boolean(x));
}

export async function fetchPaddleTransaction(transactionId: string): Promise<unknown> {
  const json = await paddleFetch<{ data?: unknown }>(`/transactions/${encodeURIComponent(transactionId)}`);
  return json.data ?? json;
}

export async function fetchPaddleSubscription(subscriptionId: string): Promise<unknown> {
  const json = await paddleFetch<{ data?: unknown }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return json.data ?? json;
}
