/**
 * Focused Creative Studio — fixed 35-second reel model + generate API client.
 * Timeline: intro 2s → hook 8s → workspace (fills) → outro (5–12s config).
 */

import { clampOutroDuration } from "@/lib/outroConfig";
import { normalizeWordTimestamps, type TimedWord } from "@/lib/kineticCaptions";

export const REEL_TOTAL_SEC = 35;
export const REEL_INTRO_SEC = 2;
export const REEL_HOOK_SEC = 8;
/** Workspace animation phases are authored on a 15s base and scaled. */
export const WORKSPACE_BASE_SEC = 15;

export type GeneratedSegmentId = "intro" | "hook" | "workspace" | "outro";

export type GeneratedSegment = {
  id: GeneratedSegmentId;
  start: number;
  end: number;
};

export function workspaceSecFor(outroDurationSec: number): number {
  return REEL_TOTAL_SEC - REEL_INTRO_SEC - REEL_HOOK_SEC - clampOutroDuration(outroDurationSec);
}

/** Fixed 35s timeline for a given outro duration. */
export function buildGeneratedSegments(outroDurationSec: number): GeneratedSegment[] {
  const outro = clampOutroDuration(outroDurationSec);
  const workspace = workspaceSecFor(outro);
  const hookEnd = REEL_INTRO_SEC + REEL_HOOK_SEC;
  const workspaceEnd = hookEnd + workspace;
  return [
    { id: "intro", start: 0, end: REEL_INTRO_SEC },
    { id: "hook", start: REEL_INTRO_SEC, end: hookEnd },
    { id: "workspace", start: hookEnd, end: workspaceEnd },
    { id: "outro", start: workspaceEnd, end: REEL_TOTAL_SEC },
  ];
}

export type WorkspaceScript = {
  speakerA: string[];
  speakerB: string[];
};

export type GeneratedStoryboard = {
  hookScript: string;
  hookScenes: string[];
  workspaceScript: WorkspaceScript;
  outroVoiceover: string;
};

export type ProviderStatus = Record<string, string>;

export type GeneratedReelResult = {
  prompt: string;
  language: string;
  series: string;
  /** Localized storyboard (equals storyboardEn when language is en). */
  storyboard: GeneratedStoryboard;
  /** Original English copy — preserved so switching back to en restores it. */
  storyboardEn: GeneratedStoryboard;
  footageUrls: string[];
  audioBase64: string | null;
  words: TimedWord[];
  outroAudioBase64: string | null;
  outroWords: TimedWord[];
  providerStatus: ProviderStatus;
  createdAt: number;
};

function apiHeaders(): HeadersInit {
  const key = import.meta.env.VITE_REEL_BUILDER_API_KEY as string | undefined;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h["x-reel-builder-key"] = key;
  return h;
}

function normalizeStoryboard(raw: unknown): GeneratedStoryboard {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ws = (r.workspaceScript && typeof r.workspaceScript === "object"
    ? r.workspaceScript
    : {}) as Record<string, unknown>;
  const lines = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  return {
    hookScript: String(r.hookScript ?? "").trim(),
    hookScenes: lines(r.hookScenes),
    workspaceScript: {
      speakerA: lines(ws.speakerA),
      speakerB: lines(ws.speakerB),
    },
    outroVoiceover: String(r.outroVoiceover ?? "").trim(),
  };
}

/** POST /api/reel-builder/generate — validates + normalizes the response. */
export async function generateReel(body: {
  prompt: string;
  language: string;
  series: string;
  outroVoiceover?: string;
}): Promise<GeneratedReelResult> {
  const res = await fetch("/api/reel-builder/generate", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const hint =
      res.status === 500 && !err.error
        ? " — API server not reachable on :8787 (restart api-server)"
        : "";
    throw new Error((err.error || `Generate failed (${res.status})`) + hint);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const storyboard = normalizeStoryboard(data.storyboard);
  if (!storyboard.hookScript) {
    throw new Error("Generate API returned an empty storyboard");
  }
  const storyboardEn = data.storyboardEn ? normalizeStoryboard(data.storyboardEn) : storyboard;
  return {
    prompt: String(data.prompt ?? body.prompt),
    language: String(data.language ?? body.language),
    series: String(data.series ?? body.series),
    storyboard,
    storyboardEn,
    footageUrls: Array.isArray(data.footageUrls)
      ? data.footageUrls.map(String).filter((u) => /^https?:\/\//.test(u))
      : [],
    audioBase64: typeof data.audioBase64 === "string" && data.audioBase64 ? data.audioBase64 : null,
    words: normalizeWordTimestamps(
      data.words as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    outroAudioBase64:
      typeof data.outroAudioBase64 === "string" && data.outroAudioBase64
        ? data.outroAudioBase64
        : null,
    outroWords: normalizeWordTimestamps(
      data.outroWords as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    providerStatus:
      data.providerStatus && typeof data.providerStatus === "object"
        ? (data.providerStatus as ProviderStatus)
        : {},
    createdAt: Date.now(),
  };
}

export function base64ToBlob(b64: string, mimeType = "audio/mpeg"): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Segment lengths are fixed (35s total) — if a voiceover runs longer than its
 * segment, trim it with a short fade-out so it never bleeds into the next one.
 */
export async function trimBlobToDuration(
  blob: Blob,
  maxSec: number,
  fadeSec = 0.35,
): Promise<Blob> {
  if (!blob || blob.size === 0 || maxSec <= 0) return blob;
  try {
    const probe = new AudioContext();
    const decoded = await probe.decodeAudioData((await blob.arrayBuffer()).slice(0));
    void probe.close();
    if (decoded.duration <= maxSec + 0.05) return blob;

    const rate = decoded.sampleRate;
    const samples = Math.floor(maxSec * rate);
    const offline = new OfflineAudioContext(1, samples, rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    const gain = offline.createGain();
    gain.gain.setValueAtTime(1, 0);
    gain.gain.setValueAtTime(1, Math.max(0, maxSec - fadeSec));
    gain.gain.linearRampToValueAtTime(0, maxSec);
    src.connect(gain);
    gain.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  } catch {
    return blob;
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
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
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
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
