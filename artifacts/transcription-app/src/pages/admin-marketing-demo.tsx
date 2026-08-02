import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetMeQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import {
  Monitor,
  Radio,
  Square,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useTranscription } from "@/hooks/use-transcription";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { workspaceLanguageOptions } from "@/lib/workspace-languages";
import { cn } from "@/lib/utils";

const LANG_OPTIONS = workspaceLanguageOptions();

/**
 * Demo-only engine routing (does not change the admin account plan in DB).
 * `basic-hetzner` hard-routes to Soniox STT + Soniox chunk-v2 native translation.
 */
const DEMO_CHUNK_V2_PLAN = "basic-hetzner";

/** Fixed marketing size — clean and consistent for video (no auto-shrink). */
const DEMO_FONT_PX = 15;

/** ~12% wider than a pure 9:16 phone while still fitting a vertical recording frame. */
const FRAME_STYLE: CSSProperties = {
  width: "min(100vw, calc(100dvh * 9 / 16 * 1.12))",
  height: "min(100dvh, calc(100vw * 16 / 9 / 1.12))",
};

const TRANSCRIPT_TEXT_STYLE: CSSProperties = {
  "--ts-font-size": `${DEMO_FONT_PX}px`,
  "--ts-line-height": "1.45",
} as CSSProperties;

const TAIL_STICK_EPS_PX = 72;

function trySpeakerFromAnyRow(row: HTMLElement): string {
  const raw = row.dataset.cawSpeaker?.trim();
  if (raw) return `Speaker ${raw}`;
  const badge = row.querySelector(".font-mono");
  const label = badge?.textContent?.trim() ?? "";
  return label || "Speaker";
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
  const [activeSpeakerLabel, setActiveSpeakerLabel] = useState("Speaker");
  const [activePairLabel, setActivePairLabel] = useState("EN → AR");

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const activeSpeakerRef = useRef(activeSpeakerLabel);
  const activePairRef = useRef(activePairLabel);

  useEffect(() => {
    activeSpeakerRef.current = activeSpeakerLabel;
  }, [activeSpeakerLabel]);
  useEffect(() => {
    activePairRef.current = activePairLabel;
  }, [activePairLabel]);

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

  useEffect(() => {
    if (transcription.isRecording) return;
    const a = langA.trim().toUpperCase() || "—";
    const b = langB.trim().toUpperCase() || "—";
    const nextPair = `${a} → ${b}`;
    activePairRef.current = nextPair;
    setActivePairLabel(nextPair);
  }, [langA, langB, transcription.isRecording]);

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

  useEffect(() => {
    const container = transcription.containerRef.current;
    const scroller = scrollerRef.current;
    if (!container || !scroller) return;

    let rafId = 0;
    const applyDemoRowState = () => {
      const rows = Array.from(container.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
      );
      rows.forEach((row) => {
        row.classList.remove("demo-row-active", "demo-row-streaming");
      });
      const activeRow = rows[rows.length - 1];
      if (!activeRow) return;

      activeRow.classList.add("demo-row-active");
      const nextSpeaker = trySpeakerFromAnyRow(activeRow);
      if (nextSpeaker !== activeSpeakerRef.current) {
        activeSpeakerRef.current = nextSpeaker;
        setActiveSpeakerLabel(nextSpeaker);
      }
      const src = (activeRow.dataset.cawLanguage ?? "").trim().toUpperCase();
      const tgt = (activeRow.dataset.cawTranslationLanguage ?? "").trim().toUpperCase();
      const nextPair = src || tgt ? `${src || "—"} → ${tgt || "—"}` : activePairRef.current;
      if (nextPair !== activePairRef.current) {
        activePairRef.current = nextPair;
        setActivePairLabel(nextPair);
      }

      const hypothesisText =
        activeRow
          .querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`)
          ?.textContent?.trim() ?? "";
      const liveTranslationTail =
        activeRow
          .querySelector<HTMLElement>(`[data-caw-part="live"]`)
          ?.textContent?.trim() ?? "";
      if (transcription.isRecording && (hypothesisText || liveTranslationTail)) {
        activeRow.classList.add("demo-row-streaming");
      }

      if (stickToBottomRef.current) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    };

    const scheduleApply = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyDemoRowState);
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    scheduleApply();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [transcription.containerRef, transcription.isRecording]);

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

  const langAShort = (LANG_OPTIONS.find((l) => l.value === langA)?.label ?? langA).split(" (")[0];
  const langBShort = (LANG_OPTIONS.find((l) => l.value === langB)?.label ?? langB).split(" (")[0];

  return (
    <div className="marketing-demo-mode min-h-screen w-full bg-[#02050b] text-white flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(59,130,246,0.14),transparent_45%),linear-gradient(180deg,#02050b_0%,#050a14_60%,#02050b_100%)]" />
      <div
        className="relative z-10 rounded-[26px] border border-white/10 bg-[#080d17]/95 shadow-[0_44px_120px_-36px_rgba(0,0,0,0.95),0_0_0_1px_rgba(34,211,238,0.15)] backdrop-blur-xl overflow-hidden flex flex-col"
        style={FRAME_STYLE}
      >
        <header className="h-14 shrink-0 border-b border-white/[0.08] bg-[#0b1220]/92 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center ring-1 ring-cyan-400/25">
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] leading-none font-semibold text-white">
                Interpreter<span className="text-cyan-300">AI</span>
              </span>
              <span className="text-[9px] tracking-[0.14em] text-slate-500 uppercase mt-0.5">
                Demo
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-200 border border-cyan-400/30">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                transcription.isRecording ? "bg-cyan-300 animate-pulse" : "bg-slate-500",
              )}
            />
            <span className="text-[10px] font-semibold tracking-widest">LIVE</span>
          </div>
        </header>

        <div className="h-8 shrink-0 border-b border-white/[0.06] bg-white/[0.015] px-4 flex items-center justify-between">
          <span className="text-[10px] font-medium tracking-wide text-slate-500">
            {activeSpeakerLabel}
          </span>
          <span className="text-[10px] font-medium tracking-wide text-slate-500">
            {activePairLabel}
          </span>
        </div>

        <div className="h-8 shrink-0 border-b border-white/[0.05] px-4 grid grid-cols-2 gap-2.5 items-center">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 truncate">
            {langAShort}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 truncate">
            {langBShort}
          </span>
        </div>

        <main className="flex-1 min-h-0 px-3 py-3">
          <div
            ref={scrollerRef}
            className="marketing-demo-transcript-root h-full rounded-2xl border border-white/[0.08] bg-[#0b111d]/92 overflow-y-auto overflow-x-hidden px-2.5 py-3 workspace-selectable-root"
            style={TRANSCRIPT_TEXT_STYLE}
          >
            <div ref={transcription.containerRef} className="workspace-selectable-root" />
            {!transcription.hasTranscript && (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-slate-400 gap-3 pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-cyan-500/12 border border-cyan-400/25 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-cyan-300" />
                </div>
                <p className="text-base font-medium text-slate-200">
                  {transcription.isRecording
                    ? "Listening to Tab Audio…"
                    : "Press Start to share a browser tab"}
                </p>
                <p className="text-xs text-slate-500 max-w-[16rem]">
                  Choose the call tab and enable “Share tab audio”.
                </p>
              </div>
            )}
          </div>
        </main>

        <footer className="shrink-0 border-t border-white/[0.08] bg-[#0b1220]/94 px-4 py-3 space-y-2.5">
          {(transcription.error || transcription.translationServiceError || localError) && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-100 px-3 py-2 text-xs flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{localError ?? transcription.translationServiceError ?? transcription.error}</span>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5">
              <select
                value={langA}
                onChange={(e) => handleLangAChange(e.target.value)}
                disabled={transcription.isRecording || transcription.isStarting}
                aria-label="Source language"
                className="h-9 flex-1 min-w-0 rounded-lg border border-white/10 bg-[#121a2a] px-2 text-xs text-slate-100 disabled:opacity-50"
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value} disabled={l.value === langB}>
                    {l.label}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-semibold text-slate-500 shrink-0">↔</span>
              <select
                value={langB}
                onChange={(e) => handleLangBChange(e.target.value)}
                disabled={transcription.isRecording || transcription.isStarting}
                aria-label="Target language"
                className="h-9 flex-1 min-w-0 rounded-lg border border-white/10 bg-[#121a2a] px-2 text-xs text-slate-100 disabled:opacity-50"
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
                  : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_32px_rgba(34,211,238,0.42)]",
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
