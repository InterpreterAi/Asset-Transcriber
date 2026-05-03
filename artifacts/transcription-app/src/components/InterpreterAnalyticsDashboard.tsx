import { useEffect, useState } from "react";
import {
  X,
  BarChart3,
  Clock,
  TrendingUp,
  Mic2,
  Zap,
  Globe2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { cn, formatMinutes } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type AnalyticsDashboardPayload = {
  generatedAt: string;
  limits: {
    dailyLimitMinutes: number;
    minutesUsedToday: number;
    minutesRemainingToday: number | null;
    pctDailyUsed: number;
    warnDaily: boolean;
    unlimitedDaily: boolean;
  };
  sessions: {
    today: number;
    week: number;
    month: number;
    minutesWeek: number;
    minutesMonth: number;
    avgDurationMinutesMonth: number;
  };
  words: {
    transcribedMonth: number;
    wpmEstimatedMonth: number | null;
  };
  performance: {
    avgTranslationLatencyMs: number | null;
    languageSwitchesMonth: number;
  };
  trendDailyMinutes: { date: string; minutes: number }[];
  langPairs: { pair: string; count: number; pct: number }[];
  totalsFromServer: {
    totalSessionsAccount: number;
    totalMinutesAccount: number;
  };
  trackingPeriod: {
    label: string;
    start: string;
    end: string;
    sessions: number;
    minutes: number;
    avgDurationMinutes: number;
  };
};

function fmtMs(ms: number | null | undefined) {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function ProgressBar({
  pct,
  warn,
  wsDark,
}: {
  pct: number;
  warn: boolean;
  wsDark: boolean;
}) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "h-2.5 rounded-full overflow-hidden border",
          wsDark ? "bg-muted/40 border-white/10" : "bg-muted border-border",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            warn ? "bg-amber-500" : wsDark ? "bg-sky-500" : "bg-primary",
          )}
          style={{ width: `${p}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{p.toFixed(0)}% of today&apos;s allowance</p>
    </div>
  );
}

export function InterpreterAnalyticsDashboard({
  open,
  onClose,
  wsDark,
}: {
  open: boolean;
  onClose: () => void;
  wsDark: boolean;
}) {
  const [data, setData] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    void fetch(`${BASE}/api/transcription/session/analytics-dashboard`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error?.trim() || `HTTP ${r.status}`);
        }
        return r.json() as Promise<AnalyticsDashboardPayload>;
      })
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  if (!open) return null;

  const panelBg = wsDark ? "bg-[#0f141c] border-white/10" : "bg-card border-border";
  const cardBg = wsDark
    ? "bg-muted/25 border-white/[0.08] text-foreground"
    : "bg-muted/40 border-border text-foreground";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analytics-dash-title"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative flex flex-col w-full max-w-5xl max-h-[100dvh] sm:max-h-[92dvh] sm:rounded-2xl shadow-2xl overflow-hidden border",
          panelBg,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0",
            wsDark ? "border-white/10 bg-black/25" : "border-border bg-muted/30",
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                wsDark ? "bg-sky-500/15 text-sky-300" : "bg-primary/10 text-primary",
              )}
            >
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="analytics-dash-title" className="font-semibold text-sm sm:text-base truncate">
                Analytics Dashboard
              </h2>
              <p className="text-[10px] text-muted-foreground truncate">
                Usage, sessions, and performance (InterpreterAI)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                wsDark ? "hover:bg-white/10 text-muted-foreground" : "hover:bg-muted text-muted-foreground",
              )}
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                wsDark ? "hover:bg-white/10 text-muted-foreground" : "hover:bg-muted text-muted-foreground",
              )}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-5">
          {err && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}
          {loading && !data && (
            <div className="flex justify-center py-16 text-muted-foreground text-sm">Loading…</div>
          )}

          {data && (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" /> Usage overview
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className={cn("rounded-xl border p-4 space-y-3", cardBg)}>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Today
                    </p>
                    <p className="text-xl font-bold tabular-nums">
                      {formatMinutes(data.limits.minutesUsedToday)}
                      {!data.limits.unlimitedDaily && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {" "}
                          / {formatMinutes(data.limits.dailyLimitMinutes)}
                        </span>
                      )}
                    </p>
                    {data.limits.unlimitedDaily ? (
                      <p className="text-xs text-muted-foreground">Unlimited daily allowance</p>
                    ) : (
                      <>
                        <ProgressBar
                          pct={data.limits.pctDailyUsed}
                          warn={data.limits.warnDaily}
                          wsDark={wsDark}
                        />
                        {data.limits.warnDaily && (
                          <p className="text-[11px] flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            You&apos;ve used over 80% of today&apos;s minutes.
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Remaining today:{" "}
                          <span className="font-semibold text-foreground tabular-nums">
                            {data.limits.minutesRemainingToday != null
                              ? formatMinutes(data.limits.minutesRemainingToday)
                              : "—"}
                          </span>
                        </p>
                      </>
                    )}
                  </div>
                  <div className={cn("rounded-xl border p-4 space-y-2", cardBg)}>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Rolling totals
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[10px] text-muted-foreground">This week</p>
                        <p className="font-semibold tabular-nums">{data.sessions.week} sessions</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatMinutes(data.sessions.minutesWeek)} transcribed
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">This month (calendar)</p>
                        <p className="font-semibold tabular-nums">{data.sessions.month} sessions</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatMinutes(data.sessions.minutesMonth)} transcribed
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 dark:border-white/10 bg-background/40 px-2.5 py-2 mt-2 space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {data.trackingPeriod.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(data.trackingPeriod.start).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" — "}
                        {new Date(data.trackingPeriod.end).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-sm">
                        <span className="font-semibold tabular-nums">{data.trackingPeriod.sessions}</span>{" "}
                        sessions ·{" "}
                        <span className="font-semibold tabular-nums">
                          {formatMinutes(data.trackingPeriod.minutes)}
                        </span>{" "}
                        transcribed
                        {data.trackingPeriod.avgDurationMinutes > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · avg {data.trackingPeriod.avgDurationMinutes.toFixed(1)} min/session
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50 dark:border-white/10">
                      Account lifetime:{" "}
                      <span className="text-foreground font-medium">
                        {data.totalsFromServer.totalSessionsAccount}
                      </span>{" "}
                      sessions ·{" "}
                      <span className="text-foreground font-medium tabular-nums">
                        {formatMinutes(data.totalsFromServer.totalMinutesAccount)}
                      </span>{" "}
                      transcribed
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Session insights
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Sessions today", value: String(data.sessions.today), icon: Mic2 },
                    {
                      label: "Avg duration (mo)",
                      value:
                        data.sessions.avgDurationMinutesMonth > 0
                          ? `${data.sessions.avgDurationMinutesMonth.toFixed(1)} min`
                          : "—",
                      icon: Clock,
                    },
                    {
                      label: "Words (month)",
                      value:
                        data.words.transcribedMonth > 0
                          ? data.words.transcribedMonth.toLocaleString()
                          : "—",
                      icon: Zap,
                    },
                    {
                      label: "Est. WPM (month)",
                      value:
                        data.words.wpmEstimatedMonth != null
                          ? String(data.words.wpmEstimatedMonth)
                          : "—",
                      icon: TrendingUp,
                    },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className={cn("rounded-xl border p-3", cardBg)}>
                      <Icon className="w-4 h-4 text-muted-foreground mb-1.5" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                      <p className="text-lg font-bold mt-0.5 tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" /> Performance
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className={cn("rounded-xl border p-4", cardBg)}>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Avg translation latency
                    </p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">
                      {fmtMs(data.performance.avgTranslationLatencyMs)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Round-trip estimate per translation dispatch (recent sessions).
                    </p>
                  </div>
                  <div className={cn("rounded-xl border p-4", cardBg)}>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Language switches (month)
                    </p>
                    <p className="text-2xl font-bold mt-1 tabular-nums">
                      {data.performance.languageSwitchesMonth > 0
                        ? data.performance.languageSwitchesMonth.toLocaleString()
                        : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Speaker-change boundaries recorded when sessions ended with analytics.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Daily usage (this month, app calendar)
                </h3>
                <div className={cn("rounded-xl border p-3 h-56", cardBg)}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trendDailyMinutes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={wsDark ? "#38bdf8" : "#2563eb"} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={wsDark ? "#38bdf8" : "#2563eb"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={wsDark ? "#ffffff14" : "#00000014"} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke={wsDark ? "#94a3b8" : "#64748b"} />
                      <YAxis tick={{ fontSize: 10 }} stroke={wsDark ? "#94a3b8" : "#64748b"} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: wsDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e2e8f0",
                          background: wsDark ? "#1e293b" : "#fff",
                          fontSize: 12,
                          color: wsDark ? "#f8fafc" : "#0f172a",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="minutes"
                        name="Minutes"
                        stroke={wsDark ? "#38bdf8" : "#2563eb"}
                        fill="url(#usageFill)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Globe2 className="w-3.5 h-3.5" /> Language pairs (this month)
                </h3>
                <div className={cn("rounded-xl border divide-y divide-border dark:divide-white/10", cardBg)}>
                  {data.langPairs.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No pair data yet this month.</p>
                  ) : (
                    data.langPairs.slice(0, 8).map((lp) => (
                      <div key={lp.pair} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="truncate font-medium">{lp.pair}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {lp.count} ({lp.pct}%)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <p className="text-[10px] text-muted-foreground text-center pb-2">
                Session History below is unchanged — expand filters in a future update.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
