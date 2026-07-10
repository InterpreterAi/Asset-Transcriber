import { logger } from "./logger.js";
import { getPayPalAccessToken, PayPalApiError, paypalBaseUrl } from "./paypal.js";

/** Cancel an active PayPal billing subscription (idempotent if already cancelled). */
export async function cancelPayPalSubscription(
  subscriptionId: string,
  reason = "Account closed by user",
): Promise<boolean> {
  const id = subscriptionId.trim();
  if (!id) return false;

  try {
    const token = await getPayPalAccessToken();
    const res = await fetch(
      `${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      },
    );

    if (res.ok || res.status === 204) return true;

    const json = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
    const name = (json.name ?? "").toUpperCase();
    const msg = (json.message ?? "").toLowerCase();

    // Already cancelled / inactive — safe to proceed with account erasure.
    if (
      res.status === 422 ||
      res.status === 404 ||
      name.includes("RESOURCE_NOT_FOUND") ||
      name.includes("SUBSCRIPTION_STATUS_INVALID") ||
      msg.includes("already cancelled") ||
      msg.includes("already canceled")
    ) {
      logger.info({ subscriptionId: id, status: res.status }, "PayPal subscription already inactive");
      return true;
    }

    throw new PayPalApiError(
      json.message ?? json.name ?? "Failed to cancel PayPal subscription",
      res.status || 500,
      json,
    );
  } catch (err) {
    if (err instanceof PayPalApiError) throw err;
    logger.error({ err, subscriptionId: id }, "PayPal subscription cancel failed");
    throw err;
  }
}
