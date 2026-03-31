import { useState, useEffect } from "react";
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
  Radio, AlertTriangle, TrendingUp, Calendar,
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
  activeSessions: {
    sessionId:       number;
    userId:          number;
    username:        string;
    email:           string | null;
    planType:        string;
    startedAt:       string;
    durationSeconds: number;
  }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function lastSeen(date: string | null | undefined) {
  if (!date) return "Never";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function inactiveDays(date: string | null | undefined) {
  if (!date) return "—";
  const d = differenceInDays(new Date(), new Date(date));
  return d === 0 ? "Today" : `${d}d ago`;
}

function trialBadge(days: number | null | undefined, plan: string) {
  if (plan !== "trial") return <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">{plan}</span>;
  if (days == null || days <= 0) return <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">Expired</span>;
  if (days <= 3) return <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{days}d left</span>;
  return <span className="text-xs text-violet-600 font-semibold bg-violet-50 px-2 py-0.5 rounded-full">{days}d left</span>;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe({ query: { retry: false } });

  const { data: usersData, isLoading: usersLoading } = useAdminListUsers({ query: { enabled: !!me?.isAdmin } });
  const { data: feedbackData } = useAdminListFeedback({ query: { enabled: !!me?.isAdmin } });

  const { data: statsData } = useQuery({
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

  const [activeTab,   setActiveTab]   = useState<"users" | "feedback">("users");
  const [userFilter,  setUserFilter]  = useState<"all" | "trial" | "paying" | "inactive" | "high">("all");
  const [showCreate,  setShowCreate]  = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLimit,    setNewLimit]    = useState(300);
  const [newIsAdmin,  setNewIsAdmin]  = useState(false);

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

  const allUsers    = usersData?.users ?? [];
  const feedback    = feedbackData?.feedback ?? [];
  const stats       = statsData;

  // ── User filter logic ─────────────────────────────────────────────────────
  const filteredUsers = allUsers.filter(u => {
    if (userFilter === "trial")    return u.planType === "trial";
    if (userFilter === "paying")   return u.planType !== "trial";
    if (userFilter === "inactive") {
      if (!u.lastActivityAt) return true;
      return differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7;
    }
    if (userFilter === "high")     return u.minutesUsedToday >= 60;
    return true;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
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

  // ── Filter counts ─────────────────────────────────────────────────────────
  const filterCounts = {
    all:      allUsers.length,
    trial:    allUsers.filter(u => u.planType === "trial").length,
    paying:   allUsers.filter(u => u.planType !== "trial").length,
    inactive: allUsers.filter(u => !u.lastActivityAt || differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7).length,
    high:     allUsers.filter(u => u.minutesUsedToday >= 60).length,
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-4 lg:p-8 text-foreground">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="w-fit text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Workspace
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-semibold tracking-tight">Admin Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Monitor usage, manage users, and track costs.</p>
            </div>
          </div>
        </div>

        {/* ── System Metrics ──────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total Users",    value: stats?.totalUsers        ?? allUsers.length, icon: <Users className="w-4 h-4" />,        color: "text-primary bg-primary/10" },
              { label: "Active Now",     value: stats?.activeUsers       ?? 0,               icon: <Activity className="w-4 h-4" />,      color: "text-blue-600 bg-blue-50",   sub: "last 5 min" },
              { label: "Active Today",   value: stats?.dailyActiveUsers  ?? 0,               icon: <TrendingUp className="w-4 h-4" />,    color: "text-emerald-600 bg-emerald-50" },
              { label: "Min Today",      value: formatMinutes(stats?.minutesToday  ?? 0),   icon: <Clock className="w-4 h-4" />,         color: "text-orange-600 bg-orange-50" },
              { label: "Min This Week",  value: formatMinutes(stats?.minutesWeek   ?? 0),   icon: <Calendar className="w-4 h-4" />,      color: "text-violet-600 bg-violet-50" },
              { label: "Min This Month", value: formatMinutes(stats?.minutesMonth  ?? 0),   icon: <Calendar className="w-4 h-4" />,      color: "text-pink-600 bg-pink-50" },
            ].map(({ label, value, icon, color, sub }) => (
              <Card key={label} className="p-4 border-none shadow-sm bg-white">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>{icon}</div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold font-display mt-0.5">{value}</p>
                {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
              </Card>
            ))}
          </div>
        </div>

        {/* ── Cost Monitoring ─────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Estimated API Costs Today</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Soniox Transcription", value: fmtMoney(stats?.sonioxCostToday    ?? 0), sub: `${formatMinutes(stats?.minutesToday ?? 0)} @ $0.0025/min`, color: "text-blue-600 bg-blue-50" },
              { label: "Translation (AI)",      value: fmtMoney(stats?.translateCostToday ?? 0), sub: `${formatMinutes(stats?.minutesToday ?? 0)} @ $0.0002/min`, color: "text-violet-600 bg-violet-50" },
              { label: "Total API Cost",        value: fmtMoney(stats?.totalCostToday     ?? 0), sub: "Soniox + Translation",                                     color: "text-emerald-600 bg-emerald-50" },
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
        </div>

        {/* ── Active Sessions ──────────────────────────────────────────────── */}
        {(stats?.activeSessions?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
              Live Sessions ({stats!.activeSessions.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats!.activeSessions.map(s => (
                <Card key={s.sessionId} className="p-4 border-none shadow-sm bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="font-semibold text-sm truncate">{s.username}</span>
                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.planType === "trial" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>{s.planType}</span>
                  </div>
                  {s.email && <p className="text-xs text-muted-foreground mb-2 truncate">{s.email}</p>}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Duration: <span className="font-medium text-foreground">{fmtDuration(s.durationSeconds)}</span></span>
                    <span>Started {formatDistanceToNow(new Date(s.startedAt), { addSuffix: true })}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-6 border-b border-border pb-px">
          <button
            onClick={() => setActiveTab("users")}
            className={`text-sm font-medium transition-colors pb-3 border-b-2 ${activeTab === "users" ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            Users ({allUsers.length})
          </button>
          <button
            onClick={() => setActiveTab("feedback")}
            className={`text-sm font-medium transition-colors pb-3 border-b-2 ${activeTab === "feedback" ? "text-foreground border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            Feedback ({feedback.length})
          </button>
        </div>

        {/* ── Users Tab ────────────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <Card className="overflow-hidden border-border shadow-sm">
            {/* Table header */}
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-white">
              <div className="flex flex-wrap gap-1.5">
                {(["all", "trial", "paying", "inactive", "high"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setUserFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${userFilter === f
                      ? "bg-primary text-white"
                      : "bg-gray-100 text-muted-foreground hover:bg-gray-200"
                    }`}
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
              <table className="w-full text-sm text-left min-w-[760px]">
                <thead className="bg-gray-50/80 text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Plan / Trial</th>
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
                    const inactive  = !u.lastActivityAt || differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7;
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            {u.username}
                            {u.isAdmin && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase font-bold">Admin</span>}
                          </div>
                          {u.email && <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{u.email}</div>}
                          <div className="text-[10px] text-muted-foreground">Joined {format(new Date(u.createdAt), "MMM d, yyyy")}</div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.isActive && !inactive ? "bg-green-100 text-green-700" : inactive && u.isActive ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive && !inactive ? "bg-green-500" : inactive && u.isActive ? "bg-amber-500" : "bg-red-500"}`} />
                            {!u.isActive ? "Disabled" : inactive ? "Inactive" : "Active"}
                          </span>
                        </td>

                        {/* Plan / Trial */}
                        <td className="px-4 py-3">
                          {trialBadge(trialDays, u.planType)}
                        </td>

                        {/* Today usage */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
                          <span className="text-gray-400 text-[10px]"> ({u.totalSessions} sessions)</span>
                        </td>

                        {/* Last seen */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {lastSeen(u.lastActivityAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => resetUsage(u.id)} title="Reset Today's Usage" className="h-7 w-7 p-0">
                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleStatus(u.id, u.isActive)} title={u.isActive ? "Disable" : "Enable"} className="h-7 w-7 p-0">
                            {u.isActive ? <PowerOff className="w-3 h-3 text-amber-500" /> : <Power className="w-3 h-3 text-green-500" />}
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive text-destructive/70" onClick={() => deleteUser(u.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground bg-white">
                        No users match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Feedback Tab ─────────────────────────────────────────────────── */}
        {activeTab === "feedback" && (
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
    </div>
  );
}
