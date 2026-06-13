import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic2, Clock, Languages } from "lucide-react";
import type { MarketingDialogueLine } from "./marketing-dialogue-script";

const STRIPE: Record<MarketingDialogueLine["stripe"], string> = {
  blue: "bg-blue-500",
  amber: "bg-amber-400",
};

function ParticipantAvatar({
  role,
  side,
  active,
}: {
  role: "clinician" | "patient" | "counsel" | "client";
  side: "left" | "right";
  active?: boolean;
}) {
  const palette =
    role === "clinician" || role === "counsel"
      ? "from-sky-500/30 to-blue-600/20 border-sky-400/30"
      : "from-amber-500/25 to-orange-500/15 border-amber-400/35";
  const label =
    role === "clinician" ? "Clinician" : role === "patient" ? "Patient" : role === "counsel" ? "Counsel" : "Client";

  return (
    <motion.div
      animate={active ? { scale: 1.04, opacity: 1 } : { scale: 1, opacity: 0.55 }}
      className={`absolute top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center gap-2 ${
        side === "left" ? "-left-[88px]" : "-right-[88px]"
      }`}
    >
      <div
        className={`w-14 h-14 rounded-2xl border bg-gradient-to-br ${palette} flex items-center justify-center shadow-lg ${
          active ? "ring-2 ring-sky-400/40" : ""
        }`}
      >
        {role === "clinician" || role === "counsel" ? (
          <svg viewBox="0 0 24 24" className="w-7 h-7 text-sky-200" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 4v4M8 6h8M6 20v-2a4 4 0 014-4h0a4 4 0 014 4v2" />
            <circle cx="12" cy="8" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-7 h-7 text-amber-100" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20v-1a5 5 0 0110 0v1" />
          </svg>
        )}
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {active && (
        <motion.span
          layoutId="speaking-pulse"
          className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-emerald-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Speaking
        </motion.span>
      )}
    </motion.div>
  );
}

function WorkspaceRow({
  line,
  visibleCharsOrig,
  visibleCharsTrans,
  isLive,
  layout,
}: {
  line: MarketingDialogueLine;
  visibleCharsOrig: number;
  visibleCharsTrans: number;
  isLive?: boolean;
  layout: "stacked" | "side-by-side";
}) {
  const origShown = line.original.slice(0, visibleCharsOrig);
  const transShown = line.translation.slice(0, visibleCharsTrans);
  const showTrans = visibleCharsTrans > 0;

  const translationBlock = showTrans ? (
    <p
      className="text-[13px] sm:text-sm leading-relaxed text-slate-300/90 italic pl-4 border-l border-white/10 ml-1 mt-1.5 ts-translation"
      dir={line.translationDir ?? "ltr"}
    >
      {transShown}
      {isLive && visibleCharsTrans > 0 && visibleCharsTrans < line.translation.length && (
        <span className="inline-block w-[2px] h-[14px] bg-emerald-400/80 ml-0.5 animate-pulse align-middle rounded-sm" />
      )}
    </p>
  ) : (
    <p className="text-[11px] text-slate-500/50 italic flex items-center gap-1.5 mt-1.5 pl-4 border-l border-white/5 ml-1">
      <span className="w-1 h-1 rounded-full bg-sky-400/50 animate-pulse" />
      Processing…
    </p>
  );

  if (layout === "stacked") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="group relative mb-4">
        <div className="flex min-w-0 items-start overflow-visible">
          <div className={`w-1 shrink-0 self-stretch rounded-full min-h-[1.25rem] mt-0.5 ${STRIPE[line.stripe]}`} />
          <div className="min-w-0 flex-1 space-y-1 py-0.5 pl-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500/80">
              {line.spokenLang}
            </div>
            <p className="text-[13px] sm:text-sm leading-relaxed text-slate-100 font-normal">
              {origShown}
              {isLive && visibleCharsOrig < line.original.length && (
                <span className="inline-block w-[2px] h-[14px] bg-sky-400 ml-0.5 animate-pulse align-middle rounded-sm" />
              )}
            </p>
            {translationBlock}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative grid grid-cols-2 gap-3 sm:gap-6 items-start mb-4"
    >
      <div className="flex min-w-0 items-start overflow-visible">
        <div className={`w-1 shrink-0 self-stretch rounded-full min-h-[1.25rem] mt-0.5 ${STRIPE[line.stripe]}`} />
        <div className="min-w-0 flex-1 space-y-1 py-0.5 pl-3">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500/80">
            {line.spokenLang}
          </div>
          <p className="text-[13px] sm:text-sm leading-relaxed text-slate-100 font-normal">
            {origShown}
            {isLive && visibleCharsOrig < line.original.length && (
              <span className="inline-block w-[2px] h-[14px] bg-sky-400 ml-0.5 animate-pulse align-middle rounded-sm" />
            )}
          </p>
        </div>
      </div>
      <div className="min-w-0 pt-0.5">{translationBlock}</div>
    </motion.div>
  );
}

export type MarketingAnimatedWorkspaceProps = {
  lines: MarketingDialogueLine[];
  /** How many lines are fully revealed (0..lines.length). Fractional = typing last line. */
  progress: number;
  scenario?: "medical" | "legal";
  langPair?: string;
  compact?: boolean;
  className?: string;
  layout?: "stacked" | "side-by-side";
};

/** Workspace-accurate marketing demo — color stripes + language codes, no Speaker labels. */
export function MarketingAnimatedWorkspace({
  lines,
  progress,
  scenario = "medical",
  langPair = "English ↔ Spanish",
  compact = false,
  className = "",
  layout = "stacked",
}: MarketingAnimatedWorkspaceProps) {
  const fullLines = Math.floor(progress);
  const frac = progress - fullLines;
  const activeLine = lines[fullLines];
  const activeRole =
    activeLine?.spokenLang === "EN"
      ? scenario === "legal"
        ? "counsel"
        : "clinician"
      : scenario === "legal"
        ? "client"
        : "patient";

  const rowStates = useMemo(() => {
    return lines.map((line, i) => {
      if (i < fullLines) {
        return { orig: line.original.length, trans: line.translation.length, live: false };
      }
      if (i === fullLines && activeLine) {
        const origLen = Math.floor(line.original.length * Math.min(1, frac * 2));
        const transFrac = Math.max(0, (frac - 0.45) * 2);
        const transLen = Math.floor(line.translation.length * Math.min(1, transFrac));
        return { orig: origLen, trans: transLen, live: true };
      }
      return { orig: 0, trans: 0, live: false };
    });
  }, [lines, fullLines, frac, activeLine]);

  return (
    <div className={`relative ${className}`}>
      <ParticipantAvatar
        role={scenario === "legal" ? "counsel" : "clinician"}
        side="left"
        active={activeRole === "clinician" || activeRole === "counsel"}
      />
      <ParticipantAvatar
        role={scenario === "legal" ? "client" : "patient"}
        side="right"
        active={activeRole === "patient" || activeRole === "client"}
      />

      <div className="rounded-2xl border border-white/10 bg-[#0b0e14]/95 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.75)] overflow-hidden ring-1 ring-white/[0.06]">
        <div className="h-11 border-b border-white/[0.06] bg-[#0f1419] flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-300 flex items-center justify-center">
              <Mic2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-slate-200">
              Interpreter<span className="text-sky-400">AI</span>
            </span>
            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              {langPair}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Clock className="w-3 h-3" />
            03:47
          </div>
        </div>

        <div className={`grid gap-3 sm:gap-6 px-3 sm:px-4 py-2 border-b border-white/[0.06] bg-white/[0.02] ${layout === "side-by-side" ? "grid-cols-2" : "grid-cols-1"}`}>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Original</span>
          {layout === "side-by-side" && (
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Translation</span>
          )}
        </div>

        <div
          className="overflow-hidden px-3 sm:px-4 py-3"
          style={{ minHeight: compact ? 220 : 280, maxHeight: compact ? 280 : 360 }}
        >
          {lines.map((line, i) =>
            rowStates[i]!.orig > 0 || rowStates[i]!.trans > 0 ? (
              <WorkspaceRow
                key={line.id}
                line={line}
                visibleCharsOrig={rowStates[i]!.orig}
                visibleCharsTrans={rowStates[i]!.trans}
                isLive={rowStates[i]!.live}
                layout={layout}
              />
            ) : null,
          )}
        </div>

        <div className="h-10 border-t border-white/[0.06] bg-[#0f1419] flex items-center justify-between px-4">
          <div className="h-7 px-3 rounded-full bg-red-500/90 text-white text-[10px] font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Stop
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Languages className="w-3 h-3" />
            {langPair}
          </div>
        </div>
      </div>
      <p className="text-center text-[10px] text-slate-500 mt-3">Illustrative interface — not a live session.</p>
    </div>
  );
}

/** Auto-plays dialogue for hero / static sections. */
export function MarketingAnimatedWorkspaceAuto({
  lines,
  scenario = "medical",
  langPair,
  compact,
  layout = "stacked",
}: Omit<MarketingAnimatedWorkspaceProps, "progress">) {
  const [progress, setProgress] = useState(0);
  const maxProgress = lines.length;
  const animStartRef = useRef<number | null>(null);

  useEffect(() => {
    const durationMs = (lines.length + 0.5) * 3800;
    const pauseMs = 2000;
    const cycleMs = durationMs + pauseMs;
    let raf = 0;
    const tick = (now: number) => {
      if (animStartRef.current === null) animStartRef.current = now;
      const elapsed = (now - animStartRef.current) % cycleMs;
      if (elapsed < durationMs) {
        setProgress((elapsed / durationMs) * maxProgress);
      } else {
        setProgress(0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines.length, maxProgress]);

  return (
    <MarketingAnimatedWorkspace
      lines={lines}
      progress={progress}
      scenario={scenario}
      langPair={langPair}
      compact={compact}
      layout={layout}
    />
  );
}
