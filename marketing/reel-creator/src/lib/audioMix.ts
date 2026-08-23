/**
 * Preview audio mix: per-bus gains + auto-ducking + master compressor/limiter.
 * Buffers peak-normalized to −3 dB on load.
 */

import { createMasterChain, normalizeAudioBuffer } from "@/lib/audioNormalize";
import { BGM_DUCK_WHILE_VO, BGM_FULL_RATIO, BGM_OUTRO_PAD_RATIO } from "@/lib/bgmDuck";

export type MixSegment = {
  id: string;
  start: number;
  end: number;
};

export type StingCue = { at: number; tag: string };

export type MixVolumes = {
  /** 0–1.5, default 1.0 */
  vo: number;
  /** 0–1, default 0.25 */
  bgm: number;
  /** 0–1, default 0.80 */
  brand: number;
};

const DEFAULT_VOLUMES: MixVolumes = { vo: 1, bgm: 0.25, brand: 0.8 };

type DuckMode = "vo" | "outroPad" | "full";

export class ReelAudioMixer {
  private ctx: AudioContext | null = null;
  private masterInput: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private voGain: GainNode | null = null;
  private stingGain: GainNode | null = null;
  private bedSource: AudioBufferSourceNode | OscillatorNode | null = null;
  private voSource: AudioBufferSourceNode | null = null;
  private bedBuffer: AudioBuffer | null = null;
  private musicEnabled = true;
  private stingBuffer: AudioBuffer | null = null;
  private voBuffers = new Map<string, AudioBuffer>();
  /** When set, one continuous VO track replaces per-segment VO switching. */
  private fullVoBuffer: AudioBuffer | null = null;
  private playing = false;
  private duckMode: DuckMode = "full";
  private brandStingEnabled = true;
  private stingCues: StingCue[] = [];
  private segments: MixSegment[] = [];
  private tickId: number | null = null;
  private getTime: (() => number) | null = null;
  private lastVoSeg: string | null = null;
  private stingPlayedFor: Set<string> = new Set();
  private volumes: MixVolumes = { ...DEFAULT_VOLUMES };

  setVolumes(v: Partial<MixVolumes>) {
    if (typeof v.vo === "number") this.volumes.vo = clamp(v.vo, 0, 1.5);
    if (typeof v.bgm === "number") this.volumes.bgm = clamp(v.bgm, 0, 1);
    if (typeof v.brand === "number") this.volumes.brand = clamp(v.brand, 0, 1);
    this.applyVolumeNodes();
  }

  private duckRatio(mode: DuckMode): number {
    if (mode === "vo") return BGM_DUCK_WHILE_VO;
    if (mode === "outroPad") return BGM_OUTRO_PAD_RATIO;
    return BGM_FULL_RATIO;
  }

  private applyVolumeNodes() {
    if (this.voGain) this.voGain.gain.value = this.volumes.vo;
    if (this.stingGain) this.stingGain.gain.value = this.volumes.brand;
    if (this.bedGain) {
      this.bedGain.gain.value = this.volumes.bgm * this.duckRatio(this.duckMode);
    }
  }

  private bedTarget(mode: DuckMode): number {
    return this.volumes.bgm * this.duckRatio(mode);
  }

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
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      this.bedBuffer = normalizeAudioBuffer(decoded);
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
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      this.stingBuffer = normalizeAudioBuffer(decoded);
      return true;
    } catch {
      this.stingBuffer = null;
      return false;
    }
  }

  setBrandStingEnabled(on: boolean) {
    this.brandStingEnabled = on;
  }

  setBrandStingSchedule(cues: StingCue[]) {
    this.stingCues = cues;
  }

  async loadVoiceovers(map: Record<string, Blob | undefined | null>) {
    const ctx = this.ensureCtx();
    this.voBuffers.clear();
    this.fullVoBuffer = null;
    for (const [id, blob] of Object.entries(map)) {
      if (!blob || blob.size === 0) continue;
      try {
        const ab = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        const normalized = normalizeAudioBuffer(decoded);
        if (id === "full") {
          this.fullVoBuffer = normalized;
        } else {
          this.voBuffers.set(id, normalized);
        }
      } catch {
        /* skip */
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
    if (!this.masterInput) {
      const chain = createMasterChain(ctx);
      this.masterInput = chain.input;
    }
    if (!this.bedGain) {
      this.bedGain = ctx.createGain();
      this.bedGain.gain.value = this.volumes.bgm;
      this.bedGain.connect(this.masterInput);
    }
    if (!this.voGain) {
      this.voGain = ctx.createGain();
      this.voGain.gain.value = this.volumes.vo;
      this.voGain.connect(this.masterInput);
    }
    if (!this.stingGain) {
      this.stingGain = ctx.createGain();
      this.stingGain.gain.value = this.volumes.brand;
      this.stingGain.connect(this.masterInput);
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
    }
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

  private setDuckMode(mode: DuckMode) {
    if (!this.bedGain || this.duckMode === mode) return;
    this.duckMode = mode;
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const target = this.bedTarget(mode);
    this.bedGain.gain.cancelScheduledValues(now);
    this.bedGain.gain.setValueAtTime(this.bedGain.gain.value, now);
    this.bedGain.gain.linearRampToValueAtTime(target, now + 0.08);
  }

  private playFullVo(fromSec: number) {
    if (!this.fullVoBuffer || !this.voGain) return;
    const ctx = this.ensureCtx();
    this.stopVo();
    const src = ctx.createBufferSource();
    src.buffer = this.fullVoBuffer;
    src.connect(this.voGain);
    const offset = Math.min(Math.max(0, fromSec), this.fullVoBuffer.duration);
    src.start(0, offset);
    this.voSource = src;
    this.setDuckMode("vo");
    src.onended = () => {
      if (this.voSource === src) {
        this.voSource = null;
        this.setDuckMode("full");
      }
    };
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
    this.setDuckMode("vo");
    src.onended = () => {
      if (this.voSource === src) {
        this.voSource = null;
        const t = this.getTime?.() ?? 0;
        const seg = this.segments.find((s) => t >= s.start && t < s.end);
        this.setDuckMode(seg?.id === "outro" ? "outroPad" : "full");
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
    if (!this.voSource) this.setDuckMode("vo");
    src.onended = () => {
      if (!this.voSource) {
        const t = this.getTime?.() ?? 0;
        const seg = this.segments.find((s) => t >= s.start && t < s.end);
        this.setDuckMode(seg?.id === "outro" ? "outroPad" : "full");
      }
    };
    src.start(0);
  }

  start(getTime: () => number) {
    void this.ensureCtx().resume();
    this.getTime = getTime;
    this.playing = true;
    this.stingPlayedFor.clear();
    this.lastVoSeg = null;
    this.duckMode = "full";
    this.startBed();
    if (this.fullVoBuffer) {
      this.playFullVo(getTime());
    }
    this.tickId = window.setInterval(() => this.syncToTimeline(), 60);
    this.syncToTimeline();
  }

  private syncToTimeline() {
    if (!this.playing || !this.getTime) return;
    const t = this.getTime();

    if (this.fullVoBuffer) {
      for (const cue of this.stingCues) {
        if (t >= cue.at) this.playStingOnce(cue.tag);
      }
      this.setDuckMode("vo");
      return;
    }

    for (const cue of this.stingCues) {
      if (t >= cue.at) this.playStingOnce(cue.tag);
    }

    const seg = this.segments.find((s) => t >= s.start && t < s.end);
    if (!seg) {
      this.stopVo();
      this.setDuckMode("full");
      this.lastVoSeg = null;
      return;
    }
    if (seg.id !== this.lastVoSeg && this.voBuffers.has(seg.id)) {
      this.lastVoSeg = seg.id;
      this.playVoForSegment(seg.id);
    } else if (this.voSource) {
      this.setDuckMode("vo");
    } else if (seg.id === "outro") {
      this.setDuckMode("outroPad");
    } else if (!this.voBuffers.has(seg.id)) {
      this.setDuckMode("full");
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
    this.duckMode = "full";
    this.lastVoSeg = null;
    this.stingPlayedFor.clear();
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.masterInput = null;
    this.bedGain = null;
    this.voGain = null;
    this.stingGain = null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
