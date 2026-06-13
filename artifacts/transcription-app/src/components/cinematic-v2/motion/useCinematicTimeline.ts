import { useEffect, useState } from "react";
import { useTransform, type MotionValue } from "framer-motion";
import { CINEMATIC_CHAPTERS, chapterProgress, type CinematicChapterId } from "../data/cinematic-chapters";

export type CinematicSceneMode =
  | "hero"
  | "workflow"
  | "product"
  | "languages"
  | "solutions"
  | "privacy"
  | "scale"
  | "pricing"
  | "finale";

export type CinematicTimeline = {
  p: number;
  chapterId: CinematicChapterId;
  chapterLocal: number;
  sceneMode: CinematicSceneMode;
  workspaceScale: number;
  workspaceOpacity: number;
  workspaceX: number;
  workspaceY: number;
  networkOpacity: number;
  streamOpacity: number;
  languageWallIntensity: number;
  capabilityIntensity: number;
  privacyIntensity: number;
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

function sceneModeFor(id: CinematicChapterId): CinematicSceneMode {
  const map: Record<CinematicChapterId, CinematicSceneMode> = {
    problem: "hero",
    conversation: "workflow",
    interpreterai: "product",
    languages: "languages",
    uses: "solutions",
    trust: "privacy",
    scale: "scale",
    pricing: "pricing",
    finale: "finale",
  };
  return map[id];
}

function blend(a: number, b: number, t: number): number {
  return a + (b - a) * ease(Math.min(1, Math.max(0, t)));
}

export function computeTimeline(p: number): CinematicTimeline {
  const clamped = Math.min(1, Math.max(0, p));
  const id = activeChapter(clamped);
  const ch = CINEMATIC_CHAPTERS.find((c) => c.id === id)!;
  const local = chapterProgress(clamped, ch);
  const sceneMode = sceneModeFor(id);

  const workspaceScale =
    clamped < 0.12
      ? blend(1.02, 1.12, clamped / 0.12)
      : clamped < 0.28
        ? 1.12
        : clamped < 0.38
          ? blend(1.12, 1.04, (clamped - 0.28) / 0.1)
          : clamped < 0.48
            ? blend(1.04, 0.98, (clamped - 0.38) / 0.1)
            : clamped < 0.88
              ? 0.96
              : blend(0.96, 0.2, (clamped - 0.88) / 0.08);

  const workspaceX =
    id === "interpreterai"
      ? blend(0, 14, local)
      : id === "languages"
        ? blend(-10, -16, local)
        : id === "trust"
          ? blend(0, 12, local)
          : id === "scale"
            ? blend(0, -14, local)
            : 0;

  const workspaceY =
    id === "problem"
      ? blend(110, 80, chapterProgress(clamped, CINEMATIC_CHAPTERS[0]!))
      : clamped < 0.28
        ? blend(80, 0, (clamped - 0.12) / 0.16)
        : id === "uses" || id === "pricing"
          ? -8
          : clamped >= 0.88
            ? blend(0, 72, (clamped - 0.88) / 0.08)
            : 0;

  const workspaceOpacity = clamped < 0.92 ? 1 : 1 - ease((clamped - 0.92) / 0.04);

  const networkOpacity =
    clamped < 0.46
      ? 0
      : clamped < 0.56
        ? ease((clamped - 0.46) / 0.1)
        : clamped < 0.9
          ? 1
          : 1 - ease((clamped - 0.9) / 0.06);

  const streamOpacity =
    clamped < 0.36
      ? 0
      : clamped < 0.48
        ? ease((clamped - 0.36) / 0.12)
        : clamped < 0.58
          ? 1
          : 1 - ease((clamped - 0.58) / 0.1);

  const languageWallIntensity =
    clamped < 0.36
      ? 0
      : clamped < 0.48
        ? ease((clamped - 0.36) / 0.12)
        : clamped < 0.56
          ? 1
          : 1 - ease((clamped - 0.56) / 0.08);

  const capabilityIntensity =
    clamped < 0.28
      ? 0
      : clamped < 0.32
        ? ease((clamped - 0.28) / 0.04)
        : clamped < 0.36
          ? 1
          : clamped < 0.4
            ? 1 - ease((clamped - 0.36) / 0.04)
            : 0;

  const privacyIntensity =
    clamped < 0.56
      ? 0
      : clamped < 0.66
        ? ease((clamped - 0.56) / 0.1)
        : clamped < 0.76
          ? 1
          : 1 - ease((clamped - 0.76) / 0.08);

  const secureIntensity = privacyIntensity;

  const scaleIntensity =
    clamped < 0.66
      ? 0
      : clamped < 0.76
        ? ease((clamped - 0.66) / 0.1)
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
    sceneMode,
    workspaceScale,
    workspaceOpacity,
    workspaceX,
    workspaceY,
    networkOpacity,
    streamOpacity,
    languageWallIntensity,
    capabilityIntensity,
    privacyIntensity,
    secureIntensity,
    scaleIntensity,
    pricingIntensity,
    finaleCollapse,
    logoReveal,
  };
}

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

export const CINEMATIC_SCROLL_VH = 820;
