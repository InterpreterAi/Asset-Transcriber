import { useMemo } from "react";
import { motion } from "framer-motion";
import { Mic2, Clock, Languages } from "lucide-react";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import { CINEMATIC_MARIA_DIALOGUE } from "../data/cinematic-dialogue";
import { dialogueProgressToTurn, turnRevealState } from "./workspace-reveal";

const STRIPE = { blue: "bg-blue-500", amber: "bg-amber-400" } as const;

type Props = {
  /** 0..1 across full Ch1+Ch2 dialogue */
  dialogueProgress: number;
  scale?: number;
  listening?: boolean;
  compact?: boolean;
};

function Waveform({ active }: { active: boolean }) {
  const heights = [10, 18, 28, 16, 32, 22, 36, 20, 30, 14, 26, 34, 12, 24];
  return (
    <div className="flex items-end justify-center gap-[2px] h-8 opacity-60" aria-hidden>
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full bg-gradient-to-t from-cyan-500/30 to-cyan-200/80"
          animate={active ? { height: [h * 0.3, h, h * 0.35] } : { height: h * 0.2 }}
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

export function CinematicWorkspace({ dialogueProgress, scale = 1, listening = false, compact = false }: Props) {
  const { turnIndex, turnFrac } = dialogueProgressToTurn(CINEMATIC_MARIA_DIALOGUE, dialogueProgress);

  const rows = useMemo(() => {
    return CINEMATIC_MARIA_DIALOGUE.map((turn, i) => {
      if (i < turnIndex) {
        return {
          turn,
          orig: turn.original,
          trans: turn.translation,
          live: false,
          listening: false,
        };
      }
      if (i === turnIndex) {
        const st = turnRevealState(turn, turnFrac);
        return {
          turn,
          orig: st.origVisible,
          trans: st.transVisible,
          live: true,
          listening: st.listening || listening,
        };
      }
      return null;
    }).filter(Boolean) as {
      turn: (typeof CINEMATIC_MARIA_DIALOGUE)[number];
      orig: string;
      trans: string;
      live: boolean;
      listening: boolean;
    }[];
  }, [turnIndex, turnFrac, listening]);

  const activeSpeaker = CINEMATIC_MARIA_DIALOGUE[turnIndex]?.speaker ?? "doctor";
  const waveformActive = turnFrac > 0 && turnFrac < 0.92 && !listening;

  return (
    <motion.div
      style={{ scale }}
      className={`relative mx-auto w-full ${compact ? "max-w-md" : "max-w-xl"}`}
    >
      <div
        className={`rounded-2xl border border-white/10 bg-[#0b0e14]/95 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)] overflow-hidden ring-1 ring-white/[0.06] ${
          listening ? "cinematic-listening-pulse" : ""
        }`}
      >
        <div className="h-10 border-b border-white/[0.06] bg-[#0f1419] flex items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-md bg-sky-500/15 text-sky-300 flex items-center justify-center">
              <Mic2 className="w-3 h-3" />
            </div>
            <span className="text-[11px] font-semibold text-slate-200">
              Interpreter<span className="text-sky-400">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-slate-500">
            <Clock className="w-2.5 h-2.5" />
            03:47
          </div>
        </div>

        <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
          <Waveform active={waveformActive} />
        </div>

        <div
          className="overflow-hidden px-3 sm:px-4 py-3 space-y-3"
          style={{ minHeight: compact ? 200 : 240, maxHeight: compact ? 280 : 320 }}
        >
          {rows.map(({ turn, orig, trans, live, listening: rowListening }) => (
            <div key={turn.id} className="flex min-w-0 items-start">
              <div className={`w-1 shrink-0 self-stretch rounded-full min-h-[1.25rem] ${STRIPE[turn.stripe]}`} />
              <div className="min-w-0 flex-1 pl-3 space-y-1">
                <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-500/80">
                  {turn.spokenLang}
                </div>
                <p className="text-[12px] sm:text-sm text-slate-100 leading-relaxed">
                  {orig}
                  {live && !rowListening && orig.length < turn.original.length && (
                    <span className="inline-block w-[2px] h-3.5 bg-sky-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
                {(trans.length > 0 || live) && (
                  <p className="text-[12px] sm:text-sm text-slate-300/90 italic pl-3 border-l border-white/10 leading-relaxed">
                    {trans}
                    {live && trans.length > 0 && trans.length < turn.translation.length && (
                      <span className="inline-block w-[2px] h-3.5 bg-emerald-400/80 ml-0.5 animate-pulse align-middle" />
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="h-9 border-t border-white/[0.06] bg-[#0f1419] flex items-center justify-between px-3 sm:px-4">
          <div className="h-6 px-2.5 rounded-full bg-red-500/90 text-white text-[9px] font-semibold flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
            Stop
          </div>
          <div className="flex items-center gap-1 text-[9px] text-slate-500">
            <Languages className="w-2.5 h-2.5" />
            {CINEMATIC_CONTENT.workspace.langPair}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-3 px-1">
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider ${
            activeSpeaker === "doctor" ? "text-sky-400" : "text-slate-600"
          }`}
        >
          Clinician
        </span>
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider ${
            activeSpeaker === "patient" ? "text-amber-400" : "text-slate-600"
          }`}
        >
          Patient
        </span>
      </div>
      <p className="text-center text-[9px] text-slate-600 mt-2">{CINEMATIC_CONTENT.workspace.disclaimer}</p>
    </motion.div>
  );
}
