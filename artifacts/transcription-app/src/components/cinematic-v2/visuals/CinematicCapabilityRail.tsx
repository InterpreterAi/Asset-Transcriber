import { Captions, Languages, Users, Phone, Video, UserRound, Shield, Globe } from "lucide-react";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

const ICONS = [Captions, Languages, Users, Phone, Video, UserRound, Shield, Globe] as const;

type Props = { timeline: CinematicTimeline; inline?: boolean };

export function CinematicCapabilityRail({ timeline, inline }: Props) {
  const intensity = timeline.capabilityIntensity;
  if (!timeline.visibility.capabilityRail || intensity <= 0.02) return null;

  return (
    <div
      className={inline ? "mt-4 pointer-events-none" : "absolute left-[3%] sm:left-[5%] top-[14%] z-[15] max-w-sm sm:max-w-md pointer-events-none"}
      style={{ opacity: intensity }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-3">
        {CINEMATIC_CONTENT.capabilities.sectionTitle}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {CINEMATIC_CONTENT.positioningPillars.map((pillar, i) => {
          const Icon = ICONS[i] ?? Captions;
          const emerge = Math.min(1, Math.max(0, (timeline.p - 0.26 - i * 0.012) / 0.12));
          return (
            <div
              key={pillar.title}
              className="cinematic-v2-glass rounded-xl px-3 py-2.5 sm:px-3.5 sm:py-3"
              style={{ opacity: emerge, transform: `translateY(${(1 - emerge) * 12}px)` }}
            >
              <Icon className="w-3.5 h-3.5 text-cyan-400 mb-1.5" strokeWidth={2} />
              <p className="text-[12px] sm:text-[13px] font-semibold text-white leading-snug">{pillar.title}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{pillar.short}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
