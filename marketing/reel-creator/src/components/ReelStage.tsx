import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BrandIntro } from "@brand/components/BrandIntro";
import { BrandOutro } from "@brand/components/BrandOutro";
import {
  CANVAS_H,
  CANVAS_W,
  compositionDurationMs,
  phaseAt,
  reelConfig,
  videoTimeAt,
  type ReelConfig,
} from "../lib/config";
import {
  assertExactCanvasSize,
  blitRecordingFrame,
  clearFrame,
} from "../lib/renderPipeline";

/**
 * Preview uses the SAME render pipeline as export:
 * hidden <video> decode → blitRecordingFrame(canvas) 1:1.
 * No CSS transforms on content. No recreated UI.
 */
export function ReelStage({
  videoUrl,
  videoRef,
  canvasRef,
  elapsedMs,
  playing,
  cfg = reelConfig,
  onSizeError,
}: {
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  elapsedMs: number;
  playing: boolean;
  cfg?: ReelConfig;
  onSizeError?: (message: string | null) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [displayScale, setDisplayScale] = useState(0.25);
  const [videoMeta, setVideoMeta] = useState({ duration: 0, ready: false, w: 0, h: 0 });
  const [sizeOk, setSizeOk] = useState(false);

  // Fit the 1080×1920 bitmap into the panel via CSS width/height only (no transform on content).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDisplayScale(el.clientWidth / CANVAS_W);
    });
    ro.observe(el);
    setDisplayScale(el.clientWidth / CANVAS_W);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) {
      setVideoMeta({ duration: 0, ready: false, w: 0, h: 0 });
      setSizeOk(false);
      onSizeError?.(null);
      return;
    }
    const onMeta = () => {
      const w = v.videoWidth || 0;
      const h = v.videoHeight || 0;
      setVideoMeta({ duration: v.duration || 0, ready: true, w, h });
      try {
        assertExactCanvasSize(v);
        setSizeOk(true);
        onSizeError?.(null);
      } catch (e) {
        setSizeOk(false);
        onSizeError?.(e instanceof Error ? e.message : "Invalid recording size");
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    if (v.readyState >= 1) onMeta();
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [videoUrl, videoRef, onSizeError]);

  // Sync decode clock + paint via shared blit pipeline
  useEffect(() => {
    const v = videoRef.current;
    const canvas = canvasRef.current;
    if (!v || !canvas || !videoMeta.ready) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const phase = phaseAt(elapsedMs, videoMeta.duration, cfg);
    const bed = cfg.export.background || "#02050B";

    if (phase === "video" && sizeOk) {
      const t = videoTimeAt(elapsedMs, videoMeta.duration, cfg);
      const paint = () => {
        try {
          clearFrame(ctx, bed);
          blitRecordingFrame(ctx, v);
        } catch {
          /* size gate */
        }
      };
      if (playing) {
        if (v.paused) void v.play().catch(() => {});
        if (Math.abs(v.currentTime - t) > 0.25) v.currentTime = t;
        let raf = 0;
        const loop = () => {
          paint();
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
          cancelAnimationFrame(raf);
          v.pause();
        };
      }
      v.pause();
      if (Math.abs(v.currentTime - t) > 0.05) {
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked);
          paint();
        };
        v.addEventListener("seeked", onSeeked);
        v.currentTime = t;
        return () => v.removeEventListener("seeked", onSeeked);
      }
      paint();
      return;
    }

    v.pause();
    if (phase === "intro") {
      clearFrame(ctx, bed);
      v.currentTime = 0;
    } else if (phase === "outro" || phase === "done") {
      if (sizeOk) {
        try {
          v.currentTime = Math.max(0, videoMeta.duration - 0.05);
          clearFrame(ctx, bed);
          // Outro HTML overlay covers this; keep last frame under if needed
          blitRecordingFrame(ctx, v);
        } catch {
          clearFrame(ctx, bed);
        }
      } else {
        clearFrame(ctx, bed);
      }
    } else {
      clearFrame(ctx, bed);
    }
  }, [elapsedMs, playing, videoMeta, cfg, videoRef, canvasRef, sizeOk]);

  const phase = phaseAt(elapsedMs, videoMeta.duration, cfg);
  const overlay =
    phase === "intro" && cfg.intro.enabled
      ? "intro"
      : phase === "outro" && cfg.outro.enabled
        ? "outro"
        : "none";

  const total = compositionDurationMs(videoMeta.duration, cfg);
  const bed = cfg.export.background || "#02050B";

  return (
    <div className="stage-frame" ref={frameRef}>
      {/*
        Display box only: CSS width/height shrink for the panel.
        Bitmap is always 1080×1920 — no transform on the canvas element.
      */}
      <div
        style={{
          width: CANVAS_W * displayScale,
          height: CANVAS_H * displayScale,
          position: "relative",
          background: bed,
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            imageRendering: sizeOk ? "pixelated" : "auto",
          }}
          data-reel-canvas="true"
        />

        {/* Decode source only — never shown, never CSS-transformed into the stage */}
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          muted
          playsInline
          preload="auto"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
            left: -9999,
            top: 0,
          }}
        />

        {!videoUrl ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: bed,
              color: "#94A3B8",
              fontSize: Math.max(12, 22 * displayScale),
              fontWeight: 600,
              textAlign: "center",
              padding: 24,
            }}
          >
            Upload a {CANVAS_W}×{CANVAS_H} MP4 of /admin/demo-marketing
          </div>
        ) : null}

        {/* Brand overlays only — never a workspace / demo recreation */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            transform: `scale(${displayScale})`,
            transformOrigin: "top left",
            width: CANVAS_W,
            height: CANVAS_H,
          }}
        >
          <AnimatePresence mode="wait">
            {overlay === "intro" ? (
              <BrandIntro
                key="intro"
                durationMs={cfg.intro.durationMs}
                transparent={cfg.intro.transparent}
                showTitle={false}
                assetBase="/brand"
              />
            ) : null}
            {overlay === "outro" ? (
              <BrandOutro
                key="outro"
                durationMs={cfg.outro.durationMs}
                referralUrl={cfg.referralLink}
                cta={cfg.cta}
                assetBase="/brand"
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <div className="stage-meta">
        {videoMeta.ready
          ? `${(elapsedMs / 1000).toFixed(1)}s / ${(total / 1000).toFixed(1)}s · src ${videoMeta.w}×${videoMeta.h}${
              sizeOk ? " · 1:1 blit" : " · SIZE MISMATCH"
            }`
          : `Assembler · ${CANVAS_W}×${CANVAS_H} · shared blit pipeline`}
      </div>
    </div>
  );
}
