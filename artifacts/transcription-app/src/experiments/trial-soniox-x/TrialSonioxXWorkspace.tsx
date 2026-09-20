import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import {
  ApiError,
  getGetMeQueryKey,
  useGetMe,
  useGetTranscriptionToken,
  useLogout,
  useStartSession,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownToLine, BarChart3, BookOpen, Clock, Copy, Check, Flag, Gift,
  Languages, LifeBuoy, LogOut, Menu, MessageCircle, Mic, Mic2, Monitor, Moon,
  PanelRightClose, PanelRightOpen, Settings, Share2, ShieldCheck, StickyNote, Sun,
  User, X, Zap,
} from "lucide-react";
import { isActiveState } from "@soniox/speech-to-text-web";
import { Select } from "@/components/ui-components";
import { InviteModal } from "@/components/InviteModal";
import { UserFeedbackModal } from "@/components/UserFeedbackModal";
import { GlossaryPanel } from "@/components/GlossaryPanel";
import { SupportPanel } from "@/components/SupportPanel";
import { SessionHistoryPanel } from "@/components/SessionHistoryPanel";
import { useWorkspaceAccount } from "@/components/workspace-account";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { forgetSessionPresence, presenceFields, rememberSessionPresence } from "@/lib/session-presence";
import {
  cn,
  formatMinutes,
  isTrialLikePlanType,
  workspacePlanDisplayName,
  workspacePlanTierKey,
  workspaceUsageShowsSlashUnlimited,
} from "@/lib/utils";
import { getWorkspacePlanTestOptions } from "@/lib/workspace-plan-test-options";
import { captureTabAudio, isFirefoxBrowser, isGetDisplayMediaCancel } from "@/lib/capture-tab-audio";
import { workspaceLanguageOptions } from "@/lib/workspace-languages";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import useSonioxClient from "./useSonioxClient";
import { getLanguage } from "./languages";
import { sonioxTwoWayLanguageHints, workspaceLangToOfficialSonioxCode } from "./soniox-lang";
import { dominantBidiDir } from "./bidi-islands";
import { applyFaithfulMeaningFixes } from "./meaning-locks";
import { langDir, attachNonFinalRows, rowsFromSonioxTokens, snapshotLinesFromSonioxXRows, stripeClassesForRows, type SonioxXRow } from "./rows-from-tokens";
import { BidiText } from "./BidiText";
import { buildStableDialectContext } from "./stable-dialect-context";
import {
  displayPinPairs,
  mergeSonioxXInterpreterContext,
  packTermsForPair,
  userGlossaryToTerms,
  type GlossaryTerm,
} from "./interpreter-glossary";
import { applyExactGlossaryPins } from "./pin-translation";
import { GLOSSARY_CHANGED_EVENT } from "@/lib/glossary-strict-storage";
import { LiveAudioMeter } from "./live-audio-meter";
import { LiveElapsedClock } from "./live-elapsed-clock";

const LANG_OPTIONS = workspaceLanguageOptions();
const WORKSPACE_THEME_STORAGE_KEY = "interpreterai-theme";
const WIDE_WORKSPACE_STORAGE_KEY = "interpreterai-wide-workspace";
const MORSY_FONT_PX_OPTIONS = [12, 14, 16, 18, 20, 22, 24] as const;
type FontPx = (typeof MORSY_FONT_PX_OPTIONS)[number];
const MORSY_WS_FONT_LS = "interpreterai_morsy_ws_font_px";
const MORSY_NOTES_FONT_LS = "interpreterai_morsy_notes_font_px";
type WorkspacePanel = "profile" | "mic" | "glossary" | "support" | "referrals";

function readFontPx(storageKey: string = MORSY_WS_FONT_LS, fallback: FontPx = 16): FontPx {
  try {
    const n = Number.parseInt(localStorage.getItem(storageKey) ?? "", 10);
    if (MORSY_FONT_PX_OPTIONS.includes(n as FontPx)) return n as FontPx;
  } catch {
    /* storage */
  }
  return fallback;
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = (err as ApiError & { data?: { error?: unknown } }).data;
    if (body && typeof body.error === "string" && body.error.trim()) return body.error;
    if (typeof err.message === "string" && err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** Leftover under 1 displayed minute is the day used (`formatMinutes` floors 4h 59m / 5h 0m). */
function sonioxXDailyCapExhausted(user: {
  dailyLimitMinutes: number;
  minutesRemainingToday: number;
  planType?: string;
}): boolean {
  if (user.dailyLimitMinutes >= 9000 || workspaceUsageShowsSlashUnlimited(user.planType)) return false;
  const cap = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  const remaining = Number(user.minutesRemainingToday);
  return Number.isFinite(remaining) && remaining < 1 - 1e-6;
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ml-1.5 p-0.5 rounded hover:bg-white/10 text-muted-foreground/60 hover:text-foreground flex-shrink-0 align-middle"
      title="Copy to clipboard"
    >
      {done ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

const SonioxXTranscriptRow = memo(function SonioxXTranscriptRow({
  row,
  stripeClass,
  pinPairs,
  marked,
}: {
  row: SonioxXRow;
  stripeClass: string;
  pinPairs: readonly GlossaryTerm[];
  marked: boolean;
}) {
  const orig = `${row.origFinal}${row.origPartial}`;
  const live = Boolean(row.origPartial || row.transPartial);
  const transRaw = `${row.transFinal}${row.transPartial}`;
  const transPinned = live ? transRaw : applyExactGlossaryPins(orig, transRaw, pinPairs);
  const trans = applyFaithfulMeaningFixes(orig, transPinned);
  const origDir = dominantBidiDir(orig, langDir(row.origLang));
  const transDir = dominantBidiDir(trans, langDir(row.transLang));
  return (
    <div
      data-caw-segment={row.id}
      className="group relative grid grid-cols-2 gap-3 sm:gap-6 items-start mb-4"
      style={
        marked
          ? { background: "rgba(245,158,11,0.12)", borderLeft: "3px solid rgb(245,158,11)", borderRadius: 6 }
          : undefined
      }
    >
      <div className="flex min-w-0 items-start overflow-visible">
        <div className={cn("w-1 shrink-0 rounded-full self-stretch min-h-[1.25rem] mt-0.5", stripeClass)} />
        <div className="flex items-start gap-1 min-w-0 flex-1 pl-2">
          <p
            className="ts-text ts-original leading-relaxed whitespace-pre-wrap flex-1 min-w-0"
            dir={origDir}
            style={{ textAlign: origDir === "rtl" ? "right" : "left", unicodeBidi: "isolate" }}
          >
            <BidiText text={row.origFinal} baseDir={origDir} className="workspace-selectable-text" />
            <BidiText
              text={row.origPartial}
              baseDir={origDir}
              className="text-muted-foreground/70 italic workspace-selectable-text"
            />
          </p>
          <CopyBtn text={orig} />
        </div>
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="flex items-start gap-1 min-w-0">
          <p
            className="ts-text ts-translation leading-relaxed whitespace-pre-wrap flex-1 min-w-0"
            dir={transDir}
            style={{ textAlign: transDir === "rtl" ? "right" : "left", unicodeBidi: "isolate" }}
          >
            <BidiText text={trans} baseDir={transDir} className="workspace-selectable-text" />
          </p>
          <CopyBtn text={trans} />
        </div>
      </div>
    </div>
  );
}, (prev, next) => (
  prev.marked === next.marked &&
  prev.stripeClass === next.stripeClass &&
  prev.pinPairs === next.pinPairs &&
  prev.row.id === next.row.id &&
  prev.row.origFinal === next.row.origFinal &&
  prev.row.origPartial === next.row.origPartial &&
  prev.row.transFinal === next.row.transFinal &&
  prev.row.transPartial === next.row.transPartial &&
  prev.row.origLang === next.row.origLang &&
  prev.row.transLang === next.row.transLang
));

function FontSizePxStepper({
  value,
  onChange,
  wsDark,
}: {
  value: FontPx;
  onChange: (v: FontPx) => void;
  wsDark: boolean;
}) {
  const idx = Math.max(0, MORSY_FONT_PX_OPTIONS.indexOf(value));
  const step = (delta: number) => {
    const next = MORSY_FONT_PX_OPTIONS[
      Math.max(0, Math.min(MORSY_FONT_PX_OPTIONS.length - 1, idx + delta))
    ]!;
    onChange(next);
  };
  return (
    <div
      className={cn(
        "flex items-center rounded-full border shrink-0 overflow-hidden h-7",
        wsDark ? "border-white/10 bg-muted/20" : "border-border/60 bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={idx <= 0}
        className={cn(
          "px-2 h-full text-sm font-semibold transition-colors disabled:opacity-30",
          wsDark ? "text-muted-foreground hover:bg-white/10" : "text-muted-foreground hover:bg-muted",
        )}
        aria-label="Decrease text size"
      >
        −
      </button>
      <span className="px-2 text-xs font-semibold tabular-nums min-w-[1.75rem] text-center text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={() => step(+1)}
        disabled={idx >= MORSY_FONT_PX_OPTIONS.length - 1}
        className={cn(
          "px-2 h-full text-sm font-semibold transition-colors disabled:opacity-30",
          wsDark ? "text-muted-foreground hover:bg-white/10" : "text-muted-foreground hover:bg-muted",
        )}
        aria-label="Increase text size"
      >
        +
      </button>
    </div>
  );
}

/**
 * Isolated Trial · Soniox X workspace.
 * Engine stays the official Soniox live two-way client; chrome matches chunk-v2 Original | Translation.
 */
export default function TrialSonioxXWorkspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: meUser, isLoading: userLoading, error: userError, isFetched: userFetched } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 15_000 },
  });
  const [cachedUser, setCachedUser] = useState(meUser);
  useEffect(() => {
    if (meUser) setCachedUser(meUser);
  }, [meUser]);
  const user = meUser ?? cachedUser;
  const account = useWorkspaceAccount(
    user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
          planType: user.planType,
          isAdmin: user.isAdmin,
          isGoogleAccount: user.isGoogleAccount,
          twoFactorEnabled: user.twoFactorEnabled,
          trialExpired: user.trialExpired,
          trialDaysRemaining: user.trialDaysRemaining,
          minutesUsedToday: user.minutesUsedToday,
          minutesRemainingToday: user.minutesRemainingToday,
          dailyLimitMinutes: user.dailyLimitMinutes,
          paidCycleDaysRemaining: user.paidCycleDaysRemaining,
          sessionsToday: (user as { sessionsToday?: number }).sessionsToday,
        }
      : undefined,
  );
  const [meTimedOut, setMeTimedOut] = useState(false);
  useEffect(() => {
    if (!userLoading) {
      setMeTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setMeTimedOut(true), 4_000);
    return () => window.clearTimeout(t);
  }, [userLoading]);
  const logoutMut = useLogout();
  const startSessionMut = useStartSession();
  const getTokenMut = useGetTranscriptionToken();
  const { devices, loading: devicesLoading, error: devicesError, refresh: refreshDevices } = useAudioDevices();

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [inputMode, setInputMode] = useState<"mic" | "tab">("mic");
  const [tabStream, setTabStream] = useState<MediaStream | null>(null);
  const tabCaptureStopRef = useRef<(() => void) | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [clearedForPrivacy, setClearedForPrivacy] = useState(false);
  const [markedRowId, setMarkedRowId] = useState<string | null>(null);
  const [tailPinned, setTailPinned] = useState(true);
  const [workspaceFontPx, setWorkspaceFontPx] = useState<FontPx>(readFontPx);
  const [workspaceTheme, setWorkspaceTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const s =
        localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY) ??
        localStorage.getItem("interpreterai-workspace-theme");
      return s === "light" || s === "dark" ? s : "dark";
    } catch {
      return "dark";
    }
  });
  const [wideWorkspace, setWideWorkspace] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(WIDE_WORKSPACE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<WorkspacePanel>("mic");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesFontPx, setNotesFontPx] = useState<FontPx>(() => readFontPx(MORSY_NOTES_FONT_LS, 16));
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUserFeedback, setShowUserFeedback] = useState(false);
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);

  const sessionIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailPinnedRef = useRef(true);
  const stopLiveRef = useRef<() => Promise<void>>(async () => {});
  const stoppingForCapRef = useRef(false);
  const [liveSessionId, setLiveSessionId] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const snapshotSeqRef = useRef(0);
  const rowsRef = useRef<SonioxXRow[]>([]);
  const langARef = useRef(langA);
  const langBRef = useRef(langB);
  const micLabelRef = useRef("Microphone");
  const workspaceThemeRef = useRef(workspaceTheme);
  const workspaceFontPxRef = useRef(workspaceFontPx);

  const sonioxA = workspaceLangToOfficialSonioxCode(langA);
  const sonioxB = workspaceLangToOfficialSonioxCode(langB);
  const languageA = getLanguage(sonioxA ?? "en");
  const languageB = getLanguage(sonioxB ?? "es");
  const pairReady = Boolean(sonioxA && sonioxB && sonioxA !== sonioxB);

  const sessionIdHolder = useRef<number | null>(null);

  const fetchTempApiKey = useCallback(async () => {
    const sid = sessionIdHolder.current;
    if (!sid) throw new Error("A valid open session is required before starting live transcription.");
    const tokenRes = await getTokenMut.mutateAsync({ data: { sessionId: sid } });
    const apiKey = tokenRes.apiKey?.trim();
    if (!apiKey) throw new Error("Could not issue a transcription token.");
    return apiKey;
  }, [getTokenMut]);

  const translationConfig = useMemo(
    () => ({
      type: "two_way" as const,
      language_a: languageA.code,
      language_b: languageB.code,
    }),
    [languageA.code, languageB.code],
  );

  const languageHints = useMemo(
    () => sonioxTwoWayLanguageHints(languageA.code, languageB.code),
    [languageA.code, languageB.code],
  );

  const dialectContext = useMemo(
    () => buildStableDialectContext(languageA.code, languageB.code),
    [languageA.code, languageB.code],
  );

  const [glossaryRows, setGlossaryRows] = useState<
    Array<{
      term?: string;
      translation?: string;
      sourceLanguage?: string | null;
      targetLanguage?: string | null;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/glossary", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          entries?: Array<{
            term?: string;
            translation?: string;
            sourceLanguage?: string | null;
            targetLanguage?: string | null;
          }>;
        };
        if (!cancelled) setGlossaryRows(data.entries ?? []);
      } catch {
        /* glossary is optional */
      }
    };
    void load();
    window.addEventListener(GLOSSARY_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(GLOSSARY_CHANGED_EVENT, load);
    };
  }, []);

  const sonioxContext = useMemo(() => {
    const pack = packTermsForPair(languageA.code, languageB.code);
    return mergeSonioxXInterpreterContext({
      dialect: dialectContext,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: userGlossaryToTerms(glossaryRows, languageA.code, languageB.code),
      langA: languageA.code,
      langB: languageB.code,
    });
  }, [dialectContext, glossaryRows, languageA.code, languageB.code]);

  const pinPairs = useMemo(
    () => displayPinPairs(languageA.code, languageB.code, glossaryRows),
    [glossaryRows, languageA.code, languageB.code],
  );

  const {
    state,
    finalTokens,
    nonFinalTokens,
    startTranscription,
    stopTranscription,
    clearTokens,
    error,
  } = useSonioxClient({
    apiKey: fetchTempApiKey,
    translationConfig,
    languageHints,
    languageHintsStrict: true,
    context: sonioxContext,
  });

  const recording = isActiveState(state);
  const wsDark = workspaceTheme === "dark";

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_THEME_STORAGE_KEY, workspaceTheme);
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle("dark", workspaceTheme === "dark");
  }, [workspaceTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(MORSY_WS_FONT_LS, String(workspaceFontPx));
    } catch {
      /* storage */
    }
  }, [workspaceFontPx]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDE_WORKSPACE_STORAGE_KEY, wideWorkspace ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [wideWorkspace]);

  useEffect(() => {
    try {
      localStorage.setItem(MORSY_NOTES_FONT_LS, String(notesFontPx));
    } catch {
      /* storage */
    }
  }, [notesFontPx]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current != null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const closeBillingSession = useCallback(async () => {
    const sid = sessionIdRef.current;
    const startedAt = startTimeRef.current;
    sessionIdRef.current = null;
    sessionIdHolder.current = null;
    setLiveSessionId(null);
    clearHeartbeat();
    startTimeRef.current = null;
    setSessionStartedAt(null);
    if (!sid) return;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : 0;
    try {
      await fetch("/api/transcription/session/stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...presenceFields(sid), durationSeconds }),
      });
    } catch {
      /* session may already be closed */
    }
    forgetSessionPresence(sid);
    void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [clearHeartbeat, queryClient]);

  const stopOwnedMic = useCallback(() => {
    setMeterStream(null);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  const stopLive = useCallback(async () => {
    stopTranscription();
    stopOwnedMic();
    if (tabCaptureStopRef.current) {
      tabCaptureStopRef.current();
      tabCaptureStopRef.current = null;
    } else if (tabStream) {
      tabStream.getTracks().forEach((t) => t.stop());
    }
    setTabStream(null);
    await closeBillingSession();
    setHistoryRefreshKey((k) => k + 1);
    setNotes("");
    // Match Chuck v2: wipe on-screen transcript when the user stops (no Clear button).
    clearTokens();
    setMarkedRowId(null);
    setClearedForPrivacy(true);
    setTimeout(() => setClearedForPrivacy(false), 4000);
  }, [clearTokens, closeBillingSession, stopOwnedMic, stopTranscription, tabStream]);
  stopLiveRef.current = stopLive;

  useEffect(() => {
    if (state !== "Error" && state !== "Canceled") return;
    stopOwnedMic();
    if (!sessionIdRef.current) return;
    void closeBillingSession();
  }, [state, closeBillingSession, stopOwnedMic]);

  useEffect(() => {
    return () => {
      stopTranscription();
      setMeterStream(null);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      void closeBillingSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (recording) return;
    if (meUser) return;
    if (!meTimedOut && (!userFetched || userLoading)) return;
    setLocation(loginUrlForReturnTo());
  }, [userFetched, userLoading, meUser, userError, meTimedOut, recording, setLocation]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/usage/language-defaults", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { defaultLangA?: string; defaultLangB?: string };
        const nextA = (data.defaultLangA ?? "").trim();
        const nextB = (data.defaultLangB ?? "").trim();
        if (!cancelled && nextA && nextB && nextA !== nextB) {
          setLangA(nextA);
          setLangB(nextB);
        }
      } catch {
        /* keep local defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDeviceId && devices[0]?.deviceId) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [devices, selectedDeviceId]);

  useSessionHeartbeat(!!user);

  const finalRows = useMemo(() => rowsFromSonioxTokens(finalTokens), [finalTokens]);
  const rows = useMemo(
    () => attachNonFinalRows(finalRows, nonFinalTokens),
    [finalRows, nonFinalTokens],
  );
  const rowStripeClasses = useMemo(() => stripeClassesForRows(rows), [rows]);
  rowsRef.current = rows;
  langARef.current = langA;
  langBRef.current = langB;
  workspaceThemeRef.current = workspaceTheme;
  workspaceFontPxRef.current = workspaceFontPx;
  const hasTranscript = rows.length > 0;

  useEffect(() => {
    const micDev = devices.find((d) => d.deviceId === selectedDeviceId);
    micLabelRef.current = inputMode === "tab"
      ? "Browser Tab Audio"
      : (micDev?.label || "Microphone");
  }, [inputMode, devices, selectedDeviceId]);

  const stickToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !tailPinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (!hasTranscript) return;
    stickToLatest();
  }, [rows, hasTranscript, stickToLatest]);

  const startHeartbeat = useCallback((sessionId: number) => {
    clearHeartbeat();
    const sendHeartbeat = () => {
      void fetch("/api/transcription/session/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...presenceFields(sessionId),
          audioSecondsProcessed: startTimeRef.current
            ? Math.floor((Date.now() - startTimeRef.current) / 1000)
            : 0,
          micLabel: micLabelRef.current,
        }),
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            dailyLimitReached?: unknown;
            sessionEnded?: unknown;
          };
          if (data.dailyLimitReached !== true || data.sessionEnded !== true) return;
          if (stoppingForCapRef.current) return;
          stoppingForCapRef.current = true;
          try {
            await stopLiveRef.current();
          } finally {
            stoppingForCapRef.current = false;
          }
        })
        .catch(() => { /* best-effort */ });
    };
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 10_000);
  }, [clearHeartbeat]);

  useEffect(() => {
    if (liveSessionId == null) return;
    const push = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const { transcriptLines, translationLines } = snapshotLinesFromSonioxXRows(rowsRef.current);
      snapshotSeqRef.current += 1;
      void fetch("/api/transcription/session/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...presenceFields(sessionId),
          langA: langARef.current,
          langB: langBRef.current,
          micLabel: micLabelRef.current,
          transcript: transcriptLines.join("\n"),
          translation: translationLines.join("\n"),
          transcriptLines,
          translationLines,
          snapshotSeq: snapshotSeqRef.current,
          viewerTheme: workspaceThemeRef.current,
          workspaceFontPx: workspaceFontPxRef.current,
          layoutMode: "stacked",
        }),
      }).catch(() => { /* best-effort */ });
    };
    push();
    const interval = setInterval(push, 2_500);
    return () => clearInterval(interval);
  }, [liveSessionId]);

  const startLive = useCallback(async (providedStream?: MediaStream) => {
    if (starting || recording) return;
    if (user && sonioxXDailyCapExhausted(user)) {
      setSessionError("You have used all of your allowed minutes for today.");
      return;
    }
    if (!pairReady || !sonioxA || !sonioxB) {
      setSessionError("Choose two Soniox-supported languages before starting.");
      return;
    }
    setStarting(true);
    setSessionError(null);
    setClearedForPrivacy(false);
    setMarkedRowId(null);
    tailPinnedRef.current = true;
    setTailPinned(true);

    const openedMic = !providedStream;
    const micPromise = providedStream
      ? Promise.resolve(providedStream)
      : navigator.mediaDevices.getUserMedia({
          audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        });

    try {
      const sessionRes = await startSessionMut.mutateAsync({
        data: { srcLang: langA, tgtLang: langB },
      });
      rememberSessionPresence(
        sessionRes.sessionId,
        (sessionRes as { presenceKey?: string }).presenceKey,
      );
      sessionIdRef.current = sessionRes.sessionId;
      sessionIdHolder.current = sessionRes.sessionId;
      snapshotSeqRef.current = 0;
      setLiveSessionId(sessionRes.sessionId);
      const startedAt = Date.now();
      startTimeRef.current = startedAt;
      setSessionStartedAt(startedAt);
      startHeartbeat(sessionRes.sessionId);

      const tokenPromise = getTokenMut.mutateAsync({ data: { sessionId: sessionRes.sessionId } });
      const [stream, tokenRes] = await Promise.all([micPromise, tokenPromise]);
      const apiKey = tokenRes.apiKey?.trim();
      if (!apiKey) throw new Error("Could not issue a transcription token.");
      if (openedMic) micStreamRef.current = stream;

      await startTranscription({ stream, apiKey });
      setMeterStream(stream);
    } catch (err) {
      if (openedMic) {
        void micPromise.then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
        }).catch(() => { /* permission denied or already stopped */ });
        stopOwnedMic();
      } else {
        setMeterStream(null);
        tabCaptureStopRef.current?.();
        tabCaptureStopRef.current = null;
        setTabStream(null);
      }
      setSessionError(errMessage(err, "Could not start a live session."));
      await closeBillingSession();
    } finally {
      setStarting(false);
    }
  }, [
    closeBillingSession,
    getTokenMut,
    langA,
    langB,
    pairReady,
    recording,
    selectedDeviceId,
    sonioxA,
    sonioxB,
    startHeartbeat,
    startSessionMut,
    startTranscription,
    starting,
    stopOwnedMic,
    user,
  ]);

  const handleStartTabAudio = async () => {
    setSessionError(null);
    try {
      const captured = await captureTabAudio();
      tabCaptureStopRef.current = captured.stop;
      setTabStream(captured.displayStream);
      captured.audioStream.getAudioTracks()[0]?.addEventListener("ended", () => {
        void stopLive();
      });
      await startLive(captured.audioStream);
    } catch (err) {
      if (isGetDisplayMediaCancel(err)) return;
      setSessionError(err instanceof Error ? err.message : "Could not capture tab audio.");
    }
  };

  const handleToggle = () => {
    if (recording || starting) {
      void stopLive();
      return;
    }
    if (user && sonioxXDailyCapExhausted(user)) return;
    if (inputMode === "tab") {
      void handleStartTabAudio();
      return;
    }
    void startLive();
  };

  const handleLogout = async () => {
    if (recording) await stopLive();
    try {
      await logoutMut.mutateAsync();
    } finally {
      queryClient.setQueryData(getGetMeQueryKey(), null);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey(), refetchType: "none" });
      setLocation("/login");
    }
  };


  const jumpTailFollow = () => {
    tailPinnedRef.current = true;
    setTailPinned(true);
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  if (userLoading && !meTimedOut && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    );
  }

  const usageShowsUnlimitedCap =
    user.dailyLimitMinutes >= 9000 || workspaceUsageShowsSlashUnlimited(user.planType);
  const isLimitReached = sonioxXDailyCapExhausted(user);
  const isBlocked = user.trialExpired || isLimitReached;
  const displayUsedMinutes = isLimitReached ? user.dailyLimitMinutes : user.minutesUsedToday;
  const workspaceTextSizeStyle: CSSProperties = {
    "--ts-font-size": `${workspaceFontPx}px`,
    "--ts-line-height": "1.625",
  } as CSSProperties;
  const notesTextSizeStyle: CSSProperties = {
    fontSize: `${notesFontPx}px`,
    lineHeight: 1.625,
  };
  const planTier = workspacePlanTierKey(user.planType);

  return (
    <div
      className={cn(
        "h-full min-h-0 w-full max-w-[100vw] flex overflow-hidden text-foreground",
        wsDark && "dark workspace-demo-night bg-background",
        !wsDark && "bg-background",
      )}
    >
      {showInviteModal && (
        <InviteModal userId={user.id} username={user.username} onClose={() => setShowInviteModal(false)} />
      )}
      <UserFeedbackModal isOpen={showUserFeedback} onClose={() => setShowUserFeedback(false)} />
      {account.accountOverlays}

      {settingsOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSettingsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-30 w-48 bg-sidebar border-r border-sidebar-border flex flex-col py-3
        transform transition-transform duration-300 ease-in-out
        ${settingsOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:inset-auto md:translate-x-0 md:w-[64px] md:items-center md:z-20 md:flex-shrink-0
      `}>
        <div className="flex items-center justify-between px-3 mb-2 md:hidden">
          <span className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">Menu</span>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col gap-1 md:gap-1.5 px-2 md:px-0 md:items-center">
          {([
            { id: "profile" as const,  icon: <User className="w-5 h-5" />,      title: "Profile" },
            { id: "mic" as const,      icon: <Mic2 className="w-5 h-5" />,      title: "Audio" },
            { id: "lang" as const,     icon: <BarChart3 className="w-5 h-5" />, title: "Usage" },
            { id: "glossary" as const, icon: <BookOpen className="w-5 h-5" />,  title: "Glossary" },
            { id: "support" as const,  icon: <LifeBuoy className="w-5 h-5" />,  title: "Support" },
          ] as const).map(({ id, icon, title }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-xl px-3 md:px-0 transition-all",
                activeTab === id
                  ? wsDark
                    ? "bg-sky-500/15 shadow-[0_0_20px_rgba(56,189,248,0.15)] text-sky-300 border border-sky-400/20 md:border-0"
                    : "bg-white text-primary shadow-sm"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              onClick={() => {
                if (id === "lang") {
                  setSettingsOpen(false);
                  setLocation("/usage");
                  return;
                }
                setActiveTab(id);
                setSettingsOpen(false);
              }}
              title={title}
            >
              <span className="shrink-0">{icon}</span>
              <span className="text-sm font-medium md:hidden">{title}</span>
            </button>
          ))}
          {user.isAdmin && (
            <button
              type="button"
              className="flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-xl px-3 md:px-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
              onClick={() => { setSettingsOpen(false); setLocation("/admin"); }}
              title="Admin"
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium md:hidden">Admin</span>
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1 md:gap-1.5 px-2 md:px-0 md:items-center mb-2">
          <div className="w-full md:w-8 h-px bg-sidebar-border mx-auto mb-0.5" />
          <button
            type="button"
            onClick={() => { setShowInviteModal(true); setSettingsOpen(false); }}
            className="flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-xl px-3 md:px-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
            title="Invite another interpreter"
          >
            <Share2 className="w-4.5 h-4.5 shrink-0" />
            <span className="text-sm font-medium md:hidden">Invite colleague</span>
          </button>
          <button
            type="button"
            onClick={() => { setShowUserFeedback(true); setSettingsOpen(false); }}
            className="flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-xl px-3 md:px-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
            title="Send feedback"
          >
            <MessageCircle className="w-4.5 h-4.5 shrink-0" />
            <span className="text-sm font-medium md:hidden">Send Feedback</span>
          </button>
          <button
            type="button"
            onClick={() => { setSettingsOpen(false); setLocation("/referrals"); }}
            className="flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-xl px-3 md:px-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
            title="Referrals"
          >
            <Gift className="w-4.5 h-4.5 shrink-0" />
            <span className="text-sm font-medium md:hidden">Referrals</span>
          </button>
        </div>
        <div className="px-2 md:px-0 md:flex md:justify-center">
          <button
            type="button"
            className="flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-xl px-3 md:px-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors"
            onClick={() => void handleLogout()}
            title="Log Out"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium md:hidden">Log Out</span>
          </button>
        </div>
      </aside>

      {activeTab === "profile" && (
        <account.AccountPanel
          onClose={() => setActiveTab("mic")}
          recording={recording}
        />
      )}

      {activeTab === "support" && (
        <SupportPanel userEmail={user.email ?? null} onClose={() => setActiveTab("mic")} />
      )}
      {activeTab === "glossary" && (
        <GlossaryPanel onClose={() => setActiveTab("mic")} langA={langA} langB={langB} />
      )}

      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        <header
          className={cn(
            "h-[52px] shrink-0 min-w-0 flex items-center justify-between px-3 sm:px-5",
            wsDark
              ? "border-b border-white/[0.08] bg-card/45 backdrop-blur-xl supports-[backdrop-filter]:bg-card/35"
              : "border-b border-border bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75",
          )}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 mr-2">
            <button
              type="button"
              onClick={() => setSettingsOpen((s) => !s)}
              className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Settings & Navigation"
              aria-label="Open settings"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowLeftPanel((v) => !v)}
              className={`md:hidden w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                showLeftPanel ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title="Notes & Session History"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Zap className="w-3.5 h-3.5" strokeWidth={2.2} />
              </div>
              <span className="font-semibold text-sm text-foreground whitespace-nowrap">
                Interpreter<span className="text-primary">AI</span>
              </span>
            </div>
            <span
              className={cn(
                "hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border",
                wsDark
                  ? "bg-sky-500/15 text-sky-300 border-sky-400/25"
                  : "bg-violet-100 text-violet-700 border-violet-200",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  recording
                    ? wsDark ? "bg-sky-400 animate-pulse" : "bg-violet-500 animate-pulse"
                    : wsDark ? "bg-sky-500/40" : "bg-violet-300",
                )}
              />
              <span className="truncate max-w-[200px]">
                {LANG_OPTIONS.find(l => l.value === langA)?.label ?? langA} ↔{" "}
                {LANG_OPTIONS.find(l => l.value === langB)?.label ?? langB}
              </span>
            </span>
            {recording && (
              <LiveElapsedClock active={recording} startedAt={sessionStartedAt} />
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setWideWorkspace((w) => !w)}
              className={cn(
                "hidden sm:flex items-center justify-center w-9 h-9 rounded-lg border transition-colors shrink-0",
                wideWorkspace
                  ? wsDark
                    ? "border-sky-400/40 bg-sky-500/15 text-sky-300"
                    : "border-primary/40 bg-primary/10 text-primary"
                  : wsDark
                    ? "border-white/10 text-muted-foreground hover:bg-white/10"
                    : "border-border text-muted-foreground hover:bg-muted",
              )}
              title={wideWorkspace ? "Show notes & session history" : "Wide workspace — hide notes & history"}
              aria-label={wideWorkspace ? "Show side panel" : "Hide side panel"}
            >
              {wideWorkspace ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTheme(wsDark ? "light" : "dark")}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-lg border transition-colors shrink-0",
                wsDark
                  ? "border-white/10 text-amber-200/90 hover:bg-white/10 hover:text-amber-100"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={wsDark ? "Bright mode" : "Dark mode"}
            >
              {wsDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                const last = rows[rows.length - 1];
                if (last) setMarkedRowId(last.id);
              }}
              disabled={!hasTranscript}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:pointer-events-none",
                wsDark
                  ? "text-muted-foreground/55 hover:text-amber-400 hover:bg-amber-500/10"
                  : "text-muted-foreground hover:text-amber-600 hover:bg-amber-50",
              )}
              title="Mark last line as important"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mark</span>
            </button>
            <div
              className={cn(
                "px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground flex items-center gap-1 sm:gap-1.5 border min-w-0",
                wsDark ? "bg-muted/40 border-white/[0.08]" : "bg-muted border-border/50",
              )}
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">
                {usageShowsUnlimitedCap
                  ? `${formatMinutes(displayUsedMinutes)} / unlimited today`
                  : `${formatMinutes(displayUsedMinutes)} / ${formatMinutes(user.dailyLimitMinutes)} today`}
              </span>
              <span className="sm:hidden">
                {formatMinutes(displayUsedMinutes)} / {usageShowsUnlimitedCap ? "unlimited" : formatMinutes(user.dailyLimitMinutes)}
              </span>
            </div>
            {isTrialLikePlanType(user.planType) ? (
              <div className={`hidden sm:flex px-2.5 py-1 rounded-full text-xs font-medium border items-center gap-1.5 ${
                user.trialExpired
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : wsDark
                    ? "bg-muted/40 text-muted-foreground border-white/[0.08]"
                    : "bg-muted text-muted-foreground border-border/50"
              }`}>
                <AlertTriangle className="w-3 h-3" />
                <span>{user.trialExpired
                  ? "Trial Expired"
                  : `${user.trialDaysRemaining} day${user.trialDaysRemaining === 1 ? "" : "s"} left`
                }</span>
              </div>
            ) : typeof user.paidCycleDaysRemaining === "number" ? (
              <div
                className={cn(
                  "hidden sm:flex px-2.5 py-1 rounded-full text-xs font-medium border items-center gap-1.5",
                  wsDark
                    ? "bg-muted/40 text-muted-foreground border-white/[0.08]"
                    : "bg-muted text-muted-foreground border-border/50",
                )}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>
                  {user.paidCycleDaysRemaining} day{user.paidCycleDaysRemaining === 1 ? "" : "s"} left
                </span>
              </div>
            ) : null}
          </div>
        </header>

        {(user.trialExpired || isLimitReached) && (
          <div className="px-4 pt-3 pb-0 shrink-0">
            {user.trialExpired ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">Your free trial has expired.</span>
                <button
                  type="button"
                  onClick={account.openUpgrade}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors whitespace-nowrap shrink-0"
                >
                  <Zap className="w-3 h-3" />
                  Upgrade
                </button>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-sm text-orange-800">
                <Clock className="w-4 h-4 shrink-0" />
                {workspaceUsageShowsSlashUnlimited(user.planType)
                  ? "You have reached your plan’s daily usage limit. Please try again tomorrow."
                  : `You have used all of your allowed minutes for today (${formatMinutes(user.dailyLimitMinutes)} per day).`}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 flex gap-3 p-4 min-h-0 overflow-hidden relative">
          {showLeftPanel && (
            <div
              className="fixed inset-0 z-20 bg-black/30 md:hidden"
              onClick={() => setShowLeftPanel(false)}
            />
          )}
          <div
            className={cn(
              "flex-1 rounded-xl flex flex-col min-h-0 overflow-hidden backdrop-blur-md",
              wsDark
                ? "bg-card/80 border border-white/[0.08] shadow-[0_12px_48px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)]"
                : "bg-card border border-border shadow-sm",
            )}
          >
            <div
              className={cn(
                "min-h-10 py-1.5 flex items-center gap-3 px-4 shrink-0 border-b",
                wsDark ? "border-white/[0.06] bg-muted/15" : "border-border bg-muted/20",
              )}
            >
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                Workspace
              </span>
              {recording && (
                <span className="flex items-center gap-1 text-[10px] text-rose-500 font-semibold">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                  Listening
                </span>
              )}
              <FontSizePxStepper value={workspaceFontPx} onChange={setWorkspaceFontPx} wsDark={wsDark} />
            </div>

            {hasTranscript && (
              <div
                className={cn(
                  "grid grid-cols-2 gap-3 sm:gap-6 px-3 sm:px-4 py-1.5 border-b shrink-0 bg-muted/10",
                  wsDark ? "border-white/[0.05]" : "border-border/40",
                )}
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    Original
                  </div>
                  {!tailPinned && (
                    <button
                      type="button"
                      onClick={jumpTailFollow}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-semibold shrink-0 border transition-colors",
                        wsDark
                          ? "border-white/15 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                      )}
                    >
                      <ArrowDownToLine className="w-2.5 h-2.5" />
                      <span className="hidden sm:inline">Jump to latest</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider shrink-0">
                    Translation
                  </span>
                </div>
              </div>
            )}

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 relative [overflow-anchor:none] workspace-selectable-root"
              data-tsize={String(workspaceFontPx)}
              style={workspaceTextSizeStyle}
              onScroll={() => {
                const el = scrollRef.current;
                if (!el) return;
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 72;
                tailPinnedRef.current = nearBottom;
                setTailPinned((prev) => (prev === nearBottom ? prev : nearBottom));
              }}
            >
              {hasTranscript && (
                <div className="[overflow-anchor:none] workspace-selectable-root">
                  {rows.map((row, index) => (
                    <SonioxXTranscriptRow
                      key={row.id}
                      row={row}
                      stripeClass={rowStripeClasses[index] ?? rowStripeClasses[0] ?? ""}
                      pinPairs={pinPairs}
                      marked={markedRowId === row.id}
                    />
                  ))}
                </div>
              )}

              {!hasTranscript && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                  {clearedForPrivacy ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className="text-sm font-semibold text-emerald-700">Session cleared</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">No session data was stored</p>
                    </>
                  ) : recording ? (
                    <>
                      <div className="relative w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <Mic className="w-5 h-5 text-primary" />
                        <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Waiting for speech input…</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Start speaking and the transcript will appear automatically.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Languages className="w-5 h-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-medium">Start recording to see transcript</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {LANG_OPTIONS.find(l => l.value === langA)?.label ?? langA} ↔{" "}
                        {LANG_OPTIONS.find(l => l.value === langB)?.label ?? langB} — detected automatically
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className={
              wideWorkspace
                ? "hidden"
                : cn(
                    showLeftPanel ? "translate-x-0" : "translate-x-full",
                    "md:translate-x-0 fixed md:relative top-0 right-0 md:right-auto h-full z-30 md:z-auto w-[85vw] md:w-[42%] lg:w-[40%] shrink-0 flex flex-col gap-2 min-h-0 transition-transform duration-200 ease-in-out",
                  )
            }
          >
            <div
              className={cn(
                "md:hidden h-14 backdrop-blur-md flex items-center justify-between px-4 shrink-0 border-b",
                wsDark ? "bg-card/80 border-white/[0.08]" : "bg-white border-border",
              )}
            >
              <span className="text-sm font-semibold">Notes & History</span>
              <button
                type="button"
                onClick={() => setShowLeftPanel(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-48 shrink-0 mx-3 md:mx-0">
              <SessionHistoryPanel
                refreshKey={historyRefreshKey}
                className={wsDark ? "border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.35)]" : ""}
              />
            </div>
            <div
              className={cn(
                "flex-1 min-h-0 rounded-xl flex flex-col overflow-hidden mx-3 md:mx-0 pb-2 md:pb-0 backdrop-blur-md border shadow-sm",
                wsDark
                  ? "bg-card/95 border-white/[0.07] shadow-[0_10px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.03)]"
                  : "bg-muted/40 border-border",
              )}
            >
              <div
                className={cn(
                  "h-10 flex items-center gap-2 px-3 shrink-0 border-b",
                  wsDark ? "border-white/[0.06] bg-black/20" : "border-border bg-muted/30",
                )}
              >
                <StickyNote className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
                {notes && (
                  <span className="text-[9px] text-muted-foreground/50 italic">cleared on end</span>
                )}
                <div className="ml-auto">
                  <FontSizePxStepper
                    value={notesFontPx}
                    onChange={setNotesFontPx}
                    wsDark={wsDark}
                  />
                </div>
              </div>
              <div className="relative flex-1 overflow-y-auto scroll-smooth min-h-0">
                {!notes.trim() && (
                  <div
                    className="absolute inset-0 p-2.5 pointer-events-none select-none space-y-1 text-muted-foreground/30 italic"
                    style={notesTextSizeStyle}
                    aria-hidden
                  >
                    <p>Claim #</p>
                    <p>Patient allergy</p>
                    <p>Appt. time</p>
                  </div>
                )}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder=""
                  className="relative z-[1] w-full h-full resize-none p-2.5 outline-none bg-transparent text-foreground"
                  style={notesTextSizeStyle}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 z-10 border-t backdrop-blur-xl",
            wsDark
              ? "border-white/[0.08] bg-card/50 supports-[backdrop-filter]:bg-card/40"
              : "border-border bg-white/90 supports-[backdrop-filter]:bg-white/80",
          )}
        >
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 pt-3 pb-2 border-b",
              wsDark ? "border-white/[0.06]" : "border-border/40",
            )}
          >
            <div
              className={cn(
                "flex items-center rounded-lg border overflow-hidden shrink-0 order-1",
                wsDark ? "border-white/10 bg-muted/25" : "border-border/60 bg-muted/30",
              )}
            >
              <button
                type="button"
                disabled={recording}
                onClick={() => { setSessionError(null); setInputMode("mic"); }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all",
                  inputMode === "mic"
                    ? wsDark
                      ? "bg-card text-primary shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35),0_0_16px_rgba(56,189,248,0.12)]"
                      : "bg-white text-primary shadow-sm"
                    : wsDark
                      ? "text-muted-foreground/55 hover:text-foreground/90"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mic2 className={cn("w-3.5 h-3.5", inputMode === "mic" && wsDark && "text-sky-400")} />
                Mic
              </button>
              <button
                type="button"
                disabled={recording}
                onClick={() => { setSessionError(null); setInputMode("tab"); }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all",
                  inputMode === "tab"
                    ? wsDark
                      ? "bg-card text-primary shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35),0_0_16px_rgba(56,189,248,0.12)]"
                      : "bg-white text-primary shadow-sm"
                    : wsDark
                      ? "text-muted-foreground/55 hover:text-foreground/90"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Monitor className={cn("w-3.5 h-3.5", inputMode === "tab" && wsDark && "text-sky-400")} />
                <span className="hidden sm:inline">Tab </span>Audio
              </button>
            </div>
            <div className="w-16 sm:w-24 shrink-0 order-2 sm:order-3 sm:ml-auto">
              <LiveAudioMeter stream={meterStream} />
            </div>
            {inputMode === "mic" && (
              <div className="w-full min-w-[220px] sm:flex-1 sm:min-w-[240px] sm:max-w-sm order-3 sm:order-2">
                {recording ? (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
                    <Mic2 className="w-3.5 h-3.5 shrink-0" />
                    Listening to Microphone (Interpreter)
                  </span>
                ) : (
                  <Select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    disabled={recording || devicesLoading}
                    aria-label="Microphone"
                    className={cn(
                      "h-8 text-xs w-full min-w-[200px] text-foreground",
                      wsDark ? "bg-card border border-white/20" : "bg-white border border-border",
                    )}
                  >
                    {devicesLoading ? (
                      <option value="">Loading microphones…</option>
                    ) : devices.length === 0 ? (
                      <option value="">{devicesError || "No microphones found — click refresh"}</option>
                    ) : (
                      devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                        </option>
                      ))
                    )}
                  </Select>
                )}
              </div>
            )}
            {devices.length === 0 && !devicesLoading && inputMode === "mic" && !recording && (
              <button
                type="button"
                onClick={() => void refreshDevices()}
                className={cn(
                  "h-8 px-2 shrink-0 rounded-lg border text-[10px] font-semibold order-3 sm:order-2",
                  wsDark ? "border-white/20 text-sky-300 hover:bg-white/5" : "border-border text-primary hover:bg-muted",
                )}
              >
                Refresh
              </button>
            )}
            {inputMode === "tab" && (
              <div className="w-full sm:flex-1 sm:min-w-0 sm:w-auto order-3 sm:order-2">
                {!recording ? (
                  <ol className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] text-muted-foreground">
                    <li className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold flex items-center justify-center shrink-0">1</span>
                      Join your call in a browser tab
                    </li>
                    <li className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold flex items-center justify-center shrink-0">2</span>
                      Click Start below
                    </li>
                    <li className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold flex items-center justify-center shrink-0">3</span>
                      {isFirefoxBrowser()
                        ? "Select a tab and turn on Share audio — if Firefox captures no sound, use Chrome/Edge or Mic"
                        : "Select the tab and enable “Share tab audio” — your mic is excluded"}
                    </li>
                  </ol>
                ) : (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 shrink-0" />
                    Listening to Tab Audio (Caller)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center px-3 sm:px-4 py-3 gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Translate</span>
              <Select
                value={langA}
                onChange={(e) => setLangA(e.target.value)}
                disabled={recording}
                className={cn(
                  "h-9 text-sm flex-1 sm:w-[130px] sm:flex-none min-w-0 border",
                  wsDark ? "bg-card/90 border-white/10" : "bg-white border-border",
                )}
              >
                {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
              <span className="text-xs font-semibold text-muted-foreground shrink-0">↔</span>
              <Select
                value={langB}
                onChange={(e) => setLangB(e.target.value)}
                disabled={recording}
                className={cn(
                  "h-9 text-sm flex-1 sm:w-[130px] sm:flex-none min-w-0 border",
                  wsDark ? "bg-card/90 border-white/10" : "bg-white border-border",
                )}
              >
                {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </div>
            <div className="w-full sm:flex-1 flex justify-center items-center">
              {isBlocked ? (
                <div className="w-full sm:w-auto h-11 sm:px-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium text-sm border border-border">
                  Limit Reached
                </div>
              ) : (
                <div className="relative w-full sm:w-auto">
                  {recording && (
                    <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20 pointer-events-none" />
                  )}
                  <button
                    type="button"
                    onClick={handleToggle}
                    disabled={starting || (!recording && !pairReady)}
                    className={`w-full sm:w-auto h-11 sm:px-10 rounded-full flex items-center justify-center gap-2.5 font-semibold text-[15px] shadow-md transition-all duration-200 active:scale-95 disabled:opacity-70 ${
                      recording
                        ? "bg-destructive text-white hover:bg-destructive/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/92 hover:shadow-[0_0_28px_rgba(56,189,248,0.45)] hover:scale-[1.02]"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${recording ? "bg-white animate-pulse" : "bg-white/80"}`} />
                    {starting ? "Starting…" : recording ? "Stop" : "Start"}
                  </button>
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 opacity-0 pointer-events-none" aria-hidden>
              <span className="text-xs font-semibold whitespace-nowrap">Translate</span>
              <div className="h-9 w-[130px]" />
            </div>
          </div>

          {!pairReady && (
            <div className="px-4 pb-2 text-xs text-amber-600">
              Both languages must be on Soniox’s supported list and different from each other.
            </div>
          )}

          {(sessionError || error) && (
            <div className="px-4 pb-3">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {sessionError || error?.message}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
