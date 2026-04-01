import { useEffect, useState } from "react";
import { History, Clock, Calendar, BarChart2 } from "lucide-react";

type SessionRow = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  langPair: string | null;
};

type Stats = {
  sessions: SessionRow[];
  totalSessions: number;
  totalMinutes: number;
  todaySessions: number;
  todayMinutes: number;
  avgSessionMinutes: number;
  weekSessions: number;
  weekMinutes: number;
};

function fmt(min: number) {
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
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
  return `${Math.round(secs / 60)} min`;
}

export function SessionHistoryPanel({ refreshKey }: { refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.BASE_URL}api/transcription/sessions?limit=10`)
      .then(r => r.json())
      .then((d: Stats) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div className="flex flex-col min-h-0 overflow-hidden bg-white rounded-xl border border-border shadow-sm">
      {/* Header */}
      <div className="h-10 border-b border-border bg-muted/20 flex items-center gap-2 px-3 shrink-0">
        <History className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session History</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <span className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-2.5 space-y-3">

            {/* Today stats */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Today</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div className="bg-blue-50 rounded-lg p-1.5 text-center">
                  <p className="text-sm font-bold text-blue-700">{stats?.todaySessions ?? 0}</p>
                  <p className="text-[8px] text-blue-500 font-medium leading-tight">Sessions</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-1.5 text-center">
                  <p className="text-sm font-bold text-violet-700">{fmt(stats?.todayMinutes ?? 0)}</p>
                  <p className="text-[8px] text-violet-500 font-medium leading-tight">Total</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-1.5 text-center">
                  <p className="text-sm font-bold text-emerald-700">{fmt(stats?.avgSessionMinutes ?? 0)}</p>
                  <p className="text-[8px] text-emerald-500 font-medium leading-tight">Avg</p>
                </div>
              </div>
            </div>

            {/* Weekly stats */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <BarChart2 className="w-3 h-3 text-muted-foreground" />
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">This Week</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-muted/50 rounded-lg p-1.5 text-center">
                  <p className="text-sm font-bold text-foreground">{stats?.weekSessions ?? 0}</p>
                  <p className="text-[8px] text-muted-foreground font-medium">Sessions</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-1.5 text-center">
                  <p className="text-sm font-bold text-foreground">{fmt(stats?.weekMinutes ?? 0)}</p>
                  <p className="text-[8px] text-muted-foreground font-medium">Minutes</p>
                </div>
              </div>
            </div>

            {/* Recent sessions */}
            {(stats?.sessions?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Recent</span>
                </div>
                <div className="space-y-1">
                  {(stats?.sessions ?? []).map(s => {
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
            )}

            {(stats?.sessions?.length ?? 0) === 0 && !loading && (
              <p className="text-[10px] text-muted-foreground text-center py-2">No sessions yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
