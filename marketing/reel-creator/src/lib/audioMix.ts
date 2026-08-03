/**
 * Preview audio mix: background bed (~15%) with ducking under voiceover,
 * plus optional InterpreterAI brand sting on intro / outro.
 */

export type MixSegment = {
  id: string;
  start: number;
  end: number;
  blob?: Blob | null;
};

const BED_GAIN = 0.15;
const BED_DUCKED = 0.05;
const VO_GAIN = 1.0;
const STING_GAIN = 0.55;

export class ReelAudioMixer {
  private ctx: AudioContext | null = null;
  private bedGain: GainNode | null = null;
  private voGain: GainNode | null = null;
  private stingGain: GainNode | null = null;
  private bedSource: AudioBufferSourceNode | OscillatorNode | null = null;
  private voSource: AudioBufferSourceNode | null = null;
  private bedBuffer: AudioBuffer | null = null;
  private musicEnabled = true;
  private stingBuffer: AudioBuffer | null = null;
  private voBuffers = new Map<string, AudioBuffer>();
  private playing = false;
  private ducking = false;
  private brandStingEnabled = true;
  private segments: MixSegment[] = [];
  private tickId: number | null = null;
  private getTime: (() => number) | null = null;
  private lastVoSeg: string | null = null;
  private stingPlayedFor: Set<string> = new Set();

  async loadMusic(url: string): Promise<boolean> {
    if (!url) {
      this.bedBuffer = null;
      this.musicEnabled = false;
      return false;
    }
    this.musicEnabled = true;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const ab = await res.arrayBuffer();
      const ctx = this.ensureCtx();
      this.bedBuffer = await ctx.decodeAudioData(ab.slice(0));
      return true;
    } catch {
      this.bedBuffer = null;
      return false;
    }
  }

  async loadBrandSting(url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const ab = await res.arrayBuffer();
      const ctx = this.ensureCtx();
      this.stingBuffer = await ctx.decodeAudioData(ab.slice(0));
      return true;
    } catch {
      this.stingBuffer = null;
      return false;
    }
  }

  setBrandStingEnabled(on: boolean) {
    this.brandStingEnabled = on;
  }

  async loadVoiceovers(map: Record<string, Blob | undefined | null>) {
    const ctx = this.ensureCtx();
    this.voBuffers.clear();
    for (const [id, blob] of Object.entries(map)) {
      if (!blob || blob.size === 0) continue;
      try {
        const ab = await blob.arrayBuffer();
        this.voBuffers.set(id, await ctx.decodeAudioData(ab.slice(0)));
      } catch {
        /* skip bad segment */
      }
    }
  }

  setSegments(segments: MixSegment[]) {
    this.segments = segments;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private ensureGraph() {
    const ctx = this.ensureCtx();
    if (!this.bedGain) {
      this.bedGain = ctx.createGain();
      this.bedGain.gain.value = BED_GAIN;
      this.bedGain.connect(ctx.destination);
    }
    if (!this.voGain) {
      this.voGain = ctx.createGain();
      this.voGain.gain.value = VO_GAIN;
      this.voGain.connect(ctx.destination);
    }
    if (!this.stingGain) {
      this.stingGain = ctx.createGain();
      this.stingGain.gain.value = STING_GAIN;
      this.stingGain.connect(ctx.destination);
    }
  }

  private startBed() {
    const ctx = this.ensureCtx();
    this.ensureGraph();
    this.stopBed();

    if (!this.musicEnabled) return;

    if (this.bedBuffer && this.bedGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.bedBuffer;
      src.loop = true;
      src.connect(this.bedGain);
      src.start(0);
      this.bedSource = src;
      return;
    }

    // Soft fallback pad only if a bed was requested but failed to decode
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    osc.type = "sine";
    osc.frequency.value = 110;
    osc.connect(filter);
    filter.connect(this.bedGain!);
    osc.start();
    this.bedSource = osc;
  }

  private stopBed() {
    try {
      this.bedSource?.stop();
    } catch {
      /* */
    }
    this.bedSource = null;
  }

  private stopVo() {
    try {
      this.voSource?.stop();
    } catch {
      /* */
    }
    this.voSource = null;
  }

  private setDuck(active: boolean) {
    if (!this.bedGain || this.ducking === active) return;
    this.ducking = active;
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    this.bedGain.gain.cancelScheduledValues(now);
    this.bedGain.gain.setTargetAtTime(active ? BED_DUCKED : BED_GAIN, now, 0.08);
  }

  private playVoForSegment(id: string) {
    const buf = this.voBuffers.get(id);
    if (!buf || !this.voGain) return;
    const ctx = this.ensureCtx();
    this.stopVo();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voGain);
    src.start(0);
    this.voSource = src;
    this.setDuck(true);
    src.onended = () => {
      if (this.voSource === src) {
        this.voSource = null;
        this.setDuck(false);
      }
    };
  }

  private playStingOnce(tag: string) {
    if (!this.brandStingEnabled || !this.stingBuffer || !this.stingGain) return;
    if (this.stingPlayedFor.has(tag)) return;
    this.stingPlayedFor.add(tag);
    const ctx = this.ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = this.stingBuffer;
    src.connect(this.stingGain);
    // brief duck under sting
    this.setDuck(true);
    src.onended = () => this.setDuck(false);
    src.start(0);
  }

  start(getTime: () => number) {
    void this.ensureCtx().resume();
    this.getTime = getTime;
    this.playing = true;
    this.stingPlayedFor.clear();
    this.lastVoSeg = null;
    this.startBed();
    this.tickId = window.setInterval(() => this.syncToTimeline(), 80);
    this.syncToTimeline();
  }

  private syncToTimeline() {
    if (!this.playing || !this.getTime) return;
    const t = this.getTime();

    // Brand sting when InterpreterAI logo beats hit (intro start + outro start)
    if (t < 2) this.playStingOnce("intro");
    if (t >= 28 && t < 35) this.playStingOnce("outro");

    const seg = this.segments.find((s) => t >= s.start && t < s.end);
    if (!seg) {
      this.stopVo();
      this.setDuck(false);
      this.lastVoSeg = null;
      return;
    }
    if (seg.id !== this.lastVoSeg && this.voBuffers.has(seg.id)) {
      this.lastVoSeg = seg.id;
      this.playVoForSegment(seg.id);
    } else if (!this.voBuffers.has(seg.id)) {
      // keep duck if sting just fired; otherwise unduck when no VO
      if (!this.voSource) this.setDuck(false);
    }
  }

  stop() {
    this.playing = false;
    if (this.tickId != null) {
      window.clearInterval(this.tickId);
      this.tickId = null;
    }
    this.stopVo();
    this.stopBed();
    this.setDuck(false);
    this.lastVoSeg = null;
    this.stingPlayedFor.clear();
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.bedGain = null;
    this.voGain = null;
    this.stingGain = null;
  }
}
