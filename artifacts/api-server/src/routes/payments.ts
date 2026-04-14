import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  createPayPalSubscription,
  inferPlanTypeFromPayPalPlanId,
  paypalPlanEnvDiagnostics,
  paypalPlanConfig,
  PayPalApiError,
  type BillingPlanType,
  verifyPayPalWebhookSignature,
} from "../lib/paypal.js";
import { computeTrialEndsAt, TRIAL_DAILY_LIMIT_MINUTES } from "../lib/trial-constants.js";
import { sendSubscriptionConfirmationEmail } from "../lib/transactional-email.js";

/** PayPal notification `resource` shape varies; normalize fields used for routing. */
function paypalResourceCustomId(resource: unknown): string {
  if (!resource || typeof resource !== "object") return "";
  const o = resource as Record<string, unknown>;
  const c = o.custom_id ?? o.customId;
  return typeof c === "string" ? c.trim() : "";
}

function paypalResourcePlanId(resource: unknown): string {
  if (!resource || typeof resource !== "object") return "";
  const o = resource as Record<string, unknown>;
  const p = o.plan_id ?? o.planId;
  return typeof p === "string" ? p.trim() : "";
}

function paypalResourceSubscriptionId(resource: unknown): string {
  if (!resource || typeof resource !== "object") return "";
  const o = resource as Record<string, unknown>;
  const id = o.id;
  return typeof id === "string" ? id.trim() : "";
}

function paypalResourceSubscriberEmail(resource: unknown): string | undefined {
  if (!resource || typeof resource !== "object") return undefined;
  const sub = (resource as Record<string, unknown>).subscriber;
  if (!sub || typeof sub !== "object") return undefined;
  const email = (sub as Record<string, unknown>).email_address;
  if (typeof email !== "string" || !email.includes("@")) return undefined;
  return email.trim().toLowerCase();
}

function billingPlanDisplayName(plan: BillingPlanType): string {
  if (plan === "basic") return "Basic";
  if (plan === "professional") return "Professional";
  return "Platinum";
}

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function isBillingPlanType(v: unknown): v is BillingPlanType {
  return v === "basic" || v === "professional" || v === "platinum";
}

/** PayPal `custom_id` historically used `unlimited`; map to platinum. */
function billingPlanFromCustomIdSegment(raw: string): BillingPlanType | null {
  const s = raw.trim();
  if (s === "unlimited") return "platinum";
  return isBillingPlanType(s) ? s : null;
}

router.post("/create-subscription", requireAuth, async (req: any, res) => {
  try {
    console.log("create-subscription route hit", req.body);
    const { userId, planType } = req.body as { userId?: number; planType?: string };
    if (!userId || !isBillingPlanType(planType)) {
      res.status(400).json({ error: "userId and valid planType are required" });
      return;
    }
    if (Number(req.session.userId) !== Number(userId)) {
      res.status(403).json({ error: "Forbidden: user mismatch" });
      return;
    }

    logger.info(
      {
        route: "/api/payments/create-subscription",
        userId,
        planType,
      },
      "PayPal create-subscription request received",
    );
    console.log("create-subscription incoming planType", planType);

    const planEnvDiag = paypalPlanEnvDiagnostics();
    const missingPlanVars = Object.entries(planEnvDiag)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    if (missingPlanVars.length > 0) {
      console.error("create-subscription missing PayPal plan env vars", missingPlanVars);
      logger.error(
        { userId, planType, missingPlanVars, planEnvDiag },
        "PayPal plan env vars missing",
      );
      res.status(503).json({
        error: `PayPal plan IDs are missing: ${missingPlanVars.join(", ")}`,
        code: "paypal_plan_env_missing",
        missingPlanVars,
      });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const plan = paypalPlanConfig(planType);
    logger.info(
      {
        userId,
        incomingPlanType: planType,
        resolvedPlanId: plan.paypalPlanId,
      },
      "PayPal create-subscription resolved plan mapping",
    );
    console.log("create-subscription resolved PayPal planId", {
      incomingPlanType: planType,
      resolvedPlanId: plan.paypalPlanId,
    });
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
    console.error("create-subscription thrown error", err);
    if (err instanceof PayPalApiError) {
      logger.error(
        {
          err,
          statusCode: err.statusCode,
          details: err.details,
        },
        "POST /api/payments/create-subscription PayPal API error",
      );
      res.status(err.statusCode || 500).json({
        error: err.message,
        code: "paypal_create_subscription_failed",
        paypalDetails: err.details ?? null,
      });
      return;
    }
    logger.error({ err }, "POST /api/payments/create-subscription failed");
    res.status(500).json({ error: "Failed to create PayPal subscription", code: "paypal_unknown_error" });
  }
});

router.post("/paypal-webhook", async (req, res) => {
  try {
    const event = req.body as {
      event_type?: string;
      resource?: unknown;
    };
    const eventType = event.event_type ?? "";
    const resource = event.resource;

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

    const paypalSubId = paypalResourceSubscriptionId(resource);
    const customId = paypalResourceCustomId(resource);
    const planIdStr = paypalResourcePlanId(resource);
    const parsedUserId = Number(customId.split(":")[0] ?? "");
    const parsedPlanTypeFromCustom = customId.split(":")[1] ?? "";
    const parsedPlanType =
      billingPlanFromCustomIdSegment(parsedPlanTypeFromCustom) ??
      inferPlanTypeFromPayPalPlanId(planIdStr);

    let userId = Number.isFinite(parsedUserId) ? parsedUserId : NaN;
    if (!Number.isFinite(userId) && paypalSubId) {
      const [userByPaypalSub] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.paypalSubscriptionId, paypalSubId))
        .limit(1);
      userId = Number(userByPaypalSub?.id ?? NaN);
    }
    const subscriberEmail = paypalResourceSubscriberEmail(resource);
    if (!Number.isFinite(userId) && subscriberEmail) {
      const [userByEmail] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, subscriberEmail))
        .limit(1);
      userId = Number(userByEmail?.id ?? NaN);
      if (Number.isFinite(userId)) {
        logger.info(
          { eventType, userId, subscriberEmail },
          "PayPal webhook: resolved user by subscriber email (custom_id missing)",
        );
      }
    }

    if (!Number.isFinite(userId)) {
      logger.warn(
        { eventType, customId, planIdStr, paypalSubscriptionId: paypalSubId, hadSubscriberEmail: Boolean(subscriberEmail) },
        "PayPal webhook: could not resolve user — check PayPal dashboard webhook deliveries, PAYPAL_PLAN_ID_* env vs live plan IDs, and that checkout used in-app flow (custom_id userId:plan)",
      );
      res.json({ received: true });
      return;
    }

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
      if (!parsedPlanType || !isBillingPlanType(parsedPlanType)) {
        logger.warn(
          { eventType, userId, planIdStr, customId },
          "PayPal webhook: unknown plan — set PAYPAL_PLAN_ID_BASIC/PROFESSIONAL/PLATINUM to match the Plan ID in PayPal (live vs sandbox)",
        );
        res.json({ received: true });
        return;
      }
      const plan = paypalPlanConfig(parsedPlanType);
      await db
        .update(usersTable)
        .set({
          planType: parsedPlanType,
          dailyLimitMinutes: plan.dailyLimitMinutes,
          paypalSubscriptionId: paypalSubId || null,
          subscriptionStatus: "active",
          subscriptionPlan: parsedPlanType,
          subscriptionStartedAt: new Date(),
          subscriptionCanceledEmailSentAt: null,
        })
        .where(eq(usersTable.id, userId));
      logger.info({ eventType, userId, planType: parsedPlanType }, "PayPal subscription activated");

      try {
        const [activatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const em = activatedUser?.email?.trim().toLowerCase();
        if (em && !activatedUser.subscriptionConfirmationSentAt) {
          const ok = await sendSubscriptionConfirmationEmail(
            em,
            billingPlanDisplayName(parsedPlanType),
            "Your next billing date is available in your PayPal account",
            activatedUser.username,
            activatedUser.id,
          );
          if (ok) {
            await db
              .update(usersTable)
              .set({ subscriptionConfirmationSentAt: new Date() })
              .where(eq(usersTable.id, userId));
            logger.info({ userId }, "PayPal subscription confirmation email sent");
          } else {
            logger.warn({ userId }, "PayPal subscription activated but confirmation email not sent (RESEND_API_KEY?)");
          }
        }
      } catch (mailErr) {
        logger.error({ err: mailErr, userId }, "PayPal ACTIVATED: subscription confirmation email failed");
      }
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

const TEST_PLAN_ACTIVATION_EMAIL = "mmorsyy1@gmail.com";

function isDevPlanSwitchType(v: unknown): v is BillingPlanType | "trial" {
  return v === "basic" || v === "professional" || v === "platinum" || v === "trial";
}

router.post("/test-activate-plan", requireAuth, async (req: any, res) => {
  try {
    const { planType } = req.body as { planType?: string };
    if (!isDevPlanSwitchType(planType)) {
      res.status(400).json({ error: "planType must be trial, basic, professional, or platinum" });
      return;
    }
    const userId = Number(req.session.userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const email = (user.email ?? "").trim().toLowerCase();
    const allowed = Boolean(user.isAdmin) || email === TEST_PLAN_ACTIVATION_EMAIL;
    if (!allowed) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    if (planType === "trial") {
      const now = new Date();
      const trialEndsAt = computeTrialEndsAt(now);
      await db
        .update(usersTable)
        .set({
          planType: "trial",
          trialStartedAt: now,
          trialEndsAt,
          dailyLimitMinutes: TRIAL_DAILY_LIMIT_MINUTES,
          subscriptionStatus: "trial",
          subscriptionPlan: null,
          subscriptionStartedAt: null,
          paypalSubscriptionId: null,
        })
        .where(eq(usersTable.id, userId));
      res.json({
        ok: true,
        planType: "trial",
        dailyLimitMinutes: TRIAL_DAILY_LIMIT_MINUTES,
        trialEndsAt: trialEndsAt.toISOString(),
      });
      return;
    }

    const plan = paypalPlanConfig(planType);
    await db
      .update(usersTable)
      .set({
        planType,
        dailyLimitMinutes: plan.dailyLimitMinutes,
        subscriptionStatus: "active",
        subscriptionPlan: planType,
        subscriptionStartedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, planType, dailyLimitMinutes: plan.dailyLimitMinutes });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/test-activate-plan failed");
    res.status(500).json({ error: "Failed to activate plan" });
  }
});

export default router;
