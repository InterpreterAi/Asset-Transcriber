import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Owns the analyser loop so mic/tab-level ticks do not re-render the live transcript.
 * Clones the capture stream so the meter cannot add latency to STT (tab audio included).
 * Trial · Soniox X only.
 */
export function LiveAudioMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }
    let raf = 0;
    let lastUi = 0;
    let ctx: AudioContext | null = null;
    let meterStream: MediaStream | null = null;
    try {
      meterStream = stream.clone();
    } catch {
      meterStream = stream;
    }
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try {
      ctx = new AudioContextCtor();
      const source = ctx.createMediaStreamSource(meterStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = (now: number) => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = ((samples[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        const next = Math.min(100, Math.sqrt(sum / (samples.length || 1)) * 350);
        if (now - lastUi >= 80) {
          lastUi = now;
          setLevel(next);
        }
        raf = requestAnimationFrame(tick);
      };
      void ctx.resume().then(() => {
        if (!ctx) return;
        raf = requestAnimationFrame(tick);
      });
    } catch {
      setLevel(0);
    }
    return () => {
      cancelAnimationFrame(raf);
      const toClose = ctx;
      ctx = null;
      if (meterStream && meterStream !== stream) {
        meterStream.getTracks().forEach((t) => t.stop());
      }
      if (toClose) void toClose.close().catch(() => { /* already closed */ });
    };
  }, [stream]);

  const color =
    level > 85 ? "bg-red-500" : level > 60 ? "bg-yellow-400" : "bg-green-500";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
        <div
          className={cn("h-full rounded-full", color)}
          style={{
            width: `${Math.min(100, Math.max(0, level))}%`,
            transition: "width 75ms linear",
          }}
        />
      </div>
    </div>
  );
}
