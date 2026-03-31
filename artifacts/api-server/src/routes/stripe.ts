import { Router, type IRouter } from "express";
import { storage } from "../lib/storage.js";
import { stripeService } from "../lib/stripeService.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Products ─────────────────────────────────────────────────────────────────

router.get("/products-with-prices", async (_req, res) => {
  try {
    const rows = await storage.listProductsWithPrices();

    const productsMap = new Map<string, any>();
    for (const row of rows) {
      const key = row.product_id as string;
      if (!productsMap.has(key)) {
        productsMap.set(key, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          active: row.product_active,
          metadata: row.product_metadata,
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(key)!.prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          active: row.price_active,
        });
      }
    }

    res.json({ data: Array.from(productsMap.values()) });
  } catch (err: any) {
    res.status(503).json({ error: "Stripe products not available", detail: err.message });
  }
});

router.get("/products", async (_req, res) => {
  try {
    const products = await storage.listProducts();
    res.json({ data: products });
  } catch (err: any) {
    res.status(503).json({ error: "Stripe products not available", detail: err.message });
  }
});

router.get("/products/:productId/prices", async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const prices = await storage.getPricesForProduct(productId);
    res.json({ data: prices });
  } catch (err: any) {
    res.status(503).json({ error: "Stripe not available", detail: err.message });
  }
});

// ── Subscription ─────────────────────────────────────────────────────────────

router.get("/subscription", requireAuth, async (req: any, res) => {
  try {
    const user = await storage.getUserById(req.session.userId);
    if (!user?.stripeSubscriptionId) {
      return res.json({ subscription: null });
    }
    const subscription = await storage.getSubscription(user.stripeSubscriptionId);
    res.json({ subscription });
  } catch (err: any) {
    res.status(503).json({ error: "Stripe not available", detail: err.message });
  }
});

// ── Checkout ─────────────────────────────────────────────────────────────────

router.post("/checkout", requireAuth, async (req: any, res) => {
  try {
    const { priceId } = req.body as { priceId: string };
    if (!priceId) return res.status(400).json({ error: "priceId is required" });

    const user = await storage.getUserById(req.session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(
        user.email ?? user.username,
        user.id
      );
      await storage.updateUserStripeInfo(user.id, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const host = req.get("host") ?? "";
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    const base = `${proto}://${host}`;

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${base}/workspace?checkout=success`,
      `${base}/workspace?checkout=cancel`
    );

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: "Checkout failed", detail: err.message });
  }
});

// ── Customer Portal ───────────────────────────────────────────────────────────

router.post("/portal", requireAuth, async (req: any, res) => {
  try {
    const user = await storage.getUserById(req.session.userId);
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const host = req.get("host") ?? "";
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    const session = await stripeService.createCustomerPortalSession(
      user.stripeCustomerId,
      `${proto}://${host}/workspace`
    );

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: "Portal failed", detail: err.message });
  }
});

export default router;
