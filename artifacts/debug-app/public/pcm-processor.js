class PcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._targetRate = (options.processorOptions && options.processorOptions.targetRate) || 16000;
    this._ratio = sampleRate / this._targetRate;
    this._chunkSize = Math.round(sampleRate * 0.06);
    this._buf = new Float32Array(this._chunkSize * 2);
    this._bufLen = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    if (this._bufLen + channel.length > this._buf.length) {
      const bigger = new Float32Array(this._buf.length * 2);
      bigger.set(this._buf.subarray(0, this._bufLen));
      this._buf = bigger;
    }
    this._buf.set(channel, this._bufLen);
    this._bufLen += channel.length;
    while (this._bufLen >= this._chunkSize) {
      const chunk = this._buf.subarray(0, this._chunkSize).slice();
      this._buf.copyWithin(0, this._chunkSize, this._bufLen);
      this._bufLen -= this._chunkSize;
      const downsampled = this._downsample(chunk);
      const pcm = this._floatToInt16(downsampled);
      this.port.postMessage(pcm, [pcm]);
    }
    return true;
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
