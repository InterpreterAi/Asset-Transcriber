import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useAdminListUsers,
  useAdminCreateUser,
  useAdminUpdateUser,
  useAdminDeleteUser,
  useAdminResetUsage,
  useAdminListFeedback,
  getAdminListUsersQueryKey,
  getAdminListFeedbackQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import {
  Users, Activity, Clock, Plus, Trash2, Power, PowerOff,
  ArrowLeft, Star, LayoutDashboard, RefreshCw, DollarSign,
  Radio, AlertTriangle, TrendingUp, Calendar, Eye, X,
  Globe, Download, ChevronRight, Wifi, WifiOff, BarChart2,
  Languages, MessageSquare, StopCircle, Check,
} from "lucide-react";
import { Button, Card, Input } from "@/components/ui-components";
import { formatMinutes } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
interface AdminStats {
  activeUsers:        number;
  totalUsers:         number;
  dailyActiveUsers:   number;
  minutesToday:       number;
  minutesWeek:        number;
  minutesMonth:       number;
  sonioxCostToday:    number;
  translateCostToday: number;
  totalCostToday:     number;
  mrrEstimate:        number;
  conversionRate:     number;
  avgSessionMin:      number;
  sessionsToday:      number;
  costPerSession:     number;
  payingUsers:        number;
  trialUsers:         number;
  activeSessions: {
    sessionId:       number;
    userId:          number;
    username:        string;
    email:           string | null;
    planType:        string;
    langPair:        string | null;
    startedAt:       string;
    durationSeconds: number;
    hasSnapshot:     boolean;
  }[];
}

interface UserSession {
  id:              number;
  startedAt:       string;
  endedAt:         string | null;
  durationSeconds: number | null;
  langPair:        string | null;
  minutesUsed:     number | null;
  isLive:          boolean;
}

interface SessionSnapshot {
  langA:       string;
  langB:       string;
  micLabel:    string;
  transcript:  string;
  translation: string;
  updatedAt:   number;
}

interface SessionDetail {
  sessionId:       number;
  userId:          number;
  username:        string;
  email:           string | null;
  planType:        string;
  langPair:        string | null;
  startedAt:       string;
  endedAt:         string | null;
  durationSeconds: number;
  isLive:          boolean;
  snapshot:        SessionSnapshot | null;
}

interface LangOption { value: string; label: string; }
interface LangConfigResp {
  allLanguages:     LangOption[];
  enabledLanguages: string[];
  defaultLangA:     string;
  defaultLangB:     string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

function fmtDuration(secs: number | null | undefined) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function lastSeen(date: string | null | undefined) {
  if (!date) return "Never";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function trialBadge(days: number | null | undefined, plan: string) {
  if (plan !== "trial") return (
    <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full capitalize">{plan}</span>
  );
  if (days == null || days <= 0) return (
    <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
  );
  if (days <= 3) return (
    <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" />{days}d left
    </span>
  );
  return <span className="text-xs text-violet-600 font-semibold bg-violet-50 px-2 py-0.5 rounded-full">{days}d left</span>;
}

function sessionStatusBadge(userId: number, lastActivityAt: string | null | undefined, activeSessions: AdminStats["activeSessions"]) {
  const isOnline = activeSessions.some(s => s.userId === userId);
  if (isOnline) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Online
    </span>
  );
  if (!lastActivityAt) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Offline
    </span>
  );
  const minsAgo = (Date.now() - new Date(lastActivityAt).getTime()) / 60000;
  if (minsAgo < 30) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Idle
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Offline
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Admin() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false } });

  const { data: usersData, isLoading: usersLoading } = useAdminListUsers({ query: { enabled: !!me?.isAdmin } });
  const { data: feedbackData } = useAdminListFeedback({ query: { enabled: !!me?.isAdmin } });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json() as Promise<AdminStats>;
    },
    enabled: !!me?.isAdmin,
    refetchInterval: 15_000,
  });

  const createMut = useAdminCreateUser();
  const updateMut = useAdminUpdateUser();
  const deleteMut = useAdminDeleteUser();
  const resetMut  = useAdminResetUsage();

  // ── Main tabs ─────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<"overview" | "users" | "languages" | "feedback">("overview");

  // ── Users tab state ───────────────────────────────────────────────────────
  const [userFilter,  setUserFilter]  = useState<"all" | "trial" | "paying" | "inactive" | "high">("all");
  const [showCreate,  setShowCreate]  = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLimit,    setNewLimit]    = useState(300);
  const [newIsAdmin,  setNewIsAdmin]  = useState(false);

  // ── Session History drawer ─────────────────────────────────────────────────
  const [historyUser,    setHistoryUser]    = useState<{ id: number; username: string } | null>(null);
  const [userSessions,   setUserSessions]   = useState<UserSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = useCallback(async (userId: number, username: string) => {
    setHistoryUser({ id: userId, username });
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/sessions`, { credentials: "include" });
      const data = await res.json() as { sessions: UserSession[] };
      setUserSessions(data.sessions ?? []);
    } catch { setUserSessions([]); }
    setHistoryLoading(false);
  }, []);

  const exportHistory = () => {
    if (!historyUser) return;
    const lines = [
      `Session History — ${historyUser.username}`,
      `Exported: ${new Date().toLocaleString()}`,
      "",
      "No,Date,Start,End,Duration,Language Pair,Minutes",
      ...userSessions.map((s, i) =>
        [
          i + 1,
          format(new Date(s.startedAt), "yyyy-MM-dd"),
          format(new Date(s.startedAt), "HH:mm:ss"),
          s.endedAt ? format(new Date(s.endedAt), "HH:mm:ss") : "—",
          fmtDuration(s.durationSeconds),
          s.langPair ?? "—",
          s.minutesUsed?.toFixed(2) ?? "—",
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `sessions-${historyUser.username}-${format(new Date(), "yyyyMMdd")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── View Session modal ─────────────────────────────────────────────────────
  const [viewingSessionId, setViewingSessionId]  = useState<number | null>(null);
  const [sessionDetail,    setSessionDetail]      = useState<SessionDetail | null>(null);
  const [viewLoading,      setViewLoading]        = useState(false);
  const [terminateLoading, setTerminateLoading]   = useState(false);
  const viewPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSessionDetail = useCallback(async (sessionId: number) => {
    try {
      const res = await fetch(`/api/admin/session/${sessionId}`, { credentials: "include" });
      if (res.ok) setSessionDetail(await res.json() as SessionDetail);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!viewingSessionId) {
      if (viewPollRef.current) { clearInterval(viewPollRef.current); viewPollRef.current = null; }
      setSessionDetail(null);
      return;
    }
    setViewLoading(true);
    fetchSessionDetail(viewingSessionId).then(() => setViewLoading(false));
    viewPollRef.current = setInterval(() => fetchSessionDetail(viewingSessionId), 5_000);
    return () => { if (viewPollRef.current) clearInterval(viewPollRef.current); };
  }, [viewingSessionId, fetchSessionDetail]);

  const terminateSession = async (sessionId: number) => {
    if (!confirm("Terminate this user's session?")) return;
    setTerminateLoading(true);
    try {
      await fetch(`/api/admin/session/${sessionId}/terminate`, {
        method: "POST", credentials: "include",
      });
      setViewingSessionId(null);
      refetchStats();
    } catch { /* ignore */ }
    setTerminateLoading(false);
  };

  // ── Language config ────────────────────────────────────────────────────────
  const [langConfigData,    setLangConfigData]    = useState<LangConfigResp | null>(null);
  const [enabledLangs,      setEnabledLangs]      = useState<Set<string>>(new Set());
  const [defaultLangA,      setDefaultLangA]      = useState("en");
  const [defaultLangB,      setDefaultLangB]      = useState("ar");
  const [langSaveLoading,   setLangSaveLoading]   = useState(false);
  const [langSaveSuccess,   setLangSaveSuccess]   = useState(false);

  useEffect(() => {
    if (mainTab !== "languages" || !me?.isAdmin) return;
    fetch("/api/admin/config/languages", { credentials: "include" })
      .then(r => r.json() as Promise<LangConfigResp>)
      .then(data => {
        setLangConfigData(data);
        setEnabledLangs(new Set(data.enabledLanguages));
        setDefaultLangA(data.defaultLangA);
        setDefaultLangB(data.defaultLangB);
      })
      .catch(() => { /* ignore */ });
  }, [mainTab, me?.isAdmin]);

  const saveLangConfig = async () => {
    setLangSaveLoading(true);
    try {
      await fetch("/api/admin/config/languages", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabledLanguages: Array.from(enabledLangs),
          defaultLangA,
          defaultLangB,
        }),
      });
      setLangSaveSuccess(true);
      setTimeout(() => setLangSaveSuccess(false), 2000);
    } catch { /* ignore */ }
    setLangSaveLoading(false);
  };

  // ── User handlers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!meLoading && !me?.isAdmin) setLocation("/");
  }, [me, meLoading, setLocation]);

  if (meLoading || usersLoading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }
  if (!me?.isAdmin) return null;

  const allUsers  = usersData?.users ?? [];
  const feedback  = feedbackData?.feedback ?? [];
  const stats     = statsData;
  const sessions  = stats?.activeSessions ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMut.mutateAsync({ data: { username: newUsername, password: newPassword, dailyLimitMinutes: newLimit, isAdmin: newIsAdmin } });
    setShowCreate(false); setNewUsername(""); setNewPassword(""); setNewLimit(300); setNewIsAdmin(false);
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
  };

  const toggleStatus = async (id: number, current: boolean) => {
    await updateMut.mutateAsync({ userId: id, data: { isActive: !current } });
    queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
  };

  const resetUsage = async (id: number) => {
    if (confirm("Reset today's usage for this user?")) {
      await resetMut.mutateAsync({ userId: id });
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    }
  };

  const deleteUser = async (id: number) => {
    if (confirm("Permanently delete this user?")) {
      await deleteMut.mutateAsync({ userId: id });
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    }
  };

  const filteredUsers = allUsers.filter(u => {
    if (userFilter === "trial")    return u.planType === "trial";
    if (userFilter === "paying")   return u.planType !== "trial";
    if (userFilter === "inactive") return !u.lastActivityAt || differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7;
    if (userFilter === "high")     return u.minutesUsedToday >= 60;
    return true;
  });

  const filterCounts = {
    all:      allUsers.length,
    trial:    allUsers.filter(u => u.planType === "trial").length,
    paying:   allUsers.filter(u => u.planType !== "trial").length,
    inactive: allUsers.filter(u => !u.lastActivityAt || differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7).length,
    high:     allUsers.filter(u => u.minutesUsedToday >= 60).length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-foreground">
      <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="w-fit text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Workspace
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-semibold tracking-tight">Admin Dashboard</h1>
                <p className="text-muted-foreground text-sm">Monitor usage, manage users, and track costs.</p>
              </div>
            </div>
            {sessions.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                <Radio className="w-3 h-3 animate-pulse" />
                {sessions.length} Live Session{sessions.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-border w-fit">
          {([
            { id: "overview",  label: "Overview",  icon: <BarChart2 className="w-3.5 h-3.5" /> },
            { id: "users",     label: `Users (${allUsers.length})`, icon: <Users className="w-3.5 h-3.5" /> },
            { id: "languages", label: "Languages", icon: <Languages className="w-3.5 h-3.5" /> },
            { id: "feedback",  label: `Feedback (${feedback.length})`, icon: <MessageSquare className="w-3.5 h-3.5" /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${mainTab === tab.id
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-gray-50"}`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {mainTab === "overview" && (
          <div className="space-y-6">

            {/* System Metrics */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Total Users",    value: stats?.totalUsers ?? allUsers.length, icon: <Users className="w-4 h-4" />,     color: "text-primary bg-primary/10" },
                  { label: "Active Now",     value: stats?.activeUsers ?? 0,              icon: <Activity className="w-4 h-4" />,   color: "text-blue-600 bg-blue-50",   sub: "last 5 min" },
                  { label: "Active Today",   value: stats?.dailyActiveUsers ?? 0,         icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-600 bg-emerald-50" },
                  { label: "Min Today",      value: formatMinutes(stats?.minutesToday ?? 0), icon: <Clock className="w-4 h-4" />,   color: "text-orange-600 bg-orange-50" },
                  { label: "Min This Week",  value: formatMinutes(stats?.minutesWeek ?? 0),  icon: <Calendar className="w-4 h-4" />,color: "text-violet-600 bg-violet-50" },
                  { label: "Min This Month", value: formatMinutes(stats?.minutesMonth ?? 0), icon: <Calendar className="w-4 h-4" />,color: "text-pink-600 bg-pink-50" },
                ].map(({ label, value, icon, color, sub }) => (
                  <Card key={label} className="p-4 border-none shadow-sm bg-white">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>{icon}</div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold font-display mt-0.5">{value}</p>
                    {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
                  </Card>
                ))}
              </div>
            </section>

            {/* SaaS Metrics */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">SaaS Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: "MRR Estimate",      value: `$${(stats?.mrrEstimate ?? 0).toFixed(0)}`,   sub: `${stats?.payingUsers ?? 0} paying users`,   color: "text-emerald-600 bg-emerald-50", icon: <DollarSign className="w-4 h-4" /> },
                  { label: "Conversion Rate",   value: `${stats?.conversionRate ?? 0}%`,             sub: `${stats?.trialUsers ?? 0} still on trial`,  color: "text-blue-600 bg-blue-50",      icon: <TrendingUp className="w-4 h-4" /> },
                  { label: "Avg Session",       value: `${stats?.avgSessionMin ?? 0}m`,              sub: "last 30 days",                               color: "text-violet-600 bg-violet-50",  icon: <Clock className="w-4 h-4" /> },
                  { label: "Sessions Today",    value: stats?.sessionsToday ?? 0,                    sub: "all sessions",                               color: "text-orange-600 bg-orange-50",  icon: <Radio className="w-4 h-4" /> },
                  { label: "Cost / Session",    value: fmtMoney(stats?.costPerSession ?? 0),         sub: "today's average",                            color: "text-pink-600 bg-pink-50",      icon: <BarChart2 className="w-4 h-4" /> },
                ].map(({ label, value, sub, color, icon }) => (
                  <Card key={label} className="p-4 border-none shadow-sm bg-white">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>{icon}</div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold font-display mt-0.5">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{sub}</p>
                  </Card>
                ))}
              </div>
            </section>

            {/* Cost Monitoring */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Estimated API Costs Today</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Soniox Transcription", value: fmtMoney(stats?.sonioxCostToday ?? 0),    sub: `${formatMinutes(stats?.minutesToday ?? 0)} @ $0.0025/min`, color: "text-blue-600 bg-blue-50" },
                  { label: "Translation (AI)",      value: fmtMoney(stats?.translateCostToday ?? 0), sub: `${formatMinutes(stats?.minutesToday ?? 0)} @ $0.0002/min`, color: "text-violet-600 bg-violet-50" },
                  { label: "Total API Cost",        value: fmtMoney(stats?.totalCostToday ?? 0),     sub: "Soniox + Translation",                                     color: "text-emerald-600 bg-emerald-50" },
                ].map(({ label, value, sub, color }) => (
                  <Card key={label} className="p-4 border-none shadow-sm bg-white flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-lg font-bold font-display">{value}</p>
                      <p className="text-[10px] text-muted-foreground">{sub}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            {/* Live Sessions */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                Live Sessions ({sessions.length})
              </h2>
              {sessions.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl bg-white">
                  No active sessions right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sessions.map(s => (
                    <Card key={s.sessionId} className="p-4 border-none shadow-sm bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        <span className="font-semibold text-sm truncate">{s.username}</span>
                        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${s.planType === "trial" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>{s.planType}</span>
                      </div>
                      {s.email && <p className="text-xs text-muted-foreground mb-1 truncate">{s.email}</p>}
                      {s.langPair && (
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {s.langPair}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <span>Duration: <span className="font-medium text-foreground">{fmtDuration(s.durationSeconds)}</span></span>
                        <span>{formatDistanceToNow(new Date(s.startedAt), { addSuffix: true })}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => setViewingSessionId(s.sessionId)}
                      >
                        <Eye className="w-3 h-3 mr-1.5" /> View Session
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── USERS TAB ────────────────────────────────────────────────────── */}
        {mainTab === "users" && (
          <Card className="overflow-hidden border-border shadow-sm">
            {/* Filters + New User */}
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-white">
              <div className="flex flex-wrap gap-1.5">
                {(["all", "trial", "paying", "inactive", "high"] as const).map(f => (
                  <button key={f} onClick={() => setUserFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${userFilter === f ? "bg-primary text-white" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"}`}
                  >
                    {f === "all"      && `All (${filterCounts.all})`}
                    {f === "trial"    && `Trial (${filterCounts.trial})`}
                    {f === "paying"   && `Paying (${filterCounts.paying})`}
                    {f === "inactive" && `Inactive (${filterCounts.inactive})`}
                    {f === "high"     && `High Usage (${filterCounts.high})`}
                  </button>
                ))}
              </div>
              <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="h-8 shadow-sm flex-shrink-0">
                <Plus className="w-4 h-4 mr-1.5" /> New User
              </Button>
            </div>

            {/* Create form */}
            {showCreate && (
              <div className="p-5 bg-gray-50 border-b border-border">
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="h-9 bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="h-9 bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Daily Limit (min)</label>
                    <Input type="number" value={newLimit} onChange={e => setNewLimit(Number(e.target.value))} required min={1} className="h-9 bg-white" />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <input type="checkbox" id="isAdmin" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} className="w-4 h-4 rounded" />
                    <label htmlFor="isAdmin" className="text-sm font-medium cursor-pointer">Admin</label>
                  </div>
                  <Button type="submit" isLoading={createMut.isPending} className="h-9">Create</Button>
                </form>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-sm text-left min-w-[860px]">
                <thead className="bg-gray-50/80 text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Session</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Today</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Last Seen</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map(u => {
                    const trialDays = u.trialDaysRemaining as number | null | undefined;
                    const todayPct  = Math.min(100, (u.minutesUsedToday / u.dailyLimitMinutes) * 100);
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                        onClick={() => openHistory(u.id, u.username)}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            {u.username}
                            {u.isAdmin && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase font-bold">Admin</span>}
                          </div>
                          {u.email && <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{u.email}</div>}
                          <div className="text-[10px] text-muted-foreground">Joined {format(new Date(u.createdAt), "MMM d, yyyy")}</div>
                        </td>

                        {/* Session Status */}
                        <td className="px-4 py-3">
                          {sessionStatusBadge(u.id, u.lastActivityAt, sessions)}
                        </td>

                        {/* Account Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-green-500" : "bg-red-500"}`} />
                            {u.isActive ? "Active" : "Disabled"}
                          </span>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3">{trialBadge(trialDays, u.planType)}</td>

                        {/* Today */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${todayPct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatMinutes(u.minutesUsedToday)} / {formatMinutes(u.dailyLimitMinutes)}
                            </span>
                          </div>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatMinutes(u.totalMinutesUsed)}
                          <span className="text-gray-400 text-[10px]"> ({u.totalSessions})</span>
                        </td>

                        {/* Last seen */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {lastSeen(u.lastActivityAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <Button variant="outline" size="sm" onClick={() => resetUsage(u.id)} title="Reset Usage" className="h-7 w-7 p-0">
                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleStatus(u.id, u.isActive)} title={u.isActive ? "Disable" : "Enable"} className="h-7 w-7 p-0">
                            {u.isActive ? <PowerOff className="w-3 h-3 text-amber-500" /> : <Power className="w-3 h-3 text-green-500" />}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => deleteUser(u.id)} className="h-7 w-7 p-0 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive text-destructive/70">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground bg-white">
                        No users match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-gray-50/50 border-t border-border text-[11px] text-muted-foreground">
              Click a row to view session history
            </div>
          </Card>
        )}

        {/* ── LANGUAGES TAB ────────────────────────────────────────────────── */}
        {mainTab === "languages" && (
          <div className="space-y-5">
            <Card className="p-6 border-none shadow-sm bg-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-base">Enabled Languages</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Toggle which languages are available in the workspace. Changes apply to all users.</p>
                </div>
                <Button onClick={saveLangConfig} isLoading={langSaveLoading} size="sm" className="flex-shrink-0">
                  {langSaveSuccess ? <><Check className="w-3.5 h-3.5 mr-1.5" />Saved!</> : "Save Changes"}
                </Button>
              </div>

              {/* Default pair selectors */}
              <div className="mb-5 p-4 bg-gray-50 rounded-xl flex flex-wrap gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Language A</label>
                  <select
                    value={defaultLangA}
                    onChange={e => setDefaultLangA(e.target.value)}
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {(langConfigData?.allLanguages ?? []).filter(l => enabledLangs.has(l.value)).map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Language B</label>
                  <select
                    value={defaultLangB}
                    onChange={e => setDefaultLangB(e.target.value)}
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {(langConfigData?.allLanguages ?? []).filter(l => enabledLangs.has(l.value) && l.value !== defaultLangA).map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <span className="text-sm text-muted-foreground">
                    Default pair: <span className="font-medium text-foreground">{defaultLangA} ↔ {defaultLangB}</span>
                  </span>
                </div>
              </div>

              {/* Language grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {(langConfigData?.allLanguages ?? []).map(lang => {
                  const enabled = enabledLangs.has(lang.value);
                  const isDefault = lang.value === defaultLangA || lang.value === defaultLangB;
                  return (
                    <button
                      key={lang.value}
                      disabled={isDefault}
                      onClick={() => {
                        const next = new Set(enabledLangs);
                        if (enabled) next.delete(lang.value);
                        else next.add(lang.value);
                        setEnabledLangs(next);
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${
                        enabled
                          ? "border-primary/30 bg-primary/5 text-foreground"
                          : "border-border bg-white text-muted-foreground hover:border-gray-300"
                      } ${isDefault ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:shadow-sm"}`}
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all ${enabled ? "bg-primary border-primary" : "border-gray-300"}`}>
                        {enabled && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="truncate text-xs font-medium">{lang.label}</span>
                      {isDefault && <span className="ml-auto text-[9px] text-primary font-bold uppercase">default</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {enabledLangs.size} of {langConfigData?.allLanguages?.length ?? 0} languages enabled. Note: changes are in-memory and reset on server restart.
              </p>
            </Card>
          </div>
        )}

        {/* ── FEEDBACK TAB ─────────────────────────────────────────────────── */}
        {mainTab === "feedback" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {feedback.map(item => (
              <Card key={item.id} className="p-5 border-none shadow-sm bg-white">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">{item.username}</h3>
                    <p className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-3.5 h-3.5 ${s <= item.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                    ))}
                  </div>
                </div>
                {item.comment
                  ? <p className="text-sm text-foreground/80 italic">"{item.comment}"</p>
                  : <p className="text-sm text-muted-foreground italic">No comment provided.</p>
                }
              </Card>
            ))}
            {feedback.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground border border-dashed border-border rounded-2xl bg-white">
                No feedback received yet.
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── VIEW SESSION MODAL ───────────────────────────────────────────── */}
      {viewingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setViewingSessionId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">
                    {viewLoading ? "Loading…" : sessionDetail ? `Session #${sessionDetail.sessionId} — ${sessionDetail.username}` : "View Session"}
                  </h3>
                  {sessionDetail && (
                    <p className="text-xs text-muted-foreground">
                      {sessionDetail.email ?? ""} · {sessionDetail.planType} plan · {fmtDuration(sessionDetail.durationSeconds)}
                      {sessionDetail.isLive && " · "}{sessionDetail.isLive && <span className="text-red-500 font-medium">Live</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {sessionDetail?.isLive && (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={terminateLoading}
                    onClick={() => terminateSession(viewingSessionId)}
                    className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  >
                    <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Terminate
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setViewingSessionId(null)} className="h-8 w-8 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Session metadata strip */}
            {sessionDetail?.snapshot && (
              <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 bg-gray-50 border-b border-border text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> {sessionDetail.snapshot.langA} ↔ {sessionDetail.snapshot.langB}</span>
                <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {sessionDetail.snapshot.micLabel}</span>
                <span className="flex items-center gap-1 ml-auto text-[10px]">
                  Updated {formatDistanceToNow(new Date(sessionDetail.snapshot.updatedAt), { addSuffix: true })}
                </span>
              </div>
            )}

            {/* Transcript / Translation columns */}
            <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-border">
              <div className="overflow-y-auto p-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Transcript</p>
                {viewLoading ? (
                  <div className="text-sm text-muted-foreground italic">Loading…</div>
                ) : sessionDetail?.snapshot?.transcript ? (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{sessionDetail.snapshot.transcript}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No transcript yet. Snap is pushed every 5 s once speech is detected.</p>
                )}
              </div>
              <div className="overflow-y-auto p-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Translation</p>
                {viewLoading ? (
                  <div className="text-sm text-muted-foreground italic">Loading…</div>
                ) : sessionDetail?.snapshot?.translation ? (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" dir="auto">{sessionDetail.snapshot.translation}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Translation will appear here as segments are finalized.</p>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-3 border-t border-border bg-gray-50 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {sessionDetail?.isLive ? "Auto-refreshing every 5 s" : "Session ended"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Started {sessionDetail ? format(new Date(sessionDetail.startedAt), "MMM d, HH:mm") : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION HISTORY DRAWER ────────────────────────────────────────── */}
      {historyUser && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setHistoryUser(null)}>
          {/* Backdrop */}
          <div className="flex-1 bg-black/20 backdrop-blur-sm" />
          {/* Panel */}
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Session History
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{historyUser.username} · {userSessions.length} session{userSessions.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {userSessions.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportHistory} className="h-8 text-xs">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setHistoryUser(null)} className="h-8 w-8 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" />
                </div>
              ) : userSessions.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">No sessions found for this user.</div>
              ) : (
                <div className="divide-y divide-border">
                  {userSessions.map(s => (
                    <div key={s.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {format(new Date(s.startedAt), "MMM d, yyyy")}
                          {s.isLive && <span className="ml-2 text-[10px] text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded-full">Live</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">#{s.id}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{format(new Date(s.startedAt), "HH:mm")} → {s.endedAt ? format(new Date(s.endedAt), "HH:mm") : "ongoing"}</span>
                        <span className="font-medium text-foreground">{fmtDuration(s.durationSeconds)}</span>
                        {s.langPair && (
                          <span className="flex items-center gap-0.5">
                            <Globe className="w-3 h-3" /> {s.langPair}
                          </span>
                        )}
                      </div>
                      {s.minutesUsed != null && (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {s.minutesUsed.toFixed(1)} minutes used · ~${(s.minutesUsed * 0.0027).toFixed(4)} cost
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div className="p-4 border-t border-border bg-gray-50">
              <p className="text-[11px] text-muted-foreground">
                Showing last 100 sessions.
                {userSessions.length > 0 && ` Total: ${userSessions.filter(s => s.minutesUsed).reduce((sum, s) => sum + (s.minutesUsed ?? 0), 0).toFixed(1)} min`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
