import { AlertTriangle, Check, CreditCard, X } from "lucide-react";
import { PaymentMethodLogos } from "@/components/billing/PaymentMethodLogos";
import { cn } from "@/lib/utils";
import type { PricingPlanKey } from "@/lib/pricing-copy";

const UPGRADE_PLAN_COPY: Record<
  PricingPlanKey,
  { name: string; priceLabel: string; chooseLabel: string; features: readonly string[]; highlight: boolean }
> = {
  basic: {
    name: "Basic",
    priceLabel: "$59",
    chooseLabel: "Choose Basic — $59/month",
    highlight: false,
    features: [
      "Up to 5 interpreting hours per day",
      "Real-time transcription and translation",
      "Speaker identification",
      "Tab audio capture",
      "Personal glossary",
      "62+ languages",
    ],
  },
  professional: {
    name: "Professional",
    priceLabel: "$99",
    chooseLabel: "Choose Professional — $99/month",
    highlight: true,
    features: [
      "Unlimited interpreting hours",
      "Everything in Basic",
      "Designed for daily professional use",
    ],
  },
};

export function UpgradePlanModal(props: {
  title: string;
  subtitle: string;
  error: string | null;
  planKeys: readonly PricingPlanKey[];
  selectedPlan: PricingPlanKey | null;
  paddleEnabled: boolean;
  upgradeLoading: string | null;
  isDowngradeFlow: boolean;
  onClose: () => void;
  onSelectPlan: (plan: PricingPlanKey) => void;
  onPaddleCheckout: (plan: PricingPlanKey) => void;
  onPayPalCheckout: (plan: PricingPlanKey) => void;
}) {
  const selectedAvailable =
    props.selectedPlan !== null && props.planKeys.includes(props.selectedPlan);

  const startCheckout = (plan: PricingPlanKey) => {
    props.onSelectPlan(plan);
    if (props.paddleEnabled) props.onPaddleCheckout(plan);
    else props.onPayPalCheckout(plan);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{props.title}</h2>
            <p className="text-sm text-foreground/65 mt-0.5">{props.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {props.error && (
            <div className="bg-destructive/15 border border-destructive/30 rounded-lg p-3 flex items-start gap-2 text-sm text-destructive dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{props.error}</span>
            </div>
          )}

          <div
            className={cn(
              "grid gap-3 mx-auto w-full",
              props.planKeys.length >= 2 ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-sm",
            )}
          >
            {props.planKeys.map((key) => {
              const plan = UPGRADE_PLAN_COPY[key];
              const selected = props.selectedPlan === key;
              const choosing = props.upgradeLoading === key || props.upgradeLoading === `paypal-${key}`;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => props.onSelectPlan(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      props.onSelectPlan(key);
                    }
                  }}
                  className={cn(
                    "relative rounded-xl border p-4 flex flex-col gap-3 text-left transition-shadow outline-none",
                    selected
                      ? "border-sky-400/70 bg-card shadow-[0_0_0_1px_rgba(56,189,248,0.28),0_0_28px_-6px_rgba(56,189,248,0.45)]"
                      : "border-border bg-muted/20 hover:border-sky-500/35",
                  )}
                >
                  {plan.highlight && !props.isDowngradeFlow && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full">
                      MOST POPULAR
                    </span>
                  )}
                  {props.isDowngradeFlow && key === "basic" && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-muted text-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border">
                      DOWNGRADE
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                      {plan.priceLabel}
                      <span className="text-sm font-normal text-foreground/55">/month</span>
                    </p>
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="text-[13px] text-foreground/80 flex items-start gap-2 leading-snug">
                        <Check className="w-3.5 h-3.5 shrink-0 text-sky-400 mt-0.5" strokeWidth={2.4} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startCheckout(key);
                    }}
                    disabled={choosing}
                    className={cn(
                      "w-full h-10 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60",
                      selected
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {choosing ? "Opening checkout…" : plan.chooseLabel}
                  </button>
                </div>
              );
            })}
          </div>

          {selectedAvailable && props.selectedPlan && (
            <div className="rounded-xl border border-border bg-muted/15 px-4 py-4 space-y-3">
              {props.paddleEnabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => startCheckout(props.selectedPlan!)}
                    disabled={props.upgradeLoading === props.selectedPlan}
                    className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {props.upgradeLoading === props.selectedPlan ? (
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4" aria-hidden />
                    )}
                    Continue to secure checkout
                  </button>
                  <PaymentMethodLogos />
                  <p className="text-center text-[11px] text-foreground/55 leading-relaxed">
                    Available payment methods depend on your device and location.
                  </p>
                  <button
                    type="button"
                    onClick={() => props.onPayPalCheckout(props.selectedPlan!)}
                    disabled={props.upgradeLoading === `paypal-${props.selectedPlan}`}
                    className="w-full h-10 rounded-lg border border-border bg-background text-sm font-medium text-foreground/80 hover:bg-muted transition-colors disabled:opacity-60"
                  >
                    {props.upgradeLoading === `paypal-${props.selectedPlan}`
                      ? "Opening PayPal…"
                      : "Prefer PayPal? Pay with PayPal"}
                  </button>
                  <p className="text-center text-xs text-foreground/60">Secure payments powered by Paddle</p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => props.onPayPalCheckout(props.selectedPlan!)}
                  disabled={props.upgradeLoading === `paypal-${props.selectedPlan}`}
                  className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {props.upgradeLoading === `paypal-${props.selectedPlan}`
                    ? "Opening PayPal…"
                    : "Continue to secure checkout"}
                </button>
              )}
            </div>
          )}

          <p className="text-center text-xs text-foreground/55 leading-relaxed">
            Cancel anytime.{" "}
            <a href="/terms" className="underline hover:text-foreground">Terms</a>
            {" · "}
            <a href="/privacy" className="underline hover:text-foreground">Privacy</a>
            {" · "}
            <a href="/refund" className="underline hover:text-foreground">Refunds</a>
          </p>
        </div>
      </div>
    </div>
  );
}
