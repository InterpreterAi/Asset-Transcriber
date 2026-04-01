import { useEffect, useState } from "react";
import { History, Clock, BarChart2, Calendar, ChevronDown } from "lucide-react";

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
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");

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
    <div className="flex flex-col min-h-0 overflow-hidden bg-white rounded-xl border border-border shadow-sm">

      {/* Header */}
      <div className="h-10 border-b border-border bg-muted/20 flex items-center gap-2 px-3 shrink-0">
        <History className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Session History
        </span>
        {/* Period label */}
        <span className="text-[9px] text-muted-foreground/50 hidden sm:block">{PERIOD_LABEL[period]}</span>
      </div>

      {/* Date filter tabs */}
      <div className="flex border-b border-border shrink-0">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={`flex-1 py-1.5 text-[9.5px] font-semibold transition-colors ${
              period === value
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <span className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-2.5 space-y-3">

            {/* Stats cards for selected period */}
            <div className="grid grid-cols-3 gap-1">
              <div className="bg-blue-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-bold text-blue-700 leading-none">
                  {stats?.periodSessions ?? 0}
                </p>
                <p className="text-[8px] text-blue-500 font-medium leading-tight mt-0.5">Sessions</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-bold text-violet-700 leading-none">
                  {fmt(stats?.periodMinutes ?? 0)}
                </p>
                <p className="text-[8px] text-violet-500 font-medium leading-tight mt-0.5">Total</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-bold text-emerald-700 leading-none">
                  {fmt(stats?.periodAvgMinutes ?? 0)}
                </p>
                <p className="text-[8px] text-emerald-500 font-medium leading-tight mt-0.5">Avg</p>
              </div>
            </div>

            {/* Sessions list */}
            {sessions.length > 0 ? (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    {PERIOD_LABEL[period]}
                  </span>
                </div>
                <div className="space-y-1">
                  {sessions.map(s => {
                    const [src, tgt] = s.langPair ? s.langPair.split("→") : [null, null];
                    return (
                      <div
                        key={s.id}
                        className="border border-border/50 rounded-lg px-2 py-1.5 bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-foreground">
                            {fmtDate(s.startedAt)}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {fmtDur(s.durationSeconds)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-muted-foreground">
                            {fmtTime(s.startedAt)}
                          </span>
                          {src && tgt ? (
                            <span className="text-[9px] text-primary font-medium">
                              {src.trim()} ↔ {tgt.trim()}
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/50 italic">No translation</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <Clock className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground/20" />
                <p className="text-[10px] text-muted-foreground/60">
                  No sessions {period === "all" ? "yet" : `this ${PERIOD_LABEL[period].toLowerCase().replace("this ", "")}`}
                </p>
              </div>
            )}

            {/* All-time footer totals */}
            {period !== "all" && (stats?.totalSessions ?? 0) > 0 && (
              <div className="border-t border-border/40 pt-2">
                <div className="flex items-center gap-1 mb-1">
                  <BarChart2 className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">All time</span>
                </div>
                <div className="flex gap-1.5 text-center">
                  <div className="flex-1 rounded-md bg-muted/20 border border-border/30 py-1">
                    <p className="text-[11px] font-bold text-foreground">{stats?.totalSessions ?? 0}</p>
                    <p className="text-[8px] text-muted-foreground/60">Sessions</p>
                  </div>
                  <div className="flex-1 rounded-md bg-muted/20 border border-border/30 py-1">
                    <p className="text-[11px] font-bold text-foreground">{fmt(stats?.totalMinutes ?? 0)}</p>
                    <p className="text-[8px] text-muted-foreground/60">Total</p>
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
