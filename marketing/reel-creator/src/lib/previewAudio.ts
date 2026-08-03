/** One-shot preview of a music bed or brand sting (before Generate VO / export). */

let previewCtx: AudioContext | null = null;
let previewSource: AudioBufferSourceNode | null = null;
let previewGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!previewCtx) previewCtx = new AudioContext();
  return previewCtx;
}

export function stopAudioPreview() {
  try {
    previewSource?.stop();
  } catch {
    /* already stopped */
  }
  previewSource = null;
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
  const buf = await ctx.decodeAudioData((await res.arrayBuffer()).slice(0));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = Boolean(opts?.loop);
  const g = ctx.createGain();
  g.gain.value = opts?.gain ?? 0.55;
  src.connect(g);
  g.connect(ctx.destination);
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
