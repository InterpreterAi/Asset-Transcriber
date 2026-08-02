import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetMeQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import {
  BookOpen,
  Columns2,
  Monitor,
  Moon,
  NotebookPen,
  Radio,
  Rows3,
  Square,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranscription } from "@/hooks/use-transcription";
import { GlossaryPanel } from "@/components/GlossaryPanel";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { workspaceLanguageOptions } from "@/lib/workspace-languages";
import { cn, formatMinutes } from "@/lib/utils";

const LANG_OPTIONS = workspaceLanguageOptions();

/**
 * Demo-only engine routing (does not change the admin account plan in DB).
 * `basic-hetzner` hard-routes to Soniox STT + Soniox chunk-v2 native translation.
 */
const DEMO_CHUNK_V2_PLAN = "basic-hetzner";

/** Marketing videos always present the real trial daily cap (2 hours). */
const DEMO_TRIAL_DAILY_MINUTES = 120;

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

type DemoSheet = "none" | "notes" | "glossary";

function formatLiveElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
        "flex items-center rounded-md border shrink-0 overflow-hidden h-6",
        dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={idx <= 0}
        className={cn(
          "px-1.5 h-full text-xs font-semibold disabled:opacity-30",
          dark ? "text-slate-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100",
        )}
        aria-label="Decrease text size"
      >
        −
      </button>
      <span
        className={cn(
          "px-1 text-[10px] font-semibold tabular-nums min-w-[1.4rem] text-center",
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
          "px-1.5 h-full text-xs font-semibold disabled:opacity-30",
          dark ? "text-slate-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100",
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
  const [sheet, setSheet] = useState<DemoSheet>("none");
  const [notes, setNotes] = useState("");
  const [usageTick, setUsageTick] = useState(0);
  const [liveElapsedSec, setLiveElapsedSec] = useState(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const liveStartedAtRef = useRef<number | null>(null);

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

  // Demo filming default: workspace-style side-by-side (not stacked nested card).
  useEffect(() => {
    transcription.setCanonIntercallLayoutStacked(false);
  }, [transcription.setCanonIntercallLayoutStacked]);

  useEffect(() => {
    if (!transcription.isRecording) return;
    const id = window.setInterval(() => setUsageTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, [transcription.isRecording]);

  useEffect(() => {
    if (!transcription.isRecording) {
      liveStartedAtRef.current = null;
      setLiveElapsedSec(0);
      return;
    }
    if (liveStartedAtRef.current == null) {
      liveStartedAtRef.current = Date.now();
    }
    const tick = () => {
      const start = liveStartedAtRef.current ?? Date.now();
      setLiveElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [transcription.isRecording]);

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

  // Tail-follow only — last-row highlight is pure CSS (:last-child) so growing text never flickers.
  useEffect(() => {
    const container = transcription.containerRef.current;
    const scroller = scrollerRef.current;
    if (!container || !scroller) return;

    let scrollRaf = 0;
    const followTailIfPinned = () => {
      if (!stickToBottomRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    };
    const scheduleScroll = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(followTailIfPinned);
    };

    const textObserver = new MutationObserver(scheduleScroll);
    textObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    followTailIfPinned();
    return () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      textObserver.disconnect();
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
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    });

    await transcription.start("", audioStream);
  };

  const handleToggleRecording = async () => {
    setLocalError(null);
    if (transcription.isRecording) {
      await transcription.stop().catch(() => {});
      stopTabStream();
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      return;
    }
    try {
      await handleStartTabAudio();
    } catch (err) {
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
  const sessionMinutes =
    transcription.isRecording ? transcription.getApproxBillableMinutesThisSession() : 0;
  void usageTick;
  const usedMinutes = me.minutesUsedToday + sessionMinutes;
  const usageLabel = `${formatMinutes(usedMinutes)} / 2h`;
  const daysLeftLabel = "7 days left";
  const usagePct = Math.min(100, (usedMinutes / DEMO_TRIAL_DAILY_MINUTES) * 100);

  const transcriptTextStyle = {
    "--ts-font-size": `${fontPx}px`,
    "--ts-line-height": "1.45",
  } as CSSProperties;

  const stacked = transcription.canonIntercallLayoutStacked;

  const toolBtn = (active: boolean) =>
    cn(
      "h-6 px-1.5 rounded-md border inline-flex items-center gap-1 text-[10px] font-semibold min-w-0 transition-colors",
      active
        ? dark
          ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-100"
          : "bg-sky-100 border-sky-300 text-sky-800"
        : dark
          ? "border-white/10 text-slate-300 hover:bg-white/10"
          : "border-slate-200 text-slate-600 hover:bg-slate-100",
    );

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
        <div className="flex flex-col flex-1 min-h-0">
        {/* Compact top bar: brand + pair + LIVE (only while recording) */}
        <header
          className={cn(
            "h-11 shrink-0 border-b px-3 flex items-center justify-between gap-2",
            dark ? "border-white/[0.08] bg-[#0b1220]/92" : "border-slate-200/80 bg-white/90",
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={dark ? "/brand/interpreterai-mark-dark.svg" : "/brand/interpreterai-mark-light.svg"}
              alt=""
              className="h-7 w-7 object-contain shrink-0"
              draggable={false}
            />
            <span className={cn("text-[13px] font-semibold truncate", dark ? "text-white" : "text-slate-900")}>
              Interpreter<span className={dark ? "text-cyan-300" : "text-sky-600"}>AI</span>
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border shrink-0",
                dark
                  ? "border-white/10 text-slate-400 bg-white/[0.03]"
                  : "border-slate-200 text-slate-500 bg-slate-50",
              )}
            >
              {pairLabel}
            </span>
          </div>
          {transcription.isRecording && (
            <div className="demo-live-badge demo-live-badge-active flex items-center gap-2 px-2 py-0.5 rounded-full bg-red-600 text-white border border-red-500 shadow-[0_0_0_1px_rgba(220,38,38,0.35)] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-bold tracking-widest">LIVE</span>
              <span className="text-[10px] font-semibold tabular-nums tracking-normal opacity-95">
                {formatLiveElapsed(liveElapsedSec)}
              </span>
            </div>
          )}
        </header>

        {/* Compact toolbar — wraps instead of horizontal scroll */}
        <div
          className={cn(
            "shrink-0 border-b px-2 py-1.5 flex flex-wrap items-center gap-1.5 overflow-x-hidden",
            dark ? "border-white/[0.06] bg-white/[0.015]" : "border-slate-200/70 bg-slate-50/80",
          )}
        >
          <DemoFontSizeStepper value={fontPx} onChange={setFontPx} dark={dark} />
          <div
            className={cn(
              "h-6 px-1.5 rounded-md text-[10px] font-medium flex items-center gap-1 border min-w-0",
              dark
                ? "bg-white/[0.04] border-white/[0.08] text-slate-300"
                : "bg-white border-slate-200 text-slate-600",
            )}
            title="Trial daily usage (2 hours)"
          >
            <span className="tabular-nums whitespace-nowrap">{usageLabel}</span>
            <span className={cn("opacity-40", dark ? "text-slate-500" : "text-slate-400")}>·</span>
            <span className="whitespace-nowrap">{daysLeftLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => setSheet((s) => (s === "notes" ? "none" : "notes"))}
            className={toolBtn(sheet === "notes")}
            title="Notes"
          >
            <NotebookPen className="w-3 h-3 shrink-0" />
            <span>Notes</span>
          </button>
          <button
            type="button"
            onClick={() => setSheet((s) => (s === "glossary" ? "none" : "glossary"))}
            className={toolBtn(sheet === "glossary")}
            title="Glossary"
          >
            <BookOpen className="w-3 h-3 shrink-0" />
            <span>Glossary</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-md border shrink-0 ml-auto",
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
            "h-7 shrink-0 border-b px-3 grid gap-3 items-center",
            stacked ? "grid-cols-1" : "grid-cols-2",
            dark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-200/70 bg-slate-50/50",
          )}
        >
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider truncate",
              dark ? "text-slate-500" : "text-slate-500",
            )}
          >
            {stacked ? "Transcript" : "Original"}
          </span>
          {!stacked && (
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider truncate",
                dark ? "text-slate-500" : "text-slate-500",
              )}
            >
              Translation
            </span>
          )}
        </div>

        <main className="relative flex-1 min-h-0 px-2.5 py-2">
          <div
            ref={scrollerRef}
            className={cn(
              "marketing-demo-transcript-root h-full rounded-xl border overflow-y-auto overflow-x-hidden px-2 py-2.5 workspace-selectable-root",
              dark
                ? "border-white/[0.08] bg-[#0b111d]/92"
                : "border-slate-200 bg-white",
            )}
            style={transcriptTextStyle}
          >
            <div ref={transcription.containerRef} className="workspace-selectable-root" />
            {!transcription.hasTranscript && (
              <div
                className={cn(
                  "h-full min-h-[180px] flex flex-col items-center justify-center text-center gap-2.5 pointer-events-none",
                  dark ? "text-slate-400" : "text-slate-500",
                )}
              >
                <div
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center border",
                    dark
                      ? "bg-cyan-500/12 border-cyan-400/25"
                      : "bg-sky-500/10 border-sky-300/40",
                  )}
                >
                  <Monitor className={cn("w-5 h-5", dark ? "text-cyan-300" : "text-sky-600")} />
                </div>
                <p className={cn("text-sm font-medium", dark ? "text-slate-200" : "text-slate-800")}>
                  {transcription.isRecording
                    ? "Listening to Tab Audio…"
                    : "Press Start to share a browser tab"}
                </p>
                <p className={cn("text-xs max-w-[15rem]", dark ? "text-slate-500" : "text-slate-500")}>
                  Choose the call tab and enable “Share tab audio”.
                </p>
              </div>
            )}
          </div>

          {/* Half-screen Notes sheet */}
          {sheet === "notes" && (
            <div
              className={cn(
                "absolute inset-x-2.5 bottom-2 z-20 h-[48%] rounded-xl border flex flex-col overflow-hidden shadow-2xl",
                dark
                  ? "border-white/10 bg-[#0d1524]"
                  : "border-slate-200 bg-white",
              )}
            >
              <div
                className={cn(
                  "h-9 px-3 border-b flex items-center justify-between shrink-0",
                  dark ? "border-white/[0.08]" : "border-slate-200",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <NotebookPen className={cn("w-3.5 h-3.5", dark ? "text-cyan-300" : "text-sky-600")} />
                  <span className="text-xs font-semibold">Notes</span>
                  <span className={cn("text-[10px] tabular-nums truncate", dark ? "text-slate-400" : "text-slate-500")}>
                    {usageLabel} · {daysLeftLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSheet("none")}
                  className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center",
                    dark ? "text-slate-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100",
                  )}
                  aria-label="Close notes"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className={cn("h-1 w-full shrink-0", dark ? "bg-white/5" : "bg-slate-100")}>
                <div
                  className={cn("h-full transition-[width]", usagePct >= 100 ? "bg-red-500" : "bg-cyan-500")}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Session notes (cleared when you stop)…"
                className={cn(
                  "flex-1 min-h-0 w-full resize-none px-3 py-2 text-sm outline-none",
                  dark
                    ? "bg-transparent text-slate-100 placeholder:text-slate-500"
                    : "bg-transparent text-slate-900 placeholder:text-slate-400",
                )}
              />
            </div>
          )}

          {/* Half-screen Glossary sheet */}
          {sheet === "glossary" && (
            <div
              className={cn(
                "absolute inset-x-2.5 bottom-2 z-20 h-[48%] rounded-xl border overflow-hidden shadow-2xl",
                "[&>div]:w-full [&>div]:h-full [&>div]:border-0 [&>div]:rounded-xl",
                dark ? "border-white/10" : "border-slate-200",
              )}
            >
              <GlossaryPanel onClose={() => setSheet("none")} langA={langA} langB={langB} />
            </div>
          )}
        </main>

        <footer
          className={cn(
            "shrink-0 border-t px-3 py-2.5 space-y-2",
            dark ? "border-white/[0.08] bg-[#0b1220]/94" : "border-slate-200/80 bg-white/95",
          )}
        >
          {(transcription.error || transcription.translationServiceError || localError) && (
            <div
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[11px] flex items-start gap-2",
                dark
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                  : "border-amber-300 bg-amber-50 text-amber-900",
              )}
            >
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{localError ?? transcription.translationServiceError ?? transcription.error}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <select
              value={langA}
              onChange={(e) => handleLangAChange(e.target.value)}
              disabled={transcription.isRecording || transcription.isStarting}
              aria-label="Source language"
              className={cn(
                "h-8 flex-1 min-w-0 rounded-lg border px-2 text-xs disabled:opacity-50",
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
            <span className={cn("text-[10px] font-semibold shrink-0", dark ? "text-slate-500" : "text-slate-400")}>
              ↔
            </span>
            <select
              value={langB}
              onChange={(e) => handleLangBChange(e.target.value)}
              disabled={transcription.isRecording || transcription.isStarting}
              aria-label="Target language"
              className={cn(
                "h-8 flex-1 min-w-0 rounded-lg border px-2 text-xs disabled:opacity-50",
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
            <button
              type="button"
              onClick={() => {
                // Let the canon engine rebuild rows for the new layout — do not rewrite classes by hand.
                transcription.setCanonIntercallLayoutStacked(!stacked);
              }}
              className={cn(
                "h-8 px-2 rounded-lg border inline-flex items-center justify-center gap-1 text-[10px] font-semibold shrink-0",
                dark
                  ? "border-white/10 bg-[#121a2a] text-slate-300 hover:bg-white/10"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
              title={stacked ? "Switch to side by side" : "Switch to stacked"}
              aria-label={stacked ? "Switch to side by side" : "Switch to stacked"}
            >
              {stacked ? <Columns2 className="w-3.5 h-3.5" /> : <Rows3 className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleRecording()}
            disabled={transcription.isStarting}
            className={cn(
              "h-10 w-full rounded-full px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all",
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
                <Square className="w-3.5 h-3.5 fill-current stroke-none" />
                Stop
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                Start
              </>
            )}
          </button>
        </footer>
        </div>
      </div>
    </div>
  );
}
