import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  createPayPalSubscription,
  inferPlanTypeFromPayPalPlanId,
  paypalPlanConfig,
  type BillingPlanType,
  verifyPayPalWebhookSignature,
} from "../lib/paypal.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function isBillingPlanType(v: unknown): v is BillingPlanType {
  return v === "basic" || v === "professional" || v === "unlimited";
}

router.post("/create-subscription", requireAuth, async (req: any, res) => {
  try {
    const { userId, planType } = req.body as { userId?: number; planType?: string };
    if (!userId || !isBillingPlanType(planType)) {
      res.status(400).json({ error: "userId and valid planType are required" });
      return;
    }
    if (Number(req.session.userId) !== Number(userId)) {
      res.status(403).json({ error: "Forbidden: user mismatch" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const plan = paypalPlanConfig(planType);
    if (!plan.paypalPlanId) {
      res.status(503).json({ error: `PayPal plan not configured for ${planType}` });
      return;
    }

    const approvalUrl = await createPayPalSubscription({
      planId: plan.paypalPlanId,
      userId,
      planType,
      email: user.email ?? null,
    });

    res.json({ approvalUrl });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/create-subscription failed");
    res.status(500).json({ error: "Failed to create PayPal subscription" });
  }
});

router.post("/paypal-webhook", async (req, res) => {
  try {
    const event = req.body as {
      event_type?: string;
      resource?: { id?: string; plan_id?: string; custom_id?: string };
    };
    const eventType = event.event_type ?? "";
    const resource = event.resource ?? {};

    const transmissionId = String(req.headers["paypal-transmission-id"] ?? "");
    const transmissionTime = String(req.headers["paypal-transmission-time"] ?? "");
    const certUrl = String(req.headers["paypal-cert-url"] ?? "");
    const authAlgo = String(req.headers["paypal-auth-algo"] ?? "");
    const transmissionSig = String(req.headers["paypal-transmission-sig"] ?? "");

    const valid = await verifyPayPalWebhookSignature({
      transmissionId,
      transmissionTime,
      certUrl,
      authAlgo,
      transmissionSig,
      webhookEvent: event,
    });
    if (!valid) {
      logger.warn({ eventType }, "PayPal webhook signature verification failed");
      res.status(400).json({ error: "Invalid PayPal webhook signature" });
      return;
    }

    const customId = resource.custom_id ?? "";
    const parsedUserId = Number(customId.split(":")[0] ?? "");
    const parsedPlanTypeFromCustom = customId.split(":")[1] ?? "";
    const parsedPlanType =
      isBillingPlanType(parsedPlanTypeFromCustom)
        ? parsedPlanTypeFromCustom
        : inferPlanTypeFromPayPalPlanId(resource.plan_id ?? "");

    let userId = Number.isFinite(parsedUserId) ? parsedUserId : NaN;
    if (!Number.isFinite(userId) && resource.id) {
      const [userByPaypalSub] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.paypalSubscriptionId, resource.id))
        .limit(1);
      userId = Number(userByPaypalSub?.id ?? NaN);
    }

    if (!Number.isFinite(userId)) {
      logger.warn({ eventType, customId, paypalSubscriptionId: resource.id }, "PayPal webhook: could not resolve user");
      res.json({ received: true });
      return;
    }

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
      if (!parsedPlanType || !isBillingPlanType(parsedPlanType)) {
        logger.warn({ eventType, userId, planId: resource.plan_id }, "PayPal webhook: unknown plan id/custom id");
        res.json({ received: true });
        return;
      }
      const plan = paypalPlanConfig(parsedPlanType);
      await db
        .update(usersTable)
        .set({
          planType: parsedPlanType,
          dailyLimitMinutes: plan.dailyLimitMinutes,
          paypalSubscriptionId: resource.id ?? null,
          subscriptionStatus: "active",
          subscriptionPlan: parsedPlanType,
          subscriptionStartedAt: new Date(),
          subscriptionCanceledEmailSentAt: null,
        })
        .where(eq(usersTable.id, userId));
      logger.info({ eventType, userId, planType: parsedPlanType }, "PayPal subscription activated");
    }

    if (
      eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ||
      eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
      eventType === "BILLING.SUBSCRIPTION.EXPIRED" ||
      eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED"
    ) {
      await db
        .update(usersTable)
        .set({
          planType: "trial",
          dailyLimitMinutes: 180,
          subscriptionStatus: "inactive",
        })
        .where(eq(usersTable.id, userId));
      logger.info({ eventType, userId }, "PayPal subscription deactivated; user downgraded");
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/paypal-webhook failed");
    res.status(400).json({ error: "Webhook processing failed" });
  }
});

export default router;
