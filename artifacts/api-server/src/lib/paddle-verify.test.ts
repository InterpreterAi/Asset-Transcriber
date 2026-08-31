import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "node:crypto";
import {
  dbPlanTypeFromPayPalBilling,
  paypalPlanConfig,
  PUBLIC_BASIC_DAILY_LIMIT_MINUTES,
  PUBLIC_PROFESSIONAL_DAILY_LIMIT_MINUTES,
} from "./paypal.js";
import { TRIAL_DAILY_LIMIT_MINUTES } from "./trial-constants.js";
import {
  billingPlanFromAllowlistedPriceIds,
  extractPaddlePriceId,
  inferPaddleEnvironment,
  ipMatchesCidrList,
  isCompletedPaddleTransactionStatus,
  paddleApiKeyKind,
  paddleApiKeyLooksLikeClientToken,
  paddleCanceledAccessStillActive,
  paddleTransactionBelongsToUser,
  verifyPaddleSignature,
} from "./paddle-verify.js";

const allowlist = { basic: "pri_basic_public", professional: "pri_pro_public" };

describe("Paddle environment inference", () => {
  it("uses live credential prefixes even when PADDLE_ENV=sandbox", () => {
    assert.equal(
      inferPaddleEnvironment({
        env: "sandbox",
        apiKey: "pdl_live_example",
        clientToken: "live_example",
      }),
      "live",
    );
  });

  it("uses test_ client tokens as sandbox even if PADDLE_ENV=live", () => {
    assert.equal(
      inferPaddleEnvironment({
        env: "live",
        apiKey: "pdl_sdbx_example",
        clientToken: "test_example",
      }),
      "sandbox",
    );
  });

  it("detects a client-side token mistakenly used as the API key", () => {
    assert.equal(paddleApiKeyLooksLikeClientToken("live_abc"), true);
    assert.equal(paddleApiKeyLooksLikeClientToken("pdl_live_abc"), false);
    assert.equal(paddleApiKeyKind("live_abc"), "client_token_live");
    assert.equal(paddleApiKeyKind("pdl_live_abc"), "pdl_live");
  });
});

describe("public PayPal/Paddle plan mapping", () => {
  it("maps $59 Basic to basic-hetzner (Soniox default, not leftover basic-libre)", () => {
    assert.equal(dbPlanTypeFromPayPalBilling("basic"), "basic-hetzner");
  });

  it("maps $99 Professional to professional-libre (same as PayPal activation)", () => {
    assert.equal(dbPlanTypeFromPayPalBilling("professional"), "professional-libre");
  });
});

describe("Paddle price-ID allowlist", () => {
  it("maps only configured public price IDs", () => {
    assert.equal(billingPlanFromAllowlistedPriceIds("pri_basic_public", allowlist), "basic");
    assert.equal(billingPlanFromAllowlistedPriceIds("pri_pro_public", allowlist), "professional");
  });

  it("rejects unknown or client-supplied IDs", () => {
    assert.equal(billingPlanFromAllowlistedPriceIds("pri_attacker", allowlist), null);
    assert.equal(billingPlanFromAllowlistedPriceIds("", allowlist), null);
  });

  it("does not trust custom_data.plan_type — only items[].price.id", () => {
    const txn = {
      custom_data: { plan_type: "professional", user_id: "1" },
      items: [{ price: { id: "pri_basic_public" } }],
    };
    const priceId = extractPaddlePriceId(txn);
    assert.equal(priceId, "pri_basic_public");
    assert.equal(billingPlanFromAllowlistedPriceIds(priceId, allowlist), "basic");
  });
});

describe("return-sync transaction gates", () => {
  it("accepts only completed/paid/billed statuses", () => {
    assert.equal(isCompletedPaddleTransactionStatus("completed"), true);
    assert.equal(isCompletedPaddleTransactionStatus("paid"), true);
    assert.equal(isCompletedPaddleTransactionStatus("billed"), true);
    assert.equal(isCompletedPaddleTransactionStatus("ready"), false);
    assert.equal(isCompletedPaddleTransactionStatus("draft"), false);
    assert.equal(isCompletedPaddleTransactionStatus(""), false);
  });

  it("requires custom_data.user_id to match the authenticated user", () => {
    const txn = { custom_data: { user_id: "42" }, customer_id: "ctm_other" };
    assert.equal(paddleTransactionBelongsToUser(txn, { id: 42 }), true);
    assert.equal(paddleTransactionBelongsToUser(txn, { id: 99 }), false);
  });

  it("allows a linked paddle customer when custom_data.user_id is absent", () => {
    const txn = { customer_id: "ctm_mine" };
    assert.equal(paddleTransactionBelongsToUser(txn, { id: 7, paddleCustomerId: "ctm_mine" }), true);
    assert.equal(paddleTransactionBelongsToUser(txn, { id: 7, paddleCustomerId: "ctm_else" }), false);
    assert.equal(paddleTransactionBelongsToUser(txn, { id: 7 }), false);
  });
});

describe("public daily entitlements", () => {
  it("Basic stays 300 minutes; trial stays 120; public Professional is the 9000 unlimited cap", () => {
    assert.equal(PUBLIC_BASIC_DAILY_LIMIT_MINUTES, 300);
    assert.equal(paypalPlanConfig("basic").dailyLimitMinutes, 300);
    assert.equal(TRIAL_DAILY_LIMIT_MINUTES, 120);
    assert.equal(PUBLIC_PROFESSIONAL_DAILY_LIMIT_MINUTES, 9000);
    assert.equal(PUBLIC_PROFESSIONAL_DAILY_LIMIT_MINUTES, 9000);
    assert.equal(paypalPlanConfig("professional").dailyLimitMinutes, 9000);
  });

  it("does not change Platinum leftover 720-minute cap", () => {
    assert.equal(paypalPlanConfig("platinum").dailyLimitMinutes, 720);
  });

  it("treats 9000 as unlimited at the same gate used by STT/translate", () => {
    const cap = paypalPlanConfig("professional").dailyLimitMinutes;
    assert.equal(cap >= 9000, true);
    assert.equal(paypalPlanConfig("basic").dailyLimitMinutes >= 9000, false);
    assert.equal(TRIAL_DAILY_LIMIT_MINUTES >= 9000, false);
  });
});

describe("Paddle webhook CIDR + signature", () => {
  it("matches non-/32 IPv4 CIDRs and IPv6-mapped IPv4", () => {
    assert.equal(ipMatchesCidrList("10.20.30.40", ["10.20.30.0/24"]), true);
    assert.equal(ipMatchesCidrList("10.20.31.40", ["10.20.30.0/24"]), false);
    assert.equal(ipMatchesCidrList("::ffff:10.20.30.40", ["10.20.30.0/24"]), true);
    assert.equal(ipMatchesCidrList("203.0.113.9", ["203.0.113.9/32"]), true);
    assert.equal(ipMatchesCidrList("203.0.113.10", ["203.0.113.9/32"]), false);
  });

  it("rejects a bad or stale HMAC signature", () => {
    const secret = "endpoint_secret_key";
    const raw = '{"event_type":"transaction.completed"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const good = createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
    assert.equal(verifyPaddleSignature(raw, `ts=${ts};h1=${good}`, secret), true);
    assert.equal(verifyPaddleSignature(raw, `ts=${ts};h1=${"0".repeat(64)}`, secret), false);
    assert.equal(verifyPaddleSignature(raw, `ts=${ts};h1=${good}`, "wrong"), false);
    const staleTs = String(Math.floor(Date.now() / 1000) - 400);
    const stale = createHmac("sha256", secret).update(`${staleTs}:${raw}`).digest("hex");
    assert.equal(verifyPaddleSignature(raw, `ts=${staleTs};h1=${stale}`, secret), false);
  });
});

describe("cancellation keeps access until period end", () => {
  const now = new Date("2026-08-31T12:00:00.000Z");
  it("keeps paid access while the period end is in the future", () => {
    assert.equal(
      paddleCanceledAccessStillActive({
        subscriptionStatus: "canceled",
        subscriptionPeriodEndsAt: new Date("2026-09-15T12:00:00.000Z"),
        now,
      }),
      true,
    );
  });

  it("ends access when the period is over or missing", () => {
    assert.equal(
      paddleCanceledAccessStillActive({
        subscriptionStatus: "canceled",
        subscriptionPeriodEndsAt: new Date("2026-08-01T12:00:00.000Z"),
        now,
      }),
      false,
    );
    assert.equal(
      paddleCanceledAccessStillActive({
        subscriptionStatus: "canceled",
        subscriptionPeriodEndsAt: null,
        now,
      }),
      false,
    );
  });
});
