import { useEffect, useState } from "react";
import { History, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionRow = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  langPair: string | null;
};

type Stats = {
  sessions: SessionRow[];
  periodSessions: number;
  periodMinutes: number;
  periodAvgMinutes: number;
  totalSessions: number;
  totalMinutes: number;
};

type Period = "today" | "week" | "month" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week",  label: "Week"  },
  { value: "month", label: "Month" },
  { value: "all",   label: "All"   },
];

const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
  all:   "All Time",
};

function fmt(min: number) {
  if (min < 1) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDur(secs: number | null) {
  if (secs == null) return "—";
  if (secs < 60) return `${secs}s`;
  return `${Math.round(secs / 60)}m`;
}

export function SessionHistoryPanel({ refreshKey, className }: { refreshKey?: number; className?: string }) {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState<Period>("today");

  useEffect(() => {
    setLoading(true);
    const base = import.meta.env.BASE_URL;
    fetch(`${base}api/transcription/sessions?limit=20&period=${period}`, { credentials: "include" })
      .then(r => r.json())
      .then((d: Stats) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, period]);

  const sessions = stats?.sessions ?? [];

  return (
    <div
      className={cn(
        "flex flex-col bg-card rounded-xl border border-border shadow-sm overflow-hidden h-full",
        className,
      )}
    >

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border shrink-0">
        <History className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Session History
        </span>
      </div>

      {/* Period tabs */}
      <div className="flex border-b border-border shrink-0">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
              period === value
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border shrink-0">
        <div className="py-2 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-sky-500 leading-none">
            {loading ? "·" : (stats?.periodSessions ?? 0)}
          </span>
          <span className="text-[10px] text-sky-400/90 font-medium mt-0.5">Sessions</span>
        </div>
        <div className="py-2 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-violet-500 leading-none">
            {loading ? "·" : fmt(stats?.periodMinutes ?? 0)}
          </span>
          <span className="text-[10px] text-violet-400/90 font-medium mt-0.5">Total</span>
        </div>
        <div className="py-2 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-emerald-500 leading-none">
            {loading ? "·" : fmt(stats?.periodAvgMinutes ?? 0)}
          </span>
          <span className="text-[10px] text-emerald-400/90 font-medium mt-0.5">Avg</span>
        </div>
      </div>

      {/* Scrollable session list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1.5 text-center px-3">
            <Clock className="w-6 h-6 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/50">
              No sessions {period === "all" ? "yet" : `for ${PERIOD_LABEL[period].toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {sessions.map(s => {
              const parts = s.langPair ? s.langPair.split("→") : [];
              return (
                <div key={s.id} className="px-3 py-2 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {fmtDate(s.startedAt)}
                      <span className="font-normal text-muted-foreground ml-1">{fmtTime(s.startedAt)}</span>
                    </span>
                    <span className="text-xs font-mono font-semibold text-foreground">
                      {fmtDur(s.durationSeconds)}
                    </span>
                  </div>
                  {parts.length === 2 && (
                    <p className="text-[10px] text-primary/80 mt-0.5">
                      {parts[0]!.trim()} → {parts[1]!.trim()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
