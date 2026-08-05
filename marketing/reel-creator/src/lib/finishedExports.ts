/**
 * Ready-to-download MP4s shipped in public/library/.
 * Seeded into Reel Library so users can grab them without re-exporting.
 */

import type { Reel, SeriesType } from "@/hooks/use-reels";

export type FinishedExport = {
  id: string;
  title: string;
  series: SeriesType;
  hook: string;
  downloadUrl: string;
  filename: string;
  durationLabel: string;
  createdAt: number;
};

/** Stable IDs — do not change once published (library seeds by id). */
export const FINISHED_EXPORTS: FinishedExport[] = [
  {
    id: "finished-hook-typing-2hours-8s",
    title: "Medical interpreters · 2 hours typing (8s hook)",
    series: "1",
    hook: "Medical interpreters waste two hours every day, manually typing call transcripts.",
    downloadUrl: "/library/InterpreterAI_Hook_Typing_2Hours_8s.mp4",
    filename: "InterpreterAI_Hook_Typing_2Hours_8s.mp4",
    durationLabel: "8s · 9:16",
    createdAt: Date.parse("2026-08-05T14:35:00.000Z"),
  },
  {
    id: "finished-hook-typing-2hours-plus-outro",
    title: "Medical interpreters · 2 hours typing + brand outro",
    series: "1",
    hook: "8s pain hook stitched to InterpreterAI Universal Brand Outro.",
    downloadUrl: "/library/InterpreterAI_Hook_Typing_2Hours_plus_Outro.mp4",
    filename: "InterpreterAI_Hook_Typing_2Hours_plus_Outro.mp4",
    durationLabel: "~19s · 9:16",
    createdAt: Date.parse("2026-08-05T14:35:00.000Z"),
  },
];

export function finishedExportToReel(exp: FinishedExport): Reel {
  return {
    id: exp.id,
    title: exp.title,
    series: exp.series,
    reelType: "finished_export",
    targetLanguage: "en",
    voiceActor: "adam",
    voiceSpeed: "1.15",
    musicBed: "urgent_er_alarm",
    brandTone: "none",
    brandStingEnabled: false,
    voVolume: 1,
    bgmVolume: 0.25,
    brandVolume: 0.8,
    problemVisual: "stock_broll",
    solutionVisual: "workspace_demo",
    hook: exp.hook,
    problem: "",
    solution: "",
    result: "",
    captions: exp.hook,
    outroLine1: "Stay focused on the conversation.",
    outroLine2: "We'll handle the words.",
    batchId: null,
    variationIndex: 0,
    scheduleTag: exp.durationLabel,
    fromStudio: false,
    studioBrief: "",
    storyboardTitle: exp.title,
    downloadUrl: exp.downloadUrl,
    downloadFilename: exp.filename,
    createdAt: exp.createdAt,
    updatedAt: exp.createdAt,
  };
}

export function downloadFinishedMp4(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
