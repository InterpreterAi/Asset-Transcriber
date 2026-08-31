import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  PaddleApiError,
  applyVerifiedPaddleTransaction,
  createPaddleCheckoutTransaction,
  createPaddlePortalUrl,
  fetchPaddleTransaction,
  paddleCheckoutEnabled,
  paddleJsPublicConfig,
  paddlePublicConfig,
} from "../lib/paddle.js";
import type { BillingPlanType } from "../lib/paypal.js";

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

function appOrigin(req: any): string {
  const fromEnv = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const host = req.get("host") ?? "";
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  return `${proto}://${host}`;
}

router.get("/paddle-js-config", async (_req, res) => {
  res.json(paddleJsPublicConfig());
});

router.get("/paddle-config", requireAuth, async (req: any, res) => {
  const userId = Number(req.session.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const pub = paddlePublicConfig();
  res.json({
    ...pub,
    customerId: user?.paddleCustomerId ?? null,
  });
});

router.post("/create-paddle-checkout", requireAuth, async (req: any, res) => {
  try {
    const userId = Number(req.session.userId);
    const { planType } = req.body as { planType?: string };
    if (!isBillingPlanType(planType) || planType === "platinum") {
      res.status(400).json({ error: "planType must be basic or professional" });
      return;
    }
    if (!paddleCheckoutEnabled()) {
      res.status(503).json({ error: "Paddle checkout is not configured", code: "paddle_not_configured" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.isAdmin) {
      res.json({ ok: true, ignored: true, planType: user.planType });
      return;
    }
    const successUrl = `${appOrigin(req)}/checkout?paddle_txn=_ptxn_`;
    const created = await createPaddleCheckoutTransaction({
      planType,
      userId,
      email: user.email ?? null,
      customerId: user.paddleCustomerId ?? null,
      successUrl,
    });
    res.json({ checkoutUrl: created.checkoutUrl, transactionId: created.transactionId, provider: "paddle" });
  } catch (err) {
    if (err instanceof PaddleApiError) {
      logger.error({ err, details: err.details }, "POST /api/payments/create-paddle-checkout Paddle API error");
      res.status(err.statusCode || 500).json({ error: err.message, code: "paddle_checkout_failed" });
      return;
    }
    logger.error({ err }, "POST /api/payments/create-paddle-checkout failed");
    res.status(500).json({ error: "Failed to start Paddle checkout" });
  }
});

router.post("/sync-paddle-checkout", requireAuth, async (req: any, res) => {
  try {
    const userId = Number(req.session.userId);
    const transactionId = String((req.body as { transactionId?: string }).transactionId ?? "").trim();
    if (!transactionId || transactionId === "_ptxn_") {
      res.status(400).json({ error: "transactionId is required" });
      return;
    }
    if (!paddleCheckoutEnabled()) {
      res.status(503).json({ ok: false, pending: true, reason: "paddle_not_configured" });
      return;
    }
    const txn = await fetchPaddleTransaction(transactionId);
    const result = await applyVerifiedPaddleTransaction({
      data: txn,
      userId,
      requireCompleted: true,
      requireOwnerUserId: userId,
      sendConfirmation: true,
      renewalMarker: null,
    });
    if (!result.ok) {
      res.status(202).json({
        ok: false,
        pending: true,
        reason: result.reason,
        message: "Payment processing. Your plan updates when Paddle confirms the transaction.",
      });
      return;
    }
    res.json({ ok: true, planType: result.planType, subscriptionPlan: result.subscriptionPlan, provider: "paddle" });
  } catch (err) {
    if (err instanceof PaddleApiError) {
      res.status(err.statusCode || 502).json({
        ok: false,
        pending: true,
        error: err.message,
        code: "paddle_sync_failed",
      });
      return;
    }
    logger.error({ err }, "POST /api/payments/sync-paddle-checkout failed");
    res.status(500).json({ ok: false, pending: true, error: "Failed to sync Paddle checkout" });
  }
});

router.post("/paddle-portal", requireAuth, async (req: any, res) => {
  try {
    const userId = Number(req.session.userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user?.paddleCustomerId) {
      res.status(400).json({ error: "No Paddle billing profile found" });
      return;
    }
    const url = await createPaddlePortalUrl(user.paddleCustomerId);
    res.json({ url, provider: "paddle" });
  } catch (err) {
    logger.error({ err }, "POST /api/payments/paddle-portal failed");
    res.status(500).json({ error: "Failed to open Paddle customer portal" });
  }
});

export default router;
