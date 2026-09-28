import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, ChevronRight, Copy, Fingerprint, Mail, MapPin, Monitor, RefreshCw, RotateCcw, X } from "lucide-react";
import { Card } from "@/components/ui-components";

type Signal = { key: string; points: number; text: string };
type AccountBrief = {
  id: number;
  username: string;
  email: string | null;
  planType: string;
  isActive: boolean;
  createdAt: string;
  trialEndsAt: string | null;
  totalMinutes: number;
  sessionCount: number;
  topLangPair: string | null;
  locations: string[];
  devices: string[];
};
type SecurityReport = {
  key: string;
  olderUserId: number;
  newerUserId: number;
  score: number;
  confidence: "high" | "medium" | "low";
  summary: string;
  signals: Signal[];
  counterSignals: Signal[];
  timeline: { at: string; userId: number | null; text: string }[];
  innocentExplanation: string;
  recommendation: string;
  draftReply: string;
  accounts: [AccountBrief, AccountBrief];
};
type AlertRow = {
  id: number;
  status: "open" | "dismissed" | "handled";
  score: number;
  confidence: "high" | "medium" | "low";
  firstDetectedAt: string;
  updatedAt: string;
  emailedAt: string | null;
  resolvedAt: string | null;
  report: SecurityReport;
  current: Record<string, { isActive: boolean | null; planType: string | null }>;
};
type AlertsResponse = {
  alerts: AlertRow[];
  counts: { openHigh: number; openMedium: number; openLow: number; dismissed: number; handled: number };
  lastRun: { ranAt: string; durationMs: number; cases: number; newAlerts: number; emailed: number } | null;
};

type StatusFilter = "open" | "handled" | "dismissed" | "all";

const CONFIDENCE_TONE: Record<AlertRow["confidence"], string> = {
  high: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/12 dark:text-red-200 dark:border-red-500/30",
  medium: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/12 dark:text-amber-200 dark:border-amber-500/30",
  low: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/12 dark:text-blue-200 dark:border-blue-500/30",
};

function fmt(ts: string | null | undefined, pattern = "MMM d, HH:mm"): string {
  if (!ts) return "—";
  try {
    return format(new Date(ts), pattern);
  } catch {
    return ts;
  }
}

function AccountCard({
  a,
  current,
  onOpenUser,
}: {
  a: AccountBrief;
  current?: { isActive: boolean | null; planType: string | null };
  onOpenUser: (id: number) => void;
}) {
  const isActive = current?.isActive ?? a.isActive;
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs space-y-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-semibold truncate">#{a.id} {a.email ?? a.username}</span>
        <span
          className={`ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            isActive
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/12 dark:text-emerald-200 dark:border-emerald-500/30"
              : "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:border-white/10"
          }`}
        >
          {isActive ? "Active" : "Disabled"}
        </span>
      </div>
      <p className="text-muted-foreground">
        {current?.planType ?? a.planType} · joined {fmt(a.createdAt, "MMM d, yyyy")}
        {a.trialEndsAt ? ` · trial ends ${fmt(a.trialEndsAt, "MMM d")}` : ""}
      </p>
      <p className="text-muted-foreground">
        {a.sessionCount} sessions · {Math.round(a.totalMinutes / 6) / 10} h used{a.topLangPair ? ` · ${a.topLangPair}` : ""}
      </p>
      {a.locations.length > 0 && (
        <p className="text-muted-foreground truncate flex items-center gap-1" title={a.locations.join("\n")}>
          <MapPin className="w-3 h-3 shrink-0" /> {a.locations.join(" · ")}
        </p>
      )}
      {a.devices.length > 0 && (
        <p className="text-muted-foreground truncate flex items-center gap-1" title={a.devices.join("\n")}>
          <Monitor className="w-3 h-3 shrink-0" /> {a.devices.join(" · ")}
        </p>
      )}
      <button
        type="button"
        className="mt-1 text-[11px] font-medium px-2 py-0.5 rounded border border-border hover:bg-muted"
        onClick={() => onOpenUser(a.id)}
      >
        Open user
      </button>
    </div>
  );
}

function AlertCard({
  alert,
  expanded,
  onToggle,
  onOpenUser,
  onSetStatus,
  busy,
}: {
  alert: AlertRow;
  expanded: boolean;
  onToggle: () => void;
  onOpenUser: (id: number) => void;
  onSetStatus: (status: AlertRow["status"]) => void;
  busy: boolean;
}) {
  const r = alert.report;
  const [copied, setCopied] = useState(false);
  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(r.draftReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={onToggle} className="w-full text-left flex items-start gap-2">
        {expanded ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CONFIDENCE_TONE[alert.confidence]}`}>
              {alert.confidence.toUpperCase()} · {alert.score}
            </span>
            {alert.status !== "open" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                {alert.status === "handled" ? "Handled" : "Dismissed"}
              </span>
            )}
            {alert.emailedAt && (
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1" title={`Emailed ${fmt(alert.emailedAt)}`}>
                <Mail className="w-3 h-3" /> emailed
              </span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto">
              found {formatDistanceToNow(new Date(alert.firstDetectedAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm mt-1">{r.summary}</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-6 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {r.accounts.map((a) => (
              <AccountCard key={a.id} a={a} current={alert.current[String(a.id)]} onOpenUser={onOpenUser} />
            ))}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Evidence</h4>
            <ul className="space-y-1">
              {r.signals.map((s) => (
                <li key={s.key} className="text-sm flex gap-2">
                  <span className="shrink-0 w-9 text-right font-mono text-xs text-red-700 dark:text-red-300 pt-0.5">+{s.points}</span>
                  <span>{s.text}</span>
                </li>
              ))}
              {r.counterSignals.map((s) => (
                <li key={s.key} className="text-sm flex gap-2">
                  <span className="shrink-0 w-9 text-right font-mono text-xs text-emerald-700 dark:text-emerald-300 pt-0.5">{s.points}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {r.timeline.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Timeline (your local time)</h4>
              <div className="rounded-lg border border-border divide-y divide-border text-xs">
                {r.timeline.map((t, i) => (
                  <div
                    key={`${t.at}-${i}`}
                    className={`flex gap-3 px-3 py-1.5 ${t.userId === r.newerUserId ? "bg-amber-50/60 dark:bg-amber-500/[0.06]" : ""}`}
                  >
                    <span className="shrink-0 w-24 font-mono text-muted-foreground">{fmt(t.at)}</span>
                    <span>{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Innocent explanation</h4>
              <p className="text-sm">{r.innocentExplanation}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">What to do</h4>
              <p className="text-sm">{r.recommendation}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested reply if they write in</h4>
              <button
                type="button"
                onClick={() => void copyReply()}
                className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded border border-border hover:bg-muted inline-flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm rounded-lg border border-border bg-muted/20 px-3 py-2 font-sans">{r.draftReply}</pre>
          </div>

          <div className="flex flex-wrap gap-2">
            {alert.status === "open" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSetStatus("handled")}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-500/10 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> Mark handled
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSetStatus("dismissed")}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Dismiss (not the same person)
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetStatus("open")}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSecurity({ onOpenUser }: { onOpenUser: (userId: number) => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [includeLow, setIncludeLow] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const queryKey = ["admin-security-alerts", status, includeLow] as const;
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const qs = new URLSearchParams({ status, ...(includeLow ? { includeLow: "1" } : {}) });
      const res = await fetch(`/api/admin/security/alerts?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load security alerts");
      return res.json() as Promise<AlertsResponse>;
    },
    refetchInterval: 60_000,
    staleTime: 10_000,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-security-alerts"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-security-counts"] });
  };

  const setAlertStatus = async (id: number, next: AlertRow["status"]) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/security/alerts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      refreshAll();
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/admin/security/run", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Scan failed");
      refreshAll();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = data?.counts;
  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border shadow-sm bg-card">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Fingerprint className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Security Watch</h3>
            <p className="text-xs text-muted-foreground">
              Every 15 minutes, compares accounts by location, VPN use, device, timing and trial behaviour to find people with more than one
              account. Nothing is changed automatically. High-confidence cases are emailed to you.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {counts?.openHigh ?? 0} high · {counts?.openMedium ?? 0} medium open · {counts?.handled ?? 0} handled · {counts?.dismissed ?? 0} dismissed
              {data?.lastRun ? ` · last check ${formatDistanceToNow(new Date(data.lastRun.ranAt), { addSuffix: true })}` : ""}
              {isFetching && !isLoading ? " · updating…" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} /> {running ? "Checking…" : "Run check now"}
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-2 text-xs">
          {(["open", "handled", "dismissed", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-md font-medium capitalize ${status === s ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {s}
            </button>
          ))}
          <label className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeLow} onChange={(e) => setIncludeLow(e.target.checked)} />
            Show weak signals{counts?.openLow ? ` (${counts.openLow})` : ""}
          </label>
        </div>

        {runError && <div className="px-4 py-2 text-xs text-red-700 dark:text-red-300 border-b border-border">{runError}</div>}

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-700 dark:text-red-300">Could not load security alerts.</div>
        ) : alerts.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {status === "open" ? "No suspicious account links right now." : "Nothing here."}
            {!data?.lastRun && status === "open" ? " The first automatic check runs a few minutes after each deploy." : ""}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                expanded={expanded.has(a.id)}
                onToggle={() => toggle(a.id)}
                onOpenUser={onOpenUser}
                onSetStatus={(next) => void setAlertStatus(a.id, next)}
                busy={busyId === a.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
