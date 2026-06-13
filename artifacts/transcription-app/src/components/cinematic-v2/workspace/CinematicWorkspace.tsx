import { useMemo } from "react";
import { motion } from "framer-motion";
import { Mic2, Clock, Languages, UserRound } from "lucide-react";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import { CINEMATIC_MARIA_DIALOGUE } from "../data/cinematic-dialogue";
import { useWorkspaceAutoplay } from "../motion/useWorkspaceAutoplay";
import { dialogueProgressToTurn, turnRevealState, type TurnPhase } from "./workspace-reveal";

const STRIPE = { blue: "bg-blue-500", amber: "bg-amber-400" } as const;

function Waveform({ phase }: { phase: TurnPhase }) {
  const active = phase === "speaking";
  const heights = [12, 22, 36, 18, 40, 28, 44, 24, 38, 16, 32, 42, 14, 30];
  return (
    <div className="flex items-end justify-center gap-[3px] h-12 sm:h-14 w-full opacity-75" aria-hidden>
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-cyan-500/30 to-cyan-100/90"
          animate={active ? { height: [h * 0.3, h, h * 0.35] } : { height: h * 0.12 }}
          transition={{
            duration: 0.55 + (i % 3) * 0.1,
            repeat: Infinity,
            repeatType: "reverse",
            delay: i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

function SpeakerBadge({ role, active }: { role: "doctor" | "patient"; active: boolean }) {
  const isClinician = role === "doctor";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
        active
          ? isClinician
            ? "bg-sky-500/20 text-sky-300 border border-sky-400/40"
            : "bg-amber-500/20 text-amber-300 border border-amber-400/40"
          : "text-slate-600 border border-transparent"
      }`}
    >
      <UserRound className="w-3 h-3" />
      {isClinician ? "Clinician" : "Patient"}
    </span>
  );
}

export function CinematicWorkspace() {
  const autoplayProgress = useWorkspaceAutoplay();
  const { turnIndex, turnFrac } = dialogueProgressToTurn(CINEMATIC_MARIA_DIALOGUE, autoplayProgress);

  const rows = useMemo(() => {
    return CINEMATIC_MARIA_DIALOGUE.map((turn, i) => {
      if (i < turnIndex) {
        return {
          turn,
          orig: turn.original,
          trans: turn.translation,
          phase: "complete" as TurnPhase,
          live: false,
        };
      }
      if (i === turnIndex) {
        const st = turnRevealState(turn, turnFrac);
        return {
          turn,
          orig: st.origVisible,
          trans: st.transVisible,
          phase: st.phase,
          live: true,
          showTrans: st.showTranslationSlot,
        };
      }
      return null;
    }).filter(Boolean) as {
      turn: (typeof CINEMATIC_MARIA_DIALOGUE)[number];
      orig: string;
      trans: string;
      phase: TurnPhase;
      live: boolean;
      showTrans?: boolean;
    }[];
  }, [turnIndex, turnFrac]);

  const activeTurn = CINEMATIC_MARIA_DIALOGUE[turnIndex];
  const activePhase = rows.find((r) => r.live)?.phase ?? "complete";
  const activeSpeaker = activeTurn?.speaker ?? "doctor";
  const isListening = activePhase === "listening";

  return (
    <div className="relative mx-auto w-full max-w-4xl z-10">
      <div
        className={`rounded-2xl border border-white/12 bg-[#0b0e14]/96 shadow-[0_40px_100px_-28px_rgba(0,0,0,0.9),0_0_0_1px_rgba(34,211,238,0.08)] overflow-hidden ring-1 ring-white/[0.08] ${
          isListening ? "cinematic-listening-pulse" : ""
        }`}
      >
        <div className="h-12 sm:h-14 border-b border-white/[0.08] bg-[#0f1419] flex items-center justify-between px-4 sm:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-300 flex items-center justify-center">
              <Mic2 className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-slate-100">
              Interpreter<span className="text-sky-400">AI</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/25">
              <span className={`w-1.5 h-1.5 rounded-full bg-sky-400 ${activePhase === "speaking" ? "animate-pulse" : ""}`} />
              {CINEMATIC_CONTENT.workspace.langPair}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            03:47
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-4 sm:px-5 py-2 border-b border-white/[0.06] bg-white/[0.02] text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <span>Original</span>
          <span>Translation</span>
        </div>

        <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <Waveform phase={activePhase} />
        </div>

        <div className="overflow-y-auto px-4 sm:px-5 py-4 space-y-5" style={{ minHeight: 280, maxHeight: 380 }}>
          {rows.map(({ turn, orig, trans, phase, live, showTrans }) => (
            <div key={turn.id} className="grid grid-cols-2 gap-4 sm:gap-6 items-start">
              <div className="flex min-w-0 items-start">
                <div className={`w-1.5 shrink-0 self-stretch rounded-full min-h-[1.5rem] ${STRIPE[turn.stripe]}`} />
                <div className="min-w-0 flex-1 pl-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {turn.spokenLang}
                    </span>
                    {live && <SpeakerBadge role={turn.speaker} active />}
                  </div>
                  <p className="text-[15px] sm:text-base text-slate-50 leading-relaxed font-normal">
                    {orig}
                    {live && phase === "speaking" && orig.length < turn.original.length && (
                      <span className="inline-block w-[2px] h-4 bg-sky-400 ml-0.5 animate-pulse align-middle" />
                    )}
                  </p>
                </div>
              </div>
              <div className="min-w-0 pt-6 sm:pt-7">
                {(showTrans || trans.length > 0 || phase === "complete") && (
                  <p className="text-[15px] sm:text-base text-slate-200/95 italic leading-relaxed ts-translation">
                    {trans}
                    {live && phase === "translating" && trans.length < turn.translation.length && (
                      <span className="inline-block w-[2px] h-4 bg-emerald-400/80 ml-0.5 animate-pulse align-middle" />
                    )}
                  </p>
                )}
                {live && phase === "listening" && (
                  <p className="text-sm text-slate-400 italic flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Listening…
                  </p>
                )}
                {live && phase === "speaking" && !showTrans && trans.length === 0 && (
                  <p className="text-sm text-slate-500/70 italic flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                    Awaiting translation…
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="h-11 border-t border-white/[0.08] bg-[#0f1419] flex items-center justify-between px-4 sm:px-5">
          <div className="h-8 px-3.5 rounded-full bg-red-500/90 text-white text-[11px] font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Stop
          </div>
          <div className="flex items-center gap-4">
            <SpeakerBadge role="doctor" active={activeSpeaker === "doctor"} />
            <SpeakerBadge role="patient" active={activeSpeaker === "patient"} />
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400">
              <Languages className="w-3.5 h-3.5" />
              {CINEMATIC_CONTENT.workspace.langPair}
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-500 mt-3">{CINEMATIC_CONTENT.workspace.disclaimer}</p>
    </div>
  );
}
