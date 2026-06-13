import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const COMPANIES = [
  "Teleperformance",
  "LanguageLine Solutions",
  "TransPerfect",
  "Propio",
  "Globo",
] as const;

type Props = { opacity?: number };

/** Interpreter employers — industry trust marquee (Intercall-style). */
export function CinematicCompanyMarquee({ opacity = 1 }: Props) {
  const items = [...COMPANIES, ...COMPANIES];

  return (
    <div className="w-full overflow-hidden py-2" style={{ opacity }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
        {CINEMATIC_CONTENT.scale.marqueeLabel}
      </p>
      <div className="relative flex overflow-hidden">
        <div className="marketing-marquee-track gap-12 px-4">
          {items.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="text-sm sm:text-base font-semibold text-slate-400/90 tracking-tight shrink-0"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
