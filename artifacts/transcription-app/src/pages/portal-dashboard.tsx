import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ApiError, getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { BarChart3, BookOpen, CalendarDays, CreditCard, Gift, LifeBuoy, Mic2, Zap } from "lucide-react";
import { cn, isTrialLikePlanType, workspacePlanDisplayName, workspaceUsageShowsSlashUnlimited } from "@/lib/utils";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";

type PortalTab = "usage" | "billing" | "account";
type Period = "day" | "week" | "month" | "custom";

type SessionRow = {
  id: number;
  startedAt: string;
  durationSeconds: number | null;
  langPair: string | null;
};

type SessionsPayload = {
  sessions: SessionRow[];
};

type BillingOverview = {
  user: {
    id: number;
    email: string | null;
    username: string;
    planType: string | null;
    subscriptionPlan: string | null;
    subscriptionStatus: string | null;
    subscriptionStartedAt: string | null;
    subscriptionPeriodEndsAt: string | null;
    paypalSubscriptionId: string | null;
    paddleCustomerId?: string | null;
    paddleSubscriptionId?: string | null;
    billingProvider?: "paddle" | "paypal" | "stripe" | null;
    memberSince: string;
    trialStartedAt: string;
    trialEndsAt: string | null;
    trialDurationDays: number;
    trialLike: boolean;
    dailyLimitMinutes: number;
    minutesUsedToday: number;
  };
  invoices: Array<{
    id: string;
    createdAt: string;
    currency: string;
    amount: string;
    status: string;
  }>;
};

function tabPath(tab: PortalTab): string {
  if (tab === "usage") return "/usage";
  if (tab === "billing") return "/billing";
  return "/account";
}

function formatDurationSeconds(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0m";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toIsoDateForInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function PortalDashboard({ initialTab }: { initialTab: PortalTab }) {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading, isFetched: meFetched, error: meError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 15_000 },
  });
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => toIsoDateForInput(new Date()));
  const [customTo, setCustomTo] = useState(() => toIsoDateForInput(new Date()));
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);

  const trialHistoryBaseline = useMemo(() => {
    const k = "workspace_trial_usage_baseline_v1";
    const existing = window.localStorage.getItem(k);
    if (existing && Number.isFinite(new Date(existing).getTime())) return new Date(existing);
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(k, nowIso);
    return new Date(nowIso);
  }, []);

  useEffect(() => {
    if (!meFetched || meLoading) return;
    if (!me) {
      if (meError instanceof ApiError && meError.status === 401) {
        setLocation(loginUrlForReturnTo());
        return;
      }
      if (!meError) setLocation(loginUrlForReturnTo());
      return;
    }
    setOverviewLoading(true);
    void fetch("/api/payments/billing-overview", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("billing_overview_failed");
        return (await r.json()) as BillingOverview;
      })
      .then((d) => setOverview(d))
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
  }, [me, meLoading, meFetched, meError, setLocation]);

  useEffect(() => {
    if (!me) return;
    const mapPeriod = period === "day" ? "today" : period === "week" ? "week" : period === "month" ? "month" : "custom";
    const params = new URLSearchParams();
    params.set("limit", "200");
    params.set("period", mapPeriod);
    if (period === "custom") {
      params.set("from", new Date(`${customFrom}T00:00:00`).toISOString());
      params.set("to", new Date(`${customTo}T23:59:59.999`).toISOString());
    }
    setSessionsLoading(true);
    void fetch(`/api/transcription/sessions?${params.toString()}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("sessions_failed");
        return (await r.json()) as SessionsPayload;
      })
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [period, customFrom, customTo, me]);

  const openBillingPortal = async () => {
    setBillingPortalError(null);
    setBillingPortalLoading(true);
    try {
      const r = await fetch("/api/payments/manage-billing", { method: "POST", credentials: "include" });
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error ?? "Billing portal unavailable");
      window.location.href = d.url;
    } catch (err) {
      setBillingPortalError(err instanceof Error ? err.message : "Billing portal unavailable");
    } finally {
      setBillingPortalLoading(false);
    }
  };

  if (meLoading || overviewLoading || !me) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-primary animate-spin" />
      </div>
    );
  }

  const userPlanType = String(me.planType ?? "").toLowerCase();
  const trialLike = isTrialLikePlanType(userPlanType);
  const showUnlimitedCap =
    workspaceUsageShowsSlashUnlimited(userPlanType) || Number(me.dailyLimitMinutes ?? 0) >= 9000;
  const usedMinutes = Number(me.minutesUsedToday ?? 0);
  const limitMinutes = Number(me.dailyLimitMinutes ?? 0);
  const safePercent = limitMinutes > 0 ? Math.min(100, Math.max(0, (usedMinutes / limitMinutes) * 100)) : 0;
  const renewalRaw = overview?.user.subscriptionPeriodEndsAt ?? null;

  const filteredSessions = (sessions ?? []).filter((s) => {
    // A custom range is an explicit request for a specific window (incl. old
    // sessions), so never clip it by the trial "history starts now" baseline.
    if (!trialLike || period === "custom") return true;
    return new Date(s.startedAt).getTime() >= trialHistoryBaseline.getTime();
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <button onClick={() => setLocation("/workspace")} className="flex items-center gap-2 text-foreground">
            <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" strokeWidth={2.2} />
            </span>
            <span className="font-semibold text-base">Interpreter<span className="text-primary">AI</span></span>
          </button>
          <div className="text-xs text-muted-foreground">{me.email ?? me.username}</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {([
            { key: "workspace", label: "Workspace", path: "/workspace", icon: <Zap className="w-3.5 h-3.5" /> },
            { key: "mic", label: "Mic", path: "/workspace?panel=mic", icon: <Mic2 className="w-3.5 h-3.5" /> },
            { key: "glossary", label: "Glossary", path: "/workspace?panel=glossary", icon: <BookOpen className="w-3.5 h-3.5" /> },
            { key: "usage", label: "Usage", path: "/usage", icon: <BarChart3 className="w-3.5 h-3.5" /> },
            { key: "billing", label: "Billing", path: "/billing", icon: <CreditCard className="w-3.5 h-3.5" /> },
            { key: "account", label: "Account", path: "/account", icon: <CalendarDays className="w-3.5 h-3.5" /> },
            { key: "referrals", label: "Referrals", path: "/referrals", icon: <Gift className="w-3.5 h-3.5" /> },
          ] as const).map((item) => {
            const active = item.path === tabPath(initialTab);
            return (
              <button
                key={item.key}
                onClick={() => setLocation(item.path)}
                className={cn(
                  "h-8 px-3 rounded-lg border text-xs flex items-center gap-1.5",
                  active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-b border-border mb-6">
          {([
            { key: "usage", label: "Usage" },
            { key: "billing", label: "Billing" },
            { key: "account", label: "Account" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setLocation(tabPath(tab.key))}
              className={cn(
                "px-1.5 py-2 text-sm border-b-2 -mb-px",
                initialTab === tab.key
                  ? "text-foreground border-foreground font-medium"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {initialTab === "usage" && (
          <section className="space-y-5">
            <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
            <div className="rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{workspacePlanDisplayName(userPlanType)}</p>
                  <p className="text-3xl font-semibold">
                    {Math.floor(usedMinutes / 60) > 0 ? `${Math.floor(usedMinutes / 60)}h ${Math.round(usedMinutes % 60)}m` : `${Math.round(usedMinutes)}m`}
                    <span className="text-base text-muted-foreground font-normal ml-1">
                      {showUnlimitedCap ? "of unlimited used" : `of ${Math.max(1, Math.floor(limitMinutes / 60))}h used`}
                    </span>
                  </p>
                </div>
                {trialLike && (
                  <button onClick={() => setLocation("/pricing")} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                    Upgrade
                  </button>
                )}
              </div>
              {!showUnlimitedCap && (
                <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${safePercent}%` }} />
                </div>
              )}
              {!trialLike && overview?.user.subscriptionStartedAt && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Trial duration before upgrade: {overview.user.trialDurationDays} day{overview.user.trialDurationDays === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-medium">History</h2>
                <div className="flex items-center gap-2">
                  {([
                    { k: "day", l: "Day" },
                    { k: "week", l: "Week" },
                    { k: "month", l: "Month" },
                    { k: "custom", l: "Custom" },
                  ] as const).map((p) => (
                    <button
                      key={p.k}
                      onClick={() => setPeriod(p.k)}
                      className={cn(
                        "h-8 px-3 rounded-lg text-xs border",
                        period === p.k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground",
                      )}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>
              {period === "custom" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-border text-sm bg-background" />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 px-3 rounded-lg border border-border text-sm bg-background" />
                </div>
              )}
              {!sessionsLoading && filteredSessions.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">Sessions</p>
                    <p className="text-lg font-semibold">{filteredSessions.length}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">Total time</p>
                    <p className="text-lg font-semibold">
                      {formatDurationSeconds(filteredSessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">Avg / session</p>
                    <p className="text-lg font-semibold">
                      {formatDurationSeconds(
                        Math.round(
                          filteredSessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) /
                            filteredSessions.length,
                        ),
                      )}
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-4 border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-4 text-xs font-medium bg-muted/40 px-4 py-2">
                  <span>Languages</span>
                  <span>Date</span>
                  <span>Time</span>
                  <span className="text-right">Duration</span>
                </div>
                {sessionsLoading ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">Loading history...</div>
                ) : filteredSessions.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                    {trialLike && period !== "custom"
                      ? "New trial history starts now."
                      : "No session history for this range."}
                  </div>
                ) : (
                  filteredSessions.map((s) => {
                    const d = new Date(s.startedAt);
                    const parts = s.langPair ? s.langPair.split("→") : [];
                    const langLabel =
                      parts.length === 2 ? `${parts[0]!.trim()} → ${parts[1]!.trim()}` : s.langPair ?? "—";
                    return (
                      <div key={s.id} className="grid grid-cols-4 text-sm px-4 py-2.5 border-t border-border/60">
                        <span className="truncate pr-2 text-primary/90" title={langLabel}>{langLabel}</span>
                        <span>{d.toLocaleDateString()}</span>
                        <span>{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="text-right">{formatDurationSeconds(s.durationSeconds)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {initialTab === "billing" && (
          <section className="space-y-5">
            <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
            <div className="rounded-2xl border border-border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xl font-semibold">{trialLike ? "Free Trial" : workspacePlanDisplayName(userPlanType)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {trialLike ? "Start a plan to unlock monthly billing controls." : "Your current subscription billing status."}
                  </p>
                </div>
                <button
                  onClick={() => (trialLike ? setLocation("/pricing") : void openBillingPortal())}
                  disabled={!trialLike && billingPortalLoading}
                  className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                >
                  {trialLike ? "Upgrade" : billingPortalLoading ? "Opening…" : "Manage"}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Hours used</p>
                  <p className="font-medium">
                    {Math.round(usedMinutes)}m / {showUnlimitedCap ? "Unlimited" : `${Math.max(1, Math.floor(limitMinutes / 60))}h`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Payment</p>
                  <p className="font-medium">
                    {overview?.user.billingProvider === "paddle"
                      ? "Paddle"
                      : overview?.user.billingProvider === "paypal" || overview?.user.paypalSubscriptionId
                        ? "PayPal"
                        : overview?.user.billingProvider === "stripe"
                          ? "Stripe"
                          : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Renewal</p>
                  <p className="font-medium">{renewalRaw ? new Date(renewalRaw).toLocaleDateString() : "-"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-5">
              <h2 className="text-lg font-medium">Invoices</h2>
              <p className="text-sm text-muted-foreground">
                View and download receipts in Paddle. Click a row or open the billing portal.
              </p>
              {billingPortalError && (
                <p className="mt-2 text-sm text-destructive">{billingPortalError}</p>
              )}
              <div className="mt-4 border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-4 text-xs font-medium bg-muted/40 px-4 py-2">
                  <span>Invoice</span>
                  <span>Date</span>
                  <span>Status</span>
                  <span className="text-right">Amount</span>
                </div>
                {(overview?.invoices ?? []).length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground space-y-3">
                    <p>No invoices yet{trialLike ? "." : " in InterpreterAI. Open Paddle to view receipts."}</p>
                    {!trialLike && (
                      <button
                        type="button"
                        onClick={() => void openBillingPortal()}
                        disabled={billingPortalLoading}
                        className="h-9 px-3 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-60"
                      >
                        {billingPortalLoading ? "Opening…" : "Open Paddle invoices"}
                      </button>
                    )}
                  </div>
                ) : (
                  (overview?.invoices ?? []).map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => void openBillingPortal()}
                      disabled={billingPortalLoading}
                      className="grid grid-cols-4 text-sm px-4 py-2.5 border-t border-border/60 w-full text-left hover:bg-muted/40 disabled:opacity-60"
                    >
                      <span className="font-mono text-xs truncate pr-2">{inv.id}</span>
                      <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                      <span>{inv.status}</span>
                      <span className="text-right">{inv.amount} {inv.currency}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {initialTab === "account" && (
          <section className="space-y-5">
            <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
            <div className="rounded-2xl border border-border p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{me.email ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Member since</p>
                  <p className="font-medium">{new Date(overview?.user.memberSince ?? Date.now()).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">User ID</p>
                  <p className="font-mono text-xs">{me.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="font-medium">{workspacePlanDisplayName(userPlanType)}</p>
                </div>
              </div>
            </div>

            {!me.isAdmin && (
              <DeleteAccountSection
                email={me.email ?? me.username}
                hasPayPalSubscription={Boolean(
                  overview?.user.paypalSubscriptionId &&
                    (overview?.user.subscriptionStatus ?? "").toLowerCase() === "active",
                )}
                isGoogleAccount={Boolean(me.isGoogleAccount)}
                twoFactorEnabled={Boolean(me.twoFactorEnabled)}
              />
            )}

            <div>
              <h2 className="text-lg font-medium">Manage</h2>
              <p className="text-sm text-muted-foreground mb-3">Plans, payment methods, and account tools.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => setLocation("/billing")} className="text-left rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /><span className="font-medium">Billing</span></div>
                  <p className="text-xs text-muted-foreground mt-1">Plan and invoices.</p>
                </button>
                <button onClick={() => setLocation("/usage")} className="text-left rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4" /><span className="font-medium">Usage</span></div>
                  <p className="text-xs text-muted-foreground mt-1">Cycle usage and session history.</p>
                </button>
                <button onClick={() => setLocation("/referrals")} className="text-left rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /><span className="font-medium">Referrals</span></div>
                  <p className="text-xs text-muted-foreground mt-1">Earn account credit by inviting colleagues.</p>
                </button>
                <button onClick={() => setLocation("/workspace?panel=support")} className="text-left rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2"><LifeBuoy className="w-4 h-4" /><span className="font-medium">Support</span></div>
                  <p className="text-xs text-muted-foreground mt-1">Questions, data requests, and tickets.</p>
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
