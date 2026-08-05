/**
 * Locked Universal Brand Outro.
 * Holds one settled 3D master frame + a clean specular shine on the icon only.
 * All reveals are driven by localTime (deterministic for preview + MP4 export).
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { REEL_CAPTION_FONT } from "@/lib/kineticCaptions";
import {
  BRAND_LOCKED,
  LOCKED_OUTRO_FADE_BLACK_SEC,
  LOCKED_OUTRO_MIN_SEC,
  UNIVERSAL_OUTRO_EN,
  type UniversalOutroCopy,
} from "@/lib/universalBrandOutro";

const CYAN = "#20D4F0";
const STAGE_W = 1080;
const STAGE_H = 1920;
const HOLD_FRAME_RATIO = 0.92;
const FADE_IN_SEC = 0.45;

/** App-icon bounds on the stretched 1080×1920 master plate. */
const ICON = { cx: 540, cy: 780, size: 240, radius: 54 };

/** Overlay beats aligned to spoken order (brand/slogan already on plate). */
function beats(dur: number) {
  return {
    languages: dur * 0.42,
    cta: dur * 0.58,
    ctaSub: dur * 0.68,
    url: dur * 0.76,
    qr: dur * 0.76,
  };
}

/** Smooth fade-in from beat time — works when export seeks non-linearly. */
function fadeIn(t: number, at: number, dur = FADE_IN_SEC): number {
  if (t < at) return 0;
  if (t >= at + dur) return 1;
  const u = (t - at) / dur;
  return u * u * (3 - 2 * u);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function UniversalBrandOutro({
  copy,
  rtl,
  localTime,
  durationSec,
  displayUrl,
  showCtaSubline = true,
}: {
  copy: UniversalOutroCopy;
  rtl: boolean;
  localTime: number;
  durationSec: number;
  /** Overrides the locked brand URL (configurable outro). */
  displayUrl?: string;
  /** Hide the small subline when the CTA text already carries the offer. */
  showCtaSubline?: boolean;
}) {
  const dur = Math.max(LOCKED_OUTRO_MIN_SEC, durationSec || LOCKED_OUTRO_MIN_SEC);
  const t = Math.max(0, localTime);
  const b = beats(dur);
  const fadeStart = dur - LOCKED_OUTRO_FADE_BLACK_SEC;
  const fadeBlack = t >= fadeStart ? Math.min(1, (t - fadeStart) / LOCKED_OUTRO_FADE_BLACK_SEC) : 0;
  const languagesLine = copy.languagesLine || UNIVERSAL_OUTRO_EN.languagesLine;
  const ctaSubline = copy.ctaSubline || UNIVERSAL_OUTRO_EN.ctaSubline;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holdCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function paintStage(time: number) {
    const stage = canvasRef.current;
    const hold = holdCanvasRef.current;
    if (!stage || !hold) return;
    const ctx = stage.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.drawImage(hold, 0, 0, STAGE_W, STAGE_H);

    // Specular sweep clipped to the icon only (no scale, no full-frame glow blob)
    const ix = ICON.cx - ICON.size / 2;
    const iy = ICON.cy - ICON.size / 2;
    const shineT = Math.min(1, Math.max(0, (time - 0.4) / 1.35));
    if (shineT <= 0 || shineT >= 1) {
      // Tiny idle highlight on the bolt after the sweep
      if (time > 1.8) {
        const idle = 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(time * Math.PI * 0.55));
        ctx.save();
        roundRectPath(ctx, ix, iy, ICON.size, ICON.size, ICON.radius);
        ctx.clip();
        const g = ctx.createRadialGradient(
          ICON.cx,
          ICON.cy - 10,
          8,
          ICON.cx,
          ICON.cy,
          ICON.size * 0.42,
        );
        g.addColorStop(0, `rgba(255,255,255,${idle})`);
        g.addColorStop(0.45, `rgba(32,212,240,${idle * 0.45})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(ix, iy, ICON.size, ICON.size);
        ctx.restore();
      }
      return;
    }

    ctx.save();
    roundRectPath(ctx, ix, iy, ICON.size, ICON.size, ICON.radius);
    ctx.clip();

    const bandW = ICON.size * 0.55;
    const travel = ICON.size + bandW * 2;
    const x = ix - bandW + shineT * travel;

    const grad = ctx.createLinearGradient(x, iy, x + bandW, iy + ICON.size);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.06)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.42)");
    grad.addColorStop(0.62, "rgba(32,212,240,0.22)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.translate(ICON.cx, ICON.cy);
    ctx.rotate((-22 * Math.PI) / 180);
    ctx.translate(-ICON.cx, -ICON.cy);
    ctx.fillRect(x - 40, iy - 80, bandW + 80, ICON.size + 160);
    ctx.restore();
  }

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = BRAND_LOCKED.masterVideo;

    const finishHold = (source: CanvasImageSource) => {
      if (cancelled) return;
      const hold = document.createElement("canvas");
      hold.width = STAGE_W;
      hold.height = STAGE_H;
      const hctx = hold.getContext("2d");
      if (!hctx) return;
      hctx.fillStyle = "#0A0A0A";
      hctx.fillRect(0, 0, STAGE_W, STAGE_H);
      hctx.drawImage(source, 0, 0, STAGE_W, STAGE_H);
      holdCanvasRef.current = hold;
      paintStage(t);
    };

    const captureFromVideo = () => {
      try {
        finishHold(video);
      } catch {
        const still = new Image();
        still.crossOrigin = "anonymous";
        still.src = BRAND_LOCKED.masterStill;
        still.onload = () => finishHold(still);
      }
    };

    const onMeta = () => {
      const d = video.duration || 4;
      const at = Math.max(0.05, d * HOLD_FRAME_RATIO);
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        captureFromVideo();
      };
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = at;
      } catch {
        captureFromVideo();
      }
    };

    video.addEventListener("loadeddata", onMeta);
    video.onerror = () => {
      const still = new Image();
      still.crossOrigin = "anonymous";
      still.src = BRAND_LOCKED.masterStill;
      still.onload = () => finishHold(still);
    };

    return () => {
      cancelled = true;
      video.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layout effect so export seek+capture sees the shine for this exact localTime.
  useLayoutEffect(() => {
    paintStage(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const opLang = fadeIn(t, b.languages);
  const opCta = fadeIn(t, b.cta);
  const opSub = fadeIn(t, b.ctaSub);
  const opUrl = fadeIn(t, b.url);
  const opQr = fadeIn(t, b.qr);

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        overflow: "hidden",
        background: "#0A0A0A",
        fontFamily: REEL_CAPTION_FONT,
      }}
    >
      <canvas
        ref={canvasRef}
        width={STAGE_W}
        height={STAGE_H}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "38%",
          background:
            "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.72) 28%, rgba(10,10,10,0.96) 55%, #0A0A0A 100%)",
          pointerEvents: "none",
          zIndex: 4,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 64px 100px",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "rgba(248,250,252,0.92)",
            opacity: opLang,
          }}
        >
          {languagesLine}
        </p>

        <div
          style={{
            marginTop: 28,
            padding: "32px 56px",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${CYAN} 0%, #0EA5C6 100%)`,
            color: "#041018",
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            boxShadow: "0 16px 48px rgba(32,212,240,0.32)",
            border: "1px solid rgba(255,255,255,0.2)",
            opacity: opCta,
          }}
        >
          {copy.ctaHeadline}
        </div>

        {showCtaSubline ? (
          <p
            style={{
              margin: "18px 0 0",
              fontSize: 34,
              fontWeight: 650,
              letterSpacing: "-0.01em",
              color: "rgba(255,255,255,0.78)",
              opacity: opSub,
            }}
          >
            {ctaSubline}
          </p>
        ) : null}

        <p
          style={{
            margin: "20px 0 0",
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "rgba(255,255,255,0.92)",
            opacity: opUrl,
          }}
        >
          {displayUrl || BRAND_LOCKED.displayUrl}
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          right: 48,
          bottom: 72,
          zIndex: 6,
          width: 132,
          height: 132,
          borderRadius: 18,
          overflow: "hidden",
          background: "#FFFFFF",
          padding: 10,
          boxSizing: "border-box",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          opacity: opQr,
        }}
      >
        <img
          src={BRAND_LOCKED.qrSrc}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 60,
          background: "#000000",
          opacity: fadeBlack,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
