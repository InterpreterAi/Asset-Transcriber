export type PaddlePublicConfig = {
  enabled: boolean;
  environment: "sandbox" | "live";
  clientToken: string;
  customerId: string | null;
  prices: { basic: string | null; professional: string | null };
};

type PaddleCheckoutItem = { priceId: string; quantity: number };

type PaddleInstance = {
  Environment: { set: (env: "sandbox" | "live") => void };
  Initialize: (opts: {
    token: string;
    pwCustomer?: { id: string };
    eventCallback?: (event: PaddleCheckoutEvent) => void;
  }) => void;
  Checkout: {
    open: (opts: {
      transactionId?: string;
      items?: PaddleCheckoutItem[];
      customer?: { id?: string; email?: string };
      customData?: Record<string, string>;
      settings?: { successUrl?: string; displayMode?: "overlay" | "inline"; theme?: "light" | "dark" };
    }) => void;
  };
};

type PaddleCheckoutEvent = {
  name?: string;
  data?: {
    transaction_id?: string;
    id?: string;
    error?: { detail?: string; message?: string };
    message?: string;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleInstance;
  }
}

let initializedToken: string | null = null;
let checkoutCompletedHandler: ((transactionId: string) => void) | null = null;
let checkoutErrorHandler: ((message: string) => void) | null = null;

function paddleEventErrorMessage(event: PaddleCheckoutEvent): string {
  return (
    event.data?.error?.detail ||
    event.data?.error?.message ||
    event.data?.message ||
    "Paddle checkout failed to open"
  );
}

function loadPaddleScript(): Promise<void> {
  if (window.Paddle) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-paddle-billing]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Paddle.js (blocked or unreachable)")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.dataset.paddleBilling = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paddle.js (blocked or unreachable)"));
    document.head.appendChild(script);
  });
}

export type PaddleJsPublicConfig = {
  enabled: boolean;
  environment: "sandbox" | "live";
  clientToken: string;
};

export async function fetchPaddleConfig(): Promise<PaddlePublicConfig> {
  const res = await fetch("/api/payments/paddle-config", { credentials: "include" });
  if (!res.ok) throw new Error("Paddle is not available");
  return res.json() as Promise<PaddlePublicConfig>;
}

export async function fetchPaddleJsConfig(): Promise<PaddleJsPublicConfig> {
  const res = await fetch("/api/payments/paddle-js-config", { credentials: "include" });
  if (!res.ok) throw new Error("Paddle is not available");
  return res.json() as Promise<PaddleJsPublicConfig>;
}

export async function initializePaddleJs(config: Pick<PaddleJsPublicConfig, "environment" | "clientToken">): Promise<void> {
  if (!config.clientToken) throw new Error("Paddle client token is missing");
  await loadPaddleScript();
  if (!window.Paddle) throw new Error("Paddle.js did not load");
  if (initializedToken === config.clientToken) return;
  if (config.environment === "sandbox") {
    window.Paddle.Environment.set("sandbox");
  }
  window.Paddle.Initialize({
    token: config.clientToken,
    eventCallback: (event) => {
      if (event.name === "checkout.completed") {
        const txn = event.data?.transaction_id || event.data?.id || "";
        if (txn) checkoutCompletedHandler?.(txn);
      }
      if (event.name === "checkout.error") {
        checkoutErrorHandler?.(paddleEventErrorMessage(event));
      }
    },
  });
  initializedToken = config.clientToken;
}

export async function openPaddleCheckout(opts: {
  config: PaddlePublicConfig;
  planType: "basic" | "professional";
  userId: number;
  email?: string | null;
  onCompleted: (transactionId: string) => void;
  onError?: (message: string) => void;
}): Promise<void> {
  const priceId = opts.config.prices[opts.planType];
  if (!opts.config.enabled || !opts.config.clientToken || !priceId) {
    throw new Error("Paddle checkout is not configured");
  }
  let transactionId = "";
  const created = await fetch("/api/payments/create-paddle-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ planType: opts.planType }),
  });
  const createdJson = (await created.json().catch(() => ({}))) as {
    transactionId?: string;
    checkoutUrl?: string;
    error?: string;
    code?: string;
    ignored?: boolean;
  };
  if (createdJson.ignored) {
    throw new Error("Admin accounts do not use card checkout");
  }
  if (created.ok && createdJson.transactionId) {
    transactionId = createdJson.transactionId;
  } else if (created.status !== 403 && created.status !== 503 && createdJson.code !== "paddle_forbidden") {
    throw new Error(createdJson.error ?? "Could not start Paddle checkout");
  }

  checkoutCompletedHandler = opts.onCompleted;
  checkoutErrorHandler = opts.onError ?? null;
  await initializePaddleJs(opts.config);
  if (!window.Paddle) throw new Error("Paddle.js did not load");

  const settings = {
    displayMode: "overlay" as const,
    successUrl: `${window.location.origin}/checkout?paddle_txn=_ptxn_`,
  };

  try {
    if (transactionId) {
      window.Paddle.Checkout.open({ transactionId, settings });
      return;
    }

    // Server transaction create was forbidden (missing transaction.write or key/env mismatch).
    // Overlay checkout only needs the public client token + live price IDs.
    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: opts.config.customerId
        ? { id: opts.config.customerId }
        : opts.email
          ? { email: opts.email }
          : undefined,
      customData: {
        user_id: String(opts.userId),
        plan_type: opts.planType,
      },
      settings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paddle checkout failed to open";
    opts.onError?.(message);
    throw new Error(message);
  }
}
