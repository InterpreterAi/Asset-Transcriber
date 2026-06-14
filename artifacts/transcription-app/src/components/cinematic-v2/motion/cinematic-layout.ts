import type { CinematicChapterId } from "../data/cinematic-chapters";

export type ChapterLayoutMode = "stack-copy-top" | "stack-copy-bottom" | "split-copy-left" | "split-copy-right" | "finale";

export type ChapterVisibility = {
  workspace: boolean;
  translationStreams: boolean;
  capabilityRail: boolean;
  testimonials: boolean;
  privacyPaths: boolean;
  network: boolean;
  companyMarquee: boolean;
  chapterCopy: boolean;
};

export type ChapterLayout = {
  mode: ChapterLayoutMode;
  workspaceScale: number;
  workspaceMaxWidth: "sm" | "md" | "lg" | "xl";
  visibility: ChapterVisibility;
};

/** Grid zones — copy and workspace never overlap; workspace fills ~half width on split chapters. */
export const CHAPTER_LAYOUTS: Record<CinematicChapterId, ChapterLayout> = {
  problem: {
    mode: "stack-copy-top",
    workspaceScale: 0.92,
    workspaceMaxWidth: "xl",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
  conversation: {
    mode: "stack-copy-bottom",
    workspaceScale: 0.9,
    workspaceMaxWidth: "xl",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
  interpreterai: {
    mode: "split-copy-left",
    workspaceScale: 0.95,
    workspaceMaxWidth: "lg",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: true,
      testimonials: false,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
  languages: {
    mode: "split-copy-right",
    workspaceScale: 0.95,
    workspaceMaxWidth: "lg",
    visibility: {
      workspace: true,
      translationStreams: true,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
  testimonials: {
    mode: "split-copy-left",
    workspaceScale: 0.95,
    workspaceMaxWidth: "lg",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: true,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: false,
    },
  },
  trust: {
    mode: "split-copy-left",
    workspaceScale: 0.92,
    workspaceMaxWidth: "lg",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: true,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
  scale: {
    mode: "split-copy-right",
    workspaceScale: 0.92,
    workspaceMaxWidth: "lg",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: true,
      companyMarquee: true,
      chapterCopy: true,
    },
  },
  pricing: {
    mode: "stack-copy-bottom",
    workspaceScale: 0.88,
    workspaceMaxWidth: "xl",
    visibility: {
      workspace: true,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
  finale: {
    mode: "finale",
    workspaceScale: 0,
    workspaceMaxWidth: "sm",
    visibility: {
      workspace: false,
      translationStreams: false,
      capabilityRail: false,
      testimonials: false,
      privacyPaths: false,
      network: false,
      companyMarquee: false,
      chapterCopy: true,
    },
  },
};

export function layoutForChapter(id: CinematicChapterId): ChapterLayout {
  return CHAPTER_LAYOUTS[id];
}

export const WORKSPACE_MAX_W = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;
