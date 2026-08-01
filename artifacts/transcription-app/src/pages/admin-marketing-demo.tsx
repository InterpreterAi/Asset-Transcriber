import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetMeQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import {
  Languages,
  Mic2,
  Radio,
  Square,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useTranscription } from "@/hooks/use-transcription";
import { planUsesCanonAppendWsStt } from "@/experiments/basic-morsy-urgent/canonAppendWs/gate";
import { readMorsyTranslationStackInitial } from "@/experiments/basic-morsy-urgent/translationStackMode";
import { loginUrlForReturnTo } from "@/lib/auth-redirect";
import { workspaceLanguageOptions } from "@/lib/workspace-languages";
import { cn } from "@/lib/utils";

const LANG_OPTIONS = workspaceLanguageOptions();
const DEMO_FONT_PX = 24;

const FRAME_STYLE: CSSProperties = {
  width: "min(100vw, calc(100dvh * 9 / 16))",
  height: "min(100dvh, calc(100vw * 16 / 9))",
};

const TRANSCRIPT_TEXT_STYLE: CSSProperties = {
  "--ts-font-size": `${DEMO_FONT_PX}px`,
  "--ts-line-height": "1.65",
} as CSSProperties;

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
  const { devices } = useAudioDevices();
  const { data: me, isLoading: meLoading, isFetched: meFetched, error: meError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeSpeakerLabel, setActiveSpeakerLabel] = useState("Speaker");
  const [activePairLabel, setActivePairLabel] = useState("EN → AR");

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
    if (devices.length === 0) return;
    setSelectedDeviceId((prev) => {
      if (prev && devices.some((d) => d.deviceId === prev)) return prev;
      return devices[0]?.deviceId ?? "";
    });
  }, [devices]);

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

  const pt = (me?.planType ?? "").toLowerCase();
  const usesCanonAppendWsStt = planUsesCanonAppendWsStt(pt);
  const morsyStackFlags = useMemo(() => readMorsyTranslationStackInitial(), []);
  const morsyWorkspaceSegmentBehavior = usesCanonAppendWsStt
    ? "morsy-intercall-isolated-experiment"
    : "morsy-urgent-cbf";

  const transcription = useTranscription(me?.isAdmin ?? false, {
    translationEnabled: (me?.translationEnabled ?? true) || pt === "morsy-urgent",
    translationUiMode: pt === "morsy-urgent" ? "hidden" : "upsell",
    planType: me?.planType ?? "",
    segmentBehaviorMode: morsyWorkspaceSegmentBehavior,
    segmentBoundaryGuards: Boolean(me),
    morsyUrgentTranscriptSegmentGuards: Boolean(me) && usesCanonAppendWsStt,
    experimentMorsyUrgentIntercallOrchestration: false,
    morsyUrgentTranslateAttachOpenAiExperiment: Boolean(me) && pt === "morsy-urgent",
    experimentMorsyIntercallEmbeddedEnglishPrompt: false,
    experimentMorsyBasicCleanTranslation:
      pt === "morsy-urgent" &&
      morsyStackFlags.clean &&
      !morsyStackFlags.chunkV2,
    experimentMorsyUrgentChunkTranslationV2:
      pt === "morsy-urgent" && morsyStackFlags.chunkV2,
    onRecordingStopped: () => {
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    },
  });

  useEffect(() => {
    transcription.setLangPair(langA, langB);
  }, [langA, langB, transcription]);

  useEffect(() => {
    const container = transcription.containerRef.current;
    const scroller = container?.parentElement;
    if (!container || !scroller) return;

    let rafId = 0;
    const applyDemoRowState = () => {
      const rows = Array.from(container.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
      );
      rows.forEach((row, index) => {
        row.classList.remove("demo-row-active", "demo-row-streaming");
        const depth = rows.length - 1 - index;
        row.dataset.demoDepth = String(Math.max(0, Math.min(depth, 4)));
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
      const streamingTail = Boolean(hypothesisText || liveTranslationTail);
      if (transcription.isRecording && streamingTail) {
        activeRow.classList.add("demo-row-streaming");
      }

      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: "smooth",
      });
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

  const handleToggleRecording = async () => {
    setLocalError(null);
    if (transcription.isRecording) {
      await transcription.stop();
      return;
    }
    if (!selectedDeviceId) {
      setLocalError("No microphone device found. Connect a mic and retry.");
      return;
    }
    try {
      await transcription.start(selectedDeviceId);
    } catch {
      // Hook already reports user-facing errors.
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

  return (
    <div className="marketing-demo-mode min-h-screen w-full bg-[#02050b] text-white flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(59,130,246,0.14),transparent_45%),linear-gradient(180deg,#02050b_0%,#050a14_60%,#02050b_100%)]" />
      <div
        className="relative z-10 rounded-[26px] border border-white/10 bg-[#080d17]/95 shadow-[0_44px_120px_-36px_rgba(0,0,0,0.95),0_0_0_1px_rgba(34,211,238,0.15)] backdrop-blur-xl overflow-hidden flex flex-col"
        style={FRAME_STYLE}
      >
        <header className="h-16 shrink-0 border-b border-white/[0.08] bg-[#0b1220]/92 px-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center ring-1 ring-cyan-400/25">
              <Zap className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] leading-none font-semibold text-white">
                Interpreter<span className="text-cyan-300">AI</span>
              </span>
              <span className="text-[10px] tracking-wide text-slate-400 uppercase">
                Marketing Demo Mode
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-200 border border-cyan-400/30">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                transcription.isRecording ? "bg-cyan-300 animate-pulse" : "bg-slate-500",
              )}
            />
            <span className="text-[11px] font-semibold tracking-widest">LIVE</span>
          </div>
        </header>

        <div className="h-12 shrink-0 border-b border-white/[0.07] bg-white/[0.02] px-5 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            {activeSpeakerLabel}
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-cyan-200 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5" />
            {activePairLabel}
          </span>
        </div>

        <div className="h-12 shrink-0 border-b border-white/[0.06] bg-white/[0.01] px-5 grid grid-cols-2 items-center gap-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Transcript</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Translation</span>
        </div>

        <main className="flex-1 min-h-0 p-5">
          <div
            className="h-full rounded-2xl border border-white/[0.08] bg-[#0b111d]/92 overflow-y-auto scroll-smooth px-4 py-4 md:px-5 md:py-5 workspace-selectable-root"
            style={TRANSCRIPT_TEXT_STYLE}
          >
            <div ref={transcription.containerRef} className="workspace-selectable-root" />
            {!transcription.hasTranscript && (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-slate-400 gap-3 pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-cyan-500/12 border border-cyan-400/25 flex items-center justify-center">
                  <Mic2 className="w-6 h-6 text-cyan-300" />
                </div>
                <p className="text-lg font-medium text-slate-200">
                  {transcription.isRecording
                    ? "Listening for live speech…"
                    : "Press Start to begin demo capture"}
                </p>
                <p className="text-sm text-slate-400/90">
                  Vertical 9:16 recording-ready transcript and translation stream.
                </p>
              </div>
            )}
          </div>
        </main>

        <footer className="shrink-0 border-t border-white/[0.08] bg-[#0b1220]/94 px-5 py-4 space-y-3">
          {(transcription.error || transcription.translationServiceError || localError) && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-100 px-3 py-2.5 text-xs flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{localError ?? transcription.translationServiceError ?? transcription.error}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400/90 truncate">
              {LANG_OPTIONS.find((l) => l.value === langA)?.label ?? langA} ↔{" "}
              {LANG_OPTIONS.find((l) => l.value === langB)?.label ?? langB}
            </span>
            <button
              type="button"
              onClick={() => void handleToggleRecording()}
              disabled={transcription.isStarting}
              className={cn(
                "h-12 min-w-[152px] rounded-full px-6 inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all",
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
