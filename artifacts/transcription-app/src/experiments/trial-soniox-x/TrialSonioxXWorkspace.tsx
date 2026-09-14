import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ApiError,
  getGetMeQueryKey,
  useGetMe,
  useGetTranscriptionToken,
  useLogout,
  useStartSession,
  useStopSession,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Languages, LogOut, Mic, Mic2, Monitor, Zap } from "lucide-react";
import { isActiveState } from "@soniox/speech-to-text-web";
import { Select } from "@/components/ui-components";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { cn, formatMinutes, workspacePlanDisplayName } from "@/lib/utils";
import { getWorkspacePlanTestOptions } from "@/lib/workspace-plan-test-options";
import { workspaceLanguageOptions } from "@/lib/workspace-languages";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import Renderer from "./renderer";
import useAutoScroll from "./useAutoScroll";
import useSonioxClient from "./useSonioxClient";
import { getLanguage } from "./languages";
import { workspaceLangToOfficialSonioxCode } from "./soniox-lang";

const LANG_OPTIONS = workspaceLanguageOptions();
const RTL_SONIOX_CODES = new Set(["ar", "he", "fa", "ur"]);

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = (err as ApiError & { data?: { error?: unknown } }).data;
    if (body && typeof body.error === "string" && body.error.trim()) return body.error;
    if (typeof err.message === "string" && err.message.trim()) return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/**
 * Isolated Trial · Soniox X workspace.
 * Live STT + two-way translation is the official Soniox live-demo "Translate Between" path
 * (https://github.com/soniox/soniox_examples/blob/master/apps/soniox-live-demo/react/src/renderers/translate-between.tsx).
 * It does not call POST /translate or the shared use-transcription pipeline.
 */
export default function TrialSonioxXWorkspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading, error: userError, isFetched: userFetched } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 15_000 },
  });
  const logoutMut = useLogout();
  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();
  const { devices, loading: devicesLoading, error: devicesError, refresh: refreshDevices } = useAudioDevices();

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [inputMode, setInputMode] = useState<"mic" | "tab">("mic");
  const [tabStream, setTabStream] = useState<MediaStream | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [testPlanLoading, setTestPlanLoading] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const sessionIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

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
    () => [languageA.code, languageB.code],
    [languageA.code, languageB.code],
  );

  const {
    state,
    finalTokens,
    nonFinalTokens,
    startTranscription,
    stopTranscription,
    error,
  } = useSonioxClient({
    apiKey: fetchTempApiKey,
    translationConfig,
    languageHints,
  });

  const recording = isActiveState(state);

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
    clearHeartbeat();
    startTimeRef.current = null;
    if (!sid) return;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : 0;
    try {
      await stopSessionMut.mutateAsync({
        data: { sessionId: sid, durationSeconds },
      });
    } catch {
      /* session may already be closed by stale sweep */
    }
    void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [clearHeartbeat, queryClient, stopSessionMut]);

  const stopLive = useCallback(async () => {
    stopTranscription();
    if (tabStream) {
      tabStream.getTracks().forEach((t) => t.stop());
      setTabStream(null);
    }
    await closeBillingSession();
  }, [closeBillingSession, stopTranscription, tabStream]);

  useEffect(() => {
    if (state !== "Error" && state !== "Canceled") return;
    if (!sessionIdRef.current) return;
    void closeBillingSession();
  }, [state, closeBillingSession]);

  useEffect(() => {
    return () => {
      stopTranscription();
      void closeBillingSession();
    };
    // Intentional unmount-only cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return;
    const tick = () => {
      if (startTimeRef.current == null) return;
      setElapsedMs(Date.now() - startTimeRef.current);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!userFetched || userLoading || user) return;
    if (userError) {
      setLocation(loginUrlForReturnTo());
      return;
    }
    setLocation(loginUrlForReturnTo());
  }, [userFetched, userLoading, user, userError, setLocation]);

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

  const allTokens = [...finalTokens, ...nonFinalTokens];
  const leftContainerAutoScrollRef = useAutoScroll(allTokens);
  const rightContainerAutoScrollRef = useAutoScroll(allTokens);
  const languageATokens = allTokens.filter((token) => token.language === languageA.code);
  const languageBTokens = allTokens.filter((token) => token.language === languageB.code);

  const startHeartbeat = useCallback((sessionId: number) => {
    clearHeartbeat();
    const sendHeartbeat = () => {
      void fetch("/api/transcription/session/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          audioSecondsProcessed: startTimeRef.current
            ? Math.floor((Date.now() - startTimeRef.current) / 1000)
            : 0,
        }),
      }).catch(() => { /* best-effort */ });
    };
    heartbeatRef.current = setInterval(sendHeartbeat, 10_000);
    sendHeartbeat();
  }, [clearHeartbeat]);

  const startLive = useCallback(async (providedStream?: MediaStream) => {
    if (starting || recording) return;
    if (!pairReady || !sonioxA || !sonioxB) {
      setSessionError("Choose two Soniox-supported languages before starting.");
      return;
    }
    setStarting(true);
    setSessionError(null);
    try {
      const sessionRes = await startSessionMut.mutateAsync({
        data: { srcLang: langA, tgtLang: langB },
      });
      sessionIdRef.current = sessionRes.sessionId;
      sessionIdHolder.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      startHeartbeat(sessionRes.sessionId);
      await startTranscription({
        stream: providedStream,
        audioConstraints:
          !providedStream && selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : undefined,
      });
    } catch (err) {
      setSessionError(errMessage(err, "Could not start a live session."));
      await closeBillingSession();
    } finally {
      setStarting(false);
    }
  }, [
    closeBillingSession,
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
  ]);

  const handleStartTabAudio = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        } as MediaTrackConstraints,
        audio: true,
      });
      const audioTracks = displayStream.getAudioTracks();
      displayStream.getVideoTracks().forEach((t) => t.stop());
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        setSessionError("Enable “Share tab audio” in the browser picker, then try again.");
        return;
      }
      const audioStream = new MediaStream(audioTracks);
      setTabStream(audioStream);
      audioTracks[0]!.addEventListener("ended", () => {
        void stopLive();
      });
      await startLive(audioStream);
    } catch {
      /* user cancelled picker */
    }
  };

  const handleToggle = () => {
    if (recording || starting) {
      void stopLive();
      return;
    }
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

  const handleTestActivatePlan = async (planType: string) => {
    setTestPlanLoading(planType);
    try {
      const res = await fetch("/api/payments/test-activate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planType }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not switch plan.");
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (err) {
      setSessionError(errMessage(err, "Could not switch plan."));
    } finally {
      setTestPlanLoading(null);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return null;

  const isLimitReached = user.minutesUsedToday > 0 && user.minutesRemainingToday <= 0;
  const isBlocked = user.trialExpired || isLimitReached;
  const elapsedLabel = `${String(Math.floor(elapsedMs / 60000)).padStart(2, "0")}:${String(
    Math.floor((elapsedMs / 1000) % 60),
  ).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-[52px] shrink-0 flex items-center justify-between px-4 border-b border-border bg-card/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5" strokeWidth={2.2} />
          </div>
          <span className="font-semibold text-sm">
            Interpreter<span className="text-primary">AI</span>
          </span>
          <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
            {workspacePlanDisplayName(user.planType)} · Soniox X
          </span>
        </div>
        <div className="flex items-center gap-2">
          {recording && (
            <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-200 font-mono">
              {elapsedLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log out
          </button>
        </div>
      </header>

      <div className="px-4 py-2 border-b border-border/60 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          Today {formatMinutes(user.minutesUsedToday)} / {formatMinutes(user.dailyLimitMinutes)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
          Official Soniox live transcription + two-way translation
        </span>
      </div>

      {user.isAdmin && (
        <div className="px-4 py-2 border-b border-border/60 flex flex-wrap gap-1.5">
          {getWorkspacePlanTestOptions(true).map((o) => {
            const active = (user.planType ?? "").toLowerCase() === o.planType;
            return (
              <button
                key={o.planType}
                type="button"
                title={o.planType}
                disabled={recording || testPlanLoading != null}
                onClick={() => void handleTestActivatePlan(o.planType)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-semibold border",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {testPlanLoading === o.planType ? "…" : o.label}
              </button>
            );
          })}
        </div>
      )}

      <main className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <div className="rounded-xl border border-border bg-card flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2 border-b border-border/40">
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
              <button
                type="button"
                disabled={recording}
                onClick={() => setInputMode("mic")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium",
                  inputMode === "mic" ? "bg-white text-primary shadow-sm" : "text-muted-foreground",
                )}
              >
                <Mic2 className="w-3.5 h-3.5" />
                Mic
              </button>
              <button
                type="button"
                disabled={recording}
                onClick={() => setInputMode("tab")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium",
                  inputMode === "tab" ? "bg-white text-primary shadow-sm" : "text-muted-foreground",
                )}
              >
                <Monitor className="w-3.5 h-3.5" />
                Tab audio
              </button>
            </div>
            {inputMode === "mic" && (
              <div className="flex-1 min-w-[220px] max-w-sm">
                <Select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={recording || devicesLoading}
                  aria-label="Microphone"
                  className="h-8 text-xs w-full bg-white border border-border"
                >
                  {devicesLoading ? (
                    <option value="">Loading microphones…</option>
                  ) : devices.length === 0 ? (
                    <option value="">{devicesError || "No microphones found"}</option>
                  ) : (
                    devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                      </option>
                    ))
                  )}
                </Select>
              </div>
            )}
            {devices.length === 0 && !devicesLoading && inputMode === "mic" && (
              <button
                type="button"
                onClick={() => void refreshDevices()}
                className="h-8 px-2 rounded-lg border border-border text-[10px] font-semibold"
              >
                Refresh
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center px-3 py-3 gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Select
                value={langA}
                onChange={(e) => setLangA(e.target.value)}
                disabled={recording}
                aria-label="Language A"
                className="h-9 w-[130px] text-xs bg-white border border-border"
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-muted-foreground">↔</span>
              <Select
                value={langB}
                onChange={(e) => setLangB(e.target.value)}
                disabled={recording}
                aria-label="Language B"
                className="h-9 w-[130px] text-xs bg-white border border-border"
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:flex-1 flex justify-center">
              {isBlocked ? (
                <div className="h-11 px-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium text-sm border border-border">
                  Limit Reached
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={starting || (!recording && !pairReady)}
                  className={cn(
                    "w-full sm:w-auto h-11 sm:px-10 rounded-full flex items-center justify-center gap-2.5 font-semibold text-[15px] shadow-md",
                    recording
                      ? "bg-destructive text-white hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/92",
                  )}
                >
                  <span className={cn("w-2.5 h-2.5 rounded-full", recording ? "bg-white animate-pulse" : "bg-white/80")} />
                  {starting ? "Starting…" : recording ? "Stop" : "Start"}
                </button>
              )}
            </div>
          </div>

          {!pairReady && (
            <div className="px-4 pb-2 text-xs text-amber-700">
              Both languages must be on Soniox’s live-demo list and different from each other.
              {(!sonioxA || !sonioxB) && " One of the selected languages is not in that list."}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-3 pb-3 flex-1 min-h-0">
            <div className="border rounded-lg bg-white p-4 min-h-0 flex flex-col">
              <div className="text-sm font-semibold text-center mb-2">{languageA.name}</div>
              <div
                ref={leftContainerAutoScrollRef}
                className="flex-1 min-h-[240px] overflow-y-auto"
                dir={RTL_SONIOX_CODES.has(languageA.code) ? "rtl" : "ltr"}
              >
                <Renderer
                  tokens={languageATokens}
                  placeholder={`${languageA.name} will appear here...`}
                />
              </div>
            </div>
            <div className="border rounded-lg bg-white p-4 min-h-0 flex flex-col">
              <div className="text-sm font-semibold text-center mb-2">{languageB.name}</div>
              <div
                ref={rightContainerAutoScrollRef}
                className="flex-1 min-h-[240px] overflow-y-auto"
                dir={RTL_SONIOX_CODES.has(languageB.code) ? "rtl" : "ltr"}
              >
                <Renderer
                  tokens={languageBTokens}
                  placeholder={`${languageB.name} will appear here...`}
                />
              </div>
            </div>
          </div>

          {(sessionError || error) && (
            <div className="px-4 pb-3">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {sessionError || error?.message}
              </div>
            </div>
          )}

          {!recording && allTokens.length === 0 && (
            <div className="absolute pointer-events-none hidden" />
          )}
        </div>

        {!recording && allTokens.length === 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center">
            <Languages className="w-3.5 h-3.5" />
            Start recording — each column stays one language, matching Soniox Translate Between.
          </p>
        )}
        {recording && allTokens.length === 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center">
            <Mic className="w-3.5 h-3.5" />
            Waiting for speech…
          </p>
        )}
      </main>
    </div>
  );
}
