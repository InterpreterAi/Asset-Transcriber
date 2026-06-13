export type CinematicChapterId =
  | "problem"
  | "conversation"
  | "interpreterai"
  | "languages"
  | "testimonials"
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
};

/** Story: Hero → Conversation → Product → Languages → Feedback → Trust → Enterprise → Pricing → Finale */
export const CINEMATIC_CHAPTERS: readonly CinematicChapterMeta[] = [
  { id: "problem", index: 1, label: "Hero", range: [0, 0.09] },
  { id: "conversation", index: 2, label: "The Conversation", range: [0.09, 0.2] },
  { id: "interpreterai", index: 3, label: "Product", range: [0.2, 0.3] },
  { id: "languages", index: 4, label: "Languages", range: [0.3, 0.4] },
  { id: "testimonials", index: 5, label: "Interpreter Feedback", range: [0.4, 0.5] },
  { id: "trust", index: 6, label: "Security & Privacy", range: [0.5, 0.6] },
  { id: "scale", index: 7, label: "Enterprise", range: [0.6, 0.7] },
  { id: "pricing", index: 8, label: "Pricing", range: [0.7, 0.86] },
  { id: "finale", index: 9, label: "Final Moment", range: [0.86, 1] },
];

export function chapterProgress(global: number, chapter: CinematicChapterMeta): number {
  const [a, b] = chapter.range;
  if (global <= a) return 0;
  if (global >= b) return 1;
  return (global - a) / (b - a);
}
