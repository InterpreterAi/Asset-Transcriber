import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { resolvedDatabaseUrl } from "@workspace/db";

// ── Credential fetching ──────────────────────────────────────────────────────
// After the Stripe Replit integration is connected, credentials are accessible
// via the STRIPE_SECRET_KEY environment variable.

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. " +
      "Connect your Stripe account via the Replit Stripe integration."
    );
  }
  return key;
}

// ── Stripe client ────────────────────────────────────────────────────────────
// Returns a fresh Stripe client each call (uncachable) to always use
// the current credentials (important when credentials rotate).
export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = getStripeSecretKey();
  return new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia",
  });
}

// ── StripeSync singleton ──────────────────────────────────────────────────────
let _stripeSync: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (_stripeSync) return _stripeSync;

  const secretKey = getStripeSecretKey();

  _stripeSync = new StripeSync({
    stripeSecretKey: secretKey,
    poolConfig: { connectionString: resolvedDatabaseUrl },
  });

  return _stripeSync;
}
