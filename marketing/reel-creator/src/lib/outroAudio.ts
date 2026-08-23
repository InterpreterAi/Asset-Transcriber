/**
 * Canonical approved English outro audio + fit/pad helpers for the fixed 10s outro.
 */

import { REEL_OUTRO_SEC } from "@/lib/generatedReel";
import { base64ToBlob } from "@/lib/generatedReel";

export const CANONICAL_OUTRO_AUDIO_URL = "/brand/universal-outro-vo-en.m4a";

let cachedCanonical: Blob | null = null;

/** Load the extracted approved-outro.mp4 audio track (English, reused every reel). */
export async function loadCanonicalOutroAudio(): Promise<Blob | null> {
  if (cachedCanonical) return cachedCanonical;
  try {
    const res = await fetch(CANONICAL_OUTRO_AUDIO_URL);
    if (!res.ok) return null;
    cachedCanonical = await res.blob();
    return cachedCanonical;
  } catch {
    return null;
  }
}

/** Fit audio into exactly `targetSec` — trim with fade or pad silence, never time-stretch. */
export async function fitAudioToDuration(
  blob: Blob,
  targetSec: number,
  fadeSec = 0.25,
): Promise<Blob> {
  if (!blob || blob.size === 0 || targetSec <= 0) return blob;
  try {
    const probe = new AudioContext();
    const decoded = await probe.decodeAudioData((await blob.arrayBuffer()).slice(0));
    void probe.close();

    const rate = decoded.sampleRate;
    const ch = decoded.numberOfChannels;
    const dur = decoded.duration;

    if (dur > targetSec + 0.05) {
      const samples = Math.floor(targetSec * rate);
      const offline = new OfflineAudioContext(ch, samples, rate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      const gain = offline.createGain();
      gain.gain.setValueAtTime(1, 0);
      gain.gain.setValueAtTime(1, Math.max(0, targetSec - fadeSec));
      gain.gain.linearRampToValueAtTime(0, targetSec);
      src.connect(gain);
      gain.connect(offline.destination);
      src.start(0);
      return audioBufferToWav(await offline.startRendering());
    }

    if (dur < targetSec - 0.05) {
      const padSamples = Math.floor((targetSec - dur) * rate);
      const total = decoded.length + padSamples;
      const offline = new OfflineAudioContext(ch, total, rate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0);
      return audioBufferToWav(await offline.startRendering());
    }

    return blob;
  } catch {
    return blob;
  }
}

export async function resolveOutroAudioBlob(opts: {
  language: string;
  translatedBase64: string | null;
  durationSec?: number;
  /** When set, TTS this script instead of canonical English. */
  voiceoverText?: string;
  phraseGapSec?: number;
}): Promise<Blob | undefined> {
  const target = opts.durationSec ?? REEL_OUTRO_SEC;
  if (opts.translatedBase64) {
    const blob = base64ToBlob(opts.translatedBase64);
    return fitAudioToDuration(blob, target);
  }
  return undefined;
}

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
