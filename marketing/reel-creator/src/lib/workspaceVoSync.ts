/**
 * Workspace VO timing — measure real audio duration, repack clips, scale word timestamps.
 */

import {
  audioBufferToWav,
  concatMonoBuffers,
  silenceBuffer,
  trimBufferToSpeechWindow,
} from "@/lib/audioTrim";
import { base64ToBlob, type StitchClip } from "@/lib/reelBlobUtils";
import type { WorkspaceVoClip } from "@/lib/generatedReel";
import { clipExchangeIndex } from "@/lib/generatedReel";
import {
  WORKSPACE_POST_VO_HOLD_SEC,
  WORKSPACE_EXCHANGE_GAP_SEC,
  WORKSPACE_THIRD_SPEAKER_GAP_SEC,
  speechTrimSecFromWords,
} from "@/lib/workspaceTiming";
import {
  normalizeWordTimestamps,
  scaleWordsToDuration,
  type TimedWord,
} from "@/lib/kineticCaptions";

const END_PAD_SEC = WORKSPACE_POST_VO_HOLD_SEC;

export {
  WORKSPACE_EXCHANGE_GAP_SEC,
  WORKSPACE_THIRD_SPEAKER_GAP_SEC,
  speechTrimSecFromWords,
} from "@/lib/workspaceTiming";

/** Pause after an original phrase before its translation phrase appears. */
export const TRANS_PHRASE_GAP_SEC = 0.14;

/** Original words spoken before translation column starts updating. */
export const TRANS_ORIGINAL_WORD_GATE = 2;

/** Translation column stays this many words behind the original line. */
export const TRANS_TRANSLATION_WORD_LAG = 2;

/** Fade-in duration per translation phrase. */
export const TRANS_PHRASE_REVEAL_SEC = 0.36;

/** Hold after last translation phrase before the next speaker. */
export const TRANS_TAIL_HOLD_SEC = 0.24;

/** Legacy block-reveal delay (after full original line). */
const TRANS_AFTER_SPEECH_DELAY_SEC = 0.12;
const TRANS_REVEAL_FADE_SEC = 0.42;

type ExchangeGapHint = {
  speaker?: string;
  thirdSpeakerVoiceId?: string;
};

/** Pack workspace TTS clips with speaker gaps — preserves exchange row indices. */
export function packWorkspaceVoClipsMeta(
  clips: Array<{
    audioBase64: string;
    words?: TimedWord[];
    exchangeIndex: number;
  }>,
  exchanges?: ExchangeGapHint[],
): WorkspaceVoClip[] {
  let cursor = 0;
  const out: WorkspaceVoClip[] = [];
  const sorted = [...clips].sort((a, b) => a.exchangeIndex - b.exchangeIndex);
  for (const clip of sorted) {
    cursor += workspaceExchangeGapSec(exchanges, clip.exchangeIndex);
    const words = normalizeWordTimestamps(clip.words);
    const durationSec = speechTrimSecFromWords(words, 2);
    out.push({
      audioBase64: clip.audioBase64,
      startSec: cursor,
      durationSec,
      exchangeIndex: clip.exchangeIndex,
      words,
    });
    // Hold after speech so startSec of the next clip matches resolveWorkspaceVoTiming.
    cursor += durationSec + TRANS_TAIL_HOLD_SEC;
  }
  return out;
}



/** Gap inserted before an exchange — longer when pink 3rd speaker enters. */
export function workspaceExchangeGapSec(
  exchanges: ExchangeGapHint[] | undefined,
  exchangeIndex: number,
): number {
  if (exchangeIndex <= 0) return 0;
  const ex = exchanges?.[exchangeIndex];
  const isThird = ex?.speaker === "C" || !!ex?.thirdSpeakerVoiceId?.trim();
  return isThird ? WORKSPACE_THIRD_SPEAKER_GAP_SEC : WORKSPACE_EXCHANGE_GAP_SEC;
}

export function buildSyntheticWordTimings(
  text: string,
  startSec: number,
  durationSec: number,
): TimedWord[] {
  const trimmed = text.trim();
  if (!trimmed || durationSec <= 0.01) return [];
  const isCjk = /[\u0600-\u06FF\u4e00-\u9fff]/.test(trimmed);
  const tokens = isCjk
    ? [...trimmed.replace(/\s+/g, "")]
    : trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const step = durationSec / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: startSec + i * step,
    end: startSec + (i + 1) * step,
    index: i,
  }));
}

export type WorkspaceVoScheduleItem = {
  startSec: number;
  durationSec: number;
  /** Spoken VO length — captions sync to this, not the longer visual hold. */
  speechDurSec: number;
  exchangeIndex: number;
};

export type ResolvedWorkspaceVo = {
  schedule: WorkspaceVoScheduleItem[];
  durationSec: number;
  /** Per-exchange word timings (segment-local, scaled to audio). */
  wordsByExchange: TimedWord[][];
};

async function measureBlobDuration(blob: Blob): Promise<number> {
  if (!blob.size) return 0;
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const d = buf.duration;
    void ctx.close();
    return d;
  } catch {
    return 0;
  }
}

/** Split spoken/UI text into phrase chunks (commas and sentence ends). */
export function splitSpeechPhrases(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[.!?,:;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/** Align translation phrase count to original phrase count. */
export function alignTranslationPhrases(originalText: string, translationText: string): string[] {
  const orig = splitSpeechPhrases(originalText);
  const trans = splitSpeechPhrases(translationText);
  if (orig.length <= 1) {
    return trans.length > 0 ? trans : translationText.trim() ? [translationText.trim()] : [];
  }
  if (trans.length === orig.length) return trans;
  if (trans.length > orig.length) return trans.slice(0, orig.length);
  const padded = [...trans];
  while (padded.length < orig.length) {
    padded.push(padded[padded.length - 1] ?? "");
  }
  return padded;
}

/** Spoken original line — synced to measured speech duration (matches stitched VO). */
export function originalTextAtVoTime(
  words: TimedWord[],
  localSpeechSec: number,
  fallbackText: string,
  speechDurSec: number,
): string {
  const parts = fallbackText.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const dur =
    speechDurSec > 0.05
      ? speechDurSec
      : words.length > 0
        ? words[words.length - 1]!.end
        : 1;
  const t = Math.max(0, Math.min(dur, localSpeechSec));
  if (t + 0.012 >= dur) return parts.join(" ");

  if (words.length === parts.length) {
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (t + 0.012 >= words[i]!.start) out.push(parts[i]!);
      else break;
    }
    return out.join(" ");
  }

  const n = Math.max(
    0,
    Math.min(parts.length, Math.ceil((t / Math.max(0.05, dur)) * parts.length)),
  );
  return parts.slice(0, n).join(" ");
}

/** Translation appears only after original VO finishes — smooth block reveal, not word-by-word. */
export type TranslationReveal = { text: string; opacity: number };

function phraseEndTimesFromWords(
  words: TimedWord[],
  phrases: string[],
  speechEndFallback: number,
): number[] {
  if (phrases.length === 0) return [];
  if (words.length === 0) {
    const step = speechEndFallback / Math.max(1, phrases.length);
    return phrases.map((_, i) => (i + 1) * step);
  }
  const counts = phrases.map((p) => p.split(/\s+/).filter(Boolean).length || 1);
  const ends: number[] = [];
  let wi = 0;
  for (const count of counts) {
    wi = Math.min(words.length, wi + count);
    ends.push(words[Math.max(0, wi - 1)]!.end);
  }
  return ends;
}

/**
 * Translation tracks original word-by-word — starts after TRANS_ORIGINAL_WORD_GATE
 * original words, then reveals proportionally (never dumps all at speaker switch).
 */
export function translationPhrasesAfterOriginal(
  originalWords: TimedWord[],
  localSpeechSec: number,
  speechDurSec: number,
  originalText: string,
  translationText: string,
): TranslationReveal {
  const trimmed = translationText.trim();
  if (!trimmed) return { text: "", opacity: 0 };

  const origTokens = originalText.trim().split(/\s+/).filter(Boolean);
  const transTokens = trimmed.split(/\s+/).filter(Boolean);
  if (transTokens.length === 0) return { text: "", opacity: 0 };

  const dur =
    speechDurSec > 0.05
      ? speechDurSec
      : originalSpeechEndSec(originalWords, speechDurSec);

  let origSpoken = 0;
  if (origTokens.length > 0) {
    if (localSpeechSec + 0.012 >= dur) {
      origSpoken = origTokens.length;
    } else if (originalWords.length === origTokens.length && originalWords.length > 0) {
      for (const w of originalWords) {
        if (localSpeechSec + 0.012 >= w.start) origSpoken++;
        else break;
      }
    } else {
      origSpoken = Math.ceil((localSpeechSec / Math.max(0.05, dur)) * origTokens.length);
    }
  }

  if (origSpoken < TRANS_ORIGINAL_WORD_GATE) {
    return { text: "", opacity: 0 };
  }

  const transCount = Math.max(
    0,
    Math.min(transTokens.length, origSpoken - TRANS_TRANSLATION_WORD_LAG),
  );
  if (transCount <= 0) {
    return { text: "", opacity: 0 };
  }

  const text = transTokens.slice(0, transCount).join(" ");

  const fullyShown = transCount >= transTokens.length;
  const lagRatio = transCount / Math.max(1, transTokens.length);
  const opacity = fullyShown ? 1 : Math.min(1, 0.65 + lagRatio * 0.35);

  return { text, opacity };
}

/** @deprecated Prefer translationPhrasesAfterOriginal */
export function translationAfterOriginalSpeech(
  originalWords: TimedWord[],
  localClipSec: number,
  clipDurationSec: number,
  translationText: string,
  originalText = "",
): TranslationReveal {
  if (originalText.trim()) {
    return translationPhrasesAfterOriginal(
      originalWords,
      localClipSec,
      clipDurationSec,
      originalText,
      translationText,
    );
  }
  const trimmed = translationText.trim();
  if (!trimmed) return { text: "", opacity: 0 };

  const speechEnd =
    originalWords.length > 0
      ? originalWords[originalWords.length - 1]!.end
      : Math.max(0.35, clipDurationSec * 0.88);

  if (localClipSec + 0.02 < speechEnd + TRANS_AFTER_SPEECH_DELAY_SEC) {
    return { text: "", opacity: 0 };
  }

  const fadeT = localClipSec - speechEnd - TRANS_AFTER_SPEECH_DELAY_SEC;
  const opacity = Math.min(1, fadeT / TRANS_REVEAL_FADE_SEC);
  return { text: trimmed, opacity };
}

/** @deprecated Use translationPhrasesAfterOriginal — parallel word reveal looked too AI. */
export function translationSyncedToOriginal(
  originalWords: TimedWord[],
  localClipSec: number,
  translationText: string,
  linearProgress: number,
): string {
  return translationAfterOriginalSpeech(
    originalWords,
    localClipSec,
    Math.max(1, localClipSec / Math.max(0.05, linearProgress)),
    translationText,
  ).text;
}

export function originalSpeechEndSec(
  originalWords: TimedWord[],
  clipDurationSec: number,
): number {
  if (originalWords.length > 0) {
    return originalWords[originalWords.length - 1]!.end;
  }
  return Math.max(0.35, clipDurationSec * 0.88);
}

export function computeTranslationRevealTail(_translationText: string): number {
  return TRANS_TAIL_HOLD_SEC;
}

export function translationRevealComplete(
  originalWords: TimedWord[],
  localClipSec: number,
  clipDurationSec: number,
  originalText: string,
  _translationText: string,
): boolean {
  const speechEnd = originalSpeechEndSec(originalWords, clipDurationSec);
  const origTokens = originalText.trim().split(/\s+/).filter(Boolean);
  let origSpoken = 0;
  if (originalWords.length > 0) {
    for (const w of originalWords) {
      if (localClipSec + 0.02 >= w.start) origSpoken++;
      else break;
    }
  } else {
    origSpoken = Math.floor(
      Math.min(1, localClipSec / Math.max(0.05, speechEnd)) * origTokens.length,
    );
  }
  return origSpoken >= origTokens.length && localClipSec + 0.02 >= speechEnd;
}

/**
 * Build schedule from decoded audio — clip stays active through translation phrase reveals.
 */
export async function resolveWorkspaceVoTiming(
  clips: WorkspaceVoClip[],
  exchanges?: Array<{ original?: string; translation?: string; translationLang?: string; speaker?: string; thirdSpeakerVoiceId?: string }>,
): Promise<ResolvedWorkspaceVo | null> {
  if (clips.length === 0) return null;

  const schedule: WorkspaceVoScheduleItem[] = [];
  const wordsByExchange: TimedWord[][] = [];
  let audioCursor = 0;

  const ordered = clips
    .map((clip, order) => ({ clip, order }))
    .sort((a, b) => {
      const ai = clipExchangeIndex(a.clip, a.order);
      const bi = clipExchangeIndex(b.clip, b.order);
      return ai !== bi ? ai - bi : a.order - b.order;
    });

  for (const { clip, order } of ordered) {
    const exIdx = clipExchangeIndex(clip, order);
    audioCursor += workspaceExchangeGapSec(exchanges, exIdx);
    const blob = base64ToBlob(clip.audioBase64);
    const audioDur = await measureBlobDuration(blob);
    const wordDur =
      clip.words && clip.words.length > 0
        ? clip.words[clip.words.length - 1]!.end
        : 0;

    let words = normalizeWordTimestamps(clip.words);
    const alignEnd = words.length > 0 ? words[words.length - 1]!.end : 0;
    const measuredSpeech =
      audioDur > 0.05 ? audioDur : alignEnd > 0.05 ? alignEnd : (clip.durationSec ?? 2);

    if (words.length > 0 && measuredSpeech > 0.05) {
      words = scaleWordsToDuration(words, measuredSpeech);
    }

    const speechDur = speechTrimSecFromWords(words, measuredSpeech, measuredSpeech);
    const speechEnd = originalSpeechEndSec(words, speechDur);
    const transTail = computeTranslationRevealTail(exchanges?.[exIdx]?.translation ?? "");
    const visualDur = Math.max(speechDur, speechEnd + transTail);

    schedule.push({
      startSec: audioCursor,
      durationSec: visualDur,
      speechDurSec: speechDur,
      exchangeIndex: exIdx,
    });
    wordsByExchange[exIdx] = words;
    // Advance by full visual window so the next speaker never overlaps this exchange's
    // translation hold (audio stitch inserts matching silence — see packWorkspaceAudioForStitch).
    audioCursor += visualDur;
  }

  const last = schedule[schedule.length - 1];
  const durationSec = Math.max(
    0.5,
    Math.max(last ? last.startSec + last.durationSec : 0, audioCursor) + END_PAD_SEC,
  );
  return { schedule, durationSec, wordsByExchange };
}

/** Fallback duration from clip metadata (before async resolve). */
export function estimateWorkspaceDurationFromClips(
  clips: Pick<WorkspaceVoClip, "startSec" | "durationSec">[],
  estimatedSpeechSec?: number,
): number {
  if (clips.length === 0) {
    return estimatedSpeechSec != null && estimatedSpeechSec > 0
      ? estimatedSpeechSec + END_PAD_SEC
      : 15;
  }
  const last = clips[clips.length - 1]!;
  return Math.max(2.5, last.startSec + (last.durationSec ?? 2) + END_PAD_SEC);
}

/** Tight VO pack — trim to spoken word end; hold through translation reveal; gap between speakers. */
export function packWorkspaceAudioForStitch(
  clips: WorkspaceVoClip[],
  wordsByExchange?: TimedWord[][],
  exchanges?: Array<{
    original?: string;
    translation?: string;
    speaker?: string;
    thirdSpeakerVoiceId?: string;
  }>,
): StitchClip[] {
  const indexed = clips
    .map((clip, order) => ({ clip, order }))
    .filter(({ clip }) => !!clip.audioBase64)
    .sort((a, b) => {
      const ai = clipExchangeIndex(a.clip, a.order);
      const bi = clipExchangeIndex(b.clip, b.order);
      return ai !== bi ? ai - bi : a.order - b.order;
    });

  let cursor = 0;
  const out: StitchClip[] = [];
  for (const { clip, order } of indexed) {
    const exIdx = clipExchangeIndex(clip, order);
    cursor += workspaceExchangeGapSec(exchanges, exIdx);
    const words = wordsByExchange?.[exIdx] ?? normalizeWordTimestamps(clip.words);
    const speechDur = speechTrimSecFromWords(words, clip.durationSec ?? 2);
    const speechEnd = originalSpeechEndSec(words, speechDur);
    const transTail = computeTranslationRevealTail(exchanges?.[exIdx]?.translation ?? "");
    const visualDur = Math.max(speechDur, speechEnd + transTail);
    out.push({
      blob: base64ToBlob(clip.audioBase64),
      startSec: cursor,
      durationSec: speechDur,
      words,
    });
    cursor += speechDur;
    const hold = Math.max(0, visualDur - speechDur);
    if (hold > 0.02) {
      // Placeholder silence region — stitchWorkspaceDialogue / continuous builder honor gaps via startSec.
      cursor += hold;
    }
  }
  return out;
}

/**
 * Workspace dialogue — sequential PCM concat with silence gaps.
 * Avoids MP3 encoder padding bleeding between exchange clips.
 */
export async function stitchWorkspaceDialogue(
  clips: WorkspaceVoClip[],
  wordsByExchange: TimedWord[][] | undefined,
  exchanges: ExchangeGapHint[] | undefined,
  totalSec: number,
  sampleRate = 48000,
): Promise<Blob | undefined> {
  const indexed = clips
    .map((clip, order) => ({ clip, order }))
    .filter(({ clip }) => !!clip.audioBase64)
    .sort((a, b) => {
      const ai = clipExchangeIndex(a.clip, a.order);
      const bi = clipExchangeIndex(b.clip, b.order);
      return ai !== bi ? ai - bi : a.order - b.order;
    });
  if (indexed.length === 0 || totalSec <= 0) return undefined;

  const decodeCtx = new OfflineAudioContext(1, 1, sampleRate);
  const parts: AudioBuffer[] = [];

  for (const { clip, order } of indexed) {
    const exIdx = clipExchangeIndex(clip, order);
    const gap = workspaceExchangeGapSec(exchanges, exIdx);
    if (gap > 0) parts.push(silenceBuffer(gap, sampleRate));

    try {
      const decoded = await decodeCtx.decodeAudioData(
        (await base64ToBlob(clip.audioBase64).arrayBuffer()).slice(0),
      );
      const words = wordsByExchange?.[exIdx] ?? normalizeWordTimestamps(clip.words);
      const speechDur = speechTrimSecFromWords(words, clip.durationSec ?? 2);
      const speechEnd = originalSpeechEndSec(words, speechDur);
      const transTail = computeTranslationRevealTail(
        (exchanges as Array<{ translation?: string }> | undefined)?.[exIdx]?.translation ?? "",
      );
      const visualDur = Math.max(speechDur, speechEnd + transTail);
      parts.push(trimBufferToSpeechWindow(decoded, words, clip.durationSec ?? 2));
      const hold = Math.max(0, visualDur - speechDur);
      if (hold > 0.02) parts.push(silenceBuffer(hold, sampleRate));
    } catch {
      /* skip bad clip */
    }
  }

  if (parts.length === 0) return undefined;
  const merged = concatMonoBuffers(parts, sampleRate);
  const targetLen = Math.max(1, Math.ceil(totalSec * sampleRate));
  const out = new AudioBuffer({ length: targetLen, numberOfChannels: 1, sampleRate });
  const dst = out.getChannelData(0);
  const src = merged.getChannelData(0);
  const copyLen = Math.min(targetLen, src.length);
  for (let i = 0; i < copyLen; i++) dst[i] = src[i]!;
  return audioBufferToWav(out);
}
