import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  billingProductKeyFromPlanType,
  createPayPalSubscription,
  inferPlanTypeFromPayPalPlanId,
  paypalPlanEnvDiagnostics,
  paypalPlanConfig,
  PayPalApiError,
  subscriptionPeriodEndFallback,
  type BillingPlanType,
  verifyPayPalWebhookSignature,
} from "../lib/paypal.js";
import { computeTrialEndsAt, TRIAL_DAILY_LIMIT_MINUTES } from "../lib/trial-constants.js";
import { sendSubscriptionConfirmationEmail } from "../lib/transactional-email.js";
import { isTrialLikePlanType } from "../lib/usage.js";

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

function paypalResourceStartTime(resource: unknown): Date | null {
  if (!resource || typeof resource !== "object") return null;
  const o = resource as Record<string, unknown>;
  const st = o.start_time ?? o.startTime;
  if (typeof st !== "string") return null;
  const d = new Date(st);
  return Number.isFinite(d.getTime()) ? d : null;
}

function paypalResourceNextBillingTime(resource: unknown): Date | null {
  if (!resource || typeof resource !== "object") return null;
  const o = resource as Record<string, unknown>;
  const bi = o.billing_info ?? o.billingInfo;
  if (!bi || typeof bi !== "object") return null;
  const nbt =
    (bi as Record<string, unknown>).next_billing_time ??
    (bi as Record<string, unknown>).nextBillingTime;
  if (typeof nbt !== "string") return null;
  const d = new Date(nbt);
  return Number.isFinite(d.getTime()) ? d : null;
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
      const startAt = paypalResourceStartTime(resource) ?? new Date();
      const periodEnd =
        paypalResourceNextBillingTime(resource) ?? subscriptionPeriodEndFallback(startAt);

      const sharedSubscription = {
        paypalSubscriptionId: paypalSubId || null,
        subscriptionStatus: "active",
        subscriptionStartedAt: startAt,
        subscriptionPeriodEndsAt: periodEnd,
        subscriptionCanceledEmailSentAt: null as null,
      };

      if (parsedPlanType && isBillingPlanType(parsedPlanType)) {
        const plan = paypalPlanConfig(parsedPlanType);
        await db
          .update(usersTable)
          .set({
            ...sharedSubscription,
            planType: parsedPlanType,
            dailyLimitMinutes: plan.dailyLimitMinutes,
            subscriptionPlan: parsedPlanType,
          })
          .where(eq(usersTable.id, userId));
        logger.info({ eventType, userId, planType: parsedPlanType }, "PayPal subscription activated");
      } else {
        await db
          .update(usersTable)
          .set(sharedSubscription)
          .where(eq(usersTable.id, userId));
        logger.warn(
          { eventType, userId, planIdStr, customId, paypalSubscriptionId: paypalSubId },
          "PayPal subscription activated but plan_id did not match PAYPAL_PLAN_ID_* — subscription dates and PayPal ID stored; fix env or assign plan in admin",
        );
      }

      try {
        const [activatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const em = activatedUser?.email?.trim().toLowerCase();
        const confirmPlan = parsedPlanType && isBillingPlanType(parsedPlanType) ? parsedPlanType : null;
        if (em && !activatedUser.subscriptionConfirmationSentAt && confirmPlan) {
          const ok = await sendSubscriptionConfirmationEmail(
            em,
            billingPlanDisplayName(confirmPlan),
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

    if (eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      const next = paypalResourceNextBillingTime(resource);
      const startAt = paypalResourceStartTime(resource);
      if (next || startAt) {
        const patch: Partial<typeof usersTable.$inferSelect> = {};
        if (next) patch.subscriptionPeriodEndsAt = next;
        if (startAt) patch.subscriptionStartedAt = startAt;
        await db.update(usersTable).set(patch).where(eq(usersTable.id, userId));
        logger.info({ eventType, userId, next, startAt }, "PayPal subscription updated (billing dates)");
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
          subscriptionPeriodEndsAt: null,
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

/** Same `plan_type` values admins can assign in `/api/admin/users/:id` — keeps workspace “Plan testing” in sync with production. */
const ADMIN_TEST_PLAN_TYPES = [
  "trial",
  "trial-openai",
  "trial-libre",
  "basic",
  "basic-openai",
  "basic-libre",
  "professional",
  "professional-openai",
  "professional-libre",
  "platinum",
  "platinum-libre",
  "unlimited",
] as const;

type AdminTestPlanType = (typeof ADMIN_TEST_PLAN_TYPES)[number];

function normalizeAdminTestPlanType(raw: unknown): AdminTestPlanType | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().toLowerCase();
  return (ADMIN_TEST_PLAN_TYPES as readonly string[]).includes(p) ? (p as AdminTestPlanType) : null;
}

/** Daily cap for test switches: PayPal tiers for paid basics; high cap for unlimited-style tiers (matches workspace “Unlimited” UI threshold). */
function dailyLimitMinutesForAdminTestPlan(planType: AdminTestPlanType): number {
  if (planType === "trial" || planType === "trial-openai" || planType === "trial-libre") {
    return TRIAL_DAILY_LIMIT_MINUTES;
  }
  if (planType === "basic" || planType === "basic-openai" || planType === "basic-libre") {
    return paypalPlanConfig("basic").dailyLimitMinutes;
  }
  if (planType === "professional" || planType === "professional-openai" || planType === "professional-libre") {
    return paypalPlanConfig("professional").dailyLimitMinutes;
  }
  if (planType === "platinum" || planType === "platinum-libre") {
    return paypalPlanConfig("platinum").dailyLimitMinutes;
  }
  if (planType === "unlimited") {
    return 9999;
  }
  return TRIAL_DAILY_LIMIT_MINUTES;
}

router.post("/test-activate-plan", requireAuth, async (req: any, res) => {
  try {
    const { planType: rawPlan } = req.body as { planType?: string };
    const planType = normalizeAdminTestPlanType(rawPlan);
    if (!planType) {
      res.status(400).json({
        error: `planType must be one of: ${ADMIN_TEST_PLAN_TYPES.join(", ")}`,
      });
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

    const dailyLimitMinutes = dailyLimitMinutesForAdminTestPlan(planType);

    if (isTrialLikePlanType(planType)) {
      const now = new Date();
      const trialEndsAt = computeTrialEndsAt(now);
      await db
        .update(usersTable)
        .set({
          planType,
          trialStartedAt: now,
          trialEndsAt,
          dailyLimitMinutes,
          subscriptionStatus: "trial",
          subscriptionPlan: null,
          subscriptionStartedAt: null,
          subscriptionPeriodEndsAt: null,
          paypalSubscriptionId: null,
        })
        .where(eq(usersTable.id, userId));
      res.json({
        ok: true,
        planType,
        dailyLimitMinutes,
        trialEndsAt: trialEndsAt.toISOString(),
      });
      return;
    }

    const billingKey = billingProductKeyFromPlanType(planType);
    const now = new Date();
    await db
      .update(usersTable)
      .set({
        planType,
        dailyLimitMinutes,
        subscriptionStatus: "active",
        subscriptionPlan: billingKey ?? planType,
        subscriptionStartedAt: now,
        subscriptionPeriodEndsAt: subscriptionPeriodEndFallback(now),
      })
      .where(eq(usersTable.id, userId));
    res.json({ ok: true, planType, dailyLimitMinutes });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/test-activate-plan failed");
    res.status(500).json({ error: "Failed to activate plan" });
  }
});

export default router;
