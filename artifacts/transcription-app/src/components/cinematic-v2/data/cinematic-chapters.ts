export type CinematicChapterId =
  | "problem"
  | "conversation"
  | "interpreterai"
  | "languages"
  | "uses"
  | "trust"
  | "scale"
  | "pricing"
  | "finale";

export type CinematicChapterMeta = {
  id: CinematicChapterId;
  index: number;
  label: string;
  /** Master scroll progress range [start, end] */
  range: readonly [number, number];
  /** Section height in vh */
  heightVh: number;
};

export const CINEMATIC_CHAPTERS: readonly CinematicChapterMeta[] = [
  { id: "problem", index: 1, label: "The Problem", range: [0, 0.12], heightVh: 0 },
  { id: "conversation", index: 2, label: "The Conversation", range: [0.12, 0.28], heightVh: 0 },
  { id: "interpreterai", index: 3, label: "InterpreterAI", range: [0.28, 0.38], heightVh: 0 },
  { id: "languages", index: 4, label: "Languages", range: [0.38, 0.48], heightVh: 0 },
  { id: "uses", index: 5, label: "Real-World Uses", range: [0.48, 0.58], heightVh: 0 },
  { id: "trust", index: 6, label: "Trust", range: [0.58, 0.68], heightVh: 0 },
  { id: "scale", index: 7, label: "Scale", range: [0.68, 0.78], heightVh: 0 },
  { id: "pricing", index: 8, label: "Pricing", range: [0.78, 0.9], heightVh: 0 },
  { id: "finale", index: 9, label: "Final Moment", range: [0.9, 1], heightVh: 0 },
];

export function chapterProgress(global: number, chapter: CinematicChapterMeta): number {
  const [a, b] = chapter.range;
  if (global <= a) return 0;
  if (global >= b) return 1;
  return (global - a) / (b - a);
}
