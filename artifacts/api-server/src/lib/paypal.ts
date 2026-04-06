import { logger } from "./logger.js";

export type BillingPlanType = "basic" | "professional" | "unlimited";

export class PayPalApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "PayPalApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

type PlanConfig = {
  paypalPlanId: string;
  dailyLimitMinutes: number;
};

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
}

function paypalBaseUrl(): string {
  const mode = (envTrim("PAYPAL_ENV") ?? "sandbox").toLowerCase();
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalPlanConfig(planType: BillingPlanType): PlanConfig {
  const basicPlanId = envTrim("PAYPAL_PLAN_ID_BASIC");
  const professionalPlanId = envTrim("PAYPAL_PLAN_ID_PROFESSIONAL");
  const unlimitedPlanId = envTrim("PAYPAL_PLAN_ID_UNLIMITED");
  const table: Record<BillingPlanType, PlanConfig> = {
    basic: {
      paypalPlanId: basicPlanId ?? "",
      dailyLimitMinutes: 500,
    },
    professional: {
      paypalPlanId: professionalPlanId ?? "",
      dailyLimitMinutes: 1500,
    },
    unlimited: {
      paypalPlanId: unlimitedPlanId ?? "",
      dailyLimitMinutes: 99999,
    },
  };
  return table[planType];
}

export function paypalPlanEnvDiagnostics(): {
  PAYPAL_PLAN_ID_BASIC: boolean;
  PAYPAL_PLAN_ID_PROFESSIONAL: boolean;
  PAYPAL_PLAN_ID_UNLIMITED: boolean;
} {
  return {
    PAYPAL_PLAN_ID_BASIC: Boolean(envTrim("PAYPAL_PLAN_ID_BASIC")),
    PAYPAL_PLAN_ID_PROFESSIONAL: Boolean(envTrim("PAYPAL_PLAN_ID_PROFESSIONAL")),
    PAYPAL_PLAN_ID_UNLIMITED: Boolean(envTrim("PAYPAL_PLAN_ID_UNLIMITED")),
  };
}

function missingPayPalPlanEnvVars(): string[] {
  const diag = paypalPlanEnvDiagnostics();
  return Object.entries(diag)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
}

export function inferPlanTypeFromPayPalPlanId(planId: string): BillingPlanType | null {
  const normalized = planId.trim();
  if (!normalized) return null;
  if (normalized === envTrim("PAYPAL_PLAN_ID_BASIC")) return "basic";
  if (normalized === envTrim("PAYPAL_PLAN_ID_PROFESSIONAL")) return "professional";
  if (normalized === envTrim("PAYPAL_PLAN_ID_UNLIMITED")) return "unlimited";
  return null;
}

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = envTrim("PAYPAL_CLIENT_ID");
  // Accept both names to match existing Railway variable conventions.
  const secret = envTrim("PAYPAL_CLIENT_SECRET") ?? envTrim("PAYPAL_SECRET");
  if (!clientId || !secret) {
    throw new Error("PayPal not configured: missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET/PAYPAL_SECRET");
  }

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  logger.info(
    {
      paypalBaseUrl: paypalBaseUrl(),
      statusCode: res.status,
      hasAccessToken: Boolean(json.access_token),
      error: json.error,
      errorDescription: json.error_description,
    },
    "PayPal OAuth token response",
  );
  console.log("PayPal OAuth token response", {
    paypalBaseUrl: paypalBaseUrl(),
    statusCode: res.status,
    hasAccessToken: Boolean(json.access_token),
    error: json.error,
    errorDescription: json.error_description,
  });
  if (!res.ok || !json.access_token) {
    throw new PayPalApiError(
      json.error_description ?? json.error ?? "Failed to get PayPal access token",
      res.status || 500,
      json,
    );
  }
  return json.access_token;
}

export async function createPayPalSubscription(input: {
  planId: string;
  userId: number;
  planType: BillingPlanType;
  email?: string | null;
}): Promise<string> {
  const missingPlanEnv = missingPayPalPlanEnvVars();
  if (missingPlanEnv.length > 0) {
    throw new PayPalApiError(
      `Missing PayPal plan env vars: ${missingPlanEnv.join(", ")}`,
      503,
      { missingPlanEnv },
    );
  }

  const token = await getPayPalAccessToken();
  const body: Record<string, unknown> = {
    plan_id: input.planId,
    custom_id: `${input.userId}:${input.planType}`,
    application_context: {
      brand_name: "InterpreterAI",
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "NO_SHIPPING",
      payment_method: {
        payer_selected: "PAYPAL",
        payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
      },
    },
  };
  if (input.email?.trim()) {
    body.subscriber = { email_address: input.email.trim() };
  }

  logger.info(
    {
      userId: input.userId,
      planType: input.planType,
      planId: input.planId,
      payload: body,
    },
    "PayPal create subscription request payload",
  );
  console.log("PayPal create subscription request payload", {
    userId: input.userId,
    planType: input.planType,
    planId: input.planId,
    payload: body,
  });

  const res = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    id?: string;
    links?: Array<{ rel?: string; href?: string }>;
    message?: string;
    details?: Array<{ issue?: string; description?: string }>;
    name?: string;
    debug_id?: string;
  };
  logger.info(
    {
      userId: input.userId,
      planType: input.planType,
      planId: input.planId,
      statusCode: res.status,
      response: json,
    },
    "PayPal create subscription response",
  );
  console.log("PayPal create subscription response", {
    userId: input.userId,
    planType: input.planType,
    planId: input.planId,
    statusCode: res.status,
    response: json,
  });
  if (!res.ok) {
    const detail = json.details?.[0]?.description ?? json.message ?? json.name ?? "PayPal subscription creation failed";
    console.error("PayPal create subscription API error", {
      userId: input.userId,
      planType: input.planType,
      planId: input.planId,
      statusCode: res.status,
      response: json,
    });
    throw new PayPalApiError(detail, res.status || 500, json);
  }
  const approve = json.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) {
    console.error("PayPal create subscription missing approval URL", {
      userId: input.userId,
      planType: input.planType,
      planId: input.planId,
      statusCode: res.status,
      response: json,
    });
    throw new PayPalApiError("PayPal did not return an approval URL", 502, json);
  }
  return approve;
}

export async function verifyPayPalWebhookSignature(input: {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  webhookEvent: unknown;
}): Promise<boolean> {
  const webhookId = envTrim("PAYPAL_WEBHOOK_ID");
  if (!webhookId) {
    logger.warn("PAYPAL_WEBHOOK_ID missing — skipping PayPal webhook signature verification");
    return true;
  }
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: input.authAlgo,
      cert_url: input.certUrl,
      transmission_id: input.transmissionId,
      transmission_sig: input.transmissionSig,
      transmission_time: input.transmissionTime,
      webhook_id: webhookId,
      webhook_event: input.webhookEvent,
    }),
  });
  const json = (await res.json()) as { verification_status?: string };
  return res.ok && json.verification_status === "SUCCESS";
}
