import { getUncachableStripeClient } from "./stripeClient.js";

/**
 * Seed InterpreterAI subscription plans in Stripe.
 *
 * Idempotent — checks if each product exists before creating it.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */
async function createProducts() {
  const stripe = await getUncachableStripeClient();
  console.log("Checking for existing products…");

  // ── Basic Plan ($19/mo, $180/yr) — 500 min/day ───────────────────────────
  const existingBasic = await stripe.products.search({
    query: "name:'InterpreterAI Basic' AND active:'true'",
  });

  if (existingBasic.data.length > 0) {
    console.log("Basic plan already exists:", existingBasic.data[0].id);
  } else {
    const basic = await stripe.products.create({
      name: "InterpreterAI Basic",
      description: "500 min/day transcription & translation. Perfect for part-time interpreters.",
      metadata: { planType: "basic", dailyLimitMinutes: "500" },
    });
    console.log("Created Basic product:", basic.id);

    const basicMonthly = await stripe.prices.create({
      product: basic.id,
      unit_amount: 1900,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { label: "Basic Monthly" },
    });
    console.log("  Basic monthly:", basicMonthly.id, "($19/mo)");

    const basicYearly = await stripe.prices.create({
      product: basic.id,
      unit_amount: 18000,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { label: "Basic Yearly" },
    });
    console.log("  Basic yearly:", basicYearly.id, "($180/yr — save 21%)");
  }

  // ── Professional Plan ($49/mo, $470/yr) — 1,500 min/day ─────────────────
  const existingPro = await stripe.products.search({
    query: "name:'InterpreterAI Professional' AND active:'true'",
  });

  if (existingPro.data.length > 0) {
    console.log("Professional plan already exists:", existingPro.data[0].id);
  } else {
    const pro = await stripe.products.create({
      name: "InterpreterAI Professional",
      description: "1,500 min/day transcription & translation. Built for full-time interpreters.",
      metadata: { planType: "professional", dailyLimitMinutes: "1500" },
    });
    console.log("Created Professional product:", pro.id);

    const proMonthly = await stripe.prices.create({
      product: pro.id,
      unit_amount: 4900,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { label: "Professional Monthly" },
    });
    console.log("  Pro monthly:", proMonthly.id, "($49/mo)");

    const proYearly = await stripe.prices.create({
      product: pro.id,
      unit_amount: 47000,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { label: "Professional Yearly" },
    });
    console.log("  Pro yearly:", proYearly.id, "($470/yr — save 20%)");
  }

  // ── Unlimited Plan ($99/mo, $950/yr) — unlimited ─────────────────────────
  const existingUnlimited = await stripe.products.search({
    query: "name:'InterpreterAI Unlimited' AND active:'true'",
  });

  if (existingUnlimited.data.length > 0) {
    console.log("Unlimited plan already exists:", existingUnlimited.data[0].id);
  } else {
    const unlimited = await stripe.products.create({
      name: "InterpreterAI Unlimited",
      description: "No daily limits. For interpretation agencies and heavy users.",
      metadata: { planType: "unlimited", dailyLimitMinutes: "99999" },
    });
    console.log("Created Unlimited product:", unlimited.id);

    const unlimitedMonthly = await stripe.prices.create({
      product: unlimited.id,
      unit_amount: 9900,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { label: "Unlimited Monthly" },
    });
    console.log("  Unlimited monthly:", unlimitedMonthly.id, "($99/mo)");

    const unlimitedYearly = await stripe.prices.create({
      product: unlimited.id,
      unit_amount: 95000,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { label: "Unlimited Yearly" },
    });
    console.log("  Unlimited yearly:", unlimitedYearly.id, "($950/yr — save 20%)");
  }

  console.log("\nDone! Webhooks will sync products to your database automatically.");
  console.log("Run the API server and then check /api/stripe/products-with-prices");
}

createProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
