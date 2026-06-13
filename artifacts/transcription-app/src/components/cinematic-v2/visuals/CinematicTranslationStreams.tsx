import { useMemo } from "react";
import { motion } from "framer-motion";
import { CINEMATIC_TRANSLATION_FRAGMENTS } from "../data/cinematic-dialogue-translations";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

const DRIFT_PATHS = [
  { x: [0, 12, -8, 0], y: [0, -18, 10, 0] },
  { x: [0, -14, 6, 0], y: [0, 12, -16, 0] },
  { x: [0, 8, 16, 0], y: [0, -10, 14, 0] },
  { x: [0, -10, -4, 0], y: [0, 16, -8, 0] },
  { x: [0, 18, -12, 0], y: [0, -14, 8, 0] },
  { x: [0, -6, 14, 0], y: [0, 10, -12, 0] },
] as const;

const POSITIONS = [
  { x: 62, y: 18 },
  { x: 78, y: 32 },
  { x: 72, y: 52 },
  { x: 58, y: 68 },
  { x: 82, y: 48 },
  { x: 68, y: 28 },
  { x: 75, y: 62 },
  { x: 55, y: 38 },
  { x: 85, y: 22 },
  { x: 64, y: 72 },
  { x: 80, y: 58 },
  { x: 70, y: 42 },
];

type Props = { timeline: CinematicTimeline };

/** Languages chapter only — real translated phrases, no decorative language tags. */
export function CinematicTranslationStreams({ timeline }: Props) {
  if (!timeline.visibility.translationStreams) return null;

  const intensity = timeline.streamOpacity;
  const fragments = useMemo(() => CINEMATIC_TRANSLATION_FRAGMENTS, []);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-[8]"
      style={{ opacity: intensity }}
    >
      {fragments.slice(0, 14).map((frag, i) => {
        const pos = POSITIONS[i % POSITIONS.length]!;
        const drift = DRIFT_PATHS[i % DRIFT_PATHS.length]!;
        const emerge = Math.min(1, Math.max(0, (timeline.chapterLocal - i * 0.04) / 0.25));
        if (emerge <= 0) return null;

        return (
          <motion.div
            key={frag.id}
            className="absolute max-w-[220px] sm:max-w-[260px] cinematic-v2-glass rounded-xl px-4 py-3 shadow-lg"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              opacity: emerge * 0.92,
            }}
            animate={{ x: drift.x, y: drift.y }}
            transition={{
              duration: 9 + (i % 3) * 2,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          >
            <p
              className="text-[13px] sm:text-sm text-slate-100 leading-snug italic"
              dir={frag.rtl ? "rtl" : "ltr"}
            >
              &ldquo;{frag.text}&rdquo;
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
