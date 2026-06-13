import { Captions, Languages, Users, Phone, Video, UserRound, Shield, Globe } from "lucide-react";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

const ICONS = [Captions, Languages, Users, Phone, Video, UserRound, Shield, Globe] as const;

type Props = { timeline: CinematicTimeline };

export function CinematicCapabilityRail({ timeline }: Props) {
  const intensity = timeline.capabilityIntensity;
  if (!timeline.visibility.capabilityRail || intensity <= 0.02) return null;

  return (
    <div
      className="absolute left-[3%] sm:left-[5%] top-[14%] z-[15] max-w-sm sm:max-w-md pointer-events-none"
      style={{ opacity: intensity }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-4">
        Platform capabilities
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {CINEMATIC_CONTENT.positioningPillars.map((pillar, i) => {
          const Icon = ICONS[i] ?? Captions;
          const emerge = Math.min(1, Math.max(0, (timeline.p - 0.26 - i * 0.012) / 0.12));
          return (
            <div
              key={pillar.title}
              className="cinematic-v2-glass rounded-xl px-3 py-3 sm:px-4 sm:py-3.5"
              style={{ opacity: emerge, transform: `translateY(${(1 - emerge) * 12}px)` }}
            >
              <Icon className="w-4 h-4 text-cyan-400 mb-2" strokeWidth={2} />
              <p className="text-[13px] sm:text-sm font-semibold text-white leading-snug">{pillar.title}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{pillar.short}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
