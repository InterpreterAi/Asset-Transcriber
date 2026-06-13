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
  { id: "problem", index: 1, label: "The Problem", range: [0, 0.14], heightVh: 110 },
  { id: "conversation", index: 2, label: "The Conversation", range: [0.14, 0.32], heightVh: 130 },
  { id: "interpreterai", index: 3, label: "InterpreterAI", range: [0.32, 0.42], heightVh: 95 },
  { id: "languages", index: 4, label: "Languages", range: [0.42, 0.52], heightVh: 95 },
  { id: "uses", index: 5, label: "Real-World Uses", range: [0.52, 0.62], heightVh: 100 },
  { id: "trust", index: 6, label: "Trust", range: [0.62, 0.72], heightVh: 100 },
  { id: "scale", index: 7, label: "Scale", range: [0.72, 0.82], heightVh: 100 },
  { id: "pricing", index: 8, label: "Pricing", range: [0.82, 0.94], heightVh: 110 },
  { id: "finale", index: 9, label: "Final Moment", range: [0.94, 1], heightVh: 100 },
];

export function chapterProgress(global: number, chapter: CinematicChapterMeta): number {
  const [a, b] = chapter.range;
  if (global <= a) return 0;
  if (global >= b) return 1;
  return (global - a) / (b - a);
}
