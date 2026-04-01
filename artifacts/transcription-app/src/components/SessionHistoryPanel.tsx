import { useEffect, useState } from "react";
import { History, Clock, BarChart2, Calendar } from "lucide-react";

type SessionRow = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  langPair: string | null;
};

type Stats = {
  sessions: SessionRow[];
  period: string;
  periodSessions: number;
  periodMinutes: number;
  periodAvgMinutes: number;
  totalSessions: number;
  totalMinutes: number;
  todaySessions: number;
  todayMinutes: number;
  avgSessionMinutes: number;
  weekSessions: number;
  weekMinutes: number;
};

type Period = "today" | "week" | "month" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week",  label: "Week"  },
  { value: "month", label: "Month" },
  { value: "all",   label: "All"   },
];

function fmt(min: number) {
  if (min < 1) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

function fmtDur(secs: number | null) {
  if (secs == null) return "—";
  if (secs < 60) return `${secs}s`;
  return `${Math.round(secs / 60)}m`;
}

const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
  all:   "All Time",
};

export function SessionHistoryPanel({ refreshKey }: { refreshKey?: number }) {
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white rounded-xl border border-border shadow-sm">

      {/* ── Header ── */}
      <div className="border-b border-border bg-muted/20 shrink-0">

        {/* Row 1 — Title */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <History className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
            Session History
          </span>
          <span className="text-[10px] text-muted-foreground/50">{PERIOD_LABEL[period]}</span>
        </div>

        {/* Row 2 — Period tabs */}
        <div className="flex border-t border-border/40">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                period === value
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <span className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-3 space-y-3">

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                <p className="text-xl font-bold text-blue-700 leading-none">
                  {stats?.periodSessions ?? 0}
                </p>
                <p className="text-xs text-blue-500 font-medium mt-1">Sessions</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-2.5 text-center">
                <p className="text-xl font-bold text-violet-700 leading-none">
                  {fmt(stats?.periodMinutes ?? 0)}
                </p>
                <p className="text-xs text-violet-500 font-medium mt-1">Total</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                <p className="text-xl font-bold text-emerald-700 leading-none">
                  {fmt(stats?.periodAvgMinutes ?? 0)}
                </p>
                <p className="text-xs text-emerald-500 font-medium mt-1">Avg</p>
              </div>
            </div>

            {/* Session list */}
            {sessions.length > 0 ? (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {PERIOD_LABEL[period]}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {sessions.map(s => {
                    const [src, tgt] = s.langPair ? s.langPair.split("→") : [null, null];
                    return (
                      <div
                        key={s.id}
                        className="border border-border/50 rounded-lg px-3 py-2 bg-muted/10 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {fmtDate(s.startedAt)}
                          </span>
                          <span className="text-sm font-mono font-semibold text-foreground">
                            {fmtDur(s.durationSeconds)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {fmtTime(s.startedAt)}
                          </span>
                          {src && tgt ? (
                            <span className="text-xs text-primary font-medium">
                              {src.trim()} → {tgt.trim()}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50 italic">No translation</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/60">
                  No sessions {period === "all" ? "yet" : `this ${PERIOD_LABEL[period].toLowerCase().replace("this ", "")}`}
                </p>
              </div>
            )}

            {/* All-time footer totals */}
            {period !== "all" && (stats?.totalSessions ?? 0) > 0 && (
              <div className="border-t border-border/40 pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart2 className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">
                    All time
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-md bg-muted/20 border border-border/30 py-2 text-center">
                    <p className="text-sm font-bold text-foreground">{stats?.totalSessions ?? 0}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Sessions</p>
                  </div>
                  <div className="flex-1 rounded-md bg-muted/20 border border-border/30 py-2 text-center">
                    <p className="text-sm font-bold text-foreground">{fmt(stats?.totalMinutes ?? 0)}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Total time</p>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
