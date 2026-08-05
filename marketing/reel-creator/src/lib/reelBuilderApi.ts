/** Client for isolated `/api/reel-builder/*` (translate + TTS). Never hits Soniox. */

import { VO_TRAILING_SILENCE_SEC } from "@/lib/timeline";
import {
  estimateTimedWords,
  normalizeWordTimestamps,
  scaleWordsToDuration,
  type TimedWord,
} from "@/lib/kineticCaptions";
import {
  buildLockedOutroVoiceParts,
  lockedOutroVoiceText,
  prepareLockedOutroAudio,
  stitchLockedOutroSpeech,
} from "@/lib/universalBrandOutro";

function apiHeaders(): HeadersInit {
  const key = import.meta.env.VITE_REEL_BUILDER_API_KEY as string | undefined;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h["x-reel-builder-key"] = key;
  return h;
}

export type TranslateResult = {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions: string;
  outroLine1: string;
  outroLine2: string;
  /** Localized "Start Your Free Trial" */
  outroCtaHeadline: string;
  /** Full locked outro VO narration (domain stays app.interpreterai.org) */
  outroVoiceover: string;
  targetLanguage: string;
};

export type ScriptVariation = {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions: string;
  framework?: string;
};

export type SaaSScriptResult = {
  framework: string;
  frameworkLabel: string;
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions: string;
  targetLanguage: string;
};

export type ScriptFrameworkId = "pov_pain" | "us_vs_them" | "shocking_stat" | "auto";

/** Creative Studio — GPT storyboard that feeds the existing Reel Builder pipeline. */
export async function generateStoryboardPackage(body: {
  campaignId: string;
  campaignName: string;
  campaignBrief: string;
  /** Single creative prompt — only user text input in Studio. */
  commercialBrief: string;
  templateId: string;
  framework?: string;
  language?: string;
  voiceId?: string;
}): Promise<import("@/lib/storyboard").StoryboardPackage> {
  const { normalizePackage, buildLocalStoryboard, CAMPAIGNS, TEMPLATES } =
    await import("@/lib/storyboard");

  if (!body.commercialBrief?.trim()) {
    throw new Error(
      "Commercial Brief is required — write an idea or paste a full script to control the commercial.",
    );
  }

  try {
    const res = await fetch("/api/reel-builder/storyboard", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as import("@/lib/storyboard").StoryboardPackage;
      return normalizePackage({
        ...data,
        commercialBrief: data.commercialBrief || body.commercialBrief,
      });
    }
  } catch {
    /* fall through to local engine */
  }

  const campaign =
    CAMPAIGNS.find((c) => c.id === body.campaignId) || {
      id: body.campaignId,
      name: body.campaignName,
      brief: body.campaignBrief || body.commercialBrief,
      mood: "Premium SaaS",
    };
  const template =
    TEMPLATES.find((t) => t.id === body.templateId) || TEMPLATES[0]!;
  return buildLocalStoryboard({
    campaign,
    template,
    commercialBrief: body.commercialBrief.trim(),
    language: body.language,
    voiceId: body.voiceId,
  });
}

/** High-converting SaaS ad script (POV / Us vs Them / Shocking Stat). */
export async function generateSaaSScript(body: {
  framework?: ScriptFrameworkId | string;
  topic?: string;
  series?: string;
  targetLanguage?: string;
  hook?: string;
  problem?: string;
  solution?: string;
  result?: string;
}): Promise<SaaSScriptResult> {
  const res = await fetch("/api/reel-builder/script", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Script generate failed (${res.status})`);
  }
  const data = (await res.json()) as SaaSScriptResult;
  if (!data || typeof data !== "object") {
    throw new Error("Script API returned invalid JSON");
  }
  return {
    framework: data.framework || "pov_pain",
    frameworkLabel: data.frameworkLabel || "Generated",
    hook: String(data.hook ?? "").trim(),
    problem: String(data.problem ?? "").trim(),
    solution: String(data.solution ?? "").trim(),
    result: String(data.result ?? "").trim(),
    captions: String(data.captions ?? "").trim(),
    targetLanguage: data.targetLanguage || body.targetLanguage || "en",
  };
}

export async function translateReelScript(body: {
  targetLanguage: string;
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions?: string;
}): Promise<TranslateResult> {
  const res = await fetch("/api/reel-builder/translate", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Translate failed (${res.status})`);
  }
  return res.json() as Promise<TranslateResult>;
}

/** Ask OpenAI (via reel-builder) for N alternate scripts for batch social posting. */
export async function generateScriptVariations(body: {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions?: string;
  count?: number;
}): Promise<ScriptVariation[]> {
  const res = await fetch("/api/reel-builder/variations", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ ...body, count: body.count ?? 3 }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Variations failed (${res.status})`);
  }
  const data = (await res.json()) as { variations?: ScriptVariation[] };
  return data.variations ?? [];
}

/** Append trailing silence so VO never clips early (WAV out — mixer decodes fine). */
export async function appendTrailingSilence(
  blob: Blob,
  silenceSec = VO_TRAILING_SILENCE_SEC,
): Promise<Blob> {
  if (!blob || blob.size === 0 || silenceSec <= 0) return blob;
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const sr = decoded.sampleRate;
    const silenceSamples = Math.ceil(silenceSec * sr);
    const total = decoded.length + silenceSamples;
    const offline = new OfflineAudioContext(1, total, sr);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  } catch {
    return blob;
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * 2;
  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

export type SynthesizedVoiceover = {
  blob: Blob;
  words: TimedWord[];
  /** Speech duration before trailing silence. */
  speechDuration: number;
  provider?: string;
};

function b64ToBlob(b64: string, mimeType: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "audio/mpeg" });
}

/**
 * TTS with word-level timestamps (ElevenLabs alignment when available).
 * Always requests JSON `{ audioBase64, words }` from `/api/reel-builder/tts`.
 */
export async function synthesizeVoiceover(
  text: string,
  voice: string,
  speed = 1,
): Promise<SynthesizedVoiceover> {
  const res = await fetch("/api/reel-builder/tts", {
    method: "POST",
    headers: {
      ...apiHeaders(),
      Accept: "application/json",
    },
    body: JSON.stringify({ text, voice, speed, withTimestamps: true }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const hint =
      res.status === 500 && !err.error
        ? " — API server not reachable on :8787 (restart api-server)"
        : "";
    throw new Error((err.error || `TTS failed (${res.status})`) + hint);
  }

  const contentType = res.headers.get("content-type") || "";
  let rawBlob: Blob;
  let words: TimedWord[] = [];
  let provider: string | undefined;

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as {
      audioBase64?: string;
      mimeType?: string;
      words?: Array<{ word: string; start: number; end: number }>;
      word_timestamps?: Array<{ word: string; start: number; end: number }>;
      provider?: string;
    };
    if (!data.audioBase64) throw new Error("TTS response missing audioBase64");
    rawBlob = b64ToBlob(data.audioBase64, data.mimeType || "audio/mpeg");
    words = normalizeWordTimestamps(data.words ?? data.word_timestamps);
    provider = data.provider;
  } else {
    rawBlob = await res.blob();
    const header = res.headers.get("X-Reel-Word-Timestamps");
    if (header) {
      try {
        words = normalizeWordTimestamps(JSON.parse(decodeURIComponent(header)) as Array<{ word: string; start: number; end: number }>);
      } catch {
        words = [];
      }
    }
  }

  const speechDuration = await measureBlobDuration(rawBlob);
  if (words.length === 0) {
    words = estimateTimedWords(text, Math.max(0.4, speechDuration));
  } else if (provider === "openai" && speechDuration > 0.2) {
    words = scaleWordsToDuration(words, speechDuration);
  } else if (speechDuration > 0.2) {
    const lastEnd = words[words.length - 1]?.end ?? 0;
    // If alignment ends far from decoded length, gentle rescale (clock skew / encode)
    if (lastEnd > 0.1 && Math.abs(lastEnd - speechDuration) / speechDuration > 0.12) {
      words = scaleWordsToDuration(words, speechDuration);
    }
  }

  const blob = await appendTrailingSilence(rawBlob, VO_TRAILING_SILENCE_SEC);
  return { blob, words, speechDuration, provider };
}

async function fetchTtsRaw(
  text: string,
  voice: string,
  opts?: { speed?: number; pacing?: "brand" },
): Promise<{ blob: Blob; words: TimedWord[]; provider?: string }> {
  const res = await fetch("/api/reel-builder/tts", {
    method: "POST",
    headers: { ...apiHeaders(), Accept: "application/json" },
    body: JSON.stringify({
      text,
      voice,
      speed: opts?.speed ?? 1,
      pacing: opts?.pacing,
      withTimestamps: true,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const hint =
      res.status === 500 && !err.error
        ? " — API server not reachable on :8787 (restart api-server)"
        : "";
    throw new Error((err.error || `TTS failed (${res.status})`) + hint);
  }
  const data = (await res.json()) as {
    audioBase64?: string;
    mimeType?: string;
    words?: Array<{ word: string; start: number; end: number }>;
    provider?: string;
  };
  if (!data.audioBase64) throw new Error("TTS missing audio");
  return {
    blob: b64ToBlob(data.audioBase64, data.mimeType || "audio/mpeg"),
    words: normalizeWordTimestamps(data.words ?? []),
    provider: data.provider,
  };
}

/**
 * Locked Universal Brand Outro VO — natural 1.0× brand pacing:
 * brand + slogan → real silence → Supports + CTA (no rushed single take).
 */
export async function synthesizeLockedOutroVoiceover(
  text: string,
  voice: string,
): Promise<SynthesizedVoiceover> {
  const spoken = lockedOutroVoiceText({ voiceover: text });
  // Always: "InterpreterAI…" first; always end on "Start your free trial now." (no URL).
  const { brandSlogan, payoff } = buildLockedOutroVoiceParts(
    spoken.match(/Stay focused on the conversation[.!]?/i)?.[0],
    spoken.match(/We(?:'ll| will) handle the (?:rest|words)[.!]?/i)?.[0],
  );

  const [a, b] = await Promise.all([
    fetchTtsRaw(brandSlogan, voice, { speed: 1, pacing: "brand" }),
    fetchTtsRaw(payoff, voice, { speed: 1, pacing: "brand" }),
  ]);

  const stitched = await stitchLockedOutroSpeech(a.blob, b.blob);
  const blob = await prepareLockedOutroAudio(stitched);
  const speechDuration = await measureBlobDuration(blob);
  const fullText = `${brandSlogan} ${payoff}`.trim();
  let words = [...a.words, ...b.words];
  if (words.length === 0) {
    words = estimateTimedWords(fullText, Math.max(0.4, speechDuration));
  }
  return {
    blob,
    words,
    speechDuration,
    provider: a.provider || b.provider,
  };
}

export type VoiceoverPack = {
  hook: SynthesizedVoiceover;
  problem: SynthesizedVoiceover;
  solution: SynthesizedVoiceover;
  result: SynthesizedVoiceover;
  outro?: SynthesizedVoiceover;
};

export async function generateSegmentVoiceovers(
  texts: { hook: string; problem: string; solution: string; result: string; outro?: string },
  voice: string,
  speed = 1,
  onProgress?: (label: string) => void,
): Promise<VoiceoverPack> {
  const empty = (): SynthesizedVoiceover => ({
    blob: new Blob([], { type: "audio/mpeg" }),
    words: [],
    speechDuration: 0,
  });
  const run = async (label: string, text: string) => {
    onProgress?.(label);
    if (!text.trim()) return empty();
    return synthesizeVoiceover(text, voice, speed);
  };
  const hook = await run("hook", texts.hook);
  const problem = await run("problem", texts.problem);
  const solution = await run("solution", texts.solution);
  const result = await run("result", texts.result);
  let outro: SynthesizedVoiceover | undefined;
  if (texts.outro?.trim()) {
    onProgress?.("outro");
    outro = await synthesizeLockedOutroVoiceover(texts.outro, voice);
  }
  return { hook, problem, solution, result, outro };
}

/** Blob map for the audio mixer / MP4 export. */
export function voiceoverBlobs(pack: Partial<VoiceoverPack> | null | undefined): {
  hook?: Blob;
  problem?: Blob;
  solution?: Blob;
  result?: Blob;
  outro?: Blob;
} {
  if (!pack) return {};
  return {
    hook: pack.hook?.blob,
    problem: pack.problem?.blob,
    solution: pack.solution?.blob,
    result: pack.result?.blob,
    outro: pack.outro?.blob,
  };
}

export async function measureBlobDuration(blob: Blob | undefined | null): Promise<number> {
  if (!blob || blob.size === 0) return 0;
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
