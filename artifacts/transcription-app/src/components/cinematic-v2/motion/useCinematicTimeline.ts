import { useEffect, useState } from "react";
import { useTransform, type MotionValue } from "framer-motion";
import { CINEMATIC_CHAPTERS, chapterProgress, type CinematicChapterId } from "../data/cinematic-chapters";
import { layoutForChapter, type ChapterLayout, type ChapterLayoutMode, type ChapterVisibility } from "./cinematic-layout";

export type CinematicTimeline = {
  p: number;
  chapterId: CinematicChapterId;
  chapterLocal: number;
  layout: ChapterLayout;
  layoutMode: ChapterLayoutMode;
  workspaceScale: number;
  workspaceMaxWidth: "sm" | "md" | "lg" | "xl";
  workspaceOpacity: number;
  visibility: ChapterVisibility;
  networkOpacity: number;
  streamOpacity: number;
  capabilityIntensity: number;
  testimonialIntensity: number;
  privacyIntensity: number;
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

function chapterFade(p: number, id: CinematicChapterId): number {
  const ch = CINEMATIC_CHAPTERS.find((c) => c.id === id);
  if (!ch) return 0;
  const [a, b] = ch.range;
  const fade = 0.04;
  if (p < a - fade || p > b + fade) return 0;
  if (p < a) return (p - (a - fade)) / fade;
  if (p > b) return 1 - (p - b) / fade;
  return 1;
}

export function computeTimeline(p: number): CinematicTimeline {
  const clamped = Math.min(1, Math.max(0, p));
  const id = activeChapter(clamped);
  const ch = CINEMATIC_CHAPTERS.find((c) => c.id === id)!;
  const local = chapterProgress(clamped, ch);
  const layout = layoutForChapter(id);
  const fade = chapterFade(clamped, id);

  const finaleCollapse = clamped < 0.84 ? 0 : ease(Math.min(1, (clamped - 0.84) / 0.1));
  const logoReveal = clamped < 0.9 ? 0 : ease(Math.min(1, (clamped - 0.9) / 0.08));

  const networkOpacity = layout.visibility.network ? fade * (1 - finaleCollapse) : 0;
  const streamOpacity = layout.visibility.translationStreams ? fade * (1 - finaleCollapse) : 0;
  const capabilityIntensity = layout.visibility.capabilityRail ? fade * (1 - finaleCollapse) : 0;
  const testimonialIntensity = layout.visibility.testimonials ? fade * (1 - finaleCollapse) : 0;
  const privacyIntensity = layout.visibility.privacyPaths ? fade * (1 - finaleCollapse) : 0;
  const scaleIntensity = layout.visibility.network ? fade * (1 - finaleCollapse) : 0;
  const pricingIntensity = id === "pricing" ? fade * (1 - finaleCollapse) : 0;

  const workspaceOpacity = layout.visibility.workspace && id !== "finale" ? fade * (1 - finaleCollapse) : 0;

  return {
    p: clamped,
    chapterId: id,
    chapterLocal: local,
    layout,
    layoutMode: layout.mode,
    workspaceScale: layout.workspaceScale,
    workspaceMaxWidth: layout.workspaceMaxWidth,
    workspaceOpacity,
    visibility: {
      ...layout.visibility,
      workspace: layout.visibility.workspace && workspaceOpacity > 0.05,
      translationStreams: layout.visibility.translationStreams && streamOpacity > 0.05,
      capabilityRail: layout.visibility.capabilityRail && capabilityIntensity > 0.05,
      testimonials: layout.visibility.testimonials && testimonialIntensity > 0.05,
      privacyPaths: layout.visibility.privacyPaths && privacyIntensity > 0.05,
      network: layout.visibility.network && networkOpacity > 0.05,
      companyMarquee: layout.visibility.companyMarquee && fade > 0.05,
      chapterCopy: layout.visibility.chapterCopy && fade > 0.05 && logoReveal < 0.5,
    },
    networkOpacity,
    streamOpacity,
    capabilityIntensity,
    testimonialIntensity,
    privacyIntensity,
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

  return { timeline, workspaceScale, workspaceOpacity };
}

export const CINEMATIC_SCROLL_VH = 900;
