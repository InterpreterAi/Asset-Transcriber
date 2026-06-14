import { Phone, Video, Captions, Languages, Users } from "lucide-react";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

const HERO_PILLARS = [
  { icon: Captions, title: "Real-Time AI Captioning", short: "Live captions" },
  { icon: Languages, title: "Translation Assistance", short: "Translation assist" },
  { icon: Users, title: "Professional Interpreters", short: "Interpreter-first" },
] as const;

type Props = { timeline: CinematicTimeline; inline?: boolean };

export function CinematicCapabilityRail({ timeline, inline }: Props) {
  const intensity = timeline.capabilityIntensity;
  if (!timeline.visibility.capabilityRail || intensity <= 0.02) return null;

  return (
    <div
      className={inline ? "mt-3 pointer-events-none shrink-0" : "absolute left-[3%] sm:left-[5%] top-[14%] z-[15] max-w-sm pointer-events-none"}
      style={{ opacity: intensity }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-2">
        {CINEMATIC_CONTENT.capabilities.sectionTitle}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {HERO_PILLARS.map((pillar, i) => {
          const Icon = pillar.icon;
          const emerge = Math.min(1, Math.max(0, (timeline.p - 0.26 - i * 0.012) / 0.12));
          return (
            <div
              key={pillar.title}
              className="cinematic-v2-glass rounded-xl px-2.5 py-2.5"
              style={{ opacity: emerge, transform: `translateY(${(1 - emerge) * 8}px)` }}
            >
              <Icon className="w-3.5 h-3.5 text-cyan-400 mb-1" strokeWidth={2} />
              <p className="text-[11px] font-semibold text-white leading-snug">{pillar.title}</p>
              <p className="text-[9px] text-slate-500 mt-0.5">{pillar.short}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-sm font-semibold text-white">{CINEMATIC_CONTENT.solutions.title}</p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="cinematic-v2-glass rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Phone className="w-3 h-3 text-cyan-400" />
            <p className="text-[11px] font-bold text-cyan-300">{CINEMATIC_CONTENT.solutions.opi.title}</p>
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">{CINEMATIC_CONTENT.solutions.opi.body}</p>
        </div>
        <div className="cinematic-v2-glass rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Video className="w-3 h-3 text-cyan-400" />
            <p className="text-[11px] font-bold text-cyan-300">{CINEMATIC_CONTENT.solutions.vri.title}</p>
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">{CINEMATIC_CONTENT.solutions.vri.body}</p>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">{CINEMATIC_CONTENT.howItWorks.sub}</p>
    </div>
  );
}
