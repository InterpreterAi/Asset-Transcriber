import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  billingPlanTierDisplayName,
  billingProductKeyFromPlanType,
  createPayPalSubscription,
  extractPayPalSubscriptionId,
  extractPayPalCustomId,
  extractPayPalSubscriberEmail,
  extractPayPalSubscriptionNextBillingTime,
  extractPayPalSubscriptionPlanId,
  extractPayPalSubscriptionStartTime,
  fetchPayPalSubscription,
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
import { stripeService } from "../lib/stripeService.js";

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

function paypalManageBillingUrl(): string {
  const mode = (process.env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();
  return mode === "live"
    ? "https://www.paypal.com/myaccount/autopay/"
    : "https://www.sandbox.paypal.com/myaccount/autopay/";
}

/** Final Boss 3: PayPal billing tier → DB `plan_type` (Basic/Prof = Libre; Platinum = OpenAI). */
function dbPlanTypeFromPayPalBilling(plan: BillingPlanType): string {
  if (plan === "basic") return "basic-libre";
  if (plan === "professional") return "professional-libre";
  return "platinum";
}

/** PayPal `custom_id` historically used `unlimited`; map to platinum. Also accept `*-libre` / `*-openai` segment variants. */
function billingPlanFromCustomIdSegment(raw: string): BillingPlanType | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "unlimited") return "platinum";
  if (s === "basic" || s === "basic-libre" || s === "basic-openai" || s === "morsy-basic") return "basic";
  if (s === "professional" || s === "professional-libre" || s === "professional-openai") return "professional";
  if (s === "platinum" || s === "platinum-libre" || s === "platinum-openai") return "platinum";
  return isBillingPlanType(s) ? s : null;
}

/** First pass from webhook `resource`; if missing, GET subscription from PayPal (plan_id / custom_id often complete there). */
async function resolvePayPalBillingTierWithApiFallback(
  firstPass: BillingPlanType | null,
  paypalSubId: string,
): Promise<BillingPlanType | null> {
  if (firstPass) return firstPass;
  if (!paypalSubId) return null;
  try {
    const subJson = await fetchPayPalSubscription(paypalSubId);
    const segment = extractPayPalCustomId(subJson).split(":")[1] ?? "";
    const fromCustom = billingPlanFromCustomIdSegment(segment);
    const planId = extractPayPalSubscriptionPlanId(subJson);
    const fromPlanId = inferPlanTypeFromPayPalPlanId(planId);
    const resolved = fromCustom ?? fromPlanId;
    return resolved && isBillingPlanType(resolved) ? resolved : null;
  } catch (err) {
    logger.warn({ err, paypalSubId }, "PayPal: could not fetch subscription to infer billing tier");
    return null;
  }
}

async function sendPayPalSubscriptionConfirmationIfNeeded(
  userId: number,
  confirmPlan: BillingPlanType | null,
): Promise<void> {
  if (!confirmPlan) return;
  try {
    const [activatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const em = activatedUser?.email?.trim().toLowerCase();
    if (em && !activatedUser.subscriptionConfirmationSentAt) {
      const ok = await sendSubscriptionConfirmationEmail(
        em,
        billingPlanTierDisplayName(confirmPlan),
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
    logger.error({ err: mailErr, userId }, "PayPal: subscription confirmation email failed");
  }
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
    if (user.isAdmin) {
      logger.info({ userId }, "PayPal sync ignored for admin account (manual plan lock)");
      res.json({ ok: true, planType: user.planType, subscriptionPlan: user.subscriptionPlan ?? null, ignored: true });
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

/**
 * Called when the user returns from PayPal with `?subscription_id=I-...` so plan + email apply even if the webhook
 * was delayed, failed, or could not infer tier from the webhook payload alone.
 */
router.post("/sync-paypal-subscription", requireAuth, async (req: any, res) => {
  try {
    const userId = Number(req.session.userId);
    const { subscriptionId: rawSubId } = req.body as { subscriptionId?: string };
    const subscriptionId = rawSubId?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "subscriptionId is required" });
      return;
    }

    let subJson: unknown;
    try {
      subJson = await fetchPayPalSubscription(subscriptionId);
    } catch (err) {
      if (err instanceof PayPalApiError) {
        res.status(err.statusCode || 502).json({ error: err.message, code: "paypal_fetch_subscription_failed" });
        return;
      }
      throw err;
    }

    const customId = extractPayPalCustomId(subJson);
    const parsedUid = Number(customId.split(":")[0] ?? "");
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const userEmail = (user.email ?? "").trim().toLowerCase();

    if (Number.isFinite(parsedUid) && parsedUid !== userId) {
      res.status(403).json({ error: "This subscription is linked to a different account" });
      return;
    }
    if (!Number.isFinite(parsedUid)) {
      const subEmail = extractPayPalSubscriberEmail(subJson);
      if (!subEmail || subEmail !== userEmail) {
        res.status(403).json({ error: "Could not verify this subscription for your account" });
        return;
      }
    }

    const segment = customId.split(":")[1] ?? "";
    const effectivePlan =
      billingPlanFromCustomIdSegment(segment) ??
      inferPlanTypeFromPayPalPlanId(extractPayPalSubscriptionPlanId(subJson));

    if (!effectivePlan || !isBillingPlanType(effectivePlan)) {
      res.status(422).json({
        error: "Could not determine plan from PayPal subscription — contact support",
        code: "paypal_plan_unresolved",
      });
      return;
    }

    const startAt = extractPayPalSubscriptionStartTime(subJson) ?? new Date();
    const periodEnd =
      extractPayPalSubscriptionNextBillingTime(subJson) ?? subscriptionPeriodEndFallback(startAt);

    const plan = paypalPlanConfig(effectivePlan);
    const resolvedPlanType = dbPlanTypeFromPayPalBilling(effectivePlan);

    await db
      .update(usersTable)
      .set({
        paypalSubscriptionId: subscriptionId,
        subscriptionStatus: "active",
        subscriptionStartedAt: startAt,
        subscriptionPeriodEndsAt: periodEnd,
        subscriptionCanceledEmailSentAt: null,
        planType: resolvedPlanType,
        dailyLimitMinutes: plan.dailyLimitMinutes,
        subscriptionPlan: effectivePlan,
      })
      .where(eq(usersTable.id, userId));

    logger.info(
      { userId, planType: resolvedPlanType, subscriptionPlan: effectivePlan, route: "sync-paypal-subscription" },
      "PayPal subscription synced after checkout return",
    );

    await sendPayPalSubscriptionConfirmationIfNeeded(userId, effectivePlan);

    res.json({ ok: true, planType: resolvedPlanType, subscriptionPlan: effectivePlan });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/sync-paypal-subscription failed");
    res.status(500).json({ error: "Failed to sync subscription", code: "paypal_sync_failed" });
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

    const paypalSubId = extractPayPalSubscriptionId(resource);
    const customId = extractPayPalCustomId(resource);
    const planIdStr = extractPayPalSubscriptionPlanId(resource);
    const parsedUserId = Number(customId.split(":")[0] ?? "");
    const parsedPlanTypeFromCustom = customId.split(":")[1] ?? "";
    const parsedPlanType =
      billingPlanFromCustomIdSegment(parsedPlanTypeFromCustom) ?? inferPlanTypeFromPayPalPlanId(planIdStr);

    let userId = Number.isFinite(parsedUserId) ? parsedUserId : NaN;
    if (!Number.isFinite(userId) && paypalSubId) {
      const [userByPaypalSub] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.paypalSubscriptionId, paypalSubId))
        .limit(1);
      userId = Number(userByPaypalSub?.id ?? NaN);
    }
    const subscriberEmail = extractPayPalSubscriberEmail(resource);
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

    const [targetUser] = await db
      .select({ id: usersTable.id, isAdmin: usersTable.isAdmin, planType: usersTable.planType })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!targetUser) {
      logger.warn({ eventType, userId }, "PayPal webhook resolved unknown user");
      res.json({ received: true });
      return;
    }
    if (targetUser.isAdmin) {
      logger.info(
        { eventType, userId, currentPlanType: targetUser.planType },
        "PayPal webhook ignored for admin account (manual plan lock)",
      );
      res.json({ received: true, ignored: true });
      return;
    }

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
      const startAt = extractPayPalSubscriptionStartTime(resource) ?? new Date();
      const periodEnd =
        extractPayPalSubscriptionNextBillingTime(resource) ?? subscriptionPeriodEndFallback(startAt);

      const sharedSubscription = {
        paypalSubscriptionId: paypalSubId || null,
        subscriptionStatus: "active",
        subscriptionStartedAt: startAt,
        subscriptionPeriodEndsAt: periodEnd,
        subscriptionCanceledEmailSentAt: null as null,
      };

      const effectivePlanType = await resolvePayPalBillingTierWithApiFallback(
        parsedPlanType && isBillingPlanType(parsedPlanType) ? parsedPlanType : null,
        paypalSubId,
      );

      if (effectivePlanType && isBillingPlanType(effectivePlanType)) {
        const plan = paypalPlanConfig(effectivePlanType);
        const resolvedPlanType = dbPlanTypeFromPayPalBilling(effectivePlanType);
        await db
          .update(usersTable)
          .set({
            ...sharedSubscription,
            planType: resolvedPlanType,
            dailyLimitMinutes: plan.dailyLimitMinutes,
            subscriptionPlan: effectivePlanType,
          })
          .where(eq(usersTable.id, userId));
        logger.info(
          { eventType, userId, planType: resolvedPlanType, subscriptionPlan: effectivePlanType },
          "PayPal subscription activated",
        );
      } else {
        await db
          .update(usersTable)
          .set(sharedSubscription)
          .where(eq(usersTable.id, userId));
        logger.warn(
          { eventType, userId, planIdStr, customId, paypalSubscriptionId: paypalSubId },
          "PayPal subscription activated but plan could not be resolved — subscription dates and PayPal ID stored; check PAYPAL_PLAN_ID_* env or assign plan in admin",
        );
      }

      await sendPayPalSubscriptionConfirmationIfNeeded(
        userId,
        effectivePlanType && isBillingPlanType(effectivePlanType) ? effectivePlanType : null,
      );
    }

    if (eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      const next = extractPayPalSubscriptionNextBillingTime(resource);
      const startAt = extractPayPalSubscriptionStartTime(resource);
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
          planType: "trial-libre",
          dailyLimitMinutes: TRIAL_DAILY_LIMIT_MINUTES,
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
/** Canonical assignable tiers: OpenAI + Hetzner + mixed trial control. */
const ADMIN_TEST_PLAN_TYPES = [
  "trial",
  "trial-openai",
  "trial-hetzner",
  "trial-libre",
  "basic",
  "basic-libre",
  "professional",
  "professional-libre",
  "platinum",
  "platinum-libre",
] as const;

type AdminTestPlanType = (typeof ADMIN_TEST_PLAN_TYPES)[number];

function normalizeAdminTestPlanType(raw: unknown): AdminTestPlanType | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim().toLowerCase();
  return (ADMIN_TEST_PLAN_TYPES as readonly string[]).includes(p) ? (p as AdminTestPlanType) : null;
}

/** Daily cap for test switches: PayPal tiers for paid basics; high cap for unlimited-style tiers (matches workspace “Unlimited” UI threshold). */
function dailyLimitMinutesForAdminTestPlan(planType: AdminTestPlanType): number {
  if (
    planType === "trial" ||
    planType === "trial-openai" ||
    planType === "trial-libre" ||
    planType === "trial-hetzner"
  ) {
    return TRIAL_DAILY_LIMIT_MINUTES;
  }
  if (planType === "basic" || planType === "basic-libre") {
    return paypalPlanConfig("basic").dailyLimitMinutes;
  }
  if (planType === "professional" || planType === "professional-libre") {
    return paypalPlanConfig("professional").dailyLimitMinutes;
  }
  if (planType === "platinum" || planType === "platinum-libre") {
    return paypalPlanConfig("platinum").dailyLimitMinutes;
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

router.post("/manage-billing", requireAuth, async (req: any, res) => {
  try {
    const userId = Number(req.session.userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Final Boss 3 billing is primarily PayPal; route users there when they have PayPal subscription state.
    if (user.paypalSubscriptionId || user.subscriptionPlan) {
      res.json({ url: paypalManageBillingUrl(), provider: "paypal" as const });
      return;
    }

    // Legacy Stripe users keep full customer-portal support.
    if (user.stripeCustomerId) {
      const host = req.get("host") ?? "";
      const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        `${proto}://${host}/workspace`,
      );
      res.json({ url: session.url, provider: "stripe" as const });
      return;
    }

    res.status(400).json({ error: "No active billing profile found" });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/manage-billing failed");
    res.status(500).json({ error: "Failed to open billing management" });
  }
});

export default router;
