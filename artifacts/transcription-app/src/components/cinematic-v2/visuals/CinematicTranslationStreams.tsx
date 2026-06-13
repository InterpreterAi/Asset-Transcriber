import { useMemo } from "react";
import { motion } from "framer-motion";
import { CINEMATIC_TRANSLATION_FRAGMENTS } from "../data/cinematic-dialogue-translations";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

type Props = { timeline: CinematicTimeline };

type BubbleSpec = {
  id: string;
  text: string;
  rtl?: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
  delay: number;
  size: "sm" | "md";
};

function buildBubbles(): BubbleSpec[] {
  const frags = CINEMATIC_TRANSLATION_FRAGMENTS;
  return frags.map((frag, i) => {
    const lane = i % 5;
    const startY = 8 + lane * 17 + (i % 3) * 4;
    const fromLeft = i % 2 === 0;
    return {
      id: frag.id,
      text: frag.text,
      rtl: frag.rtl,
      startX: fromLeft ? -22 : 108,
      startY,
      endX: fromLeft ? 108 : -22,
      endY: startY + ((i % 4) - 1.5) * 6,
      duration: 22 + (i % 7) * 3,
      delay: (i % 12) * 1.4,
      size: frag.text.length > 42 ? "md" : "sm",
    };
  });
}

/** Languages chapter — phrases drift across the full viewport behind the workspace. */
export function CinematicTranslationStreams({ timeline }: Props) {
  const bubbles = useMemo(() => buildBubbles(), []);

  if (!timeline.visibility.translationStreams) return null;

  const intensity = timeline.streamOpacity;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-[5]"
      style={{ opacity: intensity }}
      aria-hidden
    >
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className={`absolute max-w-[200px] sm:max-w-[240px] cinematic-v2-glass rounded-xl px-3 py-2.5 shadow-lg ${
            b.size === "md" ? "sm:max-w-[280px]" : ""
          }`}
          style={{ top: `${b.startY}%`, opacity: 0.78 }}
          initial={{ left: `${b.startX}%`, top: `${b.startY}%` }}
          animate={{ left: `${b.endX}%`, top: `${b.endY}%` }}
          transition={{
            duration: b.duration,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
            delay: b.delay,
          }}
        >
          <p className="text-[11px] sm:text-xs text-slate-100/95 leading-snug italic" dir={b.rtl ? "rtl" : "ltr"}>
            &ldquo;{b.text}&rdquo;
          </p>
        </motion.div>
      ))}
    </div>
  );
}
