import Stripe from "stripe";

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Connect your Stripe account via the Replit Stripe integration."
    );
  }
  return key;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = getStripeSecretKey();
  return new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });
}
