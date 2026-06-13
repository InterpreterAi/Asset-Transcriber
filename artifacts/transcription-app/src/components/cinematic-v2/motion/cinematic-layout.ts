import type { CinematicChapterId } from "../data/cinematic-chapters";

export type ChapterVisibility = {
  workspace: boolean;
  translationStreams: boolean;
  capabilityRail: boolean;
  testimonials: boolean;
  privacyPaths: boolean;
  network: boolean;
  chapterCopy: boolean;
};

export type WorkspaceLayout = {
  scale: number;
  xPercent: number;
  yPx: number;
};

export type ChapterLayout = {
  workspace: WorkspaceLayout;
  visibility: ChapterVisibility;
};

/** Per-chapter layout — zero collision zones, one dominant message per viewport. */
export const CHAPTER_LAYOUTS: Record<CinematicChapterId, ChapterLayout> = {
  problem: {
    workspace: { scale: 1.1, xPercent: 0, yPx: 100 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      chapterCopy: true,
    },
  },
  conversation: {
    workspace: { scale: 1.08, xPercent: 0, yPx: -20 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      chapterCopy: true,
    },
  },
  interpreterai: {
    workspace: { scale: 0.92, xPercent: 18, yPx: 0 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: true,
      testimonials: false,
      privacyPaths: false,
      network: false,
      chapterCopy: false,
    },
  },
  languages: {
    workspace: { scale: 0.85, xPercent: -16, yPx: 0 },
    visibility: {
      workspace: true,
      translationStreams: true,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      chapterCopy: true,
    },
  },
  testimonials: {
    workspace: { scale: 0.88, xPercent: 16, yPx: 0 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: true,
      privacyPaths: false,
      network: false,
      chapterCopy: false,
    },
  },
  trust: {
    workspace: { scale: 0.82, xPercent: 20, yPx: 0 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: true,
      network: false,
      chapterCopy: true,
    },
  },
  scale: {
    workspace: { scale: 0.86, xPercent: -14, yPx: 0 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: true,
      chapterCopy: true,
    },
  },
  pricing: {
    workspace: { scale: 0.78, xPercent: 0, yPx: -100 },
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      chapterCopy: true,
    },
  },
  finale: {
    workspace: { scale: 0.3, xPercent: 0, yPx: 40 },
    visibility: {
      workspace: false,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      chapterCopy: true,
    },
  },
};

export function layoutForChapter(id: CinematicChapterId): ChapterLayout {
  return CHAPTER_LAYOUTS[id];
}
