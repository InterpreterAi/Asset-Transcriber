import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetMeQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import {
  Clock,
  Monitor,
  Moon,
  Radio,
  Square,
  Sun,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useTranscription } from "@/hooks/use-transcription";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { workspaceLanguageOptions } from "@/lib/workspace-languages";
import { cn, formatMinutes, isTrialLikePlanType } from "@/lib/utils";

const LANG_OPTIONS = workspaceLanguageOptions();

/**
 * Demo-only engine routing (does not change the admin account plan in DB).
 * `basic-hetzner` hard-routes to Soniox STT + Soniox chunk-v2 native translation.
 */
const DEMO_CHUNK_V2_PLAN = "basic-hetzner";

const DEMO_FONT_PX_OPTIONS = [12, 14, 16, 18, 20, 22, 24] as const;
type DemoFontPx = (typeof DEMO_FONT_PX_OPTIONS)[number];
const DEMO_FONT_LS = "interpreterai_demo_marketing_font_px";
const DEMO_THEME_LS = "interpreterai_demo_marketing_theme";

/** ~12% wider than a pure 9:16 phone while still fitting a vertical recording frame. */
const FRAME_STYLE: CSSProperties = {
  width: "min(100vw, calc(100dvh * 9 / 16 * 1.12))",
  height: "min(100dvh, calc(100vw * 16 / 9 / 1.12))",
};

const TAIL_STICK_EPS_PX = 72;

function readDemoFontPx(): DemoFontPx {
  try {
    const raw = localStorage.getItem(DEMO_FONT_LS);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    if (DEMO_FONT_PX_OPTIONS.includes(n as DemoFontPx)) return n as DemoFontPx;
  } catch {
    /* storage */
  }
  return 16;
}

function readDemoTheme(): "dark" | "light" {
  try {
    const raw = localStorage.getItem(DEMO_THEME_LS);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* storage */
  }
  return "dark";
}

function DemoFontSizeStepper({
  value,
  onChange,
  dark,
}: {
  value: DemoFontPx;
  onChange: (v: DemoFontPx) => void;
  dark: boolean;
}) {
  const idx = Math.max(0, DEMO_FONT_PX_OPTIONS.indexOf(value));
  const step = (delta: number) => {
    const next = DEMO_FONT_PX_OPTIONS[
      Math.max(0, Math.min(DEMO_FONT_PX_OPTIONS.length - 1, idx + delta))
    ]!;
    onChange(next);
  };
  return (
    <div
      className={cn(
        "flex items-center rounded-full border shrink-0 overflow-hidden h-7",
        dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-100/80",
      )}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={idx <= 0}
        className={cn(
          "px-2 h-full text-sm font-semibold transition-colors disabled:opacity-30",
          dark ? "text-slate-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-200/80",
        )}
        aria-label="Decrease text size"
      >
        −
      </button>
      <span
        className={cn(
          "px-2 text-xs font-semibold tabular-nums min-w-[1.75rem] text-center",
          dark ? "text-slate-200" : "text-slate-700",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => step(+1)}
        disabled={idx >= DEMO_FONT_PX_OPTIONS.length - 1}
        className={cn(
          "px-2 h-full text-sm font-semibold transition-colors disabled:opacity-30",
          dark ? "text-slate-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-200/80",
        )}
        aria-label="Increase text size"
      >
        +
      </button>
    </div>
  );
}

export default function AdminMarketingDemo() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading, isFetched: meFetched, error: meError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");
  const [tabStream, setTabStream] = useState<MediaStream | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fontPx, setFontPx] = useState<DemoFontPx>(() => readDemoFontPx());
  const [theme, setTheme] = useState<"dark" | "light">(() => readDemoTheme());

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const activeRowRef = useRef<HTMLElement | null>(null);

  const dark = theme === "dark";

  useEffect(() => {
    try {
      localStorage.setItem(DEMO_FONT_LS, String(fontPx));
    } catch {
      /* storage */
    }
  }, [fontPx]);

  useEffect(() => {
    try {
      localStorage.setItem(DEMO_THEME_LS, theme);
    } catch {
      /* storage */
    }
  }, [theme]);

  useEffect(() => {
    if (!meFetched || meLoading) return;
    if (!me) {
      if (meError && !(meError instanceof ApiError)) return;
      setLocation(loginUrlForReturnTo("/admin/demo-marketing"));
      return;
    }
    if (!me.isAdmin) {
      setLocation("/workspace");
    }
  }, [me, meLoading, meFetched, meError, setLocation]);

  const authUnavailable =
    meFetched &&
    !meLoading &&
    !me &&
    Boolean(meError) &&
    (!(meError instanceof ApiError) || meError.status !== 401);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    void fetch("/api/auth/default-languages", { credentials: "include" })
      .then((r) => r.json() as Promise<{ defaultLangA?: string; defaultLangB?: string }>)
      .then((d) => {
        if (cancelled) return;
        const nextA = (d.defaultLangA ?? "").trim().toLowerCase();
        const nextB = (d.defaultLangB ?? "").trim().toLowerCase();
        if (nextA && nextB && nextA !== nextB) {
          setLangA(nextA);
          setLangB(nextB);
        }
      })
      .catch(() => {
        // Keep default fallback pair for demo mode.
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  // Always Soniox STT + Soniox chunk-v2 translation for marketing videos (isolated from admin DB plan).
  const transcription = useTranscription(me?.isAdmin ?? false, {
    translationEnabled: true,
    translationUiMode: "upsell",
    planType: DEMO_CHUNK_V2_PLAN,
    segmentBehaviorMode: "morsy-intercall-isolated-experiment",
    segmentBoundaryGuards: Boolean(me),
    morsyUrgentTranscriptSegmentGuards: Boolean(me),
    experimentMorsyUrgentIntercallOrchestration: false,
    morsyUrgentTranslateAttachOpenAiExperiment: false,
    experimentMorsyIntercallEmbeddedEnglishPrompt: false,
    experimentMorsyBasicCleanTranslation: false,
    experimentMorsyUrgentChunkTranslationV2: true,
    onRecordingStopped: () => {
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    },
  });

  useEffect(() => {
    transcription.setLangPair(langA, langB);
  }, [langA, langB, transcription]);

  const handleLangAChange = (next: string) => {
    if (next === langB) return;
    setLangA(next);
  };
  const handleLangBChange = (next: string) => {
    if (next === langA) return;
    setLangB(next);
  };

  // Workspace-style sticky tail: auto-follow only while near the bottom.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const distance =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickToBottomRef.current = distance <= TAIL_STICK_EPS_PX;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight moves only when a new row is appended — never while the active segment's text grows.
  useEffect(() => {
    const container = transcription.containerRef.current;
    const scroller = scrollerRef.current;
    if (!container || !scroller) return;

    let highlightRaf = 0;
    let scrollRaf = 0;

    const syncActiveRow = () => {
      const rows = Array.from(container.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
      );
      const nextActive = rows[rows.length - 1] ?? null;
      if (nextActive === activeRowRef.current) return;
      activeRowRef.current?.classList.remove("demo-row-active");
      nextActive?.classList.add("demo-row-active");
      activeRowRef.current = nextActive;
    };

    const followTailIfPinned = () => {
      if (!stickToBottomRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    };

    const scheduleHighlight = () => {
      if (highlightRaf) cancelAnimationFrame(highlightRaf);
      highlightRaf = requestAnimationFrame(syncActiveRow);
    };

    const scheduleScroll = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(followTailIfPinned);
    };

    // New bubbles only — avoids re-touching classes on every streaming character.
    const rowObserver = new MutationObserver(scheduleHighlight);
    rowObserver.observe(container, { childList: true });

    // Text growth may need tail-follow, but must not toggle highlight classes.
    const textObserver = new MutationObserver(scheduleScroll);
    textObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    syncActiveRow();
    followTailIfPinned();
    return () => {
      if (highlightRaf) cancelAnimationFrame(highlightRaf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      rowObserver.disconnect();
      textObserver.disconnect();
      activeRowRef.current?.classList.remove("demo-row-active");
      activeRowRef.current = null;
    };
  }, [transcription.containerRef]);

  const stopTabStream = () => {
    if (!tabStream) return;
    tabStream.getTracks().forEach((t) => t.stop());
    setTabStream(null);
  };

  /** Same Tab Audio path as workspace: open the browser share picker, capture tab audio only. */
  const handleStartTabAudio = async () => {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "browser",
      } as MediaTrackConstraints,
      audio: {
        // Keep tab audio audible while capturing (Chrome supports suppressLocalAudioPlayback).
        suppressLocalAudioPlayback: false,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as MediaTrackConstraints,
    });

    displayStream.getVideoTracks().forEach((t) => t.stop());

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((t) => t.stop());
      setLocalError(
        'No tab audio captured. In the share picker, choose a Chrome tab and enable "Share tab audio".',
      );
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    setTabStream(audioStream);
    stickToBottomRef.current = true;

    audioTracks[0]!.addEventListener("ended", () => {
      void transcription.stop().catch(() => {});
      setTabStream(null);
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    });

    // Empty deviceId + providedStream skips getUserMedia (mic never opened).
    await transcription.start("", audioStream);
  };

  const handleToggleRecording = async () => {
    setLocalError(null);
    if (transcription.isRecording) {
      await transcription.stop().catch(() => {});
      stopTabStream();
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      return;
    }
    try {
      await handleStartTabAudio();
    } catch (err) {
      // User cancelled the share picker, or browser blocked getDisplayMedia.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        return;
      }
      setLocalError(
        "Could not open Tab Audio picker. Use Chrome/Edge and allow screen/tab sharing, then try again.",
      );
    }
  };

  if (meLoading) {
    return (
      <div className="min-h-screen bg-[#03060d] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }
  if (authUnavailable) {
    return (
      <div className="marketing-demo-mode min-h-screen w-full bg-[#02050b] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-amber-400/30 bg-[#0b111d]/95 px-5 py-6 shadow-[0_20px_70px_-30px_rgba(0,0,0,0.9)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">Demo mode unavailable</p>
          <p className="mt-3 text-base text-slate-200 leading-relaxed">
            InterpreterAI could not verify your admin session because the API is not fully available in this environment.
          </p>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Configure the backend database and sign in as an admin to use `/admin/demo-marketing`.
          </p>
        </div>
      </div>
    );
  }
  if (!me?.isAdmin) return null;

  const pairLabel = `${langA.trim().toUpperCase() || "EN"} → ${langB.trim().toUpperCase() || "AR"}`;
  const isTrial = isTrialLikePlanType(me.planType);
  const daysLeft = isTrial
    ? me.trialDaysRemaining
    : typeof me.paidCycleDaysRemaining === "number"
      ? me.paidCycleDaysRemaining
      : null;
  const daysLeftLabel =
    typeof daysLeft === "number"
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
      : null;
  const usageLabel = `${formatMinutes(me.minutesUsedToday)} / ${formatMinutes(me.dailyLimitMinutes)} today`;

  const transcriptTextStyle = {
    "--ts-font-size": `${fontPx}px`,
    "--ts-line-height": "1.45",
  } as CSSProperties;

  return (
    <div
      className={cn(
        "marketing-demo-mode min-h-screen w-full flex items-center justify-center overflow-hidden",
        dark ? "marketing-demo-dark bg-[#02050b] text-white" : "marketing-demo-light bg-slate-100 text-slate-900",
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          dark
            ? "bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(59,130,246,0.14),transparent_45%),linear-gradient(180deg,#02050b_0%,#050a14_60%,#02050b_100%)]"
            : "bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.12),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(59,130,246,0.10),transparent_45%),linear-gradient(180deg,#e8eef6_0%,#f1f5f9_60%,#e2e8f0_100%)]",
        )}
      />
      <div
        className={cn(
          "relative z-10 rounded-[26px] border overflow-hidden flex flex-col backdrop-blur-xl",
          dark
            ? "border-white/10 bg-[#080d17]/95 shadow-[0_44px_120px_-36px_rgba(0,0,0,0.95),0_0_0_1px_rgba(34,211,238,0.15)]"
            : "border-slate-200/90 bg-white/95 shadow-[0_44px_120px_-36px_rgba(15,23,42,0.35),0_0_0_1px_rgba(14,165,233,0.12)]",
        )}
        style={FRAME_STYLE}
      >
        <header
          className={cn(
            "h-14 shrink-0 border-b px-4 flex items-center justify-between gap-2",
            dark ? "border-white/[0.08] bg-[#0b1220]/92" : "border-slate-200/80 bg-white/90",
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center ring-1",
                dark
                  ? "bg-cyan-500/15 text-cyan-300 ring-cyan-400/25"
                  : "bg-sky-500/10 text-sky-600 ring-sky-400/30",
              )}
            >
              <Zap className="w-4 h-4" />
            </div>
            <span className={cn("text-[14px] leading-none font-semibold", dark ? "text-white" : "text-slate-900")}>
              Interpreter<span className={dark ? "text-cyan-300" : "text-sky-600"}>AI</span>
            </span>
          </div>
          <div
            className={cn(
              "demo-live-badge flex items-center gap-2 px-2.5 py-1 rounded-full border shrink-0",
              transcription.isRecording && "demo-live-badge-active",
              dark
                ? "bg-cyan-500/10 text-cyan-200 border-cyan-400/30"
                : "bg-emerald-50 text-emerald-700 border-emerald-300/70",
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                transcription.isRecording
                  ? dark
                    ? "bg-cyan-300"
                    : "bg-emerald-500"
                  : dark
                    ? "bg-slate-500"
                    : "bg-slate-300",
              )}
            />
            <span className="text-[10px] font-semibold tracking-widest">LIVE</span>
          </div>
        </header>

        <div
          className={cn(
            "shrink-0 border-b px-3 py-2 flex flex-wrap items-center justify-center gap-2",
            dark ? "border-white/[0.06] bg-white/[0.015]" : "border-slate-200/70 bg-slate-50/80",
          )}
        >
          <DemoFontSizeStepper value={fontPx} onChange={setFontPx} dark={dark} />
          <div
            className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-medium flex items-center gap-1.5 border",
              dark
                ? "bg-muted/20 border-white/[0.08] text-slate-300"
                : "bg-white border-slate-200 text-slate-600",
            )}
          >
            <Clock className="w-3 h-3 shrink-0 opacity-70" />
            <span className="tabular-nums whitespace-nowrap">{usageLabel}</span>
          </div>
          {daysLeftLabel && (
            <div
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-medium border whitespace-nowrap",
                dark
                  ? "bg-emerald-500/10 border-emerald-400/25 text-emerald-200"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700",
              )}
            >
              {daysLeftLabel}
            </div>
          )}
          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg border transition-colors shrink-0",
              dark
                ? "border-white/10 text-amber-200/90 hover:bg-white/10"
                : "border-slate-200 text-slate-500 hover:bg-slate-100",
            )}
            title={dark ? "Bright mode" : "Dark mode"}
            aria-label={dark ? "Switch to bright mode" : "Switch to dark mode"}
          >
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div
          className={cn(
            "h-8 shrink-0 border-b px-4 flex items-center justify-center",
            dark ? "border-white/[0.05]" : "border-slate-200/70",
          )}
        >
          <span
            className={cn(
              "text-[10px] font-semibold tracking-wide tabular-nums",
              dark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {pairLabel}
          </span>
        </div>

        <div
          className={cn(
            "h-8 shrink-0 border-b px-4 grid grid-cols-2 gap-2.5 items-center",
            dark ? "border-white/[0.05]" : "border-slate-200/70",
          )}
        >
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider truncate",
              dark ? "text-slate-500" : "text-slate-400",
            )}
          >
            Original
          </span>
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider truncate",
              dark ? "text-slate-500" : "text-slate-400",
            )}
          >
            Translation
          </span>
        </div>

        <main className="flex-1 min-h-0 px-3 py-3">
          <div
            ref={scrollerRef}
            className={cn(
              "marketing-demo-transcript-root h-full rounded-2xl border overflow-y-auto overflow-x-hidden px-2.5 py-3 workspace-selectable-root",
              dark
                ? "border-white/[0.08] bg-[#0b111d]/92"
                : "border-slate-200 bg-slate-50/90",
            )}
            style={transcriptTextStyle}
          >
            <div ref={transcription.containerRef} className="workspace-selectable-root" />
            {!transcription.hasTranscript && (
              <div
                className={cn(
                  "h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-3 pointer-events-none",
                  dark ? "text-slate-400" : "text-slate-500",
                )}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center border",
                    dark
                      ? "bg-cyan-500/12 border-cyan-400/25"
                      : "bg-sky-500/10 border-sky-300/40",
                  )}
                >
                  <Monitor className={cn("w-5 h-5", dark ? "text-cyan-300" : "text-sky-600")} />
                </div>
                <p className={cn("text-base font-medium", dark ? "text-slate-200" : "text-slate-800")}>
                  {transcription.isRecording
                    ? "Listening to Tab Audio…"
                    : "Press Start to share a browser tab"}
                </p>
                <p className={cn("text-xs max-w-[16rem]", dark ? "text-slate-500" : "text-slate-400")}>
                  Choose the call tab and enable “Share tab audio”.
                </p>
              </div>
            )}
          </div>
        </main>

        <footer
          className={cn(
            "shrink-0 border-t px-4 py-3 space-y-2.5",
            dark ? "border-white/[0.08] bg-[#0b1220]/94" : "border-slate-200/80 bg-white/95",
          )}
        >
          {(transcription.error || transcription.translationServiceError || localError) && (
            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-xs flex items-start gap-2",
                dark
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                  : "border-amber-300 bg-amber-50 text-amber-900",
              )}
            >
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{localError ?? transcription.translationServiceError ?? transcription.error}</span>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 justify-center">
              <select
                value={langA}
                onChange={(e) => handleLangAChange(e.target.value)}
                disabled={transcription.isRecording || transcription.isStarting}
                aria-label="Source language"
                className={cn(
                  "h-9 flex-1 min-w-0 rounded-lg border px-2 text-xs disabled:opacity-50",
                  dark
                    ? "border-white/10 bg-[#121a2a] text-slate-100"
                    : "border-slate-200 bg-white text-slate-800",
                )}
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value} disabled={l.value === langB}>
                    {l.label}
                  </option>
                ))}
              </select>
              <span
                className={cn(
                  "text-[10px] font-semibold shrink-0",
                  dark ? "text-slate-500" : "text-slate-400",
                )}
              >
                ↔
              </span>
              <select
                value={langB}
                onChange={(e) => handleLangBChange(e.target.value)}
                disabled={transcription.isRecording || transcription.isStarting}
                aria-label="Target language"
                className={cn(
                  "h-9 flex-1 min-w-0 rounded-lg border px-2 text-xs disabled:opacity-50",
                  dark
                    ? "border-white/10 bg-[#121a2a] text-slate-100"
                    : "border-slate-200 bg-white text-slate-800",
                )}
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value} disabled={l.value === langA}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void handleToggleRecording()}
              disabled={transcription.isStarting}
              className={cn(
                "h-11 w-full rounded-full px-6 inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all",
                transcription.isRecording
                  ? "bg-red-500 text-white hover:bg-red-500/90 shadow-[0_0_30px_rgba(239,68,68,0.45)]"
                  : dark
                    ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_32px_rgba(34,211,238,0.42)]"
                    : "bg-sky-500 text-white hover:bg-sky-400 shadow-[0_0_28px_rgba(14,165,233,0.35)]",
                transcription.isStarting && "opacity-70 pointer-events-none",
              )}
            >
              {transcription.isRecording ? (
                <>
                  <Square className="w-4 h-4" />
                  Stop
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  Start
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
