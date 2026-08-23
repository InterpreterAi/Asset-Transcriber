/**
 * InterpreterAI Universal Brand Outro — fixed 5s deterministic composition.
 * Visual layers use a locked timeline; VO subtitles sync separately.
 */

import {
  INTERPRETER_AI_OUTRO_COPY,
  INTERPRETER_AI_OUTRO_VO,
} from "@/lib/interpreterAIOutro/lockedCopy";
import { INTERPRETER_AI_OUTRO_DURATION_SEC } from "@/lib/interpreterAIOutro/timeline";

/** Fixed visual composition length (seconds). Segment may extend for longer VO. */
export const CANONICAL_OUTRO_DURATION_SEC = INTERPRETER_AI_OUTRO_DURATION_SEC;
export const LOCKED_OUTRO_MIN_SEC = CANONICAL_OUTRO_DURATION_SEC;
export const LOCKED_OUTRO_FADE_BLACK_SEC = 0.35;
/** Hold CTA / URL on screen after VO ends before fade — premium SaaS outro pacing. */
export const OUTRO_POST_VO_HOLD_SEC = 1.0;
/** No lead silence — logo establishes brand visually first. */
export const LOCKED_OUTRO_VO_DELAY_SEC = 0;
/** No artificial pause between slogan and payoff. */
export const LOCKED_OUTRO_SLOGAN_PAUSE_SEC = 0;
/** No artificial tail pad — punctuation + TTS handle pacing. */
export const LOCKED_OUTRO_TAIL_PAD_SEC = 0;
/** @deprecated */
export const LOCKED_OUTRO_STING_AT_SEC = -1;
/** @deprecated */
export const LOCKED_OUTRO_DURATION_SEC = LOCKED_OUTRO_MIN_SEC;

/**
 * Never translate brand name in slogan layers.
 * QR/link may still resolve to the working app URL.
 */
export const BRAND_LOCKED = {
  name: "InterpreterAI",
  domain: "app.interpreterai.org",
  url: "https://app.interpreterai.org",
  /** On-screen URL in the fixed outro composition. */
  displayUrl: INTERPRETER_AI_OUTRO_COPY.urlFull,
  qrSrc: "/brand/interpreterai-org-qr.png",
  brandIconSrc: "/brand/outro-brand-icon.png?v=1",
  brandLockupSrc: "/brand/outro-brand-lockup.png?v=2",
  /** Approved 1080×1920 reference outro plate — exact brand design. */
  outroPlateSrc: "/brand/interpreterai-outro-plate.png?v=2",
  masterVideo: "/brand/approved-outro.mp4",
  masterStill: "/brand/interpreterai-outro-plate.png?v=2",
  masterBackground: "/brand/interpreterai-outro-plate.png?v=2",
  canonicalAudio: "/brand/universal-outro-vo-en.m4a",
} as const;

/** English source of truth — locked on-screen strings; do not edit in reel builder. */
export const UNIVERSAL_OUTRO_EN = {
  line1: INTERPRETER_AI_OUTRO_COPY.tagline1,
  line2: INTERPRETER_AI_OUTRO_COPY.tagline2,
  languagesLine: INTERPRETER_AI_OUTRO_COPY.languages,
  ctaHeadline: INTERPRETER_AI_OUTRO_COPY.cta,
  ctaSubline: INTERPRETER_AI_OUTRO_COPY.ctaSub,
  ctaVoice: "Start your free trial today.",
  urlVoice: "",
  badges: ["Live Transcription", "AI Translation", "62 Languages"] as const,
} as const;

export type UniversalOutroCopy = {
  line1: string;
  line2: string;
  ctaHeadline: string;
  languagesLine?: string;
  ctaSubline?: string;
  voiceover: string;
};

export const DEFAULT_OUTRO_SLOGAN = {
  line1: UNIVERSAL_OUTRO_EN.line1,
  line2: UNIVERSAL_OUTRO_EN.line2,
  ctaHeadline: UNIVERSAL_OUTRO_EN.ctaHeadline,
} as const;

function normalizeSloganLines(line1?: string, line2?: string) {
  const a = (line1 || UNIVERSAL_OUTRO_EN.line1).trim().replace(/[.!?]*$/, ".");
  let b = (line2 || UNIVERSAL_OUTRO_EN.line2).trim().replace(/[.!?]*$/, ".");
  b = b
    .replace(/\b[Ww]e will\b/g, "We'll")
    .replace(/\bhandle the rest\b/gi, "handle the words");
  return { a, b };
}

/**
 * Canonical full outro VO — locked script for every reel.
 */
export function buildCanonicalOutroVoiceover(_line1?: string, _line2?: string): string {
  return INTERPRETER_AI_OUTRO_VO;
}

/** @deprecated Use buildCanonicalOutroVoiceover */
export function buildLockedOutroVoiceover(line1?: string, line2?: string): string {
  return buildCanonicalOutroVoiceover(line1, line2);
}

/** @deprecated Single-pass TTS — parts kept for legacy callers. */
export function buildLockedOutroVoiceParts(
  line1?: string,
  line2?: string,
): { brandSlogan: string; payoff: string } {
  const full = buildCanonicalOutroVoiceover(line1, line2);
  const phrases = full.split(/(?<=[.!?])\s+/).filter(Boolean);
  const brandSlogan = phrases.slice(0, 2).join(" ").trim();
  const payoff = phrases.slice(2).join(" ").trim();
  return { brandSlogan, payoff };
}

/** Always returns the complete canonical script. */
export function lockedOutroVoiceText(copy?: Partial<UniversalOutroCopy>): string {
  if (copy?.line1 || copy?.line2 || !copy?.voiceover?.trim()) {
    return buildCanonicalOutroVoiceover(copy?.line1, copy?.line2);
  }
  return normalizeOutroVoiceover(copy.voiceover);
}

export function normalizeOutroVoiceover(raw: string): string {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return buildCanonicalOutroVoiceover();
  return v;
}

export function defaultOutroVoiceText(line1?: string, line2?: string): string {
  return buildCanonicalOutroVoiceover(line1, line2);
}

/** Outro segment length from measured speech — no fixed hold unless minHoldSec set. */
export function outroDurationForVoSec(voSec: number, minHoldSec = 0): number {
  const speech = Math.max(0, voSec);
  const tail = OUTRO_POST_VO_HOLD_SEC + LOCKED_OUTRO_FADE_BLACK_SEC;
  if (minHoldSec > 0) {
    return Math.max(minHoldSec, speech + tail);
  }
  return Math.max(1.5, speech + tail);
}

export function resolveUniversalOutroCopy(_partial?: {
  outroLine1?: string;
  outroLine2?: string;
  ctaHeadline?: string;
  outroVoiceover?: string;
  languagesLine?: string;
  ctaSubline?: string;
}): UniversalOutroCopy {
  return {
    line1: UNIVERSAL_OUTRO_EN.line1,
    line2: UNIVERSAL_OUTRO_EN.line2,
    ctaHeadline: UNIVERSAL_OUTRO_EN.ctaHeadline,
    languagesLine: UNIVERSAL_OUTRO_EN.languagesLine,
    ctaSubline: UNIVERSAL_OUTRO_EN.ctaSubline,
    voiceover: INTERPRETER_AI_OUTRO_VO,
  };
}

export function buildStudioOutroCopy(fields: {
  line1: string;
  line2: string;
  ctaHeadline?: string;
  languagesLine?: string;
  voiceover: string;
}): UniversalOutroCopy {
  return resolveUniversalOutroCopy({
    outroLine1: fields.line1,
    outroLine2: fields.line2,
    ctaHeadline: fields.ctaHeadline,
    languagesLine: fields.languagesLine,
    outroVoiceover: fields.voiceover,
  });
}

export function outroScreenCopyIsCustom(
  copy: Pick<UniversalOutroCopy, "line1" | "line2" | "ctaHeadline" | "languagesLine">,
): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?…]+$/g, "");
  return (
    norm(copy.line1.trim()) !== norm(UNIVERSAL_OUTRO_EN.line1) ||
    norm(copy.line2.trim()) !== norm(UNIVERSAL_OUTRO_EN.line2) ||
    norm((copy.ctaHeadline?.trim() ?? UNIVERSAL_OUTRO_EN.ctaHeadline)) !== norm(UNIVERSAL_OUTRO_EN.ctaHeadline) ||
    norm((copy.languagesLine?.trim() ?? UNIVERSAL_OUTRO_EN.languagesLine)) !== norm(UNIVERSAL_OUTRO_EN.languagesLine)
  );
}

export const OUTRO_BEAT_FRACS = {
  logo: 0.02,
  headline: 0.12,
  line2: 0.28,
  badges: 0.42,
  cta: 0.62,
  badgeStaggerSec: 0.12,
} as const;

export const OUTRO_BEATS = {
  open: { start: 0, end: 0.5 },
  headline: { start: 0.65, end: 2.0 },
  badges: { start: 2.3, end: 3.6 },
  cta: { start: 3.6, end: 5.2 },
  badgeStaggerSec: 0.12,
} as const;

/** Minimal tail pad for fade — no lead silence or slogan gap. */
export async function prepareLockedOutroAudio(rawSpeechBlob: Blob): Promise<Blob> {
  if (LOCKED_OUTRO_TAIL_PAD_SEC <= 0.001) return rawSpeechBlob;
  return appendSilence(rawSpeechBlob, LOCKED_OUTRO_TAIL_PAD_SEC);
}

/** @deprecated No longer stitches with pause — returns first blob only. */
export async function stitchLockedOutroSpeech(
  brandSloganBlob: Blob,
  payoffBlob: Blob,
  _pauseSec = LOCKED_OUTRO_SLOGAN_PAUSE_SEC,
): Promise<Blob> {
  if (!payoffBlob || payoffBlob.size === 0) return brandSloganBlob;
  if (!brandSloganBlob || brandSloganBlob.size === 0) return payoffBlob;
  const ctx = new AudioContext();
  try {
    const a = await ctx.decodeAudioData((await brandSloganBlob.arrayBuffer()).slice(0));
    const b = await ctx.decodeAudioData((await payoffBlob.arrayBuffer()).slice(0));
    const rate = a.sampleRate;
    const ch = Math.max(a.numberOfChannels, b.numberOfChannels);
    const total = a.length + b.length;
    const out = ctx.createBuffer(ch, total, rate);
    for (let c = 0; c < ch; c++) {
      const dest = out.getChannelData(c);
      const srcA = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
      const srcB = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      dest.set(srcA, 0);
      dest.set(srcB, a.length);
    }
    return audioBufferToWavBlob(out);
  } finally {
    void ctx.close();
  }
}

async function appendSilence(blob: Blob, silenceSec: number): Promise<Blob> {
  if (silenceSec <= 0.001 || !blob || blob.size === 0) return blob;
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const pad = Math.ceil(silenceSec * buf.sampleRate);
    const out = ctx.createBuffer(buf.numberOfChannels, buf.length + pad, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c), 0);
    }
    return audioBufferToWavBlob(out);
  } finally {
    void ctx.close();
  }
}

export async function prependSilence(blob: Blob, silenceSec: number): Promise<Blob> {
  if (silenceSec <= 0.001 || !blob || blob.size === 0) return blob;
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const pad = Math.ceil(silenceSec * buf.sampleRate);
    const out = ctx.createBuffer(buf.numberOfChannels, pad + buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c), pad);
    }
    return audioBufferToWavBlob(out);
  } finally {
    void ctx.close();
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = samples * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
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

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
