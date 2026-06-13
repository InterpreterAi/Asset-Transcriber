import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

/** Privacy + security as communication pathways — not lock symbolism. */
type Props = { timeline: CinematicTimeline };

const PATHS = [
  { id: "session", label: "Live session", angle: -95 },
  { id: "encrypt", label: "Encrypted transport", angle: -55 },
  { id: "privacy", label: "Privacy-first", angle: -15 },
  { id: "hipaa", label: "HIPAA-focused", angle: 25 },
  { id: "control", label: "Interpreter control", angle: 65 },
  { id: "retention", label: "Minimal retention", angle: 105 },
];

export function CinematicPrivacyPaths({ timeline }: Props) {
  const intensity = timeline.privacyIntensity * (1 - timeline.finaleCollapse);
  if (intensity <= 0.02) return null;

  const cx = 50;
  const cy = 50;

  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 w-full h-full pointer-events-none z-[6]"
      style={{ opacity: intensity * 0.9 }}
      aria-hidden
    >
      <defs>
        <linearGradient id="cine-privacy-flow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.05)" />
          <stop offset="50%" stopColor="rgba(34,211,238,0.7)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0.05)" />
        </linearGradient>
      </defs>

      {PATHS.map((path, i) => {
        const emerge = Math.min(1, Math.max(0, (intensity - i * 0.08) / 0.5));
        if (emerge <= 0) return null;
        const rad = (path.angle * Math.PI) / 180;
        const dist = 42 * emerge;
        const x = cx + Math.cos(rad) * dist;
        const y = cy + Math.sin(rad) * dist;
        return (
          <g key={path.id} opacity={emerge}>
            <line
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="url(#cine-privacy-flow)"
              strokeWidth={0.5}
              strokeDasharray="2 1"
            />
            <circle cx={x} cy={y} r={2.2} fill="rgba(34,211,238,0.25)" stroke="rgba(34,211,238,0.6)" strokeWidth="0.35" />
            <text x={x} y={y - 3.8} textAnchor="middle" fill="rgba(186,230,253,0.95)" fontSize="2.2" fontWeight="600">
              {path.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function CinematicPrivacyCopy({ timeline }: Props) {
  const intensity = timeline.privacyIntensity * (1 - timeline.finaleCollapse);
  if (intensity <= 0.02) return null;

  return (
    <div
      className="absolute left-[3%] sm:left-[5%] top-[12%] z-20 max-w-md pointer-events-none"
      style={{ opacity: intensity }}
    >
      <p className="text-2xl sm:text-3xl font-semibold text-white leading-tight">
        {CINEMATIC_CONTENT.chapterFrames.ch6}
      </p>
      <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
        {CINEMATIC_CONTENT.trust.landingIntro}
      </p>
      <div className="mt-5 cinematic-v2-glass rounded-xl px-4 py-4 border-l-2 border-cyan-400/50">
        <p className="text-sm font-semibold text-cyan-200">{CINEMATIC_CONTENT.trust.privacyHeadline}</p>
        <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.trust.privacyBody}</p>
      </div>
      <p className="mt-4 text-xs text-slate-500 max-w-sm">{CINEMATIC_CONTENT.trust.securityHero}</p>
    </div>
  );
}
