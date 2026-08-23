/**
 * Outro voiceover pacing — phrase ↔ layer sync with ElevenLabs timestamp priority.
 */

import type { TimedWord } from "@/lib/kineticCaptions";
import type { OutroLayerId } from "@/lib/outroLayerLayout";
import { base64ToBlob } from "@/lib/generatedReel";
import { estimateSpeechSec } from "@/lib/workspaceModel";
import {
  CANONICAL_OUTRO_DURATION_SEC,
  LOCKED_OUTRO_FADE_BLACK_SEC,
  LOCKED_OUTRO_MIN_SEC,
  OUTRO_POST_VO_HOLD_SEC,
} from "@/lib/universalBrandOutro";

/** 0 = punctuation-only pauses (no artificial stitch gaps). */
export const DEFAULT_OUTRO_PHRASE_GAP_SEC = 0;
export const OUTRO_PHRASE_GAP_MAX_SEC = 0.65;
/** Typical ElevenLabs pause at each sentence boundary in the script. */
const SENTENCE_PAUSE_SEC = 0.22;

/** Re-export for consumers that import duration from pacing. */
export { CANONICAL_OUTRO_DURATION_SEC };

/** Split spoken outro into phrase chunks (sentence boundaries). */
export function splitOutroPhrases(text: string): string[] {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?؟。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export type OutroPhraseTiming = {
  index: number;
  text: string;
  layerId?: string;
  startSec: number;
  endSec: number;
  delaySec?: number;
};

export type OutroPhraseDef = {
  id: string;
  layerId: OutroLayerId;
  matchKeys: string[];
  fallbackStartSec: number;
};

/** Five spoken phrases — drive VO subtitle sync (visual layers use fixed timeline). */
export const CANONICAL_OUTRO_PHRASE_DEFS: OutroPhraseDef[] = [
  {
    id: "brand",
    layerId: "brandWordmark",
    matchKeys: ["interpreterai", "interpreter ai"],
    fallbackStartSec: 0.0,
  },
  {
    id: "headline",
    layerId: "line1",
    matchKeys: ["stay focused", "conversation"],
    fallbackStartSec: 0.85,
  },
  {
    id: "subhead",
    layerId: "line2",
    matchKeys: ["handle the words", "handle the rest"],
    fallbackStartSec: 1.75,
  },
  {
    id: "languages",
    layerId: "languagesLine",
    matchKeys: ["supports", "languages", "sixty", "62", "sixty-two"],
    fallbackStartSec: 2.45,
  },
  {
    id: "cta",
    layerId: "ctaHeadline",
    matchKeys: ["start your free trial", "free trial"],
    fallbackStartSec: 3.15,
  },
];

/** Studio clip cards — one spoken line ↔ subtitle slot (brand text remains locked). */
export const OUTRO_CLIP_EDITOR_SPECS: Array<{
  index: number;
  layerId: OutroLayerId;
  label: string;
  defaultSpoken: string;
}> = [
  { index: 0, layerId: "brandWordmark", label: "Brand", defaultSpoken: "InterpreterAI." },
  { index: 1, layerId: "line1", label: "Headline", defaultSpoken: "Stay focused on the conversation." },
  { index: 2, layerId: "line2", label: "Subhead", defaultSpoken: "We'll handle the words." },
  { index: 3, layerId: "languagesLine", label: "Languages", defaultSpoken: "Supports sixty-two languages." },
  { index: 4, layerId: "ctaHeadline", label: "CTA", defaultSpoken: "Start your free trial today." },
];

/** Ensure each phrase ends with sentence punctuation so split/join round-trips reliably. */
export function ensureOutroPhraseTerminal(phrase: string): string {
  const t = phrase.trim();
  if (!t) return "";
  if (/[.!?؟。]$/.test(t)) return t;
  return `${t}.`;
}

/** Spoken phrase lines extracted from the full outro script. */
export function outroSpokenPhrases(voiceoverText: string): string[] {
  const raw = splitOutroPhrases(voiceoverText);
  return OUTRO_CLIP_EDITOR_SPECS.map((spec, i) => raw[i]?.trim() || spec.defaultSpoken);
}

/** Stable 5-slot VO lines for the studio editor. */
export function normalizeOutroVoPhrases(
  raw: string[] | null | undefined,
  voiceoverFallback?: string,
): string[] {
  const fromScript = outroSpokenPhrases(voiceoverFallback ?? "");
  if (!Array.isArray(raw) || raw.length === 0) return fromScript;
  return OUTRO_CLIP_EDITOR_SPECS.map((spec, i) => {
    const slot = raw[i]?.trim();
    return slot || fromScript[i]?.trim() || spec.defaultSpoken;
  });
}

/** Replace one spoken phrase and rebuild the full voiceover script. */
export function patchOutroSpokenPhrase(
  voiceoverText: string,
  index: number,
  newPhrase: string,
): string {
  const phrases = outroSpokenPhrases(voiceoverText);
  if (index >= 0 && index < phrases.length) {
    phrases[index] = newPhrase.trim();
  }
  return buildOutroVoiceoverFromPhrases(phrases);
}

/** Replace one slot in an explicit phrase list. */
export function patchOutroVoPhraseList(
  phrases: string[],
  index: number,
  newPhrase: string,
): string[] {
  const next = normalizeOutroVoPhrases(phrases);
  if (index >= 0 && index < next.length) next[index] = newPhrase.trim();
  return next;
}

/** Rebuild voiceover from all spoken clip lines. */
export function buildOutroVoiceoverFromPhrases(phrases: string[]): string {
  return phrases
    .map((p) => ensureOutroPhraseTerminal(p))
    .filter(Boolean)
    .join(" ");
}

export const OUTRO_PHRASE_COUNT = OUTRO_CLIP_EDITOR_SPECS.length;

/** Default — every spoken phrase included in TTS. */
export function defaultOutroPhraseMuted(): boolean[] {
  return Array.from({ length: OUTRO_PHRASE_COUNT }, () => false);
}

export function normalizeOutroPhraseMuted(raw?: boolean[] | null): boolean[] {
  const base = defaultOutroPhraseMuted();
  if (!Array.isArray(raw)) return base;
  return base.map((_, i) => Boolean(raw[i]));
}

/** Spoken script for ElevenLabs — muted phrases stay editable but are not synthesized. */
export function buildOutroSpokenForTts(
  voiceoverText: string,
  muted?: boolean[] | null,
  voPhrases?: string[] | null,
): string {
  const mask = normalizeOutroPhraseMuted(muted);
  const phrases = voPhrases?.length
    ? normalizeOutroVoPhrases(voPhrases, voiceoverText)
    : outroSpokenPhrases(voiceoverText);
  return buildOutroVoiceoverFromPhrases(phrases.map((p, i) => (mask[i] ? "" : p)));
}

/** Timing script — always uses all VO slots (muted lines still drive on-screen timing). */
export function outroVoiceoverForTiming(
  voiceoverText: string,
  voPhrases?: string[] | null,
): string {
  return buildOutroVoiceoverFromPhrases(
    normalizeOutroVoPhrases(voPhrases, voiceoverText),
  );
}

export function toggleOutroPhraseMuted(
  muted: boolean[] | null | undefined,
  index: number,
): boolean[] {
  const next = normalizeOutroPhraseMuted(muted);
  if (index >= 0 && index < next.length) next[index] = !next[index];
  return next;
}

/** Fallback layer reveal starts when timestamps are unavailable. */
export const CANONICAL_LAYER_FALLBACK_START: Partial<Record<OutroLayerId, number>> = {
  brandIcon: 0.15,
  brandWordmark: 0.45,
  line1: 0.85,
  line2: 1.15,
  languagesLine: 1.65,
  ctaHeadline: 2.05,
  ctaSubline: 2.45,
  url: 2.75,
  qr: 2.8,
};

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBrandLeadPhrase(phraseNorm: string): boolean {
  const n = phraseNorm.replace(/\.$/, "").trim();
  return n === "interpreterai" || n === "interpreter ai";
}

function phraseMatchesDef(phraseNorm: string, def: OutroPhraseDef): boolean {
  return def.matchKeys.some((k) => phraseNorm.includes(k));
}

type WordMatch = { startSec: number; endSec: number; nextCursor: number };

function matchWordsToPhrase(
  words: TimedWord[],
  phrase: string,
  startCursor: number,
): WordMatch | null {
  const phraseNorm = normalizeForMatch(phrase);
  const phraseWords = phraseNorm.split(" ").filter(Boolean);
  if (phraseWords.length === 0) return null;

  let matched = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  let cursor = startCursor;

  while (cursor < words.length && matched < phraseWords.length) {
    const wNorm = normalizeForMatch(words[cursor]!.word);
    const target = phraseWords[matched]!;
    if (wNorm && (wNorm.includes(target) || target.includes(wNorm))) {
      if (firstIdx < 0) firstIdx = cursor;
      lastIdx = cursor;
      matched++;
    } else if (matched > 0) {
      break;
    }
    cursor++;
  }

  if (firstIdx < 0 || lastIdx < 0) return null;
  return {
    startSec: words[firstIdx]!.start,
    endSec: words[lastIdx]!.end,
    nextCursor: lastIdx + 1,
  };
}

/**
 * Build phrase timings tied to layers — ElevenLabs word timestamps take priority;
 * fallback to canonical 7s offsets when unavailable.
 */
export function buildOutroPhraseTimings(
  voiceoverText: string,
  words: TimedWord[],
  fallbackSpeechSec?: number,
): OutroPhraseTiming[] {
  const spokenPhrases = outroSpokenPhrases(voiceoverText);

  const speechEnd =
    words.length > 0
      ? words[words.length - 1]!.end
      : (fallbackSpeechSec ?? CANONICAL_OUTRO_DURATION_SEC - 0.35);

  const timings: OutroPhraseTiming[] = [];
  let wordCursor = 0;

  for (let i = 0; i < CANONICAL_OUTRO_PHRASE_DEFS.length; i++) {
    const def = CANONICAL_OUTRO_PHRASE_DEFS[i]!;
    const phraseText = spokenPhrases[i]?.trim() ?? "";

    let startSec = def.fallbackStartSec;
    let endSec =
      i + 1 < CANONICAL_OUTRO_PHRASE_DEFS.length
        ? CANONICAL_OUTRO_PHRASE_DEFS[i + 1]!.fallbackStartSec
        : Math.min(speechEnd, CANONICAL_OUTRO_DURATION_SEC - 0.15);

    if (words.length > 0 && phraseText) {
      const matched = matchWordsToPhrase(words, phraseText, wordCursor);
      if (matched) {
        startSec = matched.startSec;
        endSec = Math.max(matched.endSec, startSec + 0.2);
        wordCursor = matched.nextCursor;
      }
    } else if (words.length === 0) {
      startSec = def.fallbackStartSec;
      endSec =
        i + 1 < CANONICAL_OUTRO_PHRASE_DEFS.length
          ? CANONICAL_OUTRO_PHRASE_DEFS[i + 1]!.fallbackStartSec
          : Math.min(speechEnd, CANONICAL_OUTRO_DURATION_SEC - 0.15);
    }

    timings.push({
      index: i,
      text: phraseText || def.id,
      layerId: def.layerId,
      startSec,
      endSec,
    });
  }

  return timings;
}

export function phraseTimingsForLayer(
  layerId: string,
  phraseIndex: number,
  timings: OutroPhraseTiming[],
): OutroPhraseTiming | undefined {
  if (phraseIndex >= 0) {
    const byIndex = timings.find((p) => p.index === phraseIndex);
    if (byIndex) return byIndex;
  }
  return timings.find((p) => p.layerId === layerId);
}

/**
 * One ElevenLabs call — join phrases with punctuation that controls pause length.
 */
export function formatOutroForSingleTts(text: string, phraseGapSec: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ").replace(/\u2026/g, ".");
  if (!trimmed) return "";
  if (phraseGapSec <= 0.001) return trimmed;
  const phrases = splitOutroPhrases(trimmed);
  if (phrases.length <= 1) return trimmed;
  const gap = Math.max(0, phraseGapSec);
  if (gap <= 0.08) return phrases.join(", ");
  if (gap <= 0.22) return phrases.join(". ");
  return phrases.join(".  ");
}

/** Estimate outro length from script — speech + sentence pauses + fade (no fixed hold). */
export function estimateOutroVoDurationSec(voiceoverText: string, lang = "en"): number {
  const text = voiceoverText.trim();
  if (!text) return 0;
  const speech = estimateSpeechSec(text, lang);
  const phrases = splitOutroPhrases(text).filter(Boolean);
  const punctuationPause = Math.max(0, phrases.length - 1) * SENTENCE_PAUSE_SEC;
  return speech + punctuationPause + OUTRO_POST_VO_HOLD_SEC + LOCKED_OUTRO_FADE_BLACK_SEC;
}

/** Outro segment length — speech + post-VO hold + fade. */
export function outroSegmentSecFromSpeech(
  speechSec: number,
  opts?: { minHoldSec?: number; tailPadSec?: number },
): number {
  const speech = Math.max(0, speechSec);
  const tail = opts?.tailPadSec ?? OUTRO_POST_VO_HOLD_SEC + LOCKED_OUTRO_FADE_BLACK_SEC;
  const minHold = opts?.minHoldSec ?? 0;
  if (minHold > 0) {
    return Math.max(minHold, speech + tail);
  }
  return Math.max(1.5, speech + tail);
}

/** @deprecated */
export function outroDurationForVoSecLegacy(voSec: number): number {
  return Math.max(LOCKED_OUTRO_MIN_SEC, voSec + LOCKED_OUTRO_FADE_BLACK_SEC + 0.15);
}

export type OutroPhraseClip = {
  audioBase64: string;
  words: TimedWord[];
  durationSec: number;
};

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = samples * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]!));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Stitch phrase TTS clips with a controlled gap. */
export async function stitchOutroPhraseClips(
  clips: OutroPhraseClip[],
  phraseGapSec: number,
): Promise<{ blob: Blob; words: TimedWord[]; speechSec: number }> {
  if (clips.length === 0) {
    return { blob: new Blob(), words: [], speechSec: 0 };
  }
  if (clips.length === 1) {
    const c = clips[0]!;
    const blob = base64ToBlob(c.audioBase64);
    return { blob, words: c.words, speechSec: c.durationSec };
  }

  const gap = Math.max(0, Math.min(OUTRO_PHRASE_GAP_MAX_SEC, phraseGapSec));
  let totalSec = 0;
  const schedule: { clip: OutroPhraseClip; startSec: number }[] = [];
  for (const clip of clips) {
    schedule.push({ clip, startSec: totalSec });
    totalSec += clip.durationSec + gap;
  }
  totalSec = Math.max(0.1, totalSec - gap);

  const ctx = new AudioContext();
  try {
    const offline = new OfflineAudioContext(1, Math.ceil(totalSec * 48000), 48000);
    for (const { clip, startSec } of schedule) {
      const decoded = await offline.decodeAudioData(b64ToArrayBuffer(clip.audioBase64));
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(startSec);
    }
    const rendered = await offline.startRendering();
    const blob = audioBufferToWav(rendered);
    const words: TimedWord[] = [];
    let wordIndex = 0;
    for (const { clip, startSec } of schedule) {
      for (const w of clip.words) {
        words.push({
          word: w.word,
          start: w.start + startSec,
          end: w.end + startSec,
          index: wordIndex++,
        });
      }
    }
    return { blob, words, speechSec: totalSec };
  } finally {
    void ctx.close();
  }
}

export async function stitchOutroPhraseClipsToBase64(
  clips: OutroPhraseClip[],
  phraseGapSec: number,
): Promise<{ audioBase64: string; words: TimedWord[]; speechSec: number }> {
  const { blob, words, speechSec } = await stitchOutroPhraseClips(clips, phraseGapSec);
  return {
    audioBase64: await blobToBase64(blob),
    words,
    speechSec,
  };
}
