import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { initializePaddleJs, fetchPaddleJsConfig } from "@/lib/paddle-checkout";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";

/**
 * Paddle default payment link page. Loads and initializes Paddle.js on every visit.
 * Does not activate a plan from query parameters.
 */
export default function CheckoutPage() {
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [paddleReady, setPaddleReady] = useState(false);
  const [paddleEnabled, setPaddleEnabled] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txn = params.get("paddle_txn")?.trim();
    if (txn && txn !== "_ptxn_") setProcessing(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchPaddleJsConfig();
        if (cancelled) return;
        setPaddleEnabled(config.enabled);
        if (config.enabled && config.clientToken) {
          await initializePaddleJs(config);
          if (!cancelled) setPaddleReady(true);
        }
      } catch {
        if (!cancelled) setPaddleEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !processing) return;
    const params = new URLSearchParams(window.location.search);
    const txn = params.get("paddle_txn")?.trim();
    if (!txn || txn === "_ptxn_") return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/payments/sync-paddle-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ transactionId: txn }),
        });
        const data = (await r.json().catch(() => ({}))) as { ok?: boolean };
        if (cancelled) return;
        if (r.ok && data.ok) {
          window.location.replace("/workspace");
        }
      } catch {
        /* stay on Payment processing until the verified webhook arrives */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, processing]);

  return (
    <MarketingPageShell premiumNav dark>
      <section className="relative border-b border-white/10 bg-[#060B14] text-white pt-16 pb-24">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm font-semibold text-sky-400/90 tracking-wide uppercase mb-3">Checkout</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {processing ? "Payment processing" : "Card checkout"}
          </h1>
          <p className="mt-4 text-slate-300 leading-relaxed">
            {processing
              ? "Paddle is confirming your payment. Your plan updates automatically when the payment is verified — this page cannot change your account from a link alone."
              : paddleEnabled
                ? paddleReady
                  ? "Paddle checkout is ready on this page. Sign in to choose Basic or Professional from the workspace."
                  : "Loading Paddle checkout…"
                : "Card checkout is not configured. Sign in and use PayPal from the workspace upgrade dialog."}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <Link
                href="/workspace"
                className="px-5 py-3 rounded-xl bg-cyan-400 text-[#030508] text-sm font-semibold hover:bg-cyan-300"
              >
                Open workspace
              </Link>
            ) : (
              <a
                href={loginUrlForReturnTo("/checkout")}
                className="px-5 py-3 rounded-xl bg-cyan-400 text-[#030508] text-sm font-semibold hover:bg-cyan-300"
              >
                Sign in to continue
              </a>
            )}
            <Link
              href="/pricing"
              className="px-5 py-3 rounded-xl border border-white/15 text-sm font-semibold hover:bg-white/5"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
