import { useEffect, useState } from "react";
import { useTransform, type MotionValue } from "framer-motion";
import { CINEMATIC_CHAPTERS, chapterProgress, type CinematicChapterId } from "../data/cinematic-chapters";

export type CinematicTimeline = {
  /** Global scroll 0..1 */
  p: number;
  chapterId: CinematicChapterId;
  chapterLocal: number;
  /** Dialogue 0..1 across Ch1+2 */
  dialogueProgress: number;
  workspaceScale: number;
  workspaceOpacity: number;
  workspaceY: number;
  networkOpacity: number;
  streamOpacity: number;
  secureIntensity: number;
  scaleIntensity: number;
  pricingIntensity: number;
  finaleCollapse: number;
  logoReveal: number;
};

function activeChapter(p: number): CinematicChapterId {
  for (let i = CINEMATIC_CHAPTERS.length - 1; i >= 0; i--) {
    if (p >= CINEMATIC_CHAPTERS[i]!.range[0]) return CINEMATIC_CHAPTERS[i]!.id;
  }
  return "problem";
}

function ease(p: number): number {
  return p * p * (3 - 2 * p);
}

export function computeTimeline(p: number): CinematicTimeline {
  const clamped = Math.min(1, Math.max(0, p));
  const id = activeChapter(clamped);
  const ch = CINEMATIC_CHAPTERS.find((c) => c.id === id)!;
  const local = chapterProgress(clamped, ch);

  const dialogueProgress = Math.min(1, clamped / 0.3);

  const workspaceScale =
    clamped < 0.1
      ? 0.78 + ease(clamped / 0.1) * 0.14
      : clamped < 0.28
        ? 0.92 + ease((clamped - 0.1) / 0.18) * 0.08
        : clamped < 0.4
          ? 1 - ease((clamped - 0.28) / 0.12) * 0.32
          : clamped < 0.88
            ? 0.68
            : 0.68 * (1 - ease((clamped - 0.88) / 0.08));

  const workspaceY =
    clamped < 0.28
      ? 0
      : clamped < 0.4
        ? ease((clamped - 0.28) / 0.12) * -24
        : clamped < 0.88
          ? -24
          : -24 + ease((clamped - 0.88) / 0.08) * 60;

  const workspaceOpacity = clamped < 0.93 ? 1 : 1 - ease((clamped - 0.93) / 0.04);

  const networkOpacity =
    clamped < 0.24
      ? 0
      : clamped < 0.38
        ? ease((clamped - 0.24) / 0.14)
        : clamped < 0.9
          ? 1
          : 1 - ease((clamped - 0.9) / 0.06);

  const streamOpacity =
    clamped < 0.34
      ? 0
      : clamped < 0.46
        ? ease((clamped - 0.34) / 0.12)
        : clamped < 0.6
          ? 1
          : 1 - ease((clamped - 0.6) / 0.1);

  const secureIntensity =
    clamped < 0.54
      ? 0
      : clamped < 0.66
        ? ease((clamped - 0.54) / 0.12)
        : clamped < 0.78
          ? 1
          : 1 - ease((clamped - 0.78) / 0.08);

  const scaleIntensity =
    clamped < 0.64
      ? 0
      : clamped < 0.76
        ? ease((clamped - 0.64) / 0.12)
        : clamped < 0.88
          ? 1
          : 1 - ease((clamped - 0.88) / 0.06);

  const pricingIntensity =
    clamped < 0.74 ? 0 : clamped < 0.88 ? ease((clamped - 0.74) / 0.14) : 1 - ease((clamped - 0.88) / 0.06);

  const finaleCollapse = clamped < 0.86 ? 0 : ease(Math.min(1, (clamped - 0.86) / 0.1));
  const logoReveal = clamped < 0.92 ? 0 : ease(Math.min(1, (clamped - 0.92) / 0.06));

  return {
    p: clamped,
    chapterId: id,
    chapterLocal: local,
    dialogueProgress,
    workspaceScale,
    workspaceOpacity,
    workspaceY,
    networkOpacity,
    streamOpacity,
    secureIntensity,
    scaleIntensity,
    pricingIntensity,
    finaleCollapse,
    logoReveal,
  };
}

/** Subscribe to scrollYProgress and expose computed timeline. */
export function useCinematicTimeline(scrollYProgress: MotionValue<number>) {
  const [timeline, setTimeline] = useState(() => computeTimeline(0));

  useEffect(() => {
    const update = (v: number) => setTimeline(computeTimeline(v));
    update(scrollYProgress.get());
    return scrollYProgress.on("change", update);
  }, [scrollYProgress]);

  const workspaceScale = useTransform(scrollYProgress, (p) => computeTimeline(p).workspaceScale);
  const workspaceOpacity = useTransform(scrollYProgress, (p) => computeTimeline(p).workspaceOpacity);
  const networkOpacity = useTransform(scrollYProgress, (p) => computeTimeline(p).networkOpacity);

  return { timeline, workspaceScale, workspaceOpacity, networkOpacity };
}

/** Total scroll track height */
export const CINEMATIC_SCROLL_VH = 820;
