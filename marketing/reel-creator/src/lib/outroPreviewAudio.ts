/**
 * Outro preview audio — cached voiceover only (never burns ElevenLabs on preview/play).
 */

import { base64ToBlob } from "@/lib/generatedReel";

export async function resolveOutroPreviewAudio(opts: {
  voiceoverText: string;
  language: string;
  generatedBase64?: string | null;
  phraseGapSec?: number;
}): Promise<Blob | null> {
  void opts.voiceoverText;
  void opts.language;
  void opts.phraseGapSec;

  if (opts.generatedBase64) {
    return base64ToBlob(opts.generatedBase64);
  }

  // No live TTS — previews must use Generate voiceover cache (one ElevenLabs batch).
  return null;
}
