/**
 * Clean audio helpers: attenuate-only peak safety + soft-clip master bus.
 * Avoids dual DynamicsCompressor pumping that made previews sound fuzzy.
 */

/** Ceiling for peaks (−3 dBFS). We only turn DOWN hot audio — never boost noise. */
export const TARGET_PEAK_DB = -3;
export const TARGET_PEAK_LINEAR = Math.pow(10, TARGET_PEAK_DB / 20); // ≈ 0.7079

/**
 * Attenuate peaks above `peakDb`. Quiet buffers are left untouched
 * (boosting them was amplifying hiss / procedural noise → fuzzy sound).
 */
export function normalizeAudioBuffer(buffer: AudioBuffer, peakDb = TARGET_PEAK_DB): AudioBuffer {
  const peakLinear = Math.pow(10, peakDb / 20);
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]!);
      if (a > max) max = a;
    }
  }
  if (max < 1e-8 || max <= peakLinear) return buffer;
  const scale = peakLinear / max;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i]! *= scale;
    }
  }
  return buffer;
}

/** Soft-knee tanh clip curve — transparent until near full scale. */
function makeSoftClipCurve(samples = 2048): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    // Gentle: linear in the middle, soft fold near ±1
    curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15);
  }
  return curve;
}

/**
 * Master bus: light makeup gain + soft clip (oversampled) → destination.
 * No DynamicsCompressor — those were pumping and muddying every preview.
 */
export function createMasterChain(ctx: BaseAudioContext): {
  input: GainNode;
  shaper: WaveShaperNode;
} {
  const input = ctx.createGain();
  // Slight headroom so summed VO+BGM doesn't slam 0 dBFS
  input.gain.value = 0.85;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftClipCurve() as unknown as Float32Array<ArrayBuffer>;
  shaper.oversample = "4x";

  input.connect(shaper);
  shaper.connect(ctx.destination);

  return { input, shaper };
}
