/**
 * AudioWorklet processor — runs in the dedicated audio-rendering thread.
 *
 * Responsibilities:
 *  1. Receive raw PCM in 128-sample quanta from the Web Audio graph.
 *  2. Accumulate samples until we have ~100 ms worth at the native rate.
 *  3. Downsample from native rate → 16 kHz using linear interpolation.
 *  4. Convert to signed 16-bit little-endian PCM.
 *  5. Transfer the ArrayBuffer to the main thread via port.postMessage().
 *
 * The main thread then forwards each chunk to the open Soniox WebSockets.
 *
 * AudioWorklet context globals:
 *   sampleRate  — AudioContext native sample rate (e.g. 48000)
 *   currentTime — current audio context time in seconds
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._targetRate = (options.processorOptions && options.processorOptions.targetRate) || 16000;
    this._ratio = sampleRate / this._targetRate;

    // Accumulate 60 ms worth of input samples before sending.
    // Smaller than 100 ms → lower end-to-end latency; still large enough for
    // the lowlatency model to process reliably.
    this._chunkSize = Math.round(sampleRate * 0.06);  // e.g. 2880 @ 48 kHz → 960 @ 16 kHz
    this._buf = new Float32Array(this._chunkSize * 2); // pre-alloc, grow if needed
    this._bufLen = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    // Grow buffer if needed
    if (this._bufLen + channel.length > this._buf.length) {
      const bigger = new Float32Array(this._buf.length * 2);
      bigger.set(this._buf.subarray(0, this._bufLen));
      this._buf = bigger;
    }

    this._buf.set(channel, this._bufLen);
    this._bufLen += channel.length;

    // Send chunks whenever we've accumulated enough
    while (this._bufLen >= this._chunkSize) {
      const chunk = this._buf.subarray(0, this._chunkSize).slice(); // copy
      // Shift remaining samples to the front
      this._buf.copyWithin(0, this._chunkSize, this._bufLen);
      this._bufLen -= this._chunkSize;

      const downsampled = this._downsample(chunk);
      const pcm = this._floatToInt16(downsampled);
      // Transfer ownership — zero-copy across threads
      this.port.postMessage(pcm, [pcm]);
    }

    return true; // keep the processor alive
  }

  _downsample(input) {
    const len = Math.floor(input.length / this._ratio);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const pos = i * this._ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = input[idx] !== undefined ? input[idx] : 0;
      const b = input[idx + 1] !== undefined ? input[idx + 1] : a;
      out[i] = a + frac * (b - a);
    }
    return out;
  }

  _floatToInt16(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = input[i] < -1 ? -1 : input[i] > 1 ? 1 : input[i];
      out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out.buffer;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
