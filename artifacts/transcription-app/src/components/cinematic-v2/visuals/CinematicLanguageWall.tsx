import { CINEMATIC_LANGUAGE_CATALOG, CINEMATIC_LANGUAGE_COUNT } from "../data/cinematic-languages";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

type Props = { timeline: CinematicTimeline };

export function CinematicLanguageWall({ timeline }: Props) {
  const intensity = timeline.languageWallIntensity * (1 - timeline.finaleCollapse);
  if (intensity <= 0.02) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ opacity: intensity }}
      aria-hidden
    >
      <div className="absolute top-[10%] right-[3%] sm:right-[6%] max-w-md text-right z-[5]">
        <p className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
          {CINEMATIC_LANGUAGE_COUNT}+
        </p>
        <p className="text-sm sm:text-base font-semibold text-cyan-300/90 mt-1">Supported Languages</p>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        {CINEMATIC_LANGUAGE_CATALOG.map((lang, i) => {
          const angle = (i / CINEMATIC_LANGUAGE_CATALOG.length) * Math.PI * 2 - Math.PI / 2;
          const ring = i % 3 === 0 ? 38 : i % 3 === 1 ? 46 : 54;
          const x = 50 + Math.cos(angle) * ring;
          const y = 50 + Math.sin(angle) * ring;
          const emerge = Math.min(1, Math.max(0, (timeline.p - 0.36 - i * 0.008) / 0.15));
          if (emerge <= 0) return null;
          return (
            <div
              key={lang.code}
              className="absolute cinematic-v2-glass rounded-lg px-2 py-1 text-center"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                opacity: emerge * 0.85,
                scale: 0.85 + emerge * 0.15,
              }}
            >
              <span className="text-[10px] font-mono font-bold text-cyan-400 block">{lang.code}</span>
              <span className="text-[9px] text-slate-400 hidden lg:block">{lang.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
