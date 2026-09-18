/**
 * Shared Chuck v2 account panel: Paddle/PayPal upgrade, billing, password, 2FA, close account.
 * Used by Soniox X (and available for other workspaces) so trial users get the same account controls.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import {
  AlertTriangle, BarChart3, CheckCircle, Eye, EyeOff, ExternalLink, Lock, ShieldCheck, User, X, Zap,
} from "lucide-react";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { UpgradePlanModal } from "@/components/UpgradePlanModal";
import { fetchPaddleConfig, openPaddleCheckout, type PaddlePublicConfig } from "@/lib/paddle-checkout";
import { PRICING_PLANS, type PricingPlanKey } from "@/lib/pricing-copy";
import { getWorkspacePlanTestOptions } from "@/lib/workspace-plan-test-options";
import {
  cn,
  formatMinutes,
  isTrialLikePlanType,
  workspacePlanDisplayName,
  workspacePlanTierKey,
  workspaceUsageShowsSlashUnlimited,
} from "@/lib/utils";

const TEST_PLAN_ACTIVATION_EMAIL = "mmorsyy1@gmail.com";

export type WorkspaceAccountUser = {
  id: number;
  username: string;
  email?: string | null;
  planType?: string;
  isAdmin?: boolean;
  isGoogleAccount?: boolean;
  twoFactorEnabled?: boolean;
  trialExpired: boolean;
  trialDaysRemaining: number;
  minutesUsedToday: number;
  minutesRemainingToday: number;
  dailyLimitMinutes: number;
  paidCycleDaysRemaining?: number | null;
  sessionsToday?: number;
};

export function useWorkspaceAccount(user: WorkspaceAccountUser | null | undefined) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [paddlePaymentProcessing, setPaddlePaymentProcessing] = useState(false);

  // ?paddle_txn= is only a lookup key. The server must re-fetch and verify the transaction.
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const txn = params.get("paddle_txn")?.trim();
    if (!txn || txn === "_ptxn_") return;

    let cancelled = false;
    setPaddlePaymentProcessing(true);
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
          await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          params.delete("paddle_txn");
          const q = params.toString();
          window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
          setPaddlePaymentProcessing(false);
          return;
        }
      } catch {
        /* keep Payment processing until the verified webhook arrives */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient]);

  // PayPal returns here with ?subscription_id=I-... after approval — sync plan + confirmation email if webhook was late or incomplete.
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("subscription_id")?.trim();
    if (!sid) return;

    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/payments/sync-paypal-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ subscriptionId: sid }),
        });
        if (cancelled || !r.ok) return;
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        params.delete("subscription_id");
        params.delete("ba_token");
        params.delete("token");
        const q = params.toString();
        const pathOnly = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
        window.history.replaceState(null, "", pathOnly);
      } catch {
        // Non-fatal — PayPal webhook may still apply the plan
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient]);

  // ── Upgrade / billing ────────────────────────────────────────────────────────
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlanKey | null>(null);
  const [testPlanLoading, setTestPlanLoading] = useState<string | null>(null);
  const [paddleConfig, setPaddleConfig] = useState<PaddlePublicConfig | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void fetchPaddleConfig()
      .then((config) => {
        if (!cancelled) setPaddleConfig(config);
      })
      .catch(() => {
        if (!cancelled) {
          setPaddleConfig({
            enabled: false,
            environment: "sandbox",
            clientToken: "",
            customerId: null,
            prices: { basic: null, professional: null },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleOpenUpgrade = () => {
    setShowUpgrade(true);
    setUpgradeError(null);
    const tier = workspacePlanTierKey(user?.planType);
    if (tier === "basic") setSelectedPlan("professional");
    else if (tier === "professional") setSelectedPlan("basic");
    else setSelectedPlan("professional");
    void fetchPaddleConfig()
      .then(setPaddleConfig)
      .catch(() => setPaddleConfig({ enabled: false, environment: "sandbox", clientToken: "", customerId: null, prices: { basic: null, professional: null } }));
    void fetch("/api/payments/billing-overview", { credentials: "include" })
      .then(async (r) => (r.ok ? ((await r.json()) as ProfileBillingOverview) : null))
      .then((d) => {
        if (d) setProfileBilling(d);
      })
      .catch(() => {});
  };

  const handlePaddleCheckout = async (planType: "basic" | "professional") => {
    setUpgradeLoading(planType);
    setUpgradeError(null);
    try {
      const config = await fetchPaddleConfig();
      setPaddleConfig(config);
      if (!config.enabled) {
        throw new Error("Card checkout is not configured");
      }
      await openPaddleCheckout({
        config,
        planType,
        userId: user?.id ?? 0,
        email: user?.email,
        onError: (message) => setUpgradeError(message),
        onCompleted: (transactionId) => {
          setPaddlePaymentProcessing(true);
          void fetch("/api/payments/sync-paddle-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ transactionId }),
          }).then(async (r) => {
            const data = (await r.json().catch(() => ({}))) as { ok?: boolean };
            if (r.ok && data.ok) {
              await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              setPaddlePaymentProcessing(false);
            }
          });
        },
      });
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUpgradeLoading(null);
    }
  };

  const handlePayPalCheckout = async (planType: "basic" | "professional") => {
    setUpgradeLoading(`paypal-${planType}`);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/payments/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: user?.id, planType }),
      });
      const data = await res.json() as { approvalUrl?: string; error?: string };
      if (!res.ok || !data.approvalUrl) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.approvalUrl;
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUpgradeLoading(null);
    }
  };

  const TEST_PLAN_ACTIVATION_EMAIL = "mmorsyy1@gmail.com";

  const handleTestActivatePlan = async (planType: string) => {
    setTestPlanLoading(planType);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/payments/test-activate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planType }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Plan switch failed");
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTestPlanLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setUpgradeLoading("portal");
    setUpgradeError(null);
    try {
      const res = await fetch("/api/payments/manage-billing", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json() as { url?: string; error?: string; code?: string };
      if (!res.ok || !data.url) {
        if (data.code === "no_billing_profile") {
          throw new Error(
            "No billing portal yet. Use Pay by card (Paddle) to set up card billing, then you can manage payment method and invoices.",
          );
        }
        throw new Error(data.error ?? "Portal unavailable");
      }
      window.location.href = data.url;
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUpgradeLoading(null);
    }
  };

  /** PayPal → Paddle card for selected (or current) plan. */
  const handleSwitchToCard = async (planType: "basic" | "professional") => {
    setUpgradeLoading(`switch-card-${planType}`);
    setUpgradeError(null);
    try {
      await handlePaddleCheckout(planType);
    } finally {
      // handlePaddleCheckout clears its own loading in finally; keep switch key cleared
      setUpgradeLoading(null);
    }
  };

  // ── Change password form ────────────────────────────────────────────────────
  const [pwForm, setPwForm]   = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading]   = useState(false);
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNext, setShowPwNext]       = useState(false);
  const [pwStatus, setPwStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // ── 2FA state ───────────────────────────────────────────────────────────────
  const [twoFaEnabled,  setTwoFaEnabled]  = useState<boolean | null>(null);
  const [twoFaStep,     setTwoFaStep]     = useState<"idle" | "setup" | "disable">("idle");
  const [twoFaQr,       setTwoFaQr]       = useState("");
  const [twoFaSecret,   setTwoFaSecret]   = useState("");
  const [twoFaToken,    setTwoFaToken]    = useState("");
  const [twoFaLoading,  setTwoFaLoading]  = useState(false);
  const [twoFaMsg,      setTwoFaMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);

  type ProfileBillingOverview = {
    user: {
      paypalSubscriptionId: string | null;
      paddleCustomerId?: string | null;
      paddleSubscriptionId?: string | null;
      subscriptionStatus: string | null;
      subscriptionPlan?: string | null;
      billingProvider?: "paddle" | "paypal" | "stripe" | null;
      paymentMethodLabel?: string;
    };
    capabilities?: {
      paddleCheckoutEnabled?: boolean;
      canOpenProviderPortal?: boolean;
      canUpdatePaymentMethod?: boolean;
      canViewInvoices?: boolean;
      canChangePlan?: boolean;
      canSwitchToCard?: boolean;
      manageHint?: string;
    };
  };
  const [profileBilling, setProfileBilling] = useState<ProfileBillingOverview | null>(null);

  useEffect(() => {
    fetch("/api/auth/2fa/status", { credentials: "include" })
      .then(r => r.json())
      .then((d: { enabled: boolean }) => setTwoFaEnabled(d.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void fetch("/api/payments/billing-overview", { credentials: "include" })
      .then(async (r) => (r.ok ? ((await r.json()) as ProfileBillingOverview) : null))
      .then((d) => setProfileBilling(d))
      .catch(() => setProfileBilling(null));
  }, [user?.id]);


  const handle2faSetup = async () => {
    setTwoFaLoading(true); setTwoFaMsg(null);
    try {
      const res  = await fetch("/api/auth/2fa/setup", { method: "POST", credentials: "include" });
      const data = await res.json() as { secret?: string; qrDataUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Setup failed");
      setTwoFaSecret(data.secret ?? "");
      setTwoFaQr(data.qrDataUrl ?? "");
      setTwoFaStep("setup");
    } catch (err: unknown) {
      setTwoFaMsg({ type: "err", text: err instanceof Error ? err.message : "Setup failed" });
    } finally { setTwoFaLoading(false); }
  };

  const handle2faEnable = async () => {
    setTwoFaLoading(true); setTwoFaMsg(null);
    try {
      const res  = await fetch("/api/auth/2fa/enable", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFaToken.replace(/\s/g, "") }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setTwoFaEnabled(true); setTwoFaStep("idle"); setTwoFaToken("");
      setTwoFaMsg({ type: "ok", text: "Two-factor authentication is now active." });
    } catch (err: unknown) {
      setTwoFaMsg({ type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally { setTwoFaLoading(false); }
  };

  const handle2faDisable = async () => {
    setTwoFaLoading(true); setTwoFaMsg(null);
    try {
      const res  = await fetch("/api/auth/2fa/disable", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFaToken.replace(/\s/g, "") }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to disable");
      setTwoFaEnabled(false); setTwoFaStep("idle"); setTwoFaToken("");
      setTwoFaMsg({ type: "ok", text: "Two-factor authentication disabled." });
    } catch (err: unknown) {
      setTwoFaMsg({ type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally { setTwoFaLoading(false); }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwStatus(null);
    if (pwForm.next !== pwForm.confirm) {
      setPwStatus({ type: "err", msg: "New passwords do not match." });
      return;
    }
    if (pwForm.next.length < 8) {
      setPwStatus({ type: "err", msg: "New password must be at least 8 characters." });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPwStatus({ type: "ok", msg: "Password changed successfully." });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: unknown) {
      setPwStatus({ type: "err", msg: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setPwLoading(false);
    }
  };

  const currentTier = user ? workspacePlanTierKey(user.planType) : "trial";
  const canChangePlan =
    currentTier === "trial" || currentTier === "basic" || currentTier === "professional";
  const upgradePlanOptions = PRICING_PLANS.filter((plan) => {
    if (currentTier === "trial") return true;
    if (currentTier === "basic") return plan.key === "professional";
    if (currentTier === "professional") return plan.key === "basic";
    return false;
  });
  const isDowngradeFlow = currentTier === "professional";
  const planModalTitle = isDowngradeFlow ? "Change Your Plan" : "Upgrade Your Plan";
  const planModalSubtitle = isDowngradeFlow
    ? "Manage billing, switch payment method, or move to Basic"
    : currentTier === "basic"
      ? "Upgrade to Professional for unlimited interpreting hours"
      : "Choose a plan that fits your workflow";
  const paddleCheckoutOn = Boolean(paddleConfig?.enabled);
  const billingProvider = profileBilling?.user.billingProvider ?? null;
  const canSwitchToCard = Boolean(profileBilling?.capabilities?.canSwitchToCard);
  const paymentMethodLabel =
    profileBilling?.user.paymentMethodLabel ??
    (billingProvider === "paddle"
      ? "Card (Paddle)"
      : billingProvider === "paypal"
        ? "PayPal"
        : null);
  const isPaidUser = user ? !isTrialLikePlanType(user.planType) : false;
  const usageShowsUnlimitedCap = user
    ? user.dailyLimitMinutes >= 9000 || workspaceUsageShowsSlashUnlimited(user.planType)
    : false;

  const accountOverlays: ReactNode =
    !user ? null : (
      <>
        {paddlePaymentProcessing && (
          <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 max-w-md w-[calc(100%-1.5rem)] rounded-lg border border-border bg-background px-4 py-3 shadow-lg text-sm text-foreground">
            <p className="font-semibold">Payment processing</p>
            <p className="text-xs text-foreground/75 mt-1 leading-relaxed">
              Paddle is confirming your payment. Your plan updates when the payment is verified — a return link cannot change your account by itself.
            </p>
          </div>
        )}
                {showUpgrade && (
          <UpgradePlanModal
            title={planModalTitle}
            subtitle={planModalSubtitle}
            error={upgradeError}
            planKeys={upgradePlanOptions.map((plan) => plan.key)}
            selectedPlan={selectedPlan}
            paddleEnabled={paddleCheckoutOn}
            upgradeLoading={upgradeLoading}
            isDowngradeFlow={isDowngradeFlow}
            billingProvider={billingProvider}
            canSwitchToCard={canSwitchToCard}
            onClose={() => setShowUpgrade(false)}
            onSelectPlan={setSelectedPlan}
            onPaddleCheckout={(plan) => void handlePaddleCheckout(plan)}
            onPayPalCheckout={(plan) => void handlePayPalCheckout(plan)}
            onOpenManageBilling={() => void handleManageBilling()}
            onViewBilling={() => {
              setShowUpgrade(false);
              setLocation("/billing");
            }}
            onSwitchToCard={(plan) => void handleSwitchToCard(plan)}
          />
        )}
      </>
    );

  function AccountPanel({ onClose, recording = false }: { onClose: () => void; recording?: boolean }) {
    if (!user) return null;

    return (
<div className="w-full md:w-72 bg-card border-r border-border dark:border-white/[0.08] flex flex-col overflow-y-auto shrink-0 z-10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]">
          {/* Panel header */}
          <div className="min-h-[52px] border-b border-border flex items-center justify-between px-4 py-2 shrink-0">
            <div className="min-w-0">
              <span className="font-semibold text-sm block">Account</span>
              <span className="text-[10px] text-muted-foreground">Security & close account</span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User identity */}
          <div className="p-4 border-b border-border/60 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.email ?? user.username}</p>
                <p className="text-[11px] text-muted-foreground truncate">@{user.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                (() => {
                  const tier = workspacePlanTierKey(user.planType);
                  if (tier === "trial") return "bg-violet-50 text-violet-700 border-violet-200";
                  if (tier === "basic") return "bg-blue-50 text-blue-700 border-blue-200";
                  if (tier === "professional") return "bg-indigo-50 text-indigo-700 border-indigo-200";
                  return "bg-emerald-50 text-emerald-700 border-emerald-200";
                })()
              }`}>
                {workspacePlanDisplayName(user.planType)}
              </span>
              {isTrialLikePlanType(user.planType) && (
                <span className="text-[11px] text-muted-foreground">
                  {user.trialExpired
                    ? "Expired"
                    : `${user.trialDaysRemaining} day${user.trialDaysRemaining === 1 ? "" : "s"} left`}
                </span>
              )}
            </div>

            {/* Upgrade / Manage billing — SaaS-style for paid subscribers */}
            {isTrialLikePlanType(user.planType) ? (
              <button
                onClick={handleOpenUpgrade}
                className="w-full mt-2 h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                Upgrade Plan
              </button>
            ) : (
              <div className="mt-2 space-y-1.5">
                {paymentMethodLabel && (
                  <p className="text-[10px] text-muted-foreground px-0.5">
                    Payment: <span className="font-medium text-foreground/80">{paymentMethodLabel}</span>
                  </p>
                )}
                {canChangePlan && (
                  <button
                    onClick={handleOpenUpgrade}
                    className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {currentTier === "professional" ? "Change Plan" : "Upgrade Plan"}
                  </button>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setLocation("/billing")}
                    className="h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    View Billing
                  </button>
                  <button
                    onClick={() => void handleManageBilling()}
                    disabled={upgradeLoading === "portal"}
                    className="h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                    title={
                      billingProvider === "paddle"
                        ? "Update card, invoices, plan, or cancel in Paddle"
                        : billingProvider === "paypal"
                          ? "Manage PayPal Autopay"
                          : "Open billing portal"
                    }
                  >
                    {upgradeLoading === "portal" ? (
                      <span className="w-3.5 h-3.5 border-2 border-border border-t-foreground rounded-full animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    {billingProvider === "paddle" ? "Payment method" : "Manage Billing"}
                  </button>
                </div>
                {canSwitchToCard && paddleCheckoutOn && (
                  <button
                    type="button"
                    onClick={() => {
                      const plan =
                        currentTier === "basic"
                          ? "basic"
                          : currentTier === "professional"
                            ? "professional"
                            : (selectedPlan ?? "professional");
                      setSelectedPlan(plan);
                      setShowUpgrade(true);
                      setUpgradeError(null);
                      void fetchPaddleConfig()
                        .then(setPaddleConfig)
                        .catch(() =>
                          setPaddleConfig({
                            enabled: false,
                            environment: "sandbox",
                            clientToken: "",
                            customerId: null,
                            prices: { basic: null, professional: null },
                          }),
                        );
                    }}
                    className="w-full h-8 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    Switch to card
                  </button>
                )}
                <button
                  onClick={() => void handleManageBilling()}
                  disabled={upgradeLoading === "portal"}
                  className="w-full h-8 rounded-lg border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                  title="Open billing portal to cancel and stop auto-renew."
                >
                  Cancel Subscription
                </button>
                {upgradeError && !showUpgrade && (
                  <p className="text-[11px] text-destructive leading-snug">{upgradeError}</p>
                )}
              </div>
            )}
          </div>

          {/* Usage */}
          <div className="p-4 border-b border-border/60">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Today's Usage</p>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium">
                {(() => {
                  const h = Math.floor(user.minutesUsedToday / 60);
                  const m = Math.round(user.minutesUsedToday % 60);
                  return h > 0 ? `${h}h ${m}m used` : `${m}m used`;
                })()}
              </span>
              {usageShowsUnlimitedCap
                ? <span className="text-muted-foreground font-medium">/ unlimited</span>
                : <span className="text-muted-foreground">
                    / {Math.floor(user.dailyLimitMinutes / 60) > 0
                      ? `${Math.floor(user.dailyLimitMinutes / 60)}h`
                      : `${user.dailyLimitMinutes}m`}
                  </span>
              }
            </div>
            {!usageShowsUnlimitedCap && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    user.minutesUsedToday >= user.dailyLimitMinutes ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, (user.minutesUsedToday / user.dailyLimitMinutes) * 100)}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>Sessions today</span>
              <span className="font-semibold text-foreground">{(user as unknown as { sessionsToday?: number }).sessionsToday ?? 0}</span>
            </div>
            {isPaidUser && (
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>Next cycle</span>
                <span className="font-semibold text-foreground">
                  {typeof user.paidCycleDaysRemaining === "number"
                    ? `${user.paidCycleDaysRemaining} day${user.paidCycleDaysRemaining === 1 ? "" : "s"} left`
                    : "—"}
                </span>
              </div>
            )}
          </div>

          {(user.isAdmin || (user.email ?? "").trim().toLowerCase() === TEST_PLAN_ACTIVATION_EMAIL) && (
            <div className="px-4 pb-4 border-b border-border/60">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Plan testing</p>
              <p className="text-[11px] text-muted-foreground mb-2">
                {user.isAdmin
                  ? "Sets your real DB plan_type (same values as Admin → Users). Trial picks apply a fresh window from now."
                  : "Switch plan instantly (no checkout)."}
              </p>
              {(["trial", "paid"] as const).map((group) => (
                <div key={group} className={group === "paid" ? "mt-2.5" : ""}>
                  <p className="text-[10px] font-medium text-muted-foreground/90 mb-1.5">
                    {group === "trial" ? "Trials" : "Paid tiers"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {getWorkspacePlanTestOptions(user.isAdmin ?? false).filter((o) => o.group === group).map((o) => {
                      const active = (user.planType ?? "").toLowerCase() === o.planType;
                      return (
                        <button
                          key={o.planType}
                          type="button"
                          title={o.planType}
                          disabled={recording || testPlanLoading !== null}
                          onClick={() => void handleTestActivatePlan(o.planType)}
                          className={`px-2 py-1 rounded-md text-[9px] font-semibold border transition-colors disabled:opacity-50 leading-tight text-left max-w-[11rem] ${
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border dark:border-white/10 bg-card text-foreground hover:bg-muted dark:bg-muted/25 dark:hover:bg-white/[0.08]"
                          }`}
                        >
                          {testPlanLoading === o.planType ? "…" : o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Change password (email/password accounts only) */}
          <div className="p-4 flex-1">
            {!user.isGoogleAccount ? (
              <>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Change Password</p>

            {pwStatus && (
              <div className={`mb-3 flex items-start gap-2 text-xs p-2.5 rounded-lg border ${
                pwStatus.type === "ok"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
                {pwStatus.type === "ok"
                  ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>{pwStatus.msg}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
              {/* Current password */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Current</label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type={showPwCurrent ? "text" : "password"}
                    value={pwForm.current}
                    onChange={(e) => setPwForm(f => ({ ...f, current: e.target.value }))}
                    placeholder="Current password"
                    className="w-full pl-8 pr-8 h-8 text-xs rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwCurrent(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPwCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type={showPwNext ? "text" : "password"}
                    value={pwForm.next}
                    onChange={(e) => setPwForm(f => ({ ...f, next: e.target.value }))}
                    placeholder="At least 8 characters"
                    className="w-full pl-8 pr-8 h-8 text-xs rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwNext(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPwNext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm new password */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Confirm</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                  className="w-full pl-3 h-8 text-xs rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={pwLoading}
                className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {pwLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {pwLoading ? "Updating…" : "Update Password"}
              </button>
            </form>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-1">
                You sign in with Google. Password changes are managed in your Google account.
              </p>
            )}

            {/* ── 2FA Section ─────────────────────────────────────── */}
            <div className={cn(!user.isGoogleAccount ? "mt-5 pt-4 border-t border-border/60" : "")}>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Two-Factor Auth</p>
                {twoFaEnabled !== null && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${twoFaEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-muted-foreground"}`}>
                    {twoFaEnabled ? "Active" : "Off"}
                  </span>
                )}
              </div>

              {twoFaMsg && (
                <div className={`mb-2.5 text-xs p-2 rounded-lg border flex items-start gap-1.5 ${twoFaMsg.type === "ok" ? "bg-green-50 text-green-700 border-green-200" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                  {twoFaMsg.type === "ok" ? <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />}
                  {twoFaMsg.text}
                </div>
              )}

              {twoFaStep === "idle" && !twoFaEnabled && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                    Add an extra layer of security. Use any TOTP app (Google Authenticator, Authy, 1Password).
                  </p>
                  <button
                    onClick={() => void handle2faSetup()}
                    disabled={twoFaLoading}
                    className="w-full h-8 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {twoFaLoading
                      ? <span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                      : <ShieldCheck className="w-3 h-3" />}
                    Enable Two-Factor Authentication
                  </button>
                </div>
              )}

              {twoFaStep === "setup" && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
                  </p>
                  {twoFaQr && (
                    <div className="flex justify-center">
                      <img src={twoFaQr} alt="2FA QR code" className="w-36 h-36 rounded-xl border border-border p-1" />
                    </div>
                  )}
                  {twoFaSecret && (
                    <div className="bg-background rounded-lg p-2 border border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Manual key:</p>
                      <p className="text-xs font-mono break-all text-foreground select-all">{twoFaSecret}</p>
                    </div>
                  )}
                  <input
                    value={twoFaToken}
                    onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full h-8 text-center font-mono text-base tracking-[0.4em] rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTwoFaStep("idle"); setTwoFaToken(""); setTwoFaMsg(null); }}
                      className="flex-1 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handle2faEnable()}
                      disabled={twoFaLoading || twoFaToken.length < 6}
                      className="flex-1 h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                    >
                      {twoFaLoading
                        ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <ShieldCheck className="w-3 h-3" />}
                      Activate
                    </button>
                  </div>
                </div>
              )}

              {twoFaStep === "idle" && twoFaEnabled && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                    Your account is protected with two-factor authentication.
                  </p>
                  <button
                    onClick={() => { setTwoFaStep("disable"); setTwoFaMsg(null); }}
                    className="w-full h-8 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/5 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3 h-3" />
                    Disable Two-Factor Authentication
                  </button>
                </div>
              )}

              {twoFaStep === "disable" && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Enter your 6-digit authenticator code to confirm disabling 2FA.
                  </p>
                  <input
                    value={twoFaToken}
                    onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full h-8 text-center font-mono text-base tracking-[0.4em] rounded-lg border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTwoFaStep("idle"); setTwoFaToken(""); setTwoFaMsg(null); }}
                      className="flex-1 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handle2faDisable()}
                      disabled={twoFaLoading || twoFaToken.length < 6}
                      className="flex-1 h-8 rounded-lg bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                    >
                      {twoFaLoading
                        ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : null}
                      Confirm Disable
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!user.isAdmin && (
              <div className="mt-5 pt-4 border-t border-border/60">
                <DeleteAccountSection
                  variant="compact"
                  email={user.email ?? user.username}
                  hasPayPalSubscription={Boolean(
                    profileBilling?.user.paypalSubscriptionId &&
                      (profileBilling.user.subscriptionStatus ?? "").toLowerCase() === "active",
                  )}
                  isGoogleAccount={Boolean(user.isGoogleAccount)}
                  twoFactorEnabled={Boolean(user.twoFactorEnabled ?? twoFaEnabled)}
                />
              </div>
            )}
          </div>
        </div>
    );
  }

  return {
    accountOverlays,
    AccountPanel,
    openUpgrade: handleOpenUpgrade,
  };
}
