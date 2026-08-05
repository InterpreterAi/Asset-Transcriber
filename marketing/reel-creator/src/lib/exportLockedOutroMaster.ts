/**
 * Reliable high-quality Universal Brand Outro MP4 export.
 * Canvas-composited (no per-frame DOM capture — that hangs browsers).
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import {
  loadLockedOutroPaintAssets,
  paintLockedOutroFrame,
} from "@/lib/renderLockedOutroFrame";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";
import { createMasterChain, normalizeAudioBuffer } from "@/lib/audioNormalize";

export type OutroExportProgress = { pct: number; detail: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function encodeAac(
  pcm: Float32Array,
  sampleRate: number,
): Promise<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[]> {
  if (typeof AudioEncoder === "undefined") return [];
  const chunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];
  const config: AudioEncoderConfig = {
    codec: "mp4a.40.2",
    numberOfChannels: 1,
    sampleRate,
    bitrate: 192_000,
  };
  const support = await AudioEncoder.isConfigSupported(config);
  if (!support.supported) return [];

  const encoder = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
    error: () => undefined,
  });
  encoder.configure(config);

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
  return chunks;
}

async function mixVo(
  durationSec: number,
  sampleRate: number,
  vo: Blob,
): Promise<Float32Array | null> {
  try {
    const ctx = new OfflineAudioContext(1, Math.ceil(durationSec * sampleRate), sampleRate);
    const { input: master } = createMasterChain(ctx);
    const ab = await vo.arrayBuffer();
    const decoded = normalizeAudioBuffer(await ctx.decodeAudioData(ab.slice(0)));
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g);
    g.connect(master);
    src.start(0);
    const rendered = await ctx.startRendering();
    return rendered.getChannelData(0);
  } catch {
    return null;
  }
}

/** Master outro MP4 — completes in seconds, 1080×1920 @ high bitrate. */
export async function exportLockedOutroMaster(opts: {
  copy: UniversalOutroCopy;
  durationSec: number;
  voiceover?: Blob | null;
  filename?: string;
  fps?: number;
  videoBitrate?: number;
  onProgress?: (p: OutroExportProgress) => void;
}): Promise<void> {
  const fps = opts.fps ?? 30;
  const width = 1080;
  const height = 1920;
  const durationSec = Math.max(1, opts.durationSec);
  const frameCount = Math.max(1, Math.ceil(durationSec * fps));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const videoBitrate = opts.videoBitrate ?? 18_000_000;

  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs required — use Chrome or Edge.");
  }

  opts.onProgress?.({ pct: 2, detail: "Loading brand plate…" });
  const assets = await loadLockedOutroPaintAssets();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const sampleRate = 48000;
  let audioChunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];
  if (opts.voiceover && opts.voiceover.size > 0) {
    opts.onProgress?.({ pct: 8, detail: "Mixing voice-over…" });
    const pcm = await mixVo(durationSec, sampleRate, opts.voiceover);
    if (pcm) {
      opts.onProgress?.({ pct: 14, detail: "Encoding audio…" });
      audioChunks = await encodeAac(pcm, sampleRate);
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

  let configured = false;
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
    for (const bitrate of [videoBitrate, 12_000_000, 8_000_000]) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
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
        /* next */
      }
    }
    if (configured) break;
  }
  if (!configured) throw new Error("No supported H.264 encoder — try Chrome/Edge.");

  opts.onProgress?.({ pct: 20, detail: "Encoding frames…" });

  for (let i = 0; i < frameCount; i++) {
    if (encoderError) throw encoderError;
    const t = Math.min(durationSec - 0.0001, i / fps);
    paintLockedOutroFrame(ctx, {
      assets,
      copy: opts.copy,
      localTime: t,
      durationSec,
      width,
      height,
    });

    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    encoder.encode(frame, { keyFrame: i === 0 || i % fps === 0 });
    frame.close();

    while (encoder.encodeQueueSize > 12) {
      await new Promise((r) => setTimeout(r, 2));
    }

    if (i % 20 === 0 || i === frameCount - 1) {
      opts.onProgress?.({
        pct: 20 + Math.round(((i + 1) / frameCount) * 75),
        detail: `Encoding ${i + 1}/${frameCount}`,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  if (blob.size < 1000) throw new Error("Export produced an empty file.");
  downloadBlob(blob, opts.filename ?? "InterpreterAI_Universal_Brand_Outro.mp4");
  opts.onProgress?.({ pct: 100, detail: "Downloaded" });
}
