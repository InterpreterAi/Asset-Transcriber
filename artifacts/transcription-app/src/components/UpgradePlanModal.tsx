import { AlertTriangle, Check, CreditCard, ExternalLink, Lock, X } from "lucide-react";
import { AcceptedCardMethods, PayByCardButton, PayPalCheckoutButton } from "@/components/billing/PaymentMethodLogos";
import { cn } from "@/lib/utils";
import type { PricingPlanKey } from "@/lib/pricing-copy";

const BASIC_FEATURES = [
  "Real-time transcription and translation",
  "Speaker identification",
  "Tab audio capture",
  "Personal glossary",
  "62+ languages",
] as const;

const UPGRADE_PLAN_COPY: Record<
  PricingPlanKey,
  { name: string; priceLabel: string; hours: string; chooseLabel: string; features: readonly string[]; highlight: boolean }
> = {
  basic: {
    name: "Basic",
    priceLabel: "$59",
    hours: "Up to 5 interpreting hours per day",
    chooseLabel: "Choose Basic — $59/month",
    highlight: false,
    features: BASIC_FEATURES,
  },
  professional: {
    name: "Professional",
    priceLabel: "$99",
    hours: "Unlimited interpreting hours",
    chooseLabel: "Choose Professional — $99/month",
    highlight: true,
    features: [...BASIC_FEATURES, "Designed for daily professional use"],
  },
};

export type BillingProviderKind = "paddle" | "paypal" | "stripe" | null;

export function UpgradePlanModal(props: {
  title: string;
  subtitle: string;
  error: string | null;
  planKeys: readonly PricingPlanKey[];
  selectedPlan: PricingPlanKey | null;
  paddleEnabled: boolean;
  upgradeLoading: string | null;
  isDowngradeFlow: boolean;
  /** Current paid billing provider — shapes SaaS manage options. */
  billingProvider?: BillingProviderKind;
  canSwitchToCard?: boolean;
  onClose: () => void;
  onSelectPlan: (plan: PricingPlanKey) => void;
  onPaddleCheckout: (plan: PricingPlanKey) => void;
  onPayPalCheckout: (plan: PricingPlanKey) => void;
  onOpenManageBilling?: () => void;
  onViewBilling?: () => void;
  /** PayPal → Paddle: checkout current (or selected) plan on card. */
  onSwitchToCard?: (plan: PricingPlanKey) => void;
}) {
  const selected =
    props.selectedPlan && props.planKeys.includes(props.selectedPlan) ? props.selectedPlan : null;
  const paddleBusy = Boolean(selected && props.upgradeLoading === selected);
  const paypalBusy = Boolean(selected && props.upgradeLoading === `paypal-${selected}`);
  const portalBusy = props.upgradeLoading === "portal";
  const switchBusy = Boolean(selected && props.upgradeLoading === `switch-card-${selected}`);
  const payDisabled = !selected || paddleBusy || paypalBusy || switchBusy || portalBusy;

  const isPaddleSubscriber = props.billingProvider === "paddle";
  const isPayPalSubscriber = props.billingProvider === "paypal";
  const showSaaSManage = isPaddleSubscriber || isPayPalSubscriber;

  const payWithCard = () => {
    if (!selected) return;
    props.onPaddleCheckout(selected);
  };

  const payWithPayPal = () => {
    if (!selected) return;
    props.onPayPalCheckout(selected);
  };

  const switchToCard = () => {
    if (!selected || !props.onSwitchToCard) return;
    props.onSwitchToCard(selected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="relative w-full max-w-[46rem] max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a1220] text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />

        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 pb-5">
          <div>
            <h2 className="text-[1.35rem] font-semibold tracking-tight">{props.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{props.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/8 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 sm:px-8 pb-7 space-y-6">
          {props.error && (
            <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 flex items-start gap-2 text-sm text-red-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{props.error}</span>
            </div>
          )}

          {showSaaSManage && (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-4 sm:p-5 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sky-300/90">
                Manage subscription
              </p>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                {isPaddleSubscriber
                  ? "Update your card, download invoices, change plan, or cancel in the Paddle billing portal — same as typical SaaS billing."
                  : "You’re on PayPal. Manage Autopay there, or switch to card (Paddle) for payment method, invoices, and plan controls in one place."}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {props.onOpenManageBilling && (
                  <button
                    type="button"
                    onClick={props.onOpenManageBilling}
                    disabled={portalBusy}
                    className="h-10 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {portalBusy ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    {isPaddleSubscriber ? "Open billing portal" : "Manage on PayPal"}
                  </button>
                )}
                {props.onViewBilling && (
                  <button
                    type="button"
                    onClick={props.onViewBilling}
                    className="h-10 px-4 rounded-lg border border-white/15 text-sm font-medium text-slate-200 hover:bg-white/5 inline-flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    View billing & invoices
                  </button>
                )}
              </div>
              {isPayPalSubscriber && props.canSwitchToCard && props.paddleEnabled && props.onSwitchToCard && (
                <div className="pt-1 space-y-2">
                  <p className="text-[12px] text-slate-400">
                    Switch to card keeps your selected plan below. Your PayPal subscription is cancelled after card payment confirms.
                  </p>
                  <button
                    type="button"
                    onClick={switchToCard}
                    disabled={payDisabled}
                    className="w-full h-10 rounded-lg border border-emerald-400/35 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-100 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {switchBusy ? (
                      <span className="w-4 h-4 border-2 border-emerald-200/30 border-t-emerald-100 rounded-full animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                    Switch to card (Paddle)
                  </button>
                </div>
              )}
            </div>
          )}

          <div
            className={cn(
              "grid gap-4",
              props.planKeys.length >= 2 ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-sm mx-auto",
            )}
          >
            {props.planKeys.map((key) => {
              const plan = UPGRADE_PLAN_COPY[key];
              const isSelected = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => props.onSelectPlan(key)}
                  className={cn(
                    "relative flex flex-col text-left rounded-2xl border p-5 sm:p-6 transition-colors",
                    isSelected
                      ? "border-sky-400/55 bg-sky-400/[0.07]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                  )}
                >
                  {plan.highlight && !props.isDowngradeFlow && (
                    <span className="absolute top-4 right-4 text-[10px] font-semibold tracking-[0.14em] text-sky-300">
                      MOST POPULAR
                    </span>
                  )}
                  {props.isDowngradeFlow && key === "basic" && (
                    <span className="absolute top-4 right-4 text-[10px] font-semibold tracking-[0.14em] text-slate-400">
                      DOWNGRADE
                    </span>
                  )}
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{plan.name}</p>
                  <p className="mt-3 text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
                    {plan.priceLabel}
                    <span className="ml-1 text-sm font-normal text-slate-500">/month</span>
                  </p>
                  <p className="mt-3 text-[13px] font-medium text-sky-200">{plan.hours}</p>
                  <ul className="mt-4 space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="text-[13px] text-slate-300 flex items-start gap-2.5 leading-snug">
                        <Check className="w-4 h-4 shrink-0 text-sky-400 mt-px" strokeWidth={2.2} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div
                    className={cn(
                      "mt-6 h-10 rounded-lg text-sm font-semibold flex items-center justify-center",
                      isSelected
                        ? "bg-sky-500 text-white"
                        : "border border-white/12 text-slate-200",
                    )}
                  >
                    {plan.chooseLabel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Paddle downgrade: change plan in portal. Upgrades / new plans still use card checkout. */}
          {isPaddleSubscriber && props.isDowngradeFlow ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-2">
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Plan changes, payment method, and cancellation for card subscribers are handled in the{" "}
                <span className="text-white font-medium">Paddle billing portal</span> above — no second checkout needed.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 space-y-3.5">
              {props.paddleEnabled ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                      {isPayPalSubscriber ? "Pay by card (recommended)" : "Pay by card"}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <Lock className="w-3 h-3" />
                      Secure checkout
                    </span>
                  </div>
                  <PayByCardButton onClick={payWithCard} disabled={payDisabled} loading={paddleBusy} />
                  <AcceptedCardMethods onPayByCard={payWithCard} disabled={payDisabled} />
                  <p className="text-center text-[11px] text-slate-500">
                    {selected
                      ? isPayPalSubscriber
                        ? "Opens Paddle checkout. After payment, PayPal billing is cancelled automatically."
                        : "Opens Paddle checkout. Apple Pay and Google Pay appear when your device supports them."
                      : "Select a plan, then pay by card."}
                  </p>

                  {!isPayPalSubscriber && (
                    <>
                      <div className="flex items-center gap-3 py-0.5">
                        <div className="h-px flex-1 bg-white/10" />
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">or</p>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>

                      <PayPalCheckoutButton onClick={payWithPayPal} disabled={payDisabled} loading={paypalBusy} />
                      <p className="text-center text-[11px] text-slate-500">
                        Card billing (Paddle) is the default for invoices and payment-method management
                      </p>
                    </>
                  )}
                </>
              ) : (
                <PayPalCheckoutButton onClick={payWithPayPal} disabled={payDisabled} loading={paypalBusy} />
              )}
            </div>
          )}

          <p className="text-center text-[12px] text-slate-500">
            Cancel anytime.{" "}
            <a href="/terms" className="text-slate-300 hover:text-white underline underline-offset-2">Terms</a>
            <span className="mx-1.5 text-slate-600">·</span>
            <a href="/privacy" className="text-slate-300 hover:text-white underline underline-offset-2">Privacy</a>
            <span className="mx-1.5 text-slate-600">·</span>
            <a href="/refund" className="text-slate-300 hover:text-white underline underline-offset-2">Refunds</a>
          </p>
        </div>
      </div>
    </div>
  );
}
