import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useAdminListUsers,
  useAdminCreateUser,
  useAdminUpdateUser,
  useAdminDeleteUser,
  useAdminResetUsage,
  useAdminListFeedback,
  getGetMeQueryKey,
  getAdminListUsersQueryKey,
  getAdminListFeedbackQueryKey,
} from "@workspace/api-client-react";
import type { AdminSharedLoginIpCluster } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import {
  Users, Activity, Clock, Plus, Trash2, Power, PowerOff,
  ArrowLeft, Star, LayoutDashboard, RefreshCw, DollarSign,
  Menu, Mic, Radio, AlertTriangle, TrendingUp, Calendar, Eye, X,
  Globe, Download, ChevronRight, Wifi, WifiOff, BarChart2,
  Languages, MessageSquare, StopCircle, Check, History,
  Timer, Banknote, LifeBuoy, Send, CheckCircle, ChevronDown, Lock,
  Monitor, LogIn, LogOut, Play, ShieldAlert, Server, Zap, XCircle, Mail,
  Pencil, Gift, Share2, UserPlus, AlertCircle, Bluetooth, Usb, Sun, Moon,
} from "lucide-react";
import { Button, Card, Input } from "@/components/ui-components";
import AdminAnalytics from "@/components/AdminAnalytics";
import {
  cn,
  formatMinutes,
  isTrialLikePlanType,
  workspacePlanDisplayName,
  workspacePlanTierKey,
  planUsesLibreEngine,
} from "@/lib/utils";
import { startOfAppDayMs } from "@workspace/app-timezone";

// ── Types ────────────────────────────────────────────────────────────────────
interface AdminStats {
  activeUsers:        number;
  totalUsers:         number;
  /** Non-admin accounts (SaaS segment); minutes/costs still exclude admin usage where applicable. */
  customerUsers?:   number;
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
    micLabel:        string | null;
    /** Same user has more than one row with ended_at null — investigate stale session. */
    openSessionsForUser?: number;
    openSessionOrdinal?: number;
    /** Live POST /translate stack (matches server `userUsesMachineTranslationStack`). */
    translationStack?: "libre" | "openai";
    /** Plain-language route + Hetzner core when applicable. */
    translationRouteDetail?: string;
    coreLane?: 1 | 2 | null;
    coreLaneColor?: "blue" | "violet" | null;
    coreNodeLabel?: string | null;
  }[];
  /** Populated with /stats and fast /active-sessions polls. */
  liveSessionSummary?: {
    totalSessions: number;
    usersWithMultipleOpen: number;
  };
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
  /** When present (from client buffers), use these instead of splitting joined strings — avoids mis-aligned rows if speech contains newlines. */
  transcriptLines?: string[];
  translationLines?: string[];
  snapshotSeq?: number;
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

type StableSnapshotRow = { idx: number; src: string; tgt: string };

/**
 * Show only stable aligned pairs in admin monitor.
 * Keep original row indices so admin view does not reindex/shift rows.
 * For live sessions, intentionally hide only the newest row (one-segment delay)
 * so admin never sees in-flight partial artifacts.
 */
function buildStableSnapshotRows(snapshot: SessionSnapshot, isLive: boolean): StableSnapshotRow[] {
  const transcriptLines = snapshot.transcriptLines;
  const translationLines = snapshot.translationLines;
  if (!Array.isArray(transcriptLines) || !Array.isArray(translationLines)) return [];
  if (transcriptLines.length === 0 || transcriptLines.length !== translationLines.length) return [];

  const src = transcriptLines.map(v => String(v).trim());
  const tgt = translationLines.map(v => String(v).trim());
  const lastExclusive = isLive ? Math.max(0, src.length - 1) : src.length;

  const rows: StableSnapshotRow[] = [];
  for (let i = 0; i < lastExclusive; i++) {
    const s = src[i] ?? "";
    const t = tgt[i] ?? "";
    // Keep contiguous aligned prefix only; never skip holes or rows shift.
    if (!s || !t) break;
    rows.push({ idx: i + 1, src: s, tgt: t });
  }
  return rows;
}

interface LangOption { value: string; label: string; }
interface LangConfigResp {
  allLanguages:     LangOption[];
  enabledLanguages: string[];
  defaultLangA:     string;
  defaultLangB:     string;
}

interface SupportTicket {
  id:         number;
  userId:     number | null;
  username:   string | null;
  email:      string;
  subject:    string;
  message:    string;
  status:     string;
  replyCount: number;
  createdAt:  string;
  updatedAt:  string;
}

interface SupportReply {
  id:        number;
  isAdmin:   boolean;
  message:   string;
  createdAt: string;
  username:  string | null;
}

interface SupportTicketDetail extends SupportTicket {
  replies: SupportReply[];
}

interface ErrorLogEntry {
  id:           number;
  userId:       number | null;
  username:     string | null;
  email:        string | null;
  sessionId:    string | null;
  endpoint:     string;
  method:       string;
  statusCode:   number;
  errorType:    string;
  errorMessage: string | null;
  userAgent:    string | null;
  ipAddress:    string | null;
  createdAt:    string;
}

interface ErrorsSummary {
  total24h:        number;
  loginFailures24h: number;
  rateLimited24h:  number;
  serverErrors24h: number;
  byType24h:       { errorType: string; count: number }[];
  byType1h:        { errorType: string; count: number }[];
}

interface LoginEventEntry {
  id:            number;
  userId:        number | null;
  email:         string | null;
  ipAddress:     string | null;
  userAgent:     string | null;
  success:       boolean;
  failureReason: string | null;
  is2fa:         boolean;
  createdAt:     string;
  username:      string | null;
}

interface LoginEventsSummary {
  total24h:    number;
  failures24h: number;
  success24h:  number;
  twoFa24h:    number;
  lastHour:    number;
  byReason:    { reason: string | null; count: number }[];
}

interface SystemMonitorData {
  activeUsers:             number;
  activeSessions:          number;
  failedLoginsToday:       number;
  successfulLoginsToday:   number;
  apiErrorsToday:          number;
  proxyFailuresToday:      number;
  sessionExpirationsToday: number;
  sessionsStartedToday:    number;
  sessionsEndedToday:      number;
}

interface SystemEvent {
  id:          string;
  type:        "login_success" | "login_failure" | "session_start" | "session_end" | "api_error" | "proxy_failure" | "email_reminder_unsubscribe";
  title:       string;
  description: string;
  timestamp:   string;
  meta:        Record<string, unknown>;
}

interface AdminReferralRow {
  id: number;
  referrerId: number;
  referrerName: string | null;
  referrerEmail: string | null;
  referredUserId: number;
  referredUsername: string | null;
  referredEmail: string | null;
  status: "pending" | "active";
  sessionsCount: number;
  createdAt: string;
  rewardPending: boolean;
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
  if (!date) return (
    <span className="flex items-center gap-1.5 text-gray-400">
      <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
      Never
    </span>
  );
  const ms = Date.now() - new Date(date).getTime();
  const dotColor = ms < 5 * 60 * 1000 ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" :
                   ms < 60 * 60 * 1000 ? "bg-yellow-400" : "bg-gray-300";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      <span>{formatDistanceToNow(new Date(date), { addSuffix: true })}</span>
    </span>
  );
}

/** Canonical plan types including separate OpenAI / Hetzner / mixed trial modes. */
const ADMIN_PLAN_OPTIONS_OPENAI: { value: string; label: string }[] = [
  { value: "trial-openai", label: "Trial · OpenAI (7 days, full OpenAI)" },
  { value: "trial", label: "Trial · OpenAI (legacy)" },
  { value: "basic", label: "Basic · OpenAI" },
  { value: "professional", label: "Professional · OpenAI" },
  { value: "platinum", label: "Platinum · OpenAI" },
];

const ADMIN_PLAN_OPTIONS_LIBRE: { value: string; label: string }[] = [
  { value: "trial-hetzner", label: "Trial · Hetzner (7 days, full Hetzner)" },
  { value: "trial-libre", label: "Trial · Mixed (days 1–4 OpenAI, then Hetzner)" },
  { value: "basic-libre", label: "Basic · Hetzner / machine" },
  { value: "professional-libre", label: "Professional · Hetzner / machine" },
  { value: "platinum-libre", label: "Platinum · Hetzner / machine" },
];

const ADMIN_PLAN_VALUE_SET = new Set([
  ...ADMIN_PLAN_OPTIONS_OPENAI.map(o => o.value),
  ...ADMIN_PLAN_OPTIONS_LIBRE.map(o => o.value),
]);

/** Matches server `SUBSCRIPTION_PERIOD_MS` when PayPal omits next_billing_time. */
const BILLING_FALLBACK_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function addBillingFallbackPeriod(start: Date): Date {
  return new Date(start.getTime() + BILLING_FALLBACK_PERIOD_MS);
}

/** Stable hue + short label so the same set of accounts shares the same visual tag across rows and the overview. */
function sharedIpRowAccent(accountIds: number[]): { hue: number; label: string } {
  const sorted = [...accountIds].sort((a, b) => a - b);
  let h = 2166136261;
  for (const id of sorted) {
    h ^= id;
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const hue = (u % 12) * 28 + 6;
  const label = (u % 900 + 100).toString(36).toUpperCase().slice(0, 4);
  return { hue, label };
}

/** `datetime-local` value in the browser's local timezone. */
function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function trialBadge(trialEndsAt: string | null | undefined, plan: string) {
  if (!isTrialLikePlanType(plan)) {
    const engine = planUsesLibreEngine(plan) ? "Hetzner" : "OpenAI";
    return (
      <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-wrap">
        <span>{workspacePlanDisplayName(plan)}</span>
        <span className="text-[9px] font-normal opacity-80">· {engine}</span>
        <span className="text-[9px] font-mono opacity-60">({plan})</span>
      </span>
    );
  }
  if (!trialEndsAt) return (
    <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
  );
  const daysLeft = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  if (daysLeft <= 0) return (
    <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full">Expired</span>
  );
  if (daysLeft <= 3) return (
    <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" />{daysLeft}d left · {planUsesLibreEngine(plan) ? "Hetzner" : "OpenAI"}
    </span>
  );
  return (
    <span className="text-xs text-violet-600 font-semibold bg-violet-50 px-2 py-0.5 rounded-full">
      {daysLeft}d left · {planUsesLibreEngine(plan) ? "Hetzner" : "OpenAI"}
    </span>
  );
}

// ── Audio device type detector ────────────────────────────────────────────────
function detectAudioDevice(label: string | null | undefined) {
  if (!label) return null;
  const l = label.toLowerCase();
  if (label === "Browser Tab Audio") {
    return { type: "Tab Audio",  badgeCls: "bg-blue-50 text-blue-700 border-blue-100",   icon: <Monitor   className="w-3 h-3" /> };
  }
  if (l.includes("usb")) {
    return { type: "USB",        badgeCls: "bg-violet-50 text-violet-700 border-violet-100", icon: <Usb      className="w-3 h-3" /> };
  }
  if (l.includes("bluetooth") || l.includes("airpod") || l.includes("wireless")) {
    return { type: "Bluetooth",  badgeCls: "bg-sky-50 text-sky-700 border-sky-100",      icon: <Bluetooth className="w-3 h-3" /> };
  }
  if (l.includes("built-in") || l.includes("built in") || l.includes("internal") || l.includes("macbook") || l.includes("laptop")) {
    return { type: "Built-in",   badgeCls: "bg-gray-100 text-gray-600 border-gray-200",  icon: <Mic       className="w-3 h-3" /> };
  }
  return   { type: "Microphone", badgeCls: "bg-green-50 text-green-700 border-green-100", icon: <Mic      className="w-3 h-3" /> };
}

/** Resolve BCP-47-ish workspace code to admin UI label (for session column headers). */
function adminLanguageLabel(code: string | undefined, all: LangOption[] | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "—";
  const hit = all?.find(l => l.value === c);
  return hit?.label ?? c.toUpperCase();
}

function AudioDeviceInfo({ label, nameClass = "" }: { label: string | null | undefined; nameClass?: string }) {
  const dev = detectAudioDevice(label);
  if (!dev) return null;
  const isTab = label === "Browser Tab Audio";
  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      <span className={`inline-flex items-center gap-1 self-start text-[10px] font-semibold border rounded-full px-1.5 py-0.5 ${dev.badgeCls}`}>
        {dev.icon}{dev.type}
      </span>
      {!isTab && (
        <span className={`text-[10px] text-muted-foreground leading-tight ${nameClass}`} title={label ?? ""}>
          {label}
        </span>
      )}
    </div>
  );
}

function sessionStatusBadge(userId: number, lastActivityAt: string | null | undefined, activeSessions: AdminStats["activeSessions"]) {
  const activeSession = activeSessions.find(s => s.userId === userId);
  if (activeSession) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Recording
        </span>
        {activeSession.translationRouteDetail && (
          <span className="text-[9px] text-muted-foreground leading-tight max-w-[14rem]" title={activeSession.translationRouteDetail}>
            {activeSession.translationRouteDetail}
          </span>
        )}
        {activeSession.coreLane ? (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              (activeSession.coreLaneColor ?? "blue") === "violet"
                ? "bg-violet-100 text-violet-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {activeSession.coreNodeLabel ?? "HZ-1"} · Core {activeSession.coreLane}
          </span>
        ) : null}
        <AudioDeviceInfo label={activeSession.micLabel} />
      </div>
    );
  }
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
  const { data: me, isLoading: meLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });

  const { data: usersData, isLoading: usersLoading } = useAdminListUsers({ query: { queryKey: getAdminListUsersQueryKey(), enabled: !!me?.isAdmin } });
  const allUsers = usersData?.users ?? [];
  const paidBillingRollup = usersData?.paidBillingRollup;
  const sharedLoginIpIndex = useMemo(() => {
    const byIp = new Map<string, AdminSharedLoginIpCluster>();
    for (const u of allUsers) {
      for (const c of u.sharedLoginIpClusters ?? []) {
        if (!byIp.has(c.ip)) byIp.set(c.ip, c);
      }
    }
    return [...byIp.values()].sort((a, b) => b.accountCount - a.accountCount || a.ip.localeCompare(b.ip));
  }, [allUsers]);
  const { data: feedbackData } = useAdminListFeedback({ query: { queryKey: getAdminListFeedbackQueryKey(), enabled: !!me?.isAdmin } });

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
  const [mainTab, setMainTab] = useState<"overview" | "analytics" | "users" | "ipWatch" | "languages" | "feedback" | "support" | "errors" | "monitor" | "referrals">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const ADMIN_THEME_STORAGE_KEY = "interpreterai-admin-theme";
  type AdminTheme = "dark" | "light";
  const [adminTheme, setAdminTheme] = useState<AdminTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const v = localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "dark";
  });
  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_THEME_STORAGE_KEY, adminTheme);
    } catch {
      /* ignore */
    }
  }, [adminTheme]);
  const adminDark = adminTheme === "dark";

  // Fast-poll live sessions on Overview / Users / Monitor — 3 s (Libre-heavy traffic needs fresh rows).
  // Must come AFTER mainTab useState to avoid temporal dead zone crash.
  const pollLiveSessions =
    !!me?.isAdmin && (mainTab === "overview" || mainTab === "users" || mainTab === "monitor");
  const {
    data: liveSessionsData,
    isError: liveSessionsPollError,
    isFetching: liveSessionsPollFetching,
    refetch: refetchLiveSessions,
  } = useQuery({
    queryKey: ["admin-active-sessions"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/admin/active-sessions", { credentials: "include", signal });
      if (!res.ok) throw new Error(`Active sessions HTTP ${res.status}`);
      return res.json() as Promise<Pick<AdminStats, "activeSessions" | "liveSessionSummary">>;
    },
    enabled: pollLiveSessions,
    refetchInterval: pollLiveSessions ? 3_000 : false,
    refetchIntervalInBackground: true,
    placeholderData: (previousData) => previousData,
    retry: 4,
    retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 30_000),
    staleTime: 2_000,
    gcTime: 30 * 60 * 1000,
  });

  const sessions = useMemo(
    () => liveSessionsData?.activeSessions ?? statsData?.activeSessions ?? [],
    [liveSessionsData?.activeSessions, statsData?.activeSessions],
  );
  const liveSessionSummary = useMemo(
    () => liveSessionsData?.liveSessionSummary ?? statsData?.liveSessionSummary,
    [liveSessionsData?.liveSessionSummary, statsData?.liveSessionSummary],
  );

  // ── Edit user drawer ───────────────────────────────────────────────────────
  const [editingUser, setEditingUser] = useState<{
    id: number; username: string; email: string | null; isAdmin: boolean;
    planType: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null; trialDaysRemaining: number | null;
    subscriptionStatus: string | null;
    subscriptionPlan: string | null;
    subscriptionStartedAt: string | null;
    subscriptionPeriodEndsAt: string | null;
    paypalSubscriptionId: string | null;
    stripeSubscriptionId: string | null;
    dailyLimitMinutes: number; minutesUsedToday: number;
    defaultLangA: string; defaultLangB: string;
    totalMinutesUsed: number; totalSessions: number; createdAt: string;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    isActive:          true,
    planType:          "trial",
    trialEndsAt:       "",
    subscriptionStartedAtLocal:   "",
    subscriptionPeriodEndsAtLocal: "",
    dailyLimitMinutes: 60,
    minutesUsedToday:  0,
    defaultLangA:      "en",
    defaultLangB:      "ar",
  });
  const [editSaving, setEditSaving]  = useState(false);
  const [editError,  setEditError]   = useState<string | null>(null);

  // ── Errors tab state ──────────────────────────────────────────────────────
  const [errorsSubTab, setErrorsSubTab]       = useState<"api" | "login">("api");
  const [loginEventFilter, setLoginEventFilter] = useState("all");
  const [errorTypeFilter, setErrorTypeFilter] = useState("all");
  const { data: errorsData, refetch: refetchErrors, isLoading: errorsLoading } = useQuery({
    queryKey: ["admin-errors", errorTypeFilter],
    queryFn: async () => {
      const url = `/api/admin/errors?limit=100${errorTypeFilter !== "all" ? `&type=${errorTypeFilter}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch errors");
      return res.json() as Promise<{ errors: ErrorLogEntry[] }>;
    },
    enabled: !!me?.isAdmin && mainTab === "errors",
    refetchInterval: mainTab === "errors" ? 30_000 : false,
  });
  const { data: errorsSummary, refetch: refetchErrorsSummary } = useQuery({
    queryKey: ["admin-errors-summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/errors/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch error summary");
      return res.json() as Promise<ErrorsSummary>;
    },
    enabled: !!me?.isAdmin && mainTab === "errors",
    refetchInterval: mainTab === "errors" ? 30_000 : false,
  });
  const { data: loginEventsData, refetch: refetchLoginEvents, isLoading: loginEventsLoading } = useQuery({
    queryKey: ["admin-login-events", loginEventFilter],
    queryFn: async () => {
      const url = `/api/admin/login-events?limit=100${loginEventFilter !== "all" ? `&filter=${loginEventFilter}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch login events");
      return res.json() as Promise<{ events: LoginEventEntry[] }>;
    },
    enabled: !!me?.isAdmin && mainTab === "errors",
    refetchInterval: mainTab === "errors" ? 30_000 : false,
  });
  const { data: loginEventsSummary, refetch: refetchLoginSummary } = useQuery({
    queryKey: ["admin-login-events-summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/login-events/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch login events summary");
      return res.json() as Promise<LoginEventsSummary>;
    },
    enabled: !!me?.isAdmin && mainTab === "errors",
    refetchInterval: mainTab === "errors" ? 30_000 : false,
  });

  // ── Monitor tab state ─────────────────────────────────────────────────────
  const { data: monitorData, refetch: refetchMonitor } = useQuery({
    queryKey: ["admin-system-monitor"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-monitor", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch system monitor");
      return res.json() as Promise<SystemMonitorData>;
    },
    enabled: !!me?.isAdmin && mainTab === "monitor",
    refetchInterval: mainTab === "monitor" ? 15_000 : false,
  });
  const { data: systemEventsData, refetch: refetchSystemEvents } = useQuery({
    queryKey: ["admin-system-events"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-events?limit=60", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch system events");
      return res.json() as Promise<{ events: SystemEvent[] }>;
    },
    enabled: !!me?.isAdmin && mainTab === "monitor",
    refetchInterval: mainTab === "monitor" ? 15_000 : false,
  });
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  const { data: referralsAdminData } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const res = await fetch("/api/referrals/admin/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch referrals");
      return res.json() as Promise<{
        totals: { totalReferrals: number; activeReferrals: number; pendingReferrals: number };
        rows: AdminReferralRow[];
      }>;
    },
    enabled: !!me?.isAdmin && mainTab === "referrals",
    refetchInterval: mainTab === "referrals" ? 30_000 : false,
  });

  // ── Support tab state ─────────────────────────────────────────────────────
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportFilter,  setSupportFilter]  = useState<"all" | "open" | "resolved">("all");
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [ticketDetail,   setTicketDetail]   = useState<SupportTicketDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [replyText,      setReplyText]      = useState("");
  const [replyLoading,   setReplyLoading]   = useState(false);
  const [statusLoading,  setStatusLoading]  = useState<number | null>(null);

  const fetchSupportTickets = useCallback(async () => {
    setSupportLoading(true);
    try {
      const res  = await fetch("/api/admin/support", { credentials: "include" });
      const data = await res.json() as { tickets: SupportTicket[] };
      setSupportTickets(data.tickets ?? []);
    } catch { setSupportTickets([]); }
    setSupportLoading(false);
  }, []);

  useEffect(() => {
    if (mainTab === "support" && me?.isAdmin) void fetchSupportTickets();
  }, [mainTab, me?.isAdmin, fetchSupportTickets]);

  const toggleTicketExpand = async (id: number) => {
    if (expandedTicket === id) { setExpandedTicket(null); setTicketDetail(null); return; }
    setExpandedTicket(id);
    setDetailLoading(true);
    try {
      const res  = await fetch(`/api/admin/support/${id}`, { credentials: "include" });
      const data = await res.json() as { ticket: SupportTicket; replies: SupportReply[] };
      setTicketDetail({ ...data.ticket, replies: data.replies });
    } catch { setTicketDetail(null); }
    setDetailLoading(false);
  };

  const submitAdminReply = async (ticketId: number) => {
    if (!replyText.trim()) return;
    setReplyLoading(true);
    try {
      await fetch(`/api/admin/support/${ticketId}/reply`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: replyText.trim() }),
      });
      setReplyText("");
      void toggleTicketExpand(ticketId);
      void fetchSupportTickets();
    } catch { /* ignore */ }
    setReplyLoading(false);
  };

  const toggleTicketStatus = async (ticketId: number, current: string) => {
    const next = current === "open" ? "resolved" : "open";
    setStatusLoading(ticketId);
    try {
      await fetch(`/api/admin/support/${ticketId}/status`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: next }),
      });
      setSupportTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: next } : t));
      if (ticketDetail?.id === ticketId) setTicketDetail(d => d ? { ...d, status: next } : d);
    } catch { /* ignore */ }
    setStatusLoading(null);
  };

  // ── Users tab state ───────────────────────────────────────────────────────
  const [userFilter,     setUserFilter]     = useState<"all" | "trial" | "paying" | "inactive" | "high" | "dupIp">("all");
  const [userSearch,     setUserSearch]     = useState("");
  const [lastSeenFilter, setLastSeenFilter] = useState("");
  const [newUsersFilter, setNewUsersFilter] = useState("");
  const [sortBy,         setSortBy]         = useState<"lastSeen" | "minutesToday" | "totalUsage" | "sessionCount" | "trialEnding" | "">("lastSeen");
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("desc");
  const [showCreate,     setShowCreate]     = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newLimit,    setNewLimit]    = useState(60);
  const [newIsAdmin,  setNewIsAdmin]  = useState(false);
  const [bumpDailyFloorPending, setBumpDailyFloorPending] = useState(false);

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
    const totalMin  = userSessions.reduce((s, x) => s + (x.minutesUsed ?? 0), 0);
    const totalCost = totalMin * 0.0027;
    const rows = [
      ["#", "Date", "Start Time", "End Time", "Duration (min)", "Language Pair", "Transcription Min", "Est. Cost ($)"],
      ...userSessions.map((s, i) => [
        i + 1,
        format(new Date(s.startedAt), "yyyy-MM-dd"),
        format(new Date(s.startedAt), "HH:mm:ss"),
        s.endedAt ? format(new Date(s.endedAt), "HH:mm:ss") : "ongoing",
        s.minutesUsed != null ? s.minutesUsed.toFixed(2) : s.durationSeconds != null ? (s.durationSeconds / 60).toFixed(2) : "",
        s.langPair ?? "",
        s.minutesUsed != null ? s.minutesUsed.toFixed(2) : "",
        s.minutesUsed != null ? (s.minutesUsed * 0.0027).toFixed(4) : "",
      ]),
      [],
      ["TOTALS", "", "", "", "", `${userSessions.length} sessions`, totalMin.toFixed(2), totalCost.toFixed(4)],
    ];
    const csv = [
      `# Session History: ${historyUser.username}`,
      `# Exported: ${new Date().toLocaleString()}`,
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `sessions-${historyUser.username}-${format(new Date(), "yyyyMMdd")}.csv`;
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
      if (!res.ok) return;
      const next = await res.json() as SessionDetail;
      setSessionDetail(next);
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
    viewPollRef.current = setInterval(() => fetchSessionDetail(viewingSessionId), 2_000);
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
      void refetchStats();
      void queryClient.invalidateQueries({ queryKey: ["admin-active-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-system-monitor"] });
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

  /** Load language names once for admin (e.g. View Session column headers) without opening the Languages tab. */
  useEffect(() => {
    if (!me?.isAdmin) return;
    let cancelled = false;
    fetch("/api/admin/config/languages", { credentials: "include" })
      .then(r => r.json() as Promise<LangConfigResp>)
      .then(data => {
        if (!cancelled) setLangConfigData(prev => prev ?? data);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [me?.isAdmin]);

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

  const feedback  = feedbackData?.feedback ?? [];
  const stats     = statsData;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMut.mutateAsync({ data: { username: newUsername, password: newPassword, dailyLimitMinutes: newLimit, isAdmin: newIsAdmin } });
    setShowCreate(false); setNewUsername(""); setNewPassword(""); setNewLimit(60); setNewIsAdmin(false);
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

  async function bumpAllUsersDailyFloor(floorMinutes: number) {
    const hrs = floorMinutes / 60;
    if (
      !confirm(
        `Raise daily limit to at least ${floorMinutes} minutes (${hrs}h) for every non-admin user under the unlimited cap? Users already at ≥9000 min/day are skipped.`,
      )
    ) {
      return;
    }
    setBumpDailyFloorPending(true);
    try {
      const res = await fetch("/api/admin/users/bump-daily-limit-floor", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorMinutes }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Request failed");
        return;
      }
      const data = (await res.json()) as { updatedCount?: number; floorMinutes?: number };
      alert(`Updated ${data.updatedCount ?? 0} user(s) to at least ${data.floorMinutes ?? floorMinutes} min/day.`);
      await queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    } finally {
      setBumpDailyFloorPending(false);
    }
  }

  // ── Edit user drawer helpers ───────────────────────────────────────────────
  function openEditUser(u: typeof allUsers[0]) {
    const userDefaultA = ((u as unknown as { defaultLangA?: string }).defaultLangA ?? defaultLangA ?? "en").trim();
    const userDefaultB = ((u as unknown as { defaultLangB?: string }).defaultLangB ?? defaultLangB ?? "ar").trim();
    setEditingUser({
      id:                u.id,
      username:          u.username,
      email:             u.email ?? null,
      isAdmin:           u.isAdmin,
      planType:          u.planType ?? "trial",
      trialStartedAt:    (u as { trialStartedAt?: string }).trialStartedAt ?? null,
      trialEndsAt:       u.trialEndsAt ?? null,
      trialDaysRemaining: (u.trialDaysRemaining as number | null | undefined) ?? null,
      subscriptionStatus: (u as { subscriptionStatus?: string | null }).subscriptionStatus ?? null,
      subscriptionPlan:   (u as { subscriptionPlan?: string | null }).subscriptionPlan ?? null,
      subscriptionStartedAt: (u as { subscriptionStartedAt?: string | null }).subscriptionStartedAt ?? null,
      subscriptionPeriodEndsAt: (u as { subscriptionPeriodEndsAt?: string | null }).subscriptionPeriodEndsAt ?? null,
      paypalSubscriptionId: (u as { paypalSubscriptionId?: string | null }).paypalSubscriptionId ?? null,
      stripeSubscriptionId: (u as { stripeSubscriptionId?: string | null }).stripeSubscriptionId ?? null,
      dailyLimitMinutes: u.dailyLimitMinutes,
      minutesUsedToday:  u.minutesUsedToday,
      defaultLangA:      userDefaultA || "en",
      defaultLangB:      userDefaultB || "ar",
      totalMinutesUsed:  u.totalMinutesUsed,
      totalSessions:     u.totalSessions,
      createdAt:         u.createdAt ?? new Date().toISOString(),
    });
    const paidRow = !isTrialLikePlanType(u.planType ?? "trial");
    const seedSubStart = (u as { subscriptionStartedAt?: string | null }).subscriptionStartedAt ?? null;
    const seedSubEnd =
      (u as { subscriptionPeriodEndsAt?: string | null }).subscriptionPeriodEndsAt ??
      (seedSubStart ? addBillingFallbackPeriod(new Date(seedSubStart)).toISOString() : null);
    setEditForm({
      isActive:          u.isActive,
      planType:          u.planType ?? "trial",
      trialEndsAt:       u.trialEndsAt ? new Date(u.trialEndsAt).toISOString().slice(0, 10) : "",
      subscriptionStartedAtLocal:    paidRow ? isoToDatetimeLocalValue(seedSubStart) : "",
      subscriptionPeriodEndsAtLocal: paidRow ? isoToDatetimeLocalValue(seedSubEnd) : "",
      dailyLimitMinutes: u.dailyLimitMinutes,
      minutesUsedToday:  Math.round(u.minutesUsedToday),
      defaultLangA:      userDefaultA || "en",
      defaultLangB:      userDefaultB || "ar",
    });
    setEditError(null);
  }

  function extendTrial(days: number) {
    const base = editForm.trialEndsAt ? new Date(editForm.trialEndsAt) : new Date();
    if (base < new Date()) base.setTime(Date.now());
    base.setDate(base.getDate() + days);
    setEditForm(f => ({ ...f, trialEndsAt: base.toISOString().slice(0, 10) }));
  }

  async function saveEditUser() {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      if (!editForm.defaultLangA || !editForm.defaultLangB || editForm.defaultLangA === editForm.defaultLangB) {
        setEditError("Please choose two different default languages.");
        return;
      }
      const body: Record<string, unknown> = {
        isActive:          editForm.isActive,
        planType:          editForm.planType,
        dailyLimitMinutes: editForm.dailyLimitMinutes,
        minutesUsedToday:  editForm.minutesUsedToday,
        defaultLangA:      editForm.defaultLangA,
        defaultLangB:      editForm.defaultLangB,
      };
      if (isTrialLikePlanType(editForm.planType) && editForm.trialEndsAt) {
        body.trialEndsAt = new Date(editForm.trialEndsAt).toISOString();
      }
      if (!isTrialLikePlanType(editForm.planType)) {
        const subS = editForm.subscriptionStartedAtLocal.trim();
        const subE = editForm.subscriptionPeriodEndsAtLocal.trim();
        if (subS) body.subscriptionStartedAt = new Date(subS).toISOString();
        if (subE) body.subscriptionPeriodEndsAt = new Date(subE).toISOString();
      }
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setEditError(err.error ?? "Failed to save");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      setEditingUser(null);
    } catch {
      setEditError("Network error — please try again");
    } finally {
      setEditSaving(false);
    }
  }

  async function resetUsageForEdit() {
    if (!editingUser) return;
    if (!confirm("Reset today's usage for this user?")) return;
    await resetMut.mutateAsync({ userId: editingUser.id });
    await queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    setEditingUser(u => u ? { ...u, minutesUsedToday: 0 } : null);
    setEditForm(f => ({ ...f, minutesUsedToday: 0 }));
  }

  async function deleteUserFromEdit() {
    if (!editingUser) return;
    if (!confirm(`Permanently delete "${editingUser.username}"? This cannot be undone.`)) return;
    await deleteMut.mutateAsync({ userId: editingUser.id });
    await queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    setEditingUser(null);
  }

  const startOfTodayMs = startOfAppDayMs();

  const filteredUsers = allUsers
    .filter(u => {
      if (userFilter === "trial")    return isTrialLikePlanType(u.planType);
      if (userFilter === "paying")   return !isTrialLikePlanType(u.planType);
      if (userFilter === "inactive") return !u.lastActivityAt || differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7;
      if (userFilter === "high")     return u.minutesUsedToday >= 60;
      if (userFilter === "dupIp")    return (u.sharedLoginIpMaxAccounts ?? 1) >= 2;
      return true;
    })
    .filter(u => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return u.username.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
    })
    .filter(u => {
      if (!lastSeenFilter) return true;
      const now = Date.now();
      const lastMs = u.lastActivityAt ? new Date(u.lastActivityAt).getTime() : 0;
      if (lastSeenFilter === "5min")     return lastMs > now - 5 * 60 * 1000;
      if (lastSeenFilter === "1h")       return lastMs > now - 60 * 60 * 1000;
      if (lastSeenFilter === "today")    return lastMs >= startOfTodayMs;
      if (lastSeenFilter === "week")     return lastMs > now - 7 * 24 * 60 * 60 * 1000;
      if (lastSeenFilter === "inactive") return !u.lastActivityAt || lastMs < now - 7 * 24 * 60 * 60 * 1000;
      return true;
    })
    .filter(u => {
      if (!newUsersFilter) return true;
      const now = Date.now();
      const joinedMs = new Date(u.createdAt).getTime();
      if (newUsersFilter === "today") return joinedMs >= startOfTodayMs;
      if (newUsersFilter === "24h")   return joinedMs > now - 24 * 60 * 60 * 1000;
      if (newUsersFilter === "7d")    return joinedMs > now - 7 * 24 * 60 * 60 * 1000;
      if (newUsersFilter === "30d")   return joinedMs > now - 30 * 24 * 60 * 60 * 1000;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "lastSeen")           cmp = (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0) - (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0);
      else if (sortBy === "minutesToday")  cmp = a.minutesUsedToday - b.minutesUsedToday;
      else if (sortBy === "totalUsage")    cmp = a.totalMinutesUsed - b.totalMinutesUsed;
      else if (sortBy === "sessionCount")  cmp = a.totalSessions - b.totalSessions;
      else if (sortBy === "trialEnding")   cmp = new Date(a.trialEndsAt ?? 0).getTime() - new Date(b.trialEndsAt ?? 0).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

  const filterCounts = {
    all:      allUsers.length,
    trial:    allUsers.filter(u => isTrialLikePlanType(u.planType)).length,
    paying:   allUsers.filter(u => !isTrialLikePlanType(u.planType)).length,
    inactive: allUsers.filter(u => !u.lastActivityAt || differenceInDays(new Date(), new Date(u.lastActivityAt)) >= 7).length,
    high:     allUsers.filter(u => u.minutesUsedToday >= 60).length,
    dupIp:    allUsers.filter(u => (u.sharedLoginIpMaxAccounts ?? 1) >= 2).length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const adminTabs = [
    { id: "overview",   label: "Overview",   icon: <BarChart2 className="w-4 h-4" />,      badge: null },
    { id: "analytics",  label: "Analytics",  icon: <TrendingUp className="w-4 h-4" />,     badge: null },
    { id: "monitor",    label: "Monitor",    icon: <Monitor className="w-4 h-4" />,         badge: sessions.length > 0 ? sessions.length : null },
    { id: "users",      label: "Users",      icon: <Users className="w-4 h-4" />,           badge: allUsers.length },
    { id: "ipWatch",    label: "IP Watch",   icon: <ShieldAlert className="w-4 h-4" />,     badge: sharedLoginIpIndex.length > 0 ? sharedLoginIpIndex.length : null },
    { id: "languages",  label: "Languages",  icon: <Languages className="w-4 h-4" />,       badge: null },
    { id: "feedback",   label: "Feedback",   icon: <MessageSquare className="w-4 h-4" />,   badge: feedback.length > 0 ? feedback.length : null },
    { id: "referrals",  label: "Referrals",  icon: <Gift className="w-4 h-4" />,            badge: referralsAdminData?.totals.pendingReferrals ?? null },
    { id: "support",    label: "Support",    icon: <LifeBuoy className="w-4 h-4" />,        badge: supportTickets.filter(t => t.status === "open").length > 0 ? supportTickets.filter(t => t.status === "open").length : null },
    { id: "errors",     label: "Errors",     icon: <AlertTriangle className="w-4 h-4" />,   badge: null },
  ];

  return (
    <div
      className={cn(
        "h-full text-foreground flex overflow-hidden",
        adminDark &&
          "dark workspace-hero-accent bg-[linear-gradient(165deg,#0b0e14_0%,#121a26_42%,#081420_100%)]",
        !adminDark && "bg-[#f5f5f7]",
      )}
    >

      {/* ── MOBILE SIDEBAR BACKDROP ───────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── ADMIN SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-card border-r border-border dark:border-white/[0.08] shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)] flex flex-col overflow-y-auto
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:inset-auto md:translate-x-0 md:w-52 md:z-10 md:shrink-0
      `}>

        {/* Logo / branding */}
        <div className="px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
              <LayoutDashboard className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight truncate">Admin</p>
              <p className="text-[10px] text-muted-foreground truncate">InterpreterAI</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => { setSidebarOpen(false); setLocation("/"); }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-3 h-3 shrink-0" /> Back to Workspace
          </button>
        </div>

        {/* Live session badge */}
        {sessions.length > 0 && (
          <div className="mx-3 mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-100/80 px-3 py-2 rounded-lg border border-red-200 dark:bg-red-500/10 dark:border-red-500/30 shrink-0">
            <Radio className="w-3 h-3 animate-pulse shrink-0" />
            {sessions.length} Live Session{sessions.length > 1 ? "s" : ""}
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {adminTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setMainTab(tab.id as typeof mainTab); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                mainTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span className={`shrink-0 ${mainTab === tab.id ? "text-primary" : ""}`}>{tab.icon}</span>
              <span className="flex-1 truncate">{tab.label}</span>
              {tab.badge !== null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                  mainTab === tab.id
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-6">

          {/* Page title */}
          <div className="pt-1 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(s => !s)}
              className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-display font-semibold tracking-tight">{adminTabs.find(t => t.id === mainTab)?.label ?? "Admin"}</h1>
              <p className="text-muted-foreground text-sm">Monitor usage, manage users, and track costs.</p>
            </div>
            <button
              type="button"
              onClick={() => setAdminTheme(adminDark ? "light" : "dark")}
              className={cn(
                "ml-auto w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
                adminDark
                  ? "border-white/10 text-amber-200/90 hover:bg-card/10 hover:text-amber-100"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={adminDark ? "Bright mode" : "Dark mode"}
              aria-label={adminDark ? "Switch admin to bright mode" : "Switch admin to dark mode"}
            >
              {adminDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

        {/* ── ANALYTICS TAB ────────────────────────────────────────────────── */}
        {mainTab === "analytics" && <AdminAnalytics />}

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {mainTab === "overview" && (
          <div className="space-y-6">

            {/* System Metrics */}
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    label: "Total Users",
                    value: stats?.totalUsers ?? allUsers.length,
                    sub:
                      stats?.customerUsers != null && stats.customerUsers !== stats.totalUsers
                        ? `${stats.customerUsers} non-admin`
                        : stats?.customerUsers != null
                          ? "all roles"
                          : undefined,
                    icon: <Users className="w-4 h-4" />,
                    color: "text-primary bg-primary/10",
                  },
                  { label: "Active Now",     value: stats?.activeUsers ?? 0,              icon: <Activity className="w-4 h-4" />,   color: "text-blue-700 bg-blue-100/80 dark:text-blue-300 dark:bg-blue-500/15",   sub: "last 5 min" },
                  { label: "Active Today",   value: stats?.dailyActiveUsers ?? 0,         icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-500/15" },
                  { label: "Min Today",      value: formatMinutes(stats?.minutesToday ?? 0), icon: <Clock className="w-4 h-4" />,   color: "text-orange-700 bg-orange-100/80 dark:text-orange-300 dark:bg-orange-500/15" },
                  { label: "Min This Week",  value: formatMinutes(stats?.minutesWeek ?? 0),  icon: <Calendar className="w-4 h-4" />,color: "text-violet-700 bg-violet-100/80 dark:text-violet-300 dark:bg-violet-500/15" },
                  { label: "Min This Month", value: formatMinutes(stats?.minutesMonth ?? 0), icon: <Calendar className="w-4 h-4" />,color: "text-pink-700 bg-pink-100/80 dark:text-pink-300 dark:bg-pink-500/15" },
                ].map(({ label, value, icon, color, sub }) => (
                  <Card key={label} className="p-4 border border-border dark:border-white/[0.08] shadow-sm bg-card">
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
                  { label: "MRR Estimate",      value: `$${(stats?.mrrEstimate ?? 0).toFixed(0)}`,   sub: `${stats?.payingUsers ?? 0} paying users`,   color: "text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-500/15", icon: <DollarSign className="w-4 h-4" /> },
                  { label: "Conversion Rate",   value: `${stats?.conversionRate ?? 0}%`,             sub: `${stats?.trialUsers ?? 0} still on trial`,  color: "text-blue-700 bg-blue-100/80 dark:text-blue-300 dark:bg-blue-500/15",      icon: <TrendingUp className="w-4 h-4" /> },
                  { label: "Avg Session",       value: `${stats?.avgSessionMin ?? 0}m`,              sub: "last 30 days",                               color: "text-violet-700 bg-violet-100/80 dark:text-violet-300 dark:bg-violet-500/15",  icon: <Clock className="w-4 h-4" /> },
                  { label: "Sessions Today",    value: stats?.sessionsToday ?? 0,                    sub: "all sessions",                               color: "text-orange-700 bg-orange-100/80 dark:text-orange-300 dark:bg-orange-500/15",  icon: <Radio className="w-4 h-4" /> },
                  { label: "Cost / Session",    value: fmtMoney(stats?.costPerSession ?? 0),         sub: "today's average",                            color: "text-pink-700 bg-pink-100/80 dark:text-pink-300 dark:bg-pink-500/15",      icon: <BarChart2 className="w-4 h-4" /> },
                ].map(({ label, value, sub, color, icon }) => (
                  <Card key={label} className="p-4 border border-border dark:border-white/[0.08] shadow-sm bg-card">
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
                  { label: "Soniox Transcription", value: fmtMoney(stats?.sonioxCostToday ?? 0),    sub: `${formatMinutes(stats?.minutesToday ?? 0)} @ $0.0025/min`, color: "text-blue-700 bg-blue-100/80 dark:text-blue-300 dark:bg-blue-500/15" },
                  { label: "Translation (est.)",    value: fmtMoney(stats?.translateCostToday ?? 0), sub: `${formatMinutes(stats?.minutesToday ?? 0)} · OpenAI $0.0002/min; Hetzner ~$0`, color: "text-violet-700 bg-violet-100/80 dark:text-violet-300 dark:bg-violet-500/15" },
                  { label: "Total API Cost",        value: fmtMoney(stats?.totalCostToday ?? 0),     sub: "Soniox + Translation",                                     color: "text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-500/15" },
                ].map(({ label, value, sub, color }) => (
                  <Card key={label} className="p-4 border border-border dark:border-white/[0.08] shadow-sm bg-card flex items-center gap-4">
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
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2 flex-wrap">
                <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                Live Sessions ({sessions.length})
                <span className="text-[10px] font-normal normal-case text-muted-foreground">
                  · updates every 3s · live /translate path (not plan label alone)
                </span>
                {pollLiveSessions && liveSessionsPollFetching && (
                  <span className="text-[10px] font-medium normal-case text-blue-600">refreshing…</span>
                )}
              </h2>
              {pollLiveSessions && liveSessionsPollError && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-xs text-red-950">
                  <span>
                    Live session poll failed (network, timeout, or 429). Last good snapshot is kept when available; stats still refresh on the slower interval.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-red-300 text-red-900"
                    onClick={() => void refetchLiveSessions()}
                  >
                    Retry now
                  </Button>
                </div>
              )}
              {(liveSessionSummary?.usersWithMultipleOpen ?? 0) > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Duplicate open sessions</p>
                    <p className="text-amber-900/90 mt-0.5">
                      {liveSessionSummary!.usersWithMultipleOpen} user(s) have more than one unclosed session row (e.g. tab closed before /session/stop).
                      Review cards marked “Duplicate” and terminate stale rows if needed.
                    </p>
                  </div>
                </div>
              )}
              {sessions.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm border border-dashed border-border dark:border-white/[0.16] rounded-2xl bg-card">
                  No active sessions right now.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sessions.map(s => (
                    <Card key={s.sessionId} className={`p-4 border-none shadow-sm ${s.hasSnapshot ? "bg-card" : "bg-amber-50/60"}`}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {s.hasSnapshot
                          ? <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                          : <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />}
                        <span className="font-semibold text-sm truncate">{s.username}</span>
                        {!s.hasSnapshot && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">stale</span>
                        )}
                        {(s.openSessionsForUser ?? 1) > 1 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0" title="Multiple DB rows with ended_at null for this user">
                            Duplicate #{s.openSessionOrdinal ?? "?"}/{s.openSessionsForUser}
                          </span>
                        )}
                        <span
                          className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            workspacePlanTierKey(s.planType) === "trial" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"
                          }`}
                          title="Database plan_type. For trial-libre, live /translate may still be OpenAI for the first four trial days — see line below."
                        >
                          {s.planType}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            (s.translationStack ?? "openai") === "openai"
                              ? "bg-violet-100 text-violet-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                          title={s.translationRouteDetail ?? "Live translation path from API"}
                        >
                          {(s.translationStack ?? "openai") === "openai" ? "OpenAI MT" : "Hetzner MT"}
                        </span>
                        {s.coreLane ? (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                              (s.coreLaneColor ?? "blue") === "violet"
                                ? "bg-violet-100 text-violet-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                            title="Live Hetzner lane (two-lane: 1 paid · 5001, 2 trial · 5002)"
                          >
                            {s.coreNodeLabel ?? "HZ-1"} · Core {s.coreLane}
                          </span>
                        ) : null}
                      </div>
                      {s.translationRouteDetail && (
                        <p className="text-[10px] text-muted-foreground leading-snug mb-1.5 border-l-2 border-border pl-2">
                          {s.translationRouteDetail}
                        </p>
                      )}
                      {s.email && <p className="text-xs text-muted-foreground mb-1 truncate">{s.email}</p>}
                      {s.langPair && (
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {s.langPair}
                        </p>
                      )}
                      {s.micLabel && (
                        <div className="mb-1">
                          <AudioDeviceInfo label={s.micLabel} />
                        </div>
                      )}
                      {!s.hasSnapshot && !s.micLabel && (
                        <p className="text-xs text-amber-600 mb-1">No active connection — may be a ghost session</p>
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

        {/* ── MONITOR TAB ──────────────────────────────────────────────────── */}
        {mainTab === "monitor" && (() => {
          const m = monitorData;
          const events = systemEventsData?.events ?? [];
          const filtered = eventTypeFilter === "all" ? events : events.filter(e => e.type === eventTypeFilter);

          const metricCards = [
            { label: "Active Users",           value: m?.activeUsers ?? 0,             sub: "last 5 min",   icon: <Activity className="w-4 h-4" />,    color: "text-blue-700 bg-blue-100/80 dark:text-blue-300 dark:bg-blue-500/15",      alert: false },
            { label: "Active Sessions",        value: m?.activeSessions ?? 0,          sub: "live now",     icon: <Radio className="w-4 h-4" />,       color: "text-red-600 bg-red-50",        alert: (m?.activeSessions ?? 0) > 0 },
            { label: "Failed Logins Today",    value: m?.failedLoginsToday ?? 0,       sub: "since midnight", icon: <XCircle className="w-4 h-4" />,   color: "text-red-600 bg-red-50",        alert: (m?.failedLoginsToday ?? 0) >= 5 },
            { label: "Successful Logins",      value: m?.successfulLoginsToday ?? 0,   sub: "since midnight", icon: <LogIn className="w-4 h-4" />,     color: "text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-500/15", alert: false },
            { label: "API Errors Today",       value: m?.apiErrorsToday ?? 0,          sub: "since midnight", icon: <Server className="w-4 h-4" />,    color: "text-amber-600 bg-amber-50",    alert: (m?.apiErrorsToday ?? 0) >= 10 },
            { label: "Proxy Failures",         value: m?.proxyFailuresToday ?? 0,      sub: "since midnight", icon: <Zap className="w-4 h-4" />,       color: "text-orange-700 bg-orange-100/80 dark:text-orange-300 dark:bg-orange-500/15",  alert: (m?.proxyFailuresToday ?? 0) > 0 },
            { label: "Session Expirations",    value: m?.sessionExpirationsToday ?? 0, sub: "401 errors today", icon: <ShieldAlert className="w-4 h-4" />, color: "text-violet-700 bg-violet-100/80 dark:text-violet-300 dark:bg-violet-500/15", alert: (m?.sessionExpirationsToday ?? 0) >= 20 },
            { label: "Sessions Started",       value: m?.sessionsStartedToday ?? 0,    sub: "since midnight", icon: <Play className="w-4 h-4" />,      color: "text-teal-600 bg-teal-50",      alert: false },
            { label: "Sessions Ended",         value: m?.sessionsEndedToday ?? 0,      sub: "since midnight", icon: <LogOut className="w-4 h-4" />,    color: "text-gray-600 bg-gray-100",     alert: false },
          ];

          function eventIcon(type: SystemEvent["type"]) {
            switch (type) {
              case "login_success":  return <LogIn    className="w-3.5 h-3.5 text-emerald-600" />;
              case "login_failure":  return <XCircle  className="w-3.5 h-3.5 text-red-500" />;
              case "session_start":  return <Play     className="w-3.5 h-3.5 text-blue-500" />;
              case "session_end":    return <LogOut   className="w-3.5 h-3.5 text-gray-500" />;
              case "api_error":      return <Server   className="w-3.5 h-3.5 text-amber-500" />;
              case "proxy_failure":  return <Zap      className="w-3.5 h-3.5 text-orange-500" />;
              case "email_reminder_unsubscribe": return <Mail className="w-3.5 h-3.5 text-violet-500" />;
            }
          }

          function eventDot(type: SystemEvent["type"]) {
            switch (type) {
              case "login_success":  return "bg-emerald-400";
              case "login_failure":  return "bg-red-500";
              case "session_start":  return "bg-blue-400";
              case "session_end":    return "bg-gray-400";
              case "api_error":      return "bg-amber-400";
              case "proxy_failure":  return "bg-orange-400";
              case "email_reminder_unsubscribe": return "bg-violet-400";
            }
          }

          const filterOptions = [
            { value: "all",           label: "All Events" },
            { value: "login_success", label: "Logins" },
            { value: "login_failure", label: "Failures" },
            { value: "session_start", label: "Session Start" },
            { value: "session_end",   label: "Session End" },
            { value: "api_error",     label: "API Errors" },
            { value: "proxy_failure", label: "Proxy" },
            { value: "email_reminder_unsubscribe", label: "Email unsubscribes" },
          ];

          return (
            <div className="space-y-6">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-primary" /> System Monitor
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Real-time platform health · refreshes every 15 seconds</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { void refetchMonitor(); void refetchSystemEvents(); }} className="h-8 text-xs gap-1.5">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>

              {/* Metric Cards */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Platform Health</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {metricCards.slice(0, 5).map(({ label, value, sub, icon, color, alert }) => (
                    <Card key={label} className={`p-4 border-none shadow-sm ${alert ? "bg-red-100/80 ring-1 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30" : "bg-card"}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>{icon}</div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
                      <p className={`text-xl font-bold font-display mt-0.5 ${alert ? "text-red-600" : ""}`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground">{sub}</p>
                    </Card>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {metricCards.slice(5).map(({ label, value, sub, icon, color, alert }) => (
                    <Card key={label} className={`p-4 border-none shadow-sm ${alert ? "bg-orange-100/80 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:ring-orange-500/30" : "bg-card"}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>{icon}</div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
                      <p className={`text-xl font-bold font-display mt-0.5 ${alert ? "text-orange-600" : ""}`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground">{sub}</p>
                    </Card>
                  ))}
                </div>
              </section>

              {/* Recent System Events */}
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Recent System Events <span className="text-primary font-bold">({filtered.length})</span>
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {filterOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setEventTypeFilter(opt.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${eventTypeFilter === opt.value ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05]"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Card className="border border-border dark:border-white/[0.08] shadow-sm bg-card overflow-hidden">
                  {filtered.length === 0 ? (
                    <div className="py-14 text-center text-muted-foreground text-sm">
                      <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No events in the last 24 hours.
                    </div>
                  ) : (
                    <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                      {filtered.map(ev => (
                        <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 dark:hover:bg-white/[0.05]/60 transition-colors">
                          {/* Timeline dot */}
                          <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                            <div className={`w-2 h-2 rounded-full mt-0.5 ${eventDot(ev.type)}`} />
                          </div>
                          {/* Icon */}
                          <div className="flex-shrink-0 mt-0.5">
                            {eventIcon(ev.type)}
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-foreground">{ev.title}</span>
                              {ev.type === "login_failure" && (
                                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium">failure</span>
                              )}
                              {ev.type === "proxy_failure" && (
                                <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">proxy</span>
                              )}
                              {ev.type === "api_error" && (
                                <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-mono">{String(ev.meta.statusCode ?? "")}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.description}</p>
                          </div>
                          {/* Timestamp */}
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                            {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-border bg-gray-50 text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Showing {filtered.length} event{filtered.length !== 1 ? "s" : ""} from the last 24 hours</span>
                      <span className="text-primary font-medium">Auto-refreshes every 15 s</span>
                    </div>
                  )}
                </Card>
              </section>

            </div>
          );
        })()}

        {/* ── USERS TAB ────────────────────────────────────────────────────── */}
        {mainTab === "users" && (
          <Card className="overflow-hidden border-border shadow-sm">
            {/* Filters + New User */}
            <div className="p-4 border-b border-border bg-card space-y-3">
              {/* Row 1: plan filter pills + New User button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "trial", "paying", "inactive", "high", "dupIp"] as const).map(f => (
                    <button key={f} onClick={() => setUserFilter(f)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${userFilter === f ? "bg-primary text-white" : f === "dupIp" && filterCounts.dupIp > 0 ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300/60" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"}`}
                    >
                      {f === "all"      && `All (${filterCounts.all})`}
                      {f === "trial"    && `Trial (${filterCounts.trial})`}
                      {f === "paying"   && `Paying (${filterCounts.paying})`}
                      {f === "inactive" && `Inactive (${filterCounts.inactive})`}
                      {f === "high"     && `High Usage (${filterCounts.high})`}
                      {f === "dupIp"    && `Shared IP (${filterCounts.dupIp})`}
                    </button>
                  ))}
                </div>
                <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="h-8 shadow-sm flex-shrink-0">
                  <Plus className="w-4 h-4 mr-1.5" /> New User
                </Button>
              </div>

              {/* Row 2: search + activity filters + sort */}
              <div className="flex flex-wrap gap-2 items-center">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-[260px]">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search email or username…"
                    className="w-full h-8 pl-3 pr-7 rounded-lg border border-border dark:border-white/[0.12] bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  {userSearch && (
                    <button onClick={() => setUserSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Last Seen filter */}
                <select
                  value={lastSeenFilter}
                  onChange={e => setLastSeenFilter(e.target.value)}
                  className={`h-8 px-2 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 ${lastSeenFilter ? "border-primary/50 bg-primary/5 text-primary font-semibold" : "border-border bg-card text-muted-foreground"}`}
                >
                  <option value="">Last Seen: Any</option>
                  <option value="5min">Active (5 min)</option>
                  <option value="1h">Active (1 hour)</option>
                  <option value="today">Active Today</option>
                  <option value="week">Active This Week</option>
                  <option value="inactive">Inactive (7d+)</option>
                </select>

                {/* New Users filter */}
                <select
                  value={newUsersFilter}
                  onChange={e => setNewUsersFilter(e.target.value)}
                  className={`h-8 px-2 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 ${newUsersFilter ? "border-primary/50 bg-primary/5 text-primary font-semibold" : "border-border bg-card text-muted-foreground"}`}
                >
                  <option value="">Joined: Any</option>
                  <option value="today">Joined Today</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className={`h-8 px-2 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 ${sortBy ? "border-primary/50 bg-primary/5 text-primary font-semibold" : "border-border bg-card text-muted-foreground"}`}
                >
                  <option value="">Sort: Default</option>
                  <option value="lastSeen">Sort: Last Seen</option>
                  <option value="minutesToday">Sort: Today's Usage</option>
                  <option value="totalUsage">Sort: Total Usage</option>
                  <option value="sessionCount">Sort: Sessions</option>
                  <option value="trialEnding">Sort: Trial Ending Soon</option>
                </select>

                <button
                  onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                  className="h-8 px-2.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05] font-mono"
                  title={sortDir === "desc" ? "Descending — click to flip" : "Ascending — click to flip"}
                >
                  {sortDir === "desc" ? "↓" : "↑"}
                </button>

                {/* Clear all filters */}
                {(userSearch || lastSeenFilter || newUsersFilter || sortBy || userFilter !== "all") && (
                  <button
                    onClick={() => { setUserSearch(""); setLastSeenFilter(""); setNewUsersFilter(""); setSortBy("lastSeen"); setUserFilter("all"); }}
                    className="h-8 px-2.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                  >
                    Reset
                  </button>
                )}

                {/* Result count */}
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {filteredUsers.length} of {allUsers.length} users
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-border/70">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bulk daily limit</span>
                <span className="text-[11px] text-muted-foreground">
                  Non-admins only; skips unlimited-style caps (≥9000 min).
                </span>
                <button
                  type="button"
                  disabled={bumpDailyFloorPending}
                  onClick={() => bumpAllUsersDailyFloor(360)}
                  className="h-7 px-2.5 rounded-lg border border-border bg-card text-[11px] font-medium text-muted-foreground hover:bg-violet-50 hover:text-violet-800 hover:border-violet-300 disabled:opacity-50"
                >
                  Floor ≥ 6h
                </button>
                <button
                  type="button"
                  disabled={bumpDailyFloorPending}
                  onClick={() => bumpAllUsersDailyFloor(480)}
                  className="h-7 px-2.5 rounded-lg border border-border bg-card text-[11px] font-medium text-muted-foreground hover:bg-violet-50 hover:text-violet-800 hover:border-violet-300 disabled:opacity-50"
                >
                  Floor ≥ 8h
                </button>
              </div>

              {sharedLoginIpIndex.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
                  Shared-IP review moved to <strong>IP Watch</strong> tab ({sharedLoginIpIndex.length} flagged IP{sharedLoginIpIndex.length !== 1 ? "s" : ""}).
                </div>
              )}

              {paidBillingRollup && (
                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 text-xs text-emerald-950 space-y-1">
                  <p className="font-semibold text-[11px] uppercase tracking-wide text-emerald-900/90">
                    Paid users — billing window (admin only)
                  </p>
                  <p className="text-[11px] leading-snug text-emerald-900/85">
                    <span className="font-semibold tabular-nums">{paidBillingRollup.paidUsersInRollup}</span> paying accounts with a window ·{" "}
                    <span className="font-semibold tabular-nums">{paidBillingRollup.totalEligibleHoursThisPeriod} h</span> total eligible this period
                    (full daily cap each day) ·{" "}
                    <span className="font-semibold tabular-nums">{paidBillingRollup.totalHoursUsedThisPeriod} h</span> used so far ·{" "}
                    <span className="font-semibold tabular-nums">{paidBillingRollup.totalProjectedHoursAtPeriodEnd} h</span> projected at renewal
                    (pace extrapolation, capped at eligible).
                  </p>
                  <p className="text-[10px] text-emerald-900/70 leading-snug">
                    Window uses <code className="font-mono bg-card/60 px-0.5 rounded">subscription_started_at</code> or signup date, and{" "}
                    <code className="font-mono bg-card/60 px-0.5 rounded">subscription_period_ends_at</code> or start + 30 days. Compare to month-end once period end is in the same month.
                  </p>
                </div>
              )}
            </div>

            {/* Create form */}
            {showCreate && (
              <div className="p-5 bg-gray-50 border-b border-border">
                <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="h-9 bg-card" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="h-9 bg-card" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Daily Limit (min)</label>
                    <Input type="number" value={newLimit} onChange={e => setNewLimit(Number(e.target.value))} required min={1} className="h-9 bg-card" />
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
            <div className="overflow-x-auto bg-card">
              <table className="w-full text-sm text-left min-w-[1180px]">
                <thead className="bg-gray-50/80 text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Risk</th>
                    <th className="px-4 py-3 font-semibold">Session</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Today</th>
                    <th className="px-4 py-3 font-semibold text-right" title="Paid: max hours if full daily cap every day in current subscription window (admin only).">
                      Period cap (h)
                    </th>
                    <th className="px-4 py-3 font-semibold text-right" title="Paid: billable hours used in that window (sessions started in window; admin only).">
                      Window used (h)
                    </th>
                    <th className="px-4 py-3 font-semibold text-right" title="Paid: linear projection to window end, capped at period cap (admin only).">
                      Proj. (h)
                    </th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Last Seen</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map(u => {
                    const todayPct  = Math.min(100, (u.minutesUsedToday / u.dailyLimitMinutes) * 100);
                    const clusters = u.sharedLoginIpClusters ?? [];
                    const firstCluster = clusters[0];
                    const dupAccent =
                      (u.sharedLoginIpMaxAccounts ?? 1) >= 2 && firstCluster && firstCluster.accounts.length >= 2
                        ? sharedIpRowAccent(firstCluster.accounts.map((a) => a.id))
                        : null;
                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${dupAccent ? "bg-amber-50/25" : ""}`}
                        style={
                          dupAccent
                            ? {
                                borderLeftWidth: 4,
                                borderLeftStyle: "solid",
                                borderLeftColor: `hsl(${dupAccent.hue} 58% 42%)`,
                              }
                            : undefined
                        }
                        onClick={() => openHistory(u.id, u.username)}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                            {u.username}
                            {u.isAdmin && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase font-bold">Admin</span>}
                            {!u.isAdmin && (Date.now() - new Date(u.createdAt).getTime()) < 24 * 60 * 60 * 1000 && (
                              <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full uppercase font-bold">New</span>
                            )}
                          </div>
                          {u.email && <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{u.email}</div>}
                          <div className="text-[10px] text-muted-foreground">Joined {format(new Date(u.createdAt), "MMM d, yyyy · HH:mm")}</div>
                        </td>

                        <td className="px-4 py-3 align-top text-xs" onClick={(e) => e.stopPropagation()}>
                          {(u.sharedLoginIpMaxAccounts ?? 1) >= 2 ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                                Shared IP ({u.sharedLoginIpMaxAccounts})
                              </span>
                              {firstCluster?.ip && (
                                <code className="text-[9px] font-mono text-muted-foreground break-all">{firstCluster.ip}</code>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>

                        {/* Session Status — uses fast-polling live data when available */}
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
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <code className="text-[10px] font-mono text-foreground bg-gray-100 px-1.5 py-0.5 rounded self-start">
                              {u.planType}
                            </code>
                            {trialBadge(u.trialEndsAt, u.planType ?? "trial")}
                            {isTrialLikePlanType(u.planType) && u.trialEndsAt && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                ends {format(new Date(u.trialEndsAt), "MMM d")}
                              </span>
                            )}
                            {!isTrialLikePlanType(u.planType) && (() => {
                              const paidFrom = (u as unknown as { subscriptionStartedAt?: string | null }).subscriptionStartedAt;
                              const periodEnd = (u as unknown as { subscriptionPeriodEndsAt?: string | null }).subscriptionPeriodEndsAt;
                              const subSt = String((u as { subscriptionStatus?: string | null }).subscriptionStatus ?? "").trim();
                              const created = u.createdAt;
                              // Any paid plan row: estimate from account created when PayPal never wrote timestamps.
                              const showPaidEstimates = !isTrialLikePlanType(u.planType ?? "");
                              const displayStartIso =
                                paidFrom ??
                                (showPaidEstimates && created ? created : null);
                              const startIsProxy = Boolean(!paidFrom && displayStartIso);
                              const displayEndDate = periodEnd
                                ? new Date(periodEnd)
                                : displayStartIso
                                  ? addBillingFallbackPeriod(new Date(displayStartIso))
                                  : null;
                              const endIsEstimate = Boolean(!periodEnd && displayStartIso);
                              const dateFmt = "MMM d, yyyy · HH:mm";
                              return (
                                <div className="mt-0.5 space-y-0.5 text-[10px] leading-tight">
                                  {subSt ? (
                                    <div className="text-muted-foreground">
                                      Billing status: <span className="font-medium text-foreground/90">{subSt}</span>
                                    </div>
                                  ) : (
                                    <div className="text-muted-foreground italic">Billing status: not set</div>
                                  )}
                                  <div className="text-muted-foreground whitespace-nowrap">
                                    Subscribed:{" "}
                                    {displayStartIso ? (
                                      <span className="font-medium text-foreground tabular-nums">
                                        {format(new Date(displayStartIso), dateFmt)}
                                        {startIsProxy ? (
                                          <span className="font-normal italic text-muted-foreground"> (signup)</span>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-medium">—</span>
                                    )}
                                  </div>
                                  <div className="text-muted-foreground whitespace-nowrap">
                                    Period ends:{" "}
                                    {displayEndDate ? (
                                      <span className="font-medium text-foreground tabular-nums">
                                        {format(displayEndDate, dateFmt)}
                                        {endIsEstimate ? (
                                          <span className="font-normal italic text-muted-foreground"> (est.)</span>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-medium">—</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>

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

                        {/* Paid billing window — admin API only */}
                        <td className="px-4 py-3 text-xs text-right tabular-nums text-muted-foreground">
                          {u.paidBillingEligibleHours != null ? (
                            <span title="Eligible hours this subscription window (daily cap × days).">{u.paidBillingEligibleHours}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-right tabular-nums text-muted-foreground">
                          {u.paidBillingHoursUsedInPeriod != null ? (
                            <span title="Hours from sessions started inside the window.">{u.paidBillingHoursUsedInPeriod}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-right tabular-nums text-muted-foreground">
                          {u.paidBillingProjectedHoursAtPeriodEnd != null ? (
                            <span title="Projected at period end from current pace (capped).">{u.paidBillingProjectedHoursAtPeriodEnd}</span>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatMinutes(u.totalMinutesUsed)}
                          <span className="text-gray-400 text-[10px]"> ({u.totalSessions} sess)</span>
                          {u.totalShares > 0 && (
                            <span className="ml-1.5 text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full font-semibold" title="Total shares">
                              {u.totalShares} shares
                            </span>
                          )}
                        </td>

                        {/* Last seen */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {lastSeen(u.lastActivityAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <Button variant="outline" size="sm" onClick={() => openHistory(u.id, u.username)} title="Session History" className="h-7 w-7 p-0 text-primary/70 hover:text-primary hover:border-primary/40">
                            <History className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEditUser(u)} title="Manage User" className="h-7 w-7 p-0 text-violet-600/70 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50">
                            <Pencil className="w-3 h-3" />
                          </Button>
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
                      <td colSpan={12} className="px-6 py-12 text-center text-muted-foreground bg-card">
                        No users match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-gray-50/50 border-t border-border text-[11px] text-muted-foreground space-y-0.5">
              <div>Click a row to view session history.</div>
              <div>
                <strong className="text-foreground">Risk</strong> is a compact shared-IP indicator only; full account/IP mapping and disable actions are in <strong className="text-foreground">IP Watch</strong>.
              </div>
            </div>
          </Card>
        )}

        {/* ── IP WATCH TAB ─────────────────────────────────────────────────── */}
        {mainTab === "ipWatch" && (
          <Card className="overflow-hidden border-border shadow-sm bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Shared IP Watch</h3>
                <p className="text-xs text-muted-foreground">Successful login IPs used by 2+ accounts (auto-refreshes with Users data).</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                {sharedLoginIpIndex.length} flagged IP{sharedLoginIpIndex.length !== 1 ? "s" : ""}
              </span>
            </div>
            {sharedLoginIpIndex.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No shared-IP clusters detected.</div>
            ) : (
              <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
                {sharedLoginIpIndex.map((c) => {
                  const accent = sharedIpRowAccent(c.accounts.map((a) => a.id));
                  return (
                    <div
                      key={c.ip}
                      className="px-4 py-3"
                      style={{ borderLeft: `4px solid hsl(${accent.hue} 56% 44%)` }}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <code className="text-xs font-mono bg-amber-50 px-1.5 py-0.5 rounded">{c.ip}</code>
                        <span className="text-[10px] font-bold text-amber-900">Tag {accent.label}</span>
                        <span className="text-[10px] text-muted-foreground">{c.accountCount} accounts</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.accounts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="text-[11px] font-medium px-2 py-0.5 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100"
                            title={a.email ?? `User #${a.id}`}
                            onClick={() => {
                              const peer = allUsers.find((x) => x.id === a.id);
                              if (peer) openEditUser(peer);
                            }}
                          >
                            #{a.id} {a.username}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* ── LANGUAGES TAB ────────────────────────────────────────────────── */}
        {mainTab === "languages" && (
          <div className="space-y-5">
            <Card className="p-6 border border-border dark:border-white/[0.08] shadow-sm bg-card">
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
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                          : "border-border bg-card text-muted-foreground hover:border-gray-300"
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
              <Card key={item.id} className="p-5 border border-border dark:border-white/[0.08] shadow-sm bg-card">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">{item.username}</h3>
                    {item.email && (
                      <p className="text-[11px] text-muted-foreground">{item.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-3.5 h-3.5 ${s <= item.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                    ))}
                  </div>
                </div>
                {item.recommend && (
                  <div className="mb-2.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      item.recommend === "yes"   ? "bg-green-50 text-green-700 border-green-100" :
                      item.recommend === "no"    ? "bg-red-50 text-red-700 border-red-100" :
                                                   "bg-amber-50 text-amber-700 border-amber-100"
                    }`}>
                      {item.recommend === "yes" ? "👍 Would recommend" : item.recommend === "no" ? "👎 Wouldn't recommend" : "🤔 Not sure"}
                    </span>
                  </div>
                )}
                {item.source === "daily-prompt" && (
                  <p className="text-[10px] text-muted-foreground mb-2">via daily prompt</p>
                )}
                {(item.source === "trial-ended" || item.source === "trial-daily-mid-session") && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    {item.source === "trial-ended" ? "trial ended modal" : "mid-trial prompt"}
                  </p>
                )}
                {item.comment
                  ? <p className="text-sm text-foreground/80 italic">"{item.comment}"</p>
                  : <p className="text-sm text-muted-foreground italic">No comment provided.</p>
                }
              </Card>
            ))}
            {feedback.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground border border-dashed border-border rounded-2xl bg-card">
                No feedback received yet.
              </div>
            )}
          </div>
        )}

        {/* ── REFERRALS TAB ────────────────────────────────────────────────── */}
        {mainTab === "referrals" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="p-4 border border-border dark:border-white/[0.08] shadow-sm bg-card">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total referrals</p>
                <p className="text-2xl font-bold mt-1">{referralsAdminData?.totals.totalReferrals ?? 0}</p>
              </Card>
              <Card className="p-4 border border-border dark:border-white/[0.08] shadow-sm bg-card">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active referrals</p>
                <p className="text-2xl font-bold mt-1 text-green-700">{referralsAdminData?.totals.activeReferrals ?? 0}</p>
              </Card>
              <Card className="p-4 border border-border dark:border-white/[0.08] shadow-sm bg-card">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pending referrals</p>
                <p className="text-2xl font-bold mt-1 text-amber-700">{referralsAdminData?.totals.pendingReferrals ?? 0}</p>
              </Card>
            </div>
            <Card className="border border-border dark:border-white/[0.08] shadow-sm bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-base">Referral tracking</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manual rewards only. Badge indicates a referrer has reached 3 active referrals.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-2.5">Referrer</th>
                      <th className="text-left px-4 py-2.5">Referred user</th>
                      <th className="text-left px-4 py-2.5">Status</th>
                      <th className="text-left px-4 py-2.5">Sessions</th>
                      <th className="text-left px-4 py-2.5">Joined</th>
                      <th className="text-left px-4 py-2.5">Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(referralsAdminData?.rows ?? []).map((row) => (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{row.referrerName ?? `User #${row.referrerId}`}</p>
                          <p className="text-xs text-muted-foreground">{row.referrerEmail ?? "No email"}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{row.referredUsername ?? `User #${row.referredUserId}`}</p>
                          <p className="text-xs text-muted-foreground">{row.referredEmail ?? "No email"}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            row.status === "active" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">{row.sessionsCount}</td>
                        <td className="px-4 py-2.5">{format(new Date(row.createdAt), "MMM d, yyyy")}</td>
                        <td className="px-4 py-2.5">
                          {row.rewardPending ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                              Reward pending - 3 referrals completed
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(referralsAdminData?.rows?.length ?? 0) === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                          No referrals yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ── SUPPORT TAB ──────────────────────────────────────────────────── */}
        {mainTab === "support" && (
          <div className="space-y-4">
            <Card className="border border-border dark:border-white/[0.08] shadow-sm bg-card overflow-hidden">
              {/* Support header */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <LifeBuoy className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Support Messages</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {supportTickets.filter(t => t.status === "open").length} open · {supportTickets.filter(t => t.status === "resolved").length} resolved
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filter chips */}
                  {(["all", "open", "resolved"] as const).map(f => (
                    <button key={f} onClick={() => setSupportFilter(f)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${supportFilter === f ? "bg-primary text-white" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"}`}>
                      {f}
                    </button>
                  ))}
                  <Button variant="outline" size="sm" onClick={fetchSupportTickets} className="h-8 w-8 p-0 ml-1">
                    <RefreshCw className={`w-3.5 h-3.5 ${supportLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Ticket list */}
              {supportLoading && supportTickets.length === 0 ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" /></div>
              ) : (() => {
                const filtered = supportTickets.filter(t => supportFilter === "all" || t.status === supportFilter);
                if (filtered.length === 0) return (
                  <div className="py-16 text-center text-muted-foreground">
                    <LifeBuoy className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No {supportFilter !== "all" ? supportFilter : ""} tickets yet.</p>
                  </div>
                );
                return (
                  <div className="divide-y divide-border">
                    {filtered.map(ticket => (
                      <div key={ticket.id}>
                        {/* Ticket row */}
                        <button
                          className="w-full px-6 py-4 text-left hover:bg-muted/40 dark:hover:bg-white/[0.05] transition-colors flex items-start gap-3"
                          onClick={() => { setReplyText(""); void toggleTicketExpand(ticket.id); }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-[10px] text-muted-foreground font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{ticket.id}</span>
                              {ticket.status === "resolved" ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle className="w-2.5 h-2.5" /> Resolved
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                                  <Clock className="w-2.5 h-2.5" /> Open
                                </span>
                              )}
                              {ticket.replyCount > 0 && (
                                <span className="text-[10px] text-muted-foreground">{ticket.replyCount} repl{ticket.replyCount === 1 ? "y" : "ies"}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                              {ticket.subject.startsWith("[Translation Issue") && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded shrink-0">⚠ Translation</span>
                              )}
                              {ticket.subject.startsWith("[User Feedback]") && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-violet-100 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded shrink-0">💬 Feedback</span>
                              )}
                              <span className="truncate">{ticket.subject.replace(/^\[(Translation Issue Report|User Feedback)\]\s*/, "").trim() || ticket.subject}</span>
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">
                                {ticket.username ? `@${ticket.username}` : ticket.email}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50">·</span>
                              <span className="text-[11px] text-muted-foreground">{format(new Date(ticket.createdAt), "MMM d, yyyy HH:mm")}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 mt-1">
                            <Button
                              variant="outline" size="sm"
                              onClick={e => { e.stopPropagation(); void toggleTicketStatus(ticket.id, ticket.status); }}
                              isLoading={statusLoading === ticket.id}
                              className={`h-7 text-xs px-2.5 ${ticket.status === "open" ? "text-green-700 border-green-200 hover:bg-green-50" : "text-amber-700 border-amber-200 hover:bg-amber-50"}`}
                            >
                              {ticket.status === "open" ? <><CheckCircle className="w-3 h-3 mr-1" />Resolve</> : <><Clock className="w-3 h-3 mr-1" />Reopen</>}
                            </Button>
                            {expandedTicket === ticket.id
                              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {/* Expanded thread */}
                        {expandedTicket === ticket.id && (
                          <div className="bg-gray-50 border-t border-border px-6 py-4 space-y-4">
                            {detailLoading ? (
                              <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" /></div>
                            ) : ticketDetail && (
                              <>
                                {/* Original message */}
                                <div className="bg-card rounded-xl border border-border p-4">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <span>{ticket.username ? `@${ticket.username}` : ticket.email}</span>
                                    <span className="normal-case font-normal">{format(new Date(ticket.createdAt), "MMM d, yyyy HH:mm")}</span>
                                  </p>
                                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ticketDetail.message}</p>
                                  <p className="text-[11px] text-muted-foreground mt-2">Reply to: {ticket.email}</p>
                                </div>

                                {/* Thread replies */}
                                {ticketDetail.replies.map(reply => (
                                  <div key={reply.id} className={`rounded-xl border p-4 ${reply.isAdmin ? "bg-blue-50 border-blue-100 ml-6" : "bg-card border-border"}`}>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                      {reply.isAdmin ? (
                                        <><span className="w-2 h-2 rounded-full bg-primary inline-block" /><span className="text-primary">Support Team</span></>
                                      ) : (
                                        <span>{reply.username ?? ticket.email}</span>
                                      )}
                                      <span className="ml-auto normal-case font-normal">{format(new Date(reply.createdAt), "MMM d, yyyy HH:mm")}</span>
                                    </p>
                                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{reply.message}</p>
                                  </div>
                                ))}

                                {/* Reply form */}
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">Reply as Support Team</p>
                                  <textarea
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    rows={3}
                                    placeholder="Type your reply..."
                                    className="w-full text-sm rounded-xl border border-border bg-card px-3 py-2.5 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      isLoading={replyLoading}
                                      disabled={!replyText.trim()}
                                      onClick={() => void submitAdminReply(ticket.id)}
                                      className="text-xs h-8"
                                    >
                                      <Send className="w-3.5 h-3.5 mr-1.5" /> Send Reply
                                    </Button>
                                    <p className="text-[11px] text-muted-foreground">User will receive a reply notification email.</p>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Card>
          </div>
        )}

        {/* ── ERRORS TAB ───────────────────────────────────────────────────── */}
        {mainTab === "errors" && (
          <div className="space-y-5">
            {/* Sub-tab toggle */}
            <div className="flex items-center gap-1 bg-card rounded-xl p-1 border border-border shadow-sm w-fit">
              {[
                { id: "api" as const,   label: "API Errors" },
                { id: "login" as const, label: "Login Events" },
              ].map(t => (
                <button key={t.id} onClick={() => setErrorsSubTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${errorsSubTab === t.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05]"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── LOGIN EVENTS sub-tab ── */}
            {errorsSubTab === "login" && (
              <div className="space-y-5">
                {/* Login summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Total logins (24h)", value: loginEventsSummary?.total24h ?? "—",    color: "bg-blue-50 text-blue-700",   icon: <Activity className="w-4 h-4" /> },
                    { label: "Successful",          value: loginEventsSummary?.success24h ?? "—",  color: "bg-green-50 text-green-700", icon: <CheckCircle className="w-4 h-4" /> },
                    { label: "Failed",              value: loginEventsSummary?.failures24h ?? "—", color: "bg-red-50 text-red-700",     icon: <AlertTriangle className="w-4 h-4" /> },
                    { label: "2FA verified",        value: loginEventsSummary?.twoFa24h ?? "—",    color: "bg-violet-50 text-violet-700", icon: <Lock className="w-4 h-4" /> },
                  ].map(c => (
                    <Card key={c.label} className="p-4 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.color}`}>{c.icon}</div>
                      <div>
                        <p className="text-2xl font-bold leading-none">{c.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Login filter + refresh */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-1 bg-card rounded-xl p-1 border border-border shadow-sm">
                    {["all", "success", "failure", "2fa"].map(f => (
                      <button key={f} onClick={() => setLoginEventFilter(f)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize ${loginEventFilter === f ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05]"}`}>
                        {f === "all" ? "All" : f === "2fa" ? "2FA" : f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { void refetchLoginEvents(); void refetchLoginSummary(); }} className="gap-1.5 text-xs">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>

                {/* Login events table */}
                <Card className="overflow-hidden">
                  {loginEventsLoading ? (
                    <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" /></div>
                  ) : !loginEventsData?.events?.length ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                      <p className="text-sm font-medium">No login events yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-gray-50">
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Time</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Result</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">User</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Reason</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">2FA</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Device</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">IP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {loginEventsData.events.map(e => (
                            <tr key={e.id} className="hover:bg-muted/40 dark:hover:bg-white/[0.05] transition-colors">
                              <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                                {format(new Date(e.createdAt), "MMM d HH:mm:ss")}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${e.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {e.success ? "Success" : "Failed"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 max-w-[120px] truncate">
                                <span className="font-medium text-foreground">{e.username ? `@${e.username}` : (e.email ?? "—")}</span>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground capitalize">
                                {e.failureReason ? e.failureReason.replace(/_/g, " ") : "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                {e.is2fa
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700">2FA</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">
                                {e.userAgent ? (/iPhone|Android.*Mobile|Windows Phone/i.test(e.userAgent) ? "📱 Mobile" : "💻 Desktop") : "—"}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                                {e.ipAddress ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {loginEventsData?.events?.length ? (
                    <div className="px-4 py-2 border-t border-border bg-gray-50">
                      <p className="text-[11px] text-muted-foreground">
                        Showing {loginEventsData.events.length} most recent events · auto-refreshes every 30s
                      </p>
                    </div>
                  ) : null}
                </Card>

                {/* Failure reasons breakdown */}
                {loginEventsSummary?.byReason && loginEventsSummary.byReason.length > 0 && (
                  <Card className="p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Failure Reasons (Last 24h)</h3>
                    <div className="space-y-2">
                      {loginEventsSummary.byReason.map(r => {
                        const pct = loginEventsSummary.failures24h > 0 ? (r.count / loginEventsSummary.failures24h) * 100 : 0;
                        return (
                          <div key={r.reason ?? "unknown"} className="flex items-center gap-3">
                            <span className="w-36 text-xs capitalize text-foreground">{(r.reason ?? "unknown").replace(/_/g, " ")}</span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-foreground w-6 text-right">{r.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── API ERRORS sub-tab ── */}
            {errorsSubTab === "api" && (
              <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total (24h)",      value: errorsSummary?.total24h ?? "—",        color: "bg-red-50 text-red-700",    icon: <AlertTriangle className="w-4 h-4" /> },
                { label: "Login Failures",   value: errorsSummary?.loginFailures24h ?? "—", color: "bg-amber-50 text-amber-700", icon: <Lock className="w-4 h-4" /> },
                { label: "Rate Limited",     value: errorsSummary?.rateLimited24h ?? "—",   color: "bg-violet-50 text-violet-700", icon: <StopCircle className="w-4 h-4" /> },
                { label: "Server Errors",    value: errorsSummary?.serverErrors24h ?? "—",  color: "bg-orange-50 text-orange-700", icon: <Activity className="w-4 h-4" /> },
              ].map(c => (
                <Card key={c.label} className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.color}`}>{c.icon}</div>
                  <div>
                    <p className="text-2xl font-bold leading-none">{c.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Filter + refresh */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-card rounded-xl p-1 border border-border shadow-sm">
                {["all", "login_failure", "session_expired", "rate_limited", "server_error", "proxy_error", "auth_error"].map(t => (
                  <button
                    key={t}
                    onClick={() => setErrorTypeFilter(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize ${errorTypeFilter === t ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05]"}`}
                  >
                    {t === "all" ? "All" : t.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => { void refetchErrors(); void refetchErrorsSummary(); }} className="gap-1.5 text-xs">
                <RefreshCw className="w-3 h-3" /> Refresh
              </Button>
            </div>

            {/* Error log table */}
            <Card className="overflow-hidden">
              {errorsLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary" /></div>
              ) : !errorsData?.errors?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="text-sm font-medium">No errors found</p>
                  <p className="text-xs mt-1">Great — everything is running clean.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-gray-50">
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Time</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Type</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Endpoint</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">User</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Device</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {errorsData.errors.map(e => (
                        <tr key={e.id} className="hover:bg-muted/40 dark:hover:bg-white/[0.05] transition-colors">
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                            {format(new Date(e.createdAt), "MMM d HH:mm:ss")}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize
                              ${e.errorType === "login_failure"  ? "bg-amber-100 text-amber-700"  :
                                e.errorType === "rate_limited"   ? "bg-violet-100 text-violet-700" :
                                e.errorType === "server_error"   ? "bg-red-100 text-red-700"      :
                                e.errorType === "session_expired"? "bg-blue-100 text-blue-700"    :
                                e.errorType === "proxy_error"    ? "bg-orange-100 text-orange-700":
                                                                    "bg-gray-100 text-gray-600"}`}>
                              {e.errorType.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[10px] text-foreground max-w-[160px] truncate" title={e.endpoint}>
                            <span className="text-muted-foreground">{e.method} </span>{e.endpoint}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`font-semibold ${e.statusCode >= 500 ? "text-red-600" : e.statusCode >= 400 ? "text-amber-600" : "text-foreground"}`}>
                              {e.statusCode}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 max-w-[120px] truncate">
                            {e.username ? (
                              <span className="text-foreground">@{e.username}</span>
                            ) : (
                              <span className="text-muted-foreground italic">anonymous</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 max-w-[120px] truncate text-muted-foreground" title={e.userAgent ?? ""}>
                            {e.userAgent
                              ? e.userAgent.includes("Mobile") || e.userAgent.includes("iPhone") || e.userAgent.includes("Android")
                                ? "📱 Mobile"
                                : "💻 Desktop"
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                            {e.ipAddress ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {errorsData?.errors?.length ? (
                <div className="px-4 py-2 border-t border-border bg-gray-50 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Showing {errorsData.errors.length} most recent errors · auto-refreshes every 30s
                  </p>
                </div>
              ) : null}
            </Card>

            {/* Breakdown by type */}
            {errorsSummary?.byType24h && errorsSummary.byType24h.length > 0 && (
              <Card className="p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">By Error Type (Last 24h)</h3>
                <div className="space-y-2">
                  {errorsSummary.byType24h.map(r => {
                    const pct = errorsSummary.total24h > 0 ? (r.count / errorsSummary.total24h) * 100 : 0;
                    return (
                      <div key={r.errorType} className="flex items-center gap-3">
                        <span className="w-32 text-xs capitalize text-foreground">{r.errorType.replace(/_/g, " ")}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-foreground w-8 text-right">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── VIEW SESSION MODAL ───────────────────────────────────────────── */}
      {viewingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setViewingSessionId(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 justify-between p-4 sm:p-5 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-base truncate">
                    {viewLoading ? "Loading…" : sessionDetail ? `Session #${sessionDetail.sessionId} — ${sessionDetail.username}` : "View Session"}
                  </h3>
                  {sessionDetail && (
                    <p className="text-xs text-muted-foreground truncate">
                      {sessionDetail.email ?? ""} · {sessionDetail.planType} plan · {fmtDuration(sessionDetail.durationSeconds)}
                      {sessionDetail.isLive && " · "}{sessionDetail.isLive && <span className="text-red-500 font-medium">Live</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
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
            {sessionDetail?.snapshot ? (
              <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 bg-gray-50 border-b border-border text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> {sessionDetail.snapshot.langA} ↔ {sessionDetail.snapshot.langB}</span>
                <span className="flex items-center gap-1">
                  <AudioDeviceInfo label={sessionDetail.snapshot.micLabel} />
                </span>
                <span className="flex items-center gap-1 ml-auto text-[10px]">
                  Updated {formatDistanceToNow(new Date(sessionDetail.snapshot.updatedAt), { addSuffix: true })}
                </span>
              </div>
            ) : sessionDetail?.isLive && sessionDetail.langPair ? (
              <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>No live data received — session may be inactive. <span className="font-medium">{sessionDetail.langPair}</span></span>
              </div>
            ) : null}

            {/* One <tr> per stable finalized pair: source column = lang A, translation column = lang B. */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-4 sm:px-5 pt-2 pb-1">
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Stable monitor mode: only strict source↔translation pairs are shown. Live view is intentionally one segment delayed to avoid duplicate/blank artifacts.
                </p>
              </div>
              <div className="p-4 sm:p-5 pt-2">
                {viewLoading ? (
                  <div className="text-sm text-muted-foreground italic">Loading…</div>
                ) : sessionDetail?.snapshot &&
                  (sessionDetail.snapshot.transcript.trim() || (sessionDetail.snapshot.translation ?? "").trim()) ? (
                  (() => {
                    const snap = sessionDetail.snapshot;
                    const stableRows = buildStableSnapshotRows(snap, Boolean(sessionDetail?.isLive));
                    if (stableRows.length === 0) {
                      return (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                          Waiting for stable aligned segment pairs (source + translation). Live monitor intentionally hides the newest in-flight row.
                        </div>
                      );
                    }
                    const n = stableRows.length;
                    const srcHead = adminLanguageLabel(snap.langA, langConfigData?.allLanguages);
                    const trHead = adminLanguageLabel(snap.langB, langConfigData?.allLanguages);
                    return (
                      <div className="rounded-lg border border-border overflow-hidden bg-card">
                        <table className="w-full text-sm border-collapse table-fixed">
                          <colgroup>
                            <col className="w-11" />
                            <col className="w-[50%]" />
                            <col className="w-[50%]" />
                          </colgroup>
                          <thead>
                            <tr className="bg-muted/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              <th className="px-1.5 py-2.5 text-center font-mono text-[9px] border-r border-border">#</th>
                              <th className="px-3 py-2.5 text-left border-r border-border align-bottom">
                                <span className="normal-case tracking-normal text-foreground">Original · {srcHead}</span>
                                <span className="block font-normal text-[9px] text-muted-foreground mt-0.5 normal-case tracking-normal">
                                  {snap.langA}
                                </span>
                              </th>
                              <th className="px-3 py-2.5 text-left align-bottom">
                                <span className="normal-case tracking-normal text-foreground">Translation · {trHead}</span>
                                <span className="block font-normal text-[9px] text-muted-foreground mt-0.5 normal-case tracking-normal">
                                  {snap.langB}
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {Array.from({ length: n }, (_, i) => {
                              const srcLine = stableRows[i]?.src ?? "";
                              const tgtLine = stableRows[i]?.tgt ?? "";
                              const rowIndex = stableRows[i]?.idx ?? i + 1;
                              return (
                                <tr key={i} className="hover:bg-muted/15 align-top">
                                  <td className="px-1.5 py-2.5 text-center font-mono text-[10px] text-muted-foreground border-r border-border align-top">
                                    {rowIndex}
                                  </td>
                                  <td className="px-3 py-2.5 text-foreground leading-relaxed whitespace-pre-wrap border-r border-border align-top">
                                    {srcLine}
                                  </td>
                                  <td className="px-3 py-2.5 text-foreground leading-relaxed whitespace-pre-wrap align-top" dir="auto">
                                    {tgtLine}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                ) : sessionDetail?.snapshot ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <div className="relative w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mic className="w-4 h-4 text-primary" />
                      <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                    </div>
                    <p className="text-sm text-muted-foreground">Waiting for speech input…</p>
                    <p className="text-xs text-muted-foreground/60">Start speaking and the transcript will appear automatically.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <AlertCircle className="w-8 h-8 text-amber-400" />
                    <p className="text-sm text-muted-foreground">No live data available</p>
                    <p className="text-xs text-muted-foreground/60">The user may have closed the app or lost connection. This session will be auto-closed shortly.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-3 border-t border-border bg-gray-50 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {sessionDetail?.isLive ? "Auto-refreshing every 2 s" : "Session ended"}
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
          <div className="w-full max-w-[520px] bg-card h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <History className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-base leading-tight">Session History</h3>
                  <p className="text-xs text-muted-foreground">{historyUser.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {userSessions.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportHistory} className="h-8 text-xs gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setHistoryUser(null)} className="h-8 w-8 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Summary stats banner */}
            {!historyLoading && userSessions.length > 0 && (() => {
              const totalMin  = userSessions.reduce((s, x) => s + (x.minutesUsed ?? 0), 0);
              const totalCost = totalMin * 0.0027;
              const langPairs = [...new Set(userSessions.map(s => s.langPair).filter(Boolean))];
              return (
                <div className="px-5 py-3 bg-gray-50 border-b border-border grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Sessions</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{userSessions.length}</p>
                  </div>
                  <div className="text-center border-x border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center justify-center gap-1">
                      <Timer className="w-2.5 h-2.5" />Transcription
                    </p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{totalMin.toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-1">min</span></p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center justify-center gap-1">
                      <Banknote className="w-2.5 h-2.5" />Est. Cost
                    </p>
                    <p className="text-xl font-bold text-foreground mt-0.5">${totalCost.toFixed(3)}</p>
                  </div>
                  {langPairs.length > 0 && (
                    <div className="col-span-3 flex flex-wrap gap-1 pt-1">
                      {langPairs.map(lp => (
                        <span key={lp} className="inline-flex items-center gap-1 text-[10px] bg-primary/5 text-primary border border-primary/15 px-2 py-0.5 rounded-full font-medium">
                          <Globe className="w-2.5 h-2.5" />{lp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

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
                  {userSessions.map((s, idx) => {
                    const minUsed = s.minutesUsed ?? (s.durationSeconds != null ? s.durationSeconds / 60 : null);
                    return (
                      <div key={s.id} className="px-5 py-4 hover:bg-muted/40 dark:hover:bg-white/[0.05]/70 transition-colors">
                        {/* Row header */}
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{userSessions.length - idx}</span>
                            <span className="text-sm font-semibold text-foreground">
                              {format(new Date(s.startedAt), "EEE, MMM d yyyy")}
                            </span>
                            {s.isLive && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Live
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Fields grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div className="flex items-center justify-between bg-gray-50 rounded px-2.5 py-1.5">
                            <span className="text-muted-foreground font-medium">Start</span>
                            <span className="font-mono text-foreground">{format(new Date(s.startedAt), "HH:mm:ss")}</span>
                          </div>
                          <div className="flex items-center justify-between bg-gray-50 rounded px-2.5 py-1.5">
                            <span className="text-muted-foreground font-medium">End</span>
                            <span className="font-mono text-foreground">
                              {s.endedAt ? format(new Date(s.endedAt), "HH:mm:ss") : <span className="text-red-500">ongoing</span>}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-gray-50 rounded px-2.5 py-1.5">
                            <span className="text-muted-foreground font-medium">Duration</span>
                            <span className="font-semibold text-foreground">{fmtDuration(s.durationSeconds)}</span>
                          </div>
                          <div className="flex items-center justify-between bg-gray-50 rounded px-2.5 py-1.5">
                            <span className="text-muted-foreground font-medium">Language Pair</span>
                            <span className="text-foreground flex items-center gap-1">
                              {s.langPair ? <><Globe className="w-3 h-3 text-primary" />{s.langPair}</> : <span className="text-muted-foreground">—</span>}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-blue-50 rounded px-2.5 py-1.5 col-span-2">
                            <span className="text-blue-700 font-medium flex items-center gap-1.5">
                              <Timer className="w-3 h-3" />Transcription Minutes
                            </span>
                            <span className="font-bold text-blue-800">
                              {minUsed != null ? `${minUsed.toFixed(2)} min` : "—"}
                              {minUsed != null && (
                                <span className="font-normal text-blue-500 ml-2">≈ ${(minUsed * 0.0027).toFixed(4)}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div className="px-5 py-3 border-t border-border bg-gray-50 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Showing last 100 sessions · Cost rate: $0.0027/min
              </p>
              {userSessions.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportHistory} className="h-7 text-xs gap-1">
                  <Download className="w-3 h-3" /> CSV
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT USER DRAWER ─────────────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingUser(null)} />

          {/* Panel */}
          <div className="relative z-10 w-full sm:w-[440px] bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4 text-violet-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground truncate">Manage: {editingUser.username}</h2>
                  {editingUser.email && <p className="text-xs text-muted-foreground truncate">{editingUser.email}</p>}
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Account Status ── */}
              <section className="px-5 py-4 border-b border-border/60">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Power className="w-3 h-3" /> Account Status
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{editForm.isActive ? "Active" : "Disabled"}</p>
                    <p className="text-xs text-muted-foreground">User can {editForm.isActive ? "" : "not "}log in and use the service</p>
                  </div>
                  <button
                    onClick={() => setEditForm(f => ({ ...f, isActive: !f.isActive }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${editForm.isActive ? "bg-green-500" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-all ${editForm.isActive ? "left-5.5 translate-x-0" : "left-0.5"}`} style={{ left: editForm.isActive ? "calc(100% - 22px)" : "2px" }} />
                  </button>
                </div>
              </section>

              {/* ── Plan & Trial ── */}
              <section className="px-5 py-4 border-b border-border/60 space-y-4">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="w-3 h-3" /> Plan & Trial
                </h3>

                {/* Plan: canonical tiers with explicit trial routing modes. */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Plan</label>
                  <select
                    value={editForm.planType}
                    onChange={e => setEditForm(f => ({ ...f, planType: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {!ADMIN_PLAN_VALUE_SET.has(editForm.planType) && (
                      <option value={editForm.planType}>Legacy / other: {editForm.planType}</option>
                    )}
                    <optgroup label="OpenAI interpreter">
                      {ADMIN_PLAN_OPTIONS_OPENAI.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Hetzner / machine">
                      {ADMIN_PLAN_OPTIONS_LIBRE.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  </select>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground/80">Customer sees:</span>{" "}
                    {workspacePlanDisplayName(editForm.planType)} only ·{" "}
                    <span className="font-medium text-foreground/80">You assign:</span>{" "}
                    {planUsesLibreEngine(editForm.planType) ? "Hetzner / machine" : "OpenAI interpreter"} ·{" "}
                    <span className="font-mono text-[9px] opacity-80">{editForm.planType}</span>
                  </p>
                </div>

                {/* Subscription / billing (read-only; trial expiry does not apply) */}
                <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Subscription &amp; billing (admin)
                  </p>
                  {!isTrialLikePlanType(editForm.planType) &&
                    (!editingUser.subscriptionStartedAt || !editingUser.subscriptionPeriodEndsAt) && (
                      <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded-md px-2.5 py-2 leading-snug">
                        <span className="font-semibold">PayPal may not have stored these dates.</span> Set the real payment date below. If you only set subscription started and save, the server fills period end as start + 30 days. Leave both fields empty to leave the database unchanged.
                      </p>
                    )}
                  <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Subscription status</span>
                      <span className="font-medium text-right truncate">{editingUser.subscriptionStatus ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Billed plan (webhook)</span>
                      <span className="font-medium text-right truncate">{editingUser.subscriptionPlan ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">PayPal sub. ID</span>
                      <span className="font-mono text-[10px] text-right break-all">{editingUser.paypalSubscriptionId ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Stripe sub. ID</span>
                      <span className="font-mono text-[10px] text-right break-all">{editingUser.stripeSubscriptionId ?? "—"}</span>
                    </div>
                  </div>
                  {!isTrialLikePlanType(editForm.planType) && (
                    <div className="space-y-2 pt-2 border-t border-border/60 mt-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Billing calendar (manual)</p>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Subscription started</label>
                        <input
                          type="datetime-local"
                          value={editForm.subscriptionStartedAtLocal}
                          onChange={e => setEditForm(f => ({ ...f, subscriptionStartedAtLocal: e.target.value }))}
                          className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Current period ends</label>
                        <input
                          type="datetime-local"
                          value={editForm.subscriptionPeriodEndsAtLocal}
                          onChange={e => setEditForm(f => ({ ...f, subscriptionPeriodEndsAtLocal: e.target.value }))}
                          className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            setEditForm(f => ({
                              ...f,
                              subscriptionStartedAtLocal: isoToDatetimeLocalValue(now.toISOString()),
                              subscriptionPeriodEndsAtLocal: isoToDatetimeLocalValue(
                                addBillingFallbackPeriod(now).toISOString(),
                              ),
                            }));
                          }}
                          className="w-full h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300"
                        >
                          Payment = now; period end +30 days
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const s = editForm.subscriptionStartedAtLocal.trim();
                            if (!s) return;
                            const d = addBillingFallbackPeriod(new Date(s));
                            setEditForm(f => ({ ...f, subscriptionPeriodEndsAtLocal: isoToDatetimeLocalValue(d.toISOString()) }));
                          }}
                          className="w-full h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300"
                        >
                          Set period end = start + 30 days
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
                    Any filled billing fields are written on save (start only → server adds 30-day end). PayPal webhooks can still update these later. Trial dates below apply only to trial-like plans.
                  </p>
                </div>

                {/* Trial window — all trial-like plan types */}
                {isTrialLikePlanType(editForm.planType) && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Trial window</label>
                    {editingUser.trialStartedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Started: {format(new Date(editingUser.trialStartedAt), "MMM d, yyyy HH:mm")}
                      </p>
                    )}
                    <label className="text-[10px] text-muted-foreground">Trial ends on (calendar)</label>
                    <input
                      type="date"
                      value={editForm.trialEndsAt}
                      onChange={e => setEditForm(f => ({ ...f, trialEndsAt: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="flex gap-2">
                      {[7, 14, 30].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => extendTrial(d)}
                          className="flex-1 h-7 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300 transition-colors flex items-center justify-center gap-1"
                        >
                          <Gift className="w-3 h-3" /> +{d}d
                        </button>
                      ))}
                    </div>
                    {editForm.trialEndsAt && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(editForm.trialEndsAt) > new Date()
                          ? `Expires in ${Math.ceil((new Date(editForm.trialEndsAt).getTime() - Date.now()) / 86_400_000)} day(s)`
                          : "Trial end date is in the past (access follows server trial rules)."}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Default Language Pair ── */}
              <section className="px-5 py-4 border-b border-border/60 space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Languages className="w-3 h-3" /> Default Language Pair
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Source</label>
                    <select
                      value={editForm.defaultLangA}
                      onChange={(e) => {
                        const nextA = e.target.value;
                        setEditForm((f) => ({
                          ...f,
                          defaultLangA: nextA,
                          defaultLangB: nextA === f.defaultLangB ? defaultLangB : f.defaultLangB,
                        }));
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {(langConfigData?.allLanguages ?? []).map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Target</label>
                    <select
                      value={editForm.defaultLangB}
                      onChange={e => setEditForm(f => ({ ...f, defaultLangB: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {(langConfigData?.allLanguages ?? [])
                        .filter(l => l.value !== editForm.defaultLangA)
                        .map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  This applies to this user on workspace load.
                </p>
              </section>

              {/* ── Daily Usage Limit ── */}
              <section className="px-5 py-4 border-b border-border/60 space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Daily Usage Limit (Credits)
                </h3>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Minutes per day</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={9999}
                      value={editForm.dailyLimitMinutes}
                      onChange={e => setEditForm(f => ({ ...f, dailyLimitMinutes: Math.max(1, Number(e.target.value)) }))}
                      className="h-9 text-sm"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[60, 120, 180, 300, 360, 480, 540, 600].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setEditForm(f => ({ ...f, dailyLimitMinutes: m }))}
                          className={`h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors ${editForm.dailyLimitMinutes === m ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >
                          {m % 60 === 0 ? `${m / 60}h` : `${m}m`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Today's usage override */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Today's Usage Override (minutes)</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={editForm.minutesUsedToday}
                      onChange={e => setEditForm(f => ({ ...f, minutesUsedToday: Math.max(0, Number(e.target.value)) }))}
                      className="h-9 text-sm"
                    />
                    <button
                      onClick={resetUsageForEdit}
                      className="h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset to 0
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, (editForm.minutesUsedToday / editForm.dailyLimitMinutes) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {editForm.minutesUsedToday} / {editForm.dailyLimitMinutes} min
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Usage & Estimated API Cost ── */}
              <section className="px-5 py-4 border-b border-border/60 space-y-3">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3" /> Usage & Estimated API Cost
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-base font-bold text-blue-700 leading-none">{formatMinutes(editingUser.totalMinutesUsed)}</p>
                    <p className="text-[10px] text-blue-500 font-medium mt-0.5">Total Transcription</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                    <p className="text-base font-bold text-violet-700 leading-none">{editingUser.totalSessions}</p>
                    <p className="text-[10px] text-violet-500 font-medium mt-0.5">Total Sessions</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                    <p className="text-base font-bold text-emerald-700 leading-none">
                      ${(editingUser.totalMinutesUsed * 0.0027).toFixed(3)}
                    </p>
                    <p className="text-[10px] text-emerald-500 font-medium mt-0.5">Est. Total API Cost</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                    <p className="text-base font-bold text-amber-700 leading-none">
                      ${(editingUser.minutesUsedToday * 0.0027).toFixed(4)}
                    </p>
                    <p className="text-[10px] text-amber-500 font-medium mt-0.5">Est. Cost Today</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60">Estimates: $0.0025/min Soniox + $0.0002/min GPT-4o-mini</p>
              </section>

              {/* ── Account Info ── */}
              <section className="px-5 py-4 space-y-1.5">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Account Info</h3>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-foreground">#{editingUser.id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Admin</span>
                  <span className={editingUser.isAdmin ? "text-primary font-medium" : "text-muted-foreground"}>
                    {editingUser.isAdmin ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="text-foreground">{format(new Date(editingUser.createdAt), "MMM d, yyyy")}</span>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="border-t border-border px-5 py-4 bg-card shrink-0 space-y-2">
              {editError && (
                <p className="text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg">{editError}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={saveEditUser} isLoading={editSaving} className="flex-1 h-9 text-sm">
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Save Changes
                </Button>
                <button
                  onClick={deleteUserFromEdit}
                  disabled={editSaving}
                  className="h-9 px-4 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Delete
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      </main>
    </div>
  );
}
