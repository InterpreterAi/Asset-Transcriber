import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { toCanvas } from "html-to-image";
import { createMasterChain, normalizeAudioBuffer } from "@/lib/audioNormalize";
import { BGM_DUCK_WHILE_VO, BGM_OUTRO_PAD_RATIO } from "@/lib/bgmDuck";
import {
  loadLockedOutroPaintAssets,
  paintLockedOutroFrame,
} from "@/lib/renderLockedOutroFrame";
import { VO_TRAILING_SILENCE_SEC } from "@/lib/timeline";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";

export type ExportProgress = { pct: number; detail: string };

export type ExportSegment = {
  id: string;
  start: number;
  end: number;
};

export type ExportVolumes = {
  vo?: number;
  bgm?: number;
  brand?: number;
};

export type ExportAudioOpts = {
  musicUrl?: string | null;
  brandStingUrl?: string | null;
  /** Timeline seconds to fire brand sting (e.g. intro 0.05, outro 28.05) */
  brandStingAt?: number[];
  voiceovers?: Record<string, Blob | undefined | null>;
  segments: ExportSegment[];
  volumes?: ExportVolumes;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function captureStage(
  stage: HTMLElement,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  return toCanvas(stage, {
    width,
    height,
    pixelRatio: 1,
    quality: 1,
    cacheBust: false,
    backgroundColor: "#0A0A0A",
    style: {
      transform: "none",
      transformOrigin: "top left",
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
      left: "0",
      top: "0",
      right: "auto",
      bottom: "auto",
      opacity: "1",
      position: "relative",
    },
  });
}

async function decodeBlob(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer | null> {
  try {
    const ab = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab.slice(0));
    return normalizeAudioBuffer(decoded);
  } catch {
    return null;
  }
}

/**
 * Mix bed + VO + brand sting through per-bus gains + master compressor/limiter.
 * Samples are peak-normalized to −3 dB on decode.
 */
async function mixExportAudio(
  durationSec: number,
  sampleRate: number,
  audio: ExportAudioOpts,
): Promise<Float32Array | null> {
  const ctx = new OfflineAudioContext(1, Math.ceil(durationSec * sampleRate), sampleRate);
  const { input: master } = createMasterChain(ctx);
  let hasAny = false;

  const voGain = clamp(audio.volumes?.vo ?? 1, 0, 1.5);
  const bgmGain = clamp(audio.volumes?.bgm ?? 0.25, 0, 1);
  const brandGain = clamp(audio.volumes?.brand ?? 0.8, 0, 1);
  const ducked = bgmGain * BGM_DUCK_WHILE_VO;
  const outroPad = bgmGain * BGM_OUTRO_PAD_RATIO;

  if (audio.musicUrl) {
    try {
      const res = await fetch(audio.musicUrl);
      if (res.ok) {
        const bed = await decodeBlob(ctx, await res.blob());
        if (bed) {
          hasAny = true;
          const src = ctx.createBufferSource();
          src.buffer = bed;
          src.loop = true;
          const g = ctx.createGain();
          g.gain.value = bgmGain;
          for (const seg of audio.segments) {
            const vo = audio.voiceovers?.[seg.id];
            if (!vo || vo.size === 0) continue;
            // Duck while VO (speech); raise slightly on outro pad after trailing silence
            const speechEnd = Math.max(
              seg.start + 0.2,
              seg.end - (seg.id === "outro" ? VO_TRAILING_SILENCE_SEC + 0.15 : 0.12),
            );
            g.gain.setValueAtTime(bgmGain, Math.max(0, seg.start - 0.001));
            g.gain.linearRampToValueAtTime(ducked, seg.start + 0.05);
            g.gain.setValueAtTime(ducked, speechEnd);
            if (seg.id === "outro") {
              g.gain.linearRampToValueAtTime(outroPad, Math.min(seg.end, speechEnd + 0.2));
              g.gain.setValueAtTime(outroPad, Math.max(speechEnd, seg.end - 0.05));
              g.gain.linearRampToValueAtTime(bgmGain, seg.end);
            } else {
              g.gain.linearRampToValueAtTime(bgmGain, Math.min(seg.end, speechEnd + 0.12));
            }
          }
          src.connect(g);
          g.connect(master);
          src.start(0);
        }
      }
    } catch {
      /* no bed */
    }
  }

  if (audio.voiceovers) {
    for (const seg of audio.segments) {
      const blob = audio.voiceovers[seg.id];
      if (!blob || blob.size === 0) continue;
      const buf = await decodeBlob(ctx, blob);
      if (!buf) continue;
      hasAny = true;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = voGain;
      src.connect(g);
      g.connect(master);
      src.start(seg.start);
    }
  }

  if (audio.brandStingUrl && audio.brandStingAt?.length) {
    try {
      const res = await fetch(audio.brandStingUrl);
      if (res.ok) {
        const sting = await decodeBlob(ctx, await res.blob());
        if (sting) {
          hasAny = true;
          for (const t of audio.brandStingAt) {
            const src = ctx.createBufferSource();
            src.buffer = sting;
            const g = ctx.createGain();
            g.gain.value = brandGain;
            src.connect(g);
            g.connect(master);
            src.start(Math.max(0, t));
          }
        }
      }
    } catch {
      /* no sting */
    }
  }

  if (!hasAny) {
    return null;
  }

  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function tryEncodeAac(
  pcm: Float32Array,
  sampleRate: number,
  onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void,
): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;

  const numberOfChannels = 1;
  const configs: AudioEncoderConfig[] = [
    { codec: "mp4a.40.2", numberOfChannels, sampleRate, bitrate: 128_000 },
    { codec: "mp4a.40.2", numberOfChannels, sampleRate: 48000, bitrate: 128_000 },
  ];

  let encoder: AudioEncoder | null = null;
  for (const config of configs) {
    try {
      const support = await AudioEncoder.isConfigSupported(config);
      if (!support.supported) continue;
      encoder = new AudioEncoder({
        output: (chunk, meta) => onChunk(chunk, meta),
        error: () => {
          /* handled by flush failure */
        },
      });
      encoder.configure(config);
      break;
    } catch {
      encoder = null;
    }
  }
  if (!encoder) return false;

  const frameSamples = 1024;
  let timestamp = 0;
  for (let i = 0; i < pcm.length; i += frameSamples) {
    const slice = pcm.subarray(i, Math.min(i + frameSamples, pcm.length));
    const data = new Float32Array(slice.length);
    data.set(slice);
    const audioData = new AudioData({
      format: "f32",
      sampleRate,
      numberOfFrames: data.length,
      numberOfChannels: 1,
      timestamp,
      data,
    });
    encoder.encode(audioData);
    audioData.close();
    timestamp += Math.round((data.length / sampleRate) * 1_000_000);
  }

  await encoder.flush();
  encoder.close();
  return true;
}

/** Timed outro motion (shine + staggered CTAs) must re-capture every frame. */
function needsFrameAccurateCapture(segId: string): boolean {
  return segId === "outro" || segId === "full";
}

/**
 * Encode MP4 from the live stage.
 * Content beats: one mid-segment snapshot.
 * Outro: capture the real preview DOM every frame (pixel-match) unless canvas fallback.
 */
export async function exportReelMp4(opts: {
  stage: HTMLElement;
  durationSec: number;
  width: number;
  height: number;
  segments: ExportSegment[];
  fps?: number;
  filename?: string;
  seekTo: (tSec: number) => void;
  waitForPaint: () => Promise<void>;
  onProgress?: (p: ExportProgress) => void;
  audio?: ExportAudioOpts;
  /** Used only when outroCapture is "canvas". */
  outroCopy?: UniversalOutroCopy;
  /**
   * "dom" = capture the live preview (best quality / exact match).
   * "canvas" = fast approximate painter.
   */
  outroCapture?: "dom" | "canvas";
  /** Video bitrate in bps. Default 6Mbps; use ~18–20Mbps for master outro. */
  videoBitrate?: number;
  /**
   * Capture EVERY segment from the live DOM per frame (generated 35s reels:
   * hook footage, typing workspace and word subtitles all animate).
   */
  frameAccurate?: boolean;
}): Promise<void> {
  const fps = opts.fps ?? 15;
  const { stage, durationSec, width, height, segments } = opts;
  const frameCount = Math.max(1, Math.ceil(durationSec * fps));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const outroCapture = opts.outroCapture ?? "dom";
  const videoBitrate = opts.videoBitrate ?? 6_000_000;
  const frameAccurateFor = (segId: string): boolean =>
    opts.frameAccurate === true || needsFrameAccurateCapture(segId);

  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs required — use Chrome or Edge to download MP4.");
  }

  opts.onProgress?.({ pct: 0, detail: "Starting…" });
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* continue */
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const sampleRate = 48000;
  const audioChunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];

  if (opts.audio) {
    opts.onProgress?.({ pct: 5, detail: "Mixing audio…" });
    const mixed = await mixExportAudio(durationSec, sampleRate, opts.audio);
    if (mixed) {
      opts.onProgress?.({ pct: 12, detail: "Encoding audio…" });
      const ok = await tryEncodeAac(mixed, sampleRate, (chunk, meta) => {
        audioChunks.push({ chunk, meta });
      });
      if (!ok) {
        audioChunks.length = 0;
        opts.onProgress?.({ pct: 15, detail: "AudioEncoder unavailable — video only…" });
      }
    }
  }

  const withAudio = audioChunks.length > 0;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    audio: withAudio
      ? { codec: "aac", numberOfChannels: 1, sampleRate }
      : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  for (const { chunk, meta } of audioChunks) {
    muxer.addAudioChunk(chunk, meta);
  }

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  // Prefer High profile for master quality.
  let configured = false;
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: videoBitrate,
      framerate: fps,
      avc: { format: "avc" },
      hardwareAcceleration: "prefer-hardware",
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        encoder.configure(config);
        configured = true;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!configured) throw new Error("No supported H.264 encoder config.");

  const active = segments.length
    ? segments
    : [{ id: "full", start: 0, end: durationSec }];

  // Static mid snaps for non-animated beats (hook/problem/solution/result).
  const staticSnaps: { start: number; end: number; bitmap: ImageBitmap }[] = [];
  const staticSegs = active.filter((s) => !frameAccurateFor(s.id));
  for (let s = 0; s < staticSegs.length; s++) {
    const seg = staticSegs[s]!;
    const mid = (seg.start + seg.end) / 2;
    opts.onProgress?.({
      pct: 18 + Math.round(((s + 0.5) / Math.max(1, staticSegs.length)) * 12),
      detail: `Capturing ${seg.id}…`,
    });
    opts.seekTo(mid);
    await opts.waitForPaint();
    await new Promise((r) => setTimeout(r, 30));
    const snap = await captureStage(stage, width, height);
    staticSnaps.push({
      start: seg.start,
      end: seg.end,
      bitmap: await createImageBitmap(snap),
    });
  }

  const hasOutro = active.some((s) => frameAccurateFor(s.id));
  let outroAssets: Awaited<ReturnType<typeof loadLockedOutroPaintAssets>> | null = null;
  if (hasOutro && outroCapture === "canvas" && opts.outroCopy) {
    opts.onProgress?.({ pct: 30, detail: "Loading outro assets…" });
    outroAssets = await loadLockedOutroPaintAssets();
  }

  opts.onProgress?.({ pct: 32, detail: "Encoding video…" });

  const segmentAt = (t: number): ExportSegment => {
    for (const seg of active) {
      if (t >= seg.start && t < seg.end) return seg;
    }
    return active[active.length - 1]!;
  };

  const staticFor = (t: number): ImageBitmap | null => {
    for (const s of staticSnaps) {
      if (t >= s.start && t < s.end) return s.bitmap;
    }
    return null;
  };

  for (let i = 0; i < frameCount; i++) {
    if (encoderError) throw encoderError;
    const t = Math.min(durationSec - 0.0001, i / fps);
    const seg = segmentAt(t);

    if (frameAccurateFor(seg.id) && (outroCapture === "dom" || seg.id !== "outro")) {
      // Exact preview frames — same DOM the creator shows.
      opts.seekTo(t);
      await opts.waitForPaint();
      const snap = await captureStage(stage, width, height);
      ctx.drawImage(snap, 0, 0, width, height);
    } else if (
      frameAccurateFor(seg.id) &&
      outroCapture === "canvas" &&
      outroAssets &&
      opts.outroCopy
    ) {
      const local = Math.max(0, t - seg.start);
      const segDur = Math.max(0.1, seg.end - seg.start);
      paintLockedOutroFrame(ctx, {
        assets: outroAssets,
        copy: opts.outroCopy,
        localTime: local,
        durationSec: segDur,
        width,
        height,
      });
    } else {
      const bmp = staticFor(t);
      if (bmp) {
        ctx.drawImage(bmp, 0, 0, width, height);
      } else {
        opts.seekTo(t);
        await opts.waitForPaint();
        const snap = await captureStage(stage, width, height);
        ctx.drawImage(snap, 0, 0, width, height);
      }
    }

    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    encoder.encode(frame, { keyFrame: i === 0 || i % fps === 0 });
    frame.close();

    while (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 4));
    }

    if (i % 6 === 0 || i === frameCount - 1) {
      opts.onProgress?.({
        pct: 32 + Math.round(((i + 1) / frameCount) * 65),
        detail: `Master frame ${i + 1}/${frameCount}`,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  for (const s of staticSnaps) s.bitmap.close();

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  downloadBlob(blob, opts.filename ?? "interpreterai-reel.mp4");
  opts.onProgress?.({
    pct: 100,
    detail: withAudio ? "Downloaded (video + audio)" : "Downloaded",
  });
}
