import { useEffect, useRef } from "react";
import { COLORS } from "@/lib/brandSystem";

type Props = {
  /** Concatenated peak data 0–1, or raw blobs to decode. */
  blobs?: Array<Blob | undefined | null>;
  progress?: number;
  height?: number;
  width?: number;
};

async function peaksFromBlobs(blobs: Array<Blob | undefined | null>, bars = 96): Promise<number[]> {
  const parts = blobs.filter((b): b is Blob => !!b && b.size > 0);
  if (parts.length === 0) return Array.from({ length: bars }, () => 0.08);
  try {
    const ctx = new AudioContext();
    const buffers: AudioBuffer[] = [];
    for (const blob of parts) {
      try {
        buffers.push(await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0)));
      } catch {
        /* skip */
      }
    }
    void ctx.close();
    if (buffers.length === 0) return Array.from({ length: bars }, () => 0.12);

    const total = buffers.reduce((n, b) => n + b.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const b of buffers) {
      merged.set(b.getChannelData(0), off);
      off += b.length;
    }
    const block = Math.max(1, Math.floor(merged.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * block;
      for (let j = start; j < start + block && j < merged.length; j++) {
        max = Math.max(max, Math.abs(merged[j]!));
      }
      peaks.push(Math.min(1, max * 1.8));
    }
    return peaks;
  } catch {
    return Array.from({ length: bars }, () => 0.1);
  }
}

export function AudioWaveform({ blobs = [], progress = 0, height = 48, width = 300 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    void peaksFromBlobs(blobs).then((peaks) => {
      if (!cancelled) {
        peaksRef.current = peaks;
        draw();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobs]);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, width, height]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const peaks = peaksRef.current;
    if (peaks.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, height / 2 - 1, width, 2);
      return;
    }

    const gap = 2;
    const barW = Math.max(2, (width - gap * (peaks.length - 1)) / peaks.length);
    const playedUntil = Math.floor(progress * peaks.length);

    peaks.forEach((p, i) => {
      const h = Math.max(3, p * (height - 8));
      const x = i * (barW + gap);
      const y = (height - h) / 2;
      ctx.fillStyle = i <= playedUntil ? COLORS.accent : "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, barW, h);
    });
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width,
        height,
        borderRadius: 8,
        background: "rgba(255,255,255,0.03)",
      }}
    />
  );
}
