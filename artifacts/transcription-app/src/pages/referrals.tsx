import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Copy, Check, Zap, Mic2, BookOpen, BarChart3, CreditCard, CalendarDays, Gift } from "lucide-react";
import { ApiError, getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";

type ReferralsPayload = {
  referralLink: string;
  constants: { signupCreditUsd: number; upgradeCreditUsd: number; upgradeHoldDays: number };
  totals: { signups: number; upgrades: number; creditedUsd: number; pendingUsd: number };
  activity: Array<{
    id: number;
    username: string | null;
    email: string | null;
    joinedAt: string;
    upgraded: boolean;
    upgradedAt: string | null;
    holdReadyAt: string | null;
    holdCleared: boolean;
    sessionsCount: number;
    signupCredited: boolean;
    creditedUsd: number;
    pendingUsd: number;
    status: string;
  }>;
};

function fmtUsd(v: number): string {
  return `$${v.toFixed(2)}`;
}

export default function ReferralsPage() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading, isFetched: meFetched, error: meError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 15_000 },
  });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralsPayload | null>(null);

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
    setLoading(true);
    void fetch("/api/referrals/my", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("failed");
        return (await r.json()) as ReferralsPayload;
      })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [me, meLoading, meFetched, meError, setLocation]);

  const activity = useMemo(() => data?.activity ?? [], [data]);
  const fallbackReferralLink = useMemo(() => {
    if (!me) return "";
    const u = encodeURIComponent((me.username ?? `${me.id}`).trim());
    return `${window.location.origin}/invite?ref=${me.id}&u=${u}`;
  }, [me]);

  const copyLink = async () => {
    const link = data?.referralLink || fallbackReferralLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // no-op
    }
  };

  if (meLoading || loading || !me) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <button onClick={() => setLocation("/workspace")} className="flex items-center gap-2 text-foreground">
            <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" strokeWidth={2.2} />
            </span>
            <span className="font-semibold text-base">Interpreter<span className="text-primary">AI</span></span>
          </button>
          <button onClick={() => setLocation("/account")} className="text-sm text-muted-foreground hover:text-foreground">
            Account
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {([
            { key: "workspace", label: "Workspace", path: "/workspace", icon: <Zap className="w-3.5 h-3.5" /> },
            { key: "mic", label: "Mic", path: "/workspace?panel=mic", icon: <Mic2 className="w-3.5 h-3.5" /> },
            { key: "glossary", label: "Glossary", path: "/workspace?panel=glossary", icon: <BookOpen className="w-3.5 h-3.5" /> },
            { key: "usage", label: "Usage", path: "/usage", icon: <BarChart3 className="w-3.5 h-3.5" /> },
            { key: "billing", label: "Billing", path: "/billing", icon: <CreditCard className="w-3.5 h-3.5" /> },
            { key: "account", label: "Account", path: "/account", icon: <CalendarDays className="w-3.5 h-3.5" /> },
            { key: "referrals", label: "Referrals", path: "/referrals", icon: <Gift className="w-3.5 h-3.5" /> },
          ] as const).map((item) => {
            const active = item.path === "/referrals";
            return (
              <button
                key={item.key}
                onClick={() => setLocation(item.path)}
                className={
                  active && item.key === "referrals"
                    ? "h-8 px-3 rounded-lg border text-xs flex items-center gap-1.5 bg-primary text-primary-foreground border-primary"
                    : "h-8 px-3 rounded-lg border text-xs flex items-center gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Invite colleagues. Earn bonuses.</h1>
          <p className="mt-3 text-muted-foreground">
            Get credit when someone you invite joins, and again when they upgrade.
          </p>
        </div>

        <section className="mt-10 rounded-2xl border border-border p-5">
          <h2 className="text-xl font-semibold">How it works</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">01 Share your link</p>
                <p className="text-sm text-muted-foreground">Send your personal invite to colleagues and interpreters.</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm flex items-center truncate">
                    {data?.referralLink || fallbackReferralLink || "—"}
                  </div>
                  <button
                    onClick={copyLink}
                    className="h-10 px-3 rounded-lg border border-border text-sm hover:bg-muted/50 flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">02 They sign up</p>
                <span className="text-sm font-semibold">{fmtUsd(data?.constants.signupCreditUsd ?? 1.5)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Credited when they join through your link.</p>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">03 They upgrade to paid</p>
                <span className="text-sm font-semibold">{fmtUsd(data?.constants.upgradeCreditUsd ?? 10)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Upgrade credit is released after a {data?.constants.upgradeHoldDays ?? 30}-day hold.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-3">Your activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Signups</p><p className="text-2xl font-semibold">{data?.totals.signups ?? 0}</p></div>
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Upgrades</p><p className="text-2xl font-semibold">{data?.totals.upgrades ?? 0}</p></div>
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">$ Credited</p><p className="text-2xl font-semibold">{fmtUsd(data?.totals.creditedUsd ?? 0)}</p></div>
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">$ Pending</p><p className="text-2xl font-semibold">{fmtUsd(data?.totals.pendingUsd ?? 0)}</p></div>
          </div>

          <div className="mt-4 rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-5 px-4 py-2 text-xs font-semibold bg-muted/40">
              <span>User</span><span>Joined</span><span>Subscribed</span><span>Generated</span><span className="text-right">Status</span>
            </div>
            {activity.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No referrals yet — share your link above.</div>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="grid grid-cols-5 px-4 py-3 text-sm border-t border-border/60">
                  <span className="truncate">{a.username ?? a.email ?? `User #${a.id}`}</span>
                  <span>{new Date(a.joinedAt).toLocaleDateString()}</span>
                  <span>{a.upgradedAt ? new Date(a.upgradedAt).toLocaleDateString() : "-"}</span>
                  <span>{fmtUsd(a.creditedUsd + a.pendingUsd)}</span>
                  <span className="text-right">{a.holdCleared ? "credited" : a.upgraded ? "pending hold" : "joined"}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
