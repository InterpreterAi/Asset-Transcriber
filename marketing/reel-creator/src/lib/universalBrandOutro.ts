/**
 * InterpreterAI Universal Brand Outro — locked brand sequence.
 * Visual plate = approved 3D master. Domain = working app URL only.
 */

/**
 * Minimum visual hold for the full English locked script.
 * Full VO ≈ 8–10s; never cut off “Supports 62 languages” / CTA.
 * Timeline still extends further when measured VO is longer (localized).
 */
export const LOCKED_OUTRO_MIN_SEC = 10.0;
export const LOCKED_OUTRO_FADE_BLACK_SEC = 0.35;
/** Calm open before brand name — commercial pacing. */
export const LOCKED_OUTRO_VO_DELAY_SEC = 0.55;
/** Real silence after slogan before “Supports…” (brand-spot beat). */
export const LOCKED_OUTRO_SLOGAN_PAUSE_SEC = 0.4;
/** Pad after speech so last words never clip into fade-black. */
export const LOCKED_OUTRO_TAIL_PAD_SEC = 0.65;
/** @deprecated */
export const LOCKED_OUTRO_STING_AT_SEC = -1;
/** @deprecated */
export const LOCKED_OUTRO_DURATION_SEC = LOCKED_OUTRO_MIN_SEC;

/**
 * Never translate brand name / domain.
 * Use app.interpreterai.org — InterpreterAI.org does not resolve.
 */
export const BRAND_LOCKED = {
  name: "InterpreterAI",
  domain: "app.interpreterai.org",
  url: "https://app.interpreterai.org",
  displayUrl: "app.interpreterai.org",
  qrSrc: "/brand/interpreterai-org-qr.png",
  /** Approved 3D master plate (Flow) — exact logo look */
  masterVideo: "/brand/universal-outro-master.mp4",
  masterStill: "/brand/universal-outro-plate.png",
} as const;

/** English source of truth — translate slogan/CTA/VO only. */
export const UNIVERSAL_OUTRO_EN = {
  brandSpoken: "InterpreterAI.",
  line1: "Stay focused on the conversation.",
  line2: "We'll handle the words.",
  languagesLine: "Supports 62 languages",
  ctaHeadline: "Start Free Trial",
  /** Risk remover under CTA — keep short. */
  ctaSubline: "7 days free · No credit card",
  ctaVoice: "Start your free trial now.",
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
  brand: UNIVERSAL_OUTRO_EN.brandSpoken,
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

/** Locked VO ending — never speak the URL or anything after this. */
function lockedCtaVoice(): string {
  return UNIVERSAL_OUTRO_EN.ctaVoice;
}

/** Two-part brand script — stitch with silence after the slogan for natural spots. */
export function buildLockedOutroVoiceParts(
  line1?: string,
  line2?: string,
): { brandSlogan: string; payoff: string } {
  const { a, b } = normalizeSloganLines(line1, line2);
  return {
    // Brand name first, plain, every speaker.
    brandSlogan: [UNIVERSAL_OUTRO_EN.brandSpoken, a, b].join(" ").replace(/\s+/g, " ").trim(),
    // Ends on “Start your free trial now.” — nothing after.
    payoff: [`${UNIVERSAL_OUTRO_EN.languagesLine}.`, lockedCtaVoice()]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

/**
 * Canonical full outro VO:
 * InterpreterAI → slogan → Supports 62 languages → Start your free trial now.
 */
export function buildLockedOutroVoiceover(line1?: string, line2?: string): string {
  const { brandSlogan, payoff } = buildLockedOutroVoiceParts(line1, line2);
  return `${brandSlogan} ${payoff}`.replace(/\s+/g, " ").trim();
}

/** Always returns the complete locked script (never a truncated pack line). */
export function lockedOutroVoiceText(copy?: Partial<UniversalOutroCopy>): string {
  // Prefer rebuilding from lines so stale short pack narration cannot drop beats.
  if (copy?.line1 || copy?.line2 || !copy?.voiceover?.trim()) {
    return buildLockedOutroVoiceover(copy?.line1, copy?.line2);
  }
  return normalizeOutroVoiceover(copy.voiceover);
}

export function normalizeOutroVoiceover(raw: string): string {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return buildLockedOutroVoiceover();

  const line1Match = v.match(/Stay focused on the conversation[.!]?/i);
  const line2Match = v.match(/We(?:'ll| will) handle the (?:rest|words)[.!]?/i);

  // Always rebuild — CTA is locked to “…now.” (never URL / never trailing extras).
  return buildLockedOutroVoiceover(
    line1Match?.[0],
    line2Match?.[0]?.replace(/rest/i, "words").replace(/\bwe will\b/i, "We'll"),
  );
}

/** Recommended outro segment length for a VO blob (speech + settle + tail). */
export function outroDurationForVoSec(voSec: number): number {
  const speech = Math.max(0, voSec);
  return Math.max(
    LOCKED_OUTRO_MIN_SEC,
    speech + LOCKED_OUTRO_FADE_BLACK_SEC + 0.15,
  );
}

export function defaultOutroVoiceText(line1?: string, line2?: string): string {
  return lockedOutroVoiceText({ line1, line2 });
}

export function resolveUniversalOutroCopy(partial?: {
  outroLine1?: string;
  outroLine2?: string;
  ctaHeadline?: string;
  outroVoiceover?: string;
  languagesLine?: string;
}): UniversalOutroCopy {
  const line1 = (partial?.outroLine1 || UNIVERSAL_OUTRO_EN.line1).trim();
  let line2 = (partial?.outroLine2 || UNIVERSAL_OUTRO_EN.line2).trim();
  line2 = line2
    .replace(/\bhandle the rest\b/gi, "handle the words")
    .replace(/\b[Ww]e will\b/g, "We'll");
  if (/rest/i.test(line2) && !/words/i.test(line2)) {
    line2 = UNIVERSAL_OUTRO_EN.line2;
  }
  return {
    line1,
    line2,
    ctaHeadline: (partial?.ctaHeadline || UNIVERSAL_OUTRO_EN.ctaHeadline).trim(),
    languagesLine: (partial?.languagesLine || UNIVERSAL_OUTRO_EN.languagesLine).trim(),
    voiceover: lockedOutroVoiceText({
      line1,
      line2,
      voiceover: partial?.outroVoiceover,
    }),
  };
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

export async function prepareLockedOutroAudio(rawSpeechBlob: Blob): Promise<Blob> {
  const withLead = await prependSilence(rawSpeechBlob, LOCKED_OUTRO_VO_DELAY_SEC);
  return appendSilence(withLead, LOCKED_OUTRO_TAIL_PAD_SEC);
}

/** Join brand+slogan → pause → payoff (Supports + CTA). */
export async function stitchLockedOutroSpeech(
  brandSloganBlob: Blob,
  payoffBlob: Blob,
  pauseSec = LOCKED_OUTRO_SLOGAN_PAUSE_SEC,
): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const a = await ctx.decodeAudioData((await brandSloganBlob.arrayBuffer()).slice(0));
    const b = await ctx.decodeAudioData((await payoffBlob.arrayBuffer()).slice(0));
    const rate = a.sampleRate;
    const ch = Math.max(a.numberOfChannels, b.numberOfChannels);
    const gap = Math.max(0, Math.ceil(pauseSec * rate));
    const total = a.length + gap + b.length;
    const out = ctx.createBuffer(ch, total, rate);
    for (let c = 0; c < ch; c++) {
      const dest = out.getChannelData(c);
      const srcA = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
      const srcB = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      dest.set(srcA, 0);
      dest.set(srcB, a.length + gap);
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
