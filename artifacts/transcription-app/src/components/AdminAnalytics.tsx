import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Activity, TrendingUp, Clock, DollarSign, Users, Zap, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui-components";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AnalyticsData {
  userGrowth: { day: string; users: number }[];
  dau: { day: string; users: number }[];
  usageStats: {
    minutesToday: number;
    minutesMonth: number;
    costToday: number;
    costMonth: number;
    sessionsToday: number;
  };
  conversion: {
    totalUsers: number;
    trialUsers: number;
    paidUsers: number;
    conversionRate: number;
  };
  topUsers: {
    username: string;
    minutesToday: number;
    totalMinutes: number;
    planType: string;
  }[];
}

async function fetchAnalytics(): Promise<AnalyticsData> {
  const res = await fetch(`${BASE}/api/admin/analytics`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json();
}

function fmtMin(m: number) {
  if (m < 1) return `${Math.round(m * 60)}s`;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

function fmtDay(iso: string) {
  try { return format(parseISO(iso), "MMM d"); } catch { return iso; }
}

const CHART_COLORS = {
  primary:  "#6366f1",
  green:    "#22c55e",
  amber:    "#f59e0b",
  blue:     "#3b82f6",
  red:      "#ef4444",
  violet:   "#8b5cf6",
};

const PIE_COLORS = [CHART_COLORS.primary, CHART_COLORS.green];

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border border-border bg-white`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
      {children}
    </h3>
  );
}

const tooltipStyle = {
  contentStyle: { border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
  labelStyle:   { fontWeight: 600, marginBottom: 4 },
};

export default function AdminAnalytics() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<AnalyticsData>({
    queryKey:      ["admin-analytics"],
    queryFn:       fetchAnalytics,
    refetchInterval: 5 * 60 * 1000, // 5-min auto-refresh
    staleTime:     60_000,
  });

  const lastUpdate = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading analytics…</p>
      </div>
    );
  }

  if (!data) return null;

  const { userGrowth, dau, usageStats, conversion, topUsers } = data;

  const conversionPie = [
    { name: "Paid",  value: conversion.paidUsers  },
    { name: "Trial", value: conversion.trialUsers },
  ];

  // Shorten day labels on X axes
  const growthWithLabel = userGrowth.map(d => ({ ...d, label: fmtDay(d.day) }));
  const dauWithLabel    = dau.map(d => ({ ...d, label: fmtDay(d.day) }));

  return (
    <div className="space-y-8">

      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-refreshes every 5 minutes{lastUpdate && ` · Last updated ${lastUpdate}`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh now
        </button>
      </div>

      {/* ── AI Usage Stats ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle><Zap className="w-4 h-4 text-amber-500" />AI Usage Statistics</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
          <StatCard
            icon={<Clock className="w-4.5 h-4.5" />}
            label="Transcribed Today"
            value={fmtMin(usageStats.minutesToday)}
            sub={`${usageStats.sessionsToday} session${usageStats.sessionsToday !== 1 ? "s" : ""}`}
            color="bg-indigo-50 text-indigo-600"
          />
          <StatCard
            icon={<Clock className="w-4.5 h-4.5" />}
            label="Transcribed This Month"
            value={fmtMin(usageStats.minutesMonth)}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            icon={<DollarSign className="w-4.5 h-4.5" />}
            label="AI Cost Today"
            value={`$${usageStats.costToday.toFixed(2)}`}
            sub="Soniox + GPT"
            color="bg-amber-50 text-amber-600"
          />
          <StatCard
            icon={<DollarSign className="w-4.5 h-4.5" />}
            label="AI Cost This Month"
            value={`$${usageStats.costMonth.toFixed(2)}`}
            sub="Soniox + GPT"
            color="bg-orange-50 text-orange-600"
          />
          <StatCard
            icon={<Activity className="w-4.5 h-4.5" />}
            label="Sessions Today"
            value={usageStats.sessionsToday}
            sub="≥30s only"
            color="bg-green-50 text-green-600"
          />
        </div>
      </section>

      {/* ── Conversion Metrics ─────────────────────────────────────────── */}
      <section>
        <SectionTitle><TrendingUp className="w-4 h-4 text-green-500" />Conversion Metrics</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 content-start">
            <StatCard
              icon={<Users className="w-4.5 h-4.5" />}
              label="Total Users"
              value={conversion.totalUsers}
              color="bg-slate-100 text-slate-600"
            />
            <StatCard
              icon={<Users className="w-4.5 h-4.5" />}
              label="Trial Users"
              value={conversion.trialUsers}
              color="bg-violet-50 text-violet-600"
            />
            <StatCard
              icon={<Users className="w-4.5 h-4.5" />}
              label="Paid Users"
              value={conversion.paidUsers}
              color="bg-green-50 text-green-600"
            />
            <StatCard
              icon={<TrendingUp className="w-4.5 h-4.5" />}
              label="Conversion Rate"
              value={`${conversion.conversionRate}%`}
              sub="trial → paid"
              color="bg-blue-50 text-blue-600"
            />
          </div>

          {/* Pie chart */}
          <Card className="p-4 border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Plan Distribution</p>
            {conversion.totalUsers === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">No users yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={conversionPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                    labelLine={false}
                  >
                    {conversionPie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </section>

      {/* ── User Growth ────────────────────────────────────────────────── */}
      <section>
        <SectionTitle><Users className="w-4 h-4 text-indigo-500" />User Growth — Last 30 Days</SectionTitle>
        <Card className="p-4 border-border mt-3">
          {userGrowth.every(d => d.users === 0) ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No signups in the last 30 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={growthWithLabel} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "New Users"]} labelFormatter={l => `Date: ${l}`} />
                <Area type="monotone" dataKey="users" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#gradGrowth)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      {/* ── Daily Active Users ─────────────────────────────────────────── */}
      <section>
        <SectionTitle><Activity className="w-4 h-4 text-green-500" />Daily Active Users — Last 14 Days</SectionTitle>
        <Card className="p-4 border-border mt-3">
          {dau.every(d => d.users === 0) ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No sessions in the last 14 days</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dauWithLabel} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Active Users"]} labelFormatter={l => `Date: ${l}`} />
                <Bar dataKey="users" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      {/* ── Top Active Users ───────────────────────────────────────────── */}
      <section>
        <SectionTitle><Zap className="w-4 h-4 text-amber-500" />Top 10 Users by Usage Today</SectionTitle>
        <Card className="border-border mt-3 overflow-hidden">
          {topUsers.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No usage recorded today</div>
          ) : (
            <>
              {/* Inline bar chart */}
              <div className="p-4 border-b border-border">
                <ResponsiveContainer width="100%" height={Math.max(160, topUsers.length * 36)}>
                  <BarChart
                    data={topUsers}
                    layout="vertical"
                    margin={{ top: 0, right: 60, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}m`} />
                    <YAxis type="category" dataKey="username" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v: number) => [fmtMin(v), "Today"]}
                    />
                    <Bar dataKey="minutesToday" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 10, formatter: (v: number) => fmtMin(v) }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detail table */}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-semibold text-left">#</th>
                    <th className="px-4 py-2 font-semibold text-left">User</th>
                    <th className="px-4 py-2 font-semibold text-left">Plan</th>
                    <th className="px-4 py-2 font-semibold text-right">Today</th>
                    <th className="px-4 py-2 font-semibold text-right">All Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topUsers.map((u, i) => (
                    <tr key={u.username} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-sm">{u.username}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${u.planType === "trial" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>
                          {u.planType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-sm text-primary">{fmtMin(u.minutesToday)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{fmtMin(u.totalMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </section>

    </div>
  );
}
