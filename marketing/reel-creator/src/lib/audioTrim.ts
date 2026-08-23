/** Trim decoded TTS to spoken word window — strips MP3 lead-in/tail garbage between clips. */

import type { TimedWord } from "@/lib/kineticCaptions";

export function speechWindowSec(
  words: TimedWord[],
  decodedDurationSec: number,
  fallbackSec = 2,
): { startSec: number; endSec: number } {
  if (words.length > 0) {
    const startSec = Math.max(0, words[0]!.start - 0.012);
    const endSec = Math.min(decodedDurationSec, words[words.length - 1]!.end + 0.04);
    return { startSec, endSec: Math.max(startSec + 0.08, endSec) };
  }
  const endSec = Math.min(decodedDurationSec, Math.max(0.35, fallbackSec));
  return { startSec: 0, endSec };
}

/** Copy only the spoken samples — never pass full MP3 decode to the stitcher. */
export function trimBufferToSpeechWindow(
  decoded: AudioBuffer,
  words: TimedWord[],
  fallbackSec = 2,
): AudioBuffer {
  const { startSec, endSec } = speechWindowSec(words, decoded.duration, fallbackSec);
  const rate = decoded.sampleRate;
  const startSample = Math.min(decoded.length, Math.floor(startSec * rate));
  const endSample = Math.min(decoded.length, Math.max(startSample + 1, Math.ceil(endSec * rate)));
  const len = endSample - startSample;
  const out = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: rate });
  const src = decoded.getChannelData(0);
  const dst = out.getChannelData(0);
  for (let i = 0; i < len; i++) dst[i] = src[startSample + i] ?? 0;

  const fadeIn = Math.min(len, Math.floor(0.008 * rate));
  const fadeOut = Math.min(len, Math.floor(0.025 * rate));
  for (let i = 0; i < fadeIn; i++) dst[i]! *= (i + 1) / fadeIn;
  for (let i = 0; i < fadeOut; i++) dst[len - 1 - i]! *= (i + 1) / fadeOut;
  return out;
}

export function concatMonoBuffers(buffers: AudioBuffer[], sampleRate: number): AudioBuffer {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: 1, sampleRate });
  const dst = out.getChannelData(0);
  let offset = 0;
  for (const buf of buffers) {
    const src = buf.getChannelData(0);
    for (let i = 0; i < src.length; i++) dst[offset + i] = src[i]!;
    offset += src.length;
  }
  return out;
}

export function silenceBuffer(durationSec: number, sampleRate: number): AudioBuffer {
  const len = Math.max(1, Math.ceil(durationSec * sampleRate));
  return new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate });
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
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
