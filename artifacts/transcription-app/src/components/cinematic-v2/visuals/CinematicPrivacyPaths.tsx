import { Link } from "wouter";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const PATHS = [
  { id: "session", label: "Live session flow", angle: -100 },
  { id: "transport", label: "Encrypted transport", angle: -58 },
  { id: "control", label: "Interpreter control", angle: -16 },
  { id: "retention", label: "Retention approach", angle: 26 },
  { id: "privacy", label: "Privacy principles", angle: 68 },
  { id: "security", label: "Security practices", angle: 110 },
];

type Props = { timeline: CinematicTimeline };

export function CinematicPrivacyPaths({ timeline }: Props) {
  const intensity = timeline.privacyIntensity;
  if (intensity <= 0.02) return null;

  const cx = 42;
  const cy = 50;

  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 w-full h-full pointer-events-none z-[6]"
      style={{ opacity: intensity * 0.85 }}
      aria-hidden
    >
      <defs>
        <linearGradient id="cine-trust-flow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(34,211,238,0.08)" />
          <stop offset="50%" stopColor="rgba(34,211,238,0.65)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0.08)" />
        </linearGradient>
      </defs>

      {PATHS.map((path, i) => {
        const emerge = Math.min(1, Math.max(0, (timeline.chapterLocal - i * 0.1) / 0.45));
        if (emerge <= 0) return null;
        const rad = (path.angle * Math.PI) / 180;
        const dist = 38 * emerge;
        const x = cx + Math.cos(rad) * dist;
        const y = cy + Math.sin(rad) * dist;
        return (
          <g key={path.id} opacity={emerge}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="url(#cine-trust-flow)" strokeWidth={0.5} />
            <circle cx={x} cy={y} r={2} fill="rgba(34,211,238,0.3)" stroke="rgba(34,211,238,0.7)" strokeWidth="0.35" />
            <text x={x} y={y - 3.5} textAnchor="middle" fill="rgba(186,230,253,0.95)" fontSize="2.2" fontWeight="600">
              {path.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function CinematicTrustCopy({ timeline }: Props) {
  const intensity = timeline.privacyIntensity;
  if (intensity <= 0.02) return null;

  return (
    <div
      className="absolute left-[3%] sm:left-[5%] top-1/2 -translate-y-1/2 z-20 max-w-md pointer-events-none"
      style={{ opacity: intensity }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-3">Trust center</p>
      <h2 className="text-2xl sm:text-3xl font-semibold text-white leading-tight">Security &amp; Privacy</h2>
      <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.trust.landingIntro}</p>
      <div className="mt-5 cinematic-v2-glass rounded-xl px-4 py-4 border-l-2 border-cyan-400/50">
        <p className="text-sm font-semibold text-cyan-200">{CINEMATIC_CONTENT.trust.privacyHeadline}</p>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.trust.privacyBody}</p>
      </div>
      <Link
        href="/security"
        className="mt-4 inline-block text-sm font-semibold text-cyan-400 pointer-events-auto hover:text-cyan-300"
      >
        Explore Security &amp; Privacy →
      </Link>
    </div>
  );
}
