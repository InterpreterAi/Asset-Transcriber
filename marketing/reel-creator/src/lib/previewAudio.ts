/** One-shot preview of a music bed or brand sting (before Generate VO / export). */

import { createMasterChain, normalizeAudioBuffer } from "@/lib/audioNormalize";

let previewCtx: AudioContext | null = null;
let previewMaster: GainNode | null = null;
let previewSource: AudioBufferSourceNode | null = null;
let previewGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!previewCtx) previewCtx = new AudioContext();
  return previewCtx;
}

function getMaster(): GainNode {
  const ctx = getCtx();
  if (!previewMaster) {
    previewMaster = createMasterChain(ctx).input;
  }
  return previewMaster;
}

export function stopAudioPreview() {
  try {
    previewSource?.stop();
  } catch {
    /* already stopped */
  }
  previewSource = null;
}

/** Live-update gain while a preview is playing. */
export function setPreviewGain(gain: number) {
  if (previewGain) previewGain.gain.value = Math.max(0, Math.min(1.5, gain));
}

export async function previewAudioUrl(
  url: string,
  opts?: { gain?: number; loop?: boolean },
): Promise<void> {
  stopAudioPreview();
  const ctx = getCtx();
  await ctx.resume();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load audio (${res.status})`);
  const decoded = await ctx.decodeAudioData((await res.arrayBuffer()).slice(0));
  const buf = normalizeAudioBuffer(decoded);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = Boolean(opts?.loop);
  const g = ctx.createGain();
  g.gain.value = opts?.gain ?? 0.55;
  src.connect(g);
  g.connect(getMaster());
  previewSource = src;
  previewGain = g;
  src.onended = () => {
    if (previewSource === src) previewSource = null;
  };
  src.start(0);
}

export function isPreviewPlaying(): boolean {
  return previewSource != null;
}

export { previewGain };
