import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import {
  activatePaddlePaidUser,
  applyPaddleCancellation,
  assertPaddleWebhookIp,
  billingPlanFromPaddlePriceId,
  extractPaddleCustomUserId,
  extractPaddlePeriod,
  extractPaddlePriceId,
  fetchPaddleSubscription,
  markPaddleCanceledKeepAccess,
  paddleWebhookSecret,
  verifyPaddleSignature,
} from "./paddle.js";
import type { BillingPlanType } from "./paypal.js";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function isBillingPlan(v: unknown): v is BillingPlanType {
  return v === "basic" || v === "professional" || v === "platinum";
}

async function resolveUserId(data: unknown, customerId: string, subscriptionId: string): Promise<number> {
  const fromCustom = extractPaddleCustomUserId(data);
  if (Number.isFinite(fromCustom)) return fromCustom;
  if (subscriptionId) {
    const [bySub] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.paddleSubscriptionId, subscriptionId))
      .limit(1);
    if (bySub) return bySub.id;
  }
  if (customerId) {
    const [byCust] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.paddleCustomerId, customerId))
      .limit(1);
    if (byCust) return byCust.id;
  }
  return NaN;
}

async function resolveBillingPlan(data: unknown): Promise<BillingPlanType | null> {
  const fromPrice = billingPlanFromPaddlePriceId(extractPaddlePriceId(data));
  if (fromPrice) return fromPrice;
  const rec = asRecord(data);
  const subId = typeof rec.subscription_id === "string" ? rec.subscription_id : "";
  if (!subId) return null;
  try {
    const sub = await fetchPaddleSubscription(subId);
    return billingPlanFromPaddlePriceId(extractPaddlePriceId(sub));
  } catch (err) {
    logger.warn({ err, subId }, "Paddle webhook: subscription fetch for plan mapping failed");
    return null;
  }
}

export async function processPaddleWebhook(opts: {
  rawBody: Buffer;
  signature: string;
  sourceIp: string;
}): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const secret = paddleWebhookSecret();
  if (!secret) {
    logger.error("PADDLE_WEBHOOK_SECRET missing");
    return { ok: false, status: 503, body: { error: "Paddle webhook secret is not configured" } };
  }
  const raw = opts.rawBody.toString("utf8");
  if (!verifyPaddleSignature(raw, opts.signature, secret)) {
    logger.warn("Paddle webhook signature verification failed");
    return { ok: false, status: 400, body: { error: "Invalid Paddle webhook signature" } };
  }
  const ipOk = await assertPaddleWebhookIp(opts.sourceIp);
  if (!ipOk) {
    return { ok: false, status: 403, body: { error: "Forbidden" } };
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid JSON" } };
  }

  const eventType = String(event.event_type ?? "");
  const data = event.data;
  const rec = asRecord(data);
  const customerId = typeof rec.customer_id === "string" ? rec.customer_id : "";
  const subscriptionId =
    typeof rec.id === "string" && eventType.startsWith("subscription.")
      ? rec.id
      : typeof rec.subscription_id === "string"
        ? rec.subscription_id
        : "";

  const userId = await resolveUserId(data, customerId, subscriptionId);
  if (!Number.isFinite(userId)) {
    logger.warn({ eventType, customerId, subscriptionId }, "Paddle webhook: could not resolve user");
    return { ok: true, status: 200, body: { received: true, unresolved: true } };
  }

  const [target] = await db
    .select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!target) return { ok: true, status: 200, body: { received: true } };
  if (target.isAdmin) {
    logger.info({ eventType, userId }, "Paddle webhook ignored for admin account");
    return { ok: true, status: 200, body: { received: true, ignored: true } };
  }

  if (
    eventType === "subscription.created" ||
    eventType === "subscription.activated" ||
    eventType === "subscription.updated" ||
    eventType === "subscription.imported"
  ) {
    const status = String(rec.status ?? "").toLowerCase();
    const scheduled = asRecord(rec.scheduled_change);
    const scheduledAction = String(scheduled.action ?? "").toLowerCase();
    if (scheduledAction === "cancel") {
      const effectiveRaw = typeof scheduled.effective_at === "string" ? scheduled.effective_at : "";
      const effectiveAt =
        effectiveRaw && Number.isFinite(new Date(effectiveRaw).getTime())
          ? new Date(effectiveRaw)
          : extractPaddlePeriod(data).periodEnd;
      await markPaddleCanceledKeepAccess(userId, effectiveAt);
      return { ok: true, status: 200, body: { received: true, cancelScheduled: true } };
    }
    if (status === "canceled" || status === "cancelled") {
      await applyPaddleCancellation(userId, data);
      return { ok: true, status: 200, body: { received: true } };
    }
    if (status === "paused" || status === "past_due") {
      return { ok: true, status: 200, body: { received: true } };
    }
    const billingPlan = await resolveBillingPlan(data);
    if (!isBillingPlan(billingPlan)) {
      logger.warn({ eventType, userId, priceId: extractPaddlePriceId(data) }, "Paddle webhook: plan unresolved");
      return { ok: true, status: 200, body: { received: true, planUnresolved: true } };
    }
    const { startAt, periodEnd } = extractPaddlePeriod(data);
    await activatePaddlePaidUser({
      userId,
      billingPlan,
      customerId,
      subscriptionId,
      startAt,
      periodEnd,
      sendConfirmation: eventType === "subscription.activated" || eventType === "subscription.created",
    });
  }

  if (eventType === "transaction.completed" || eventType === "transaction.paid") {
    const origin = String(rec.origin ?? "");
    const billingPlan = await resolveBillingPlan(data);
    const txnId = typeof rec.id === "string" ? rec.id : "";
    let period = extractPaddlePeriod(data);
    if (subscriptionId) {
      try {
        const sub = await fetchPaddleSubscription(subscriptionId);
        period = extractPaddlePeriod(sub);
      } catch {
        /* keep transaction dates */
      }
    }
    if (isBillingPlan(billingPlan)) {
      const isRenewal = /subscription_recurring|recurring/i.test(origin);
      await activatePaddlePaidUser({
        userId,
        billingPlan,
        customerId,
        subscriptionId,
        startAt: period.startAt,
        periodEnd: period.periodEnd,
        sendConfirmation: !isRenewal,
        renewalMarker: txnId ? `paddle:${subscriptionId || "none"}:${txnId}` : null,
      });
    }
  }

  if (
    eventType === "subscription.canceled" ||
    eventType === "subscription.past_due"
  ) {
    if (eventType === "subscription.canceled") await applyPaddleCancellation(userId, data);
    else {
      await db
        .update(usersTable)
        .set({ subscriptionStatus: "past_due" })
        .where(eq(usersTable.id, userId));
    }
  }

  return { ok: true, status: 200, body: { received: true } };
}