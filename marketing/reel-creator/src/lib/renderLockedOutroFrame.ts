/**
 * Fast canvas painter for Universal Brand Outro export.
 * Same timing/look as UniversalBrandOutro — no per-frame DOM capture.
 */

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
const FADE_IN_SEC = 0.45;
const ICON = { cx: 540, cy: 780, size: 240, radius: 54 };

function beats(dur: number) {
  return {
    languages: dur * 0.42,
    cta: dur * 0.58,
    ctaSub: dur * 0.68,
    url: dur * 0.76,
    qr: dur * 0.76,
  };
}

function fadeIn(t: number, at: number, dur = FADE_IN_SEC): number {
  if (t < at) return 0;
  if (t >= at + dur) return 1;
  const u = (t - at) / dur;
  return u * u * (3 - 2 * u);
}

/** Correct pill / rounded-rect path (native roundRect when available). */
function pathRoundRect(
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

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  pathRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export type LockedOutroPaintAssets = {
  plate: CanvasImageSource;
  qr: HTMLImageElement;
};

/** Capture settled hold frame from master video (matches preview), fallback to still. */
async function loadHoldPlate(): Promise<HTMLImageElement | HTMLCanvasElement> {
  const still = () => loadImage(BRAND_LOCKED.masterStill);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = BRAND_LOCKED.masterVideo;

    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("video timeout")), 8000);
      video.onloadeddata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error("video error"));
      };
    });

    const d = video.duration || 4;
    const at = Math.max(0.05, d * 0.92);
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = at;
      } catch {
        resolve();
      }
    });

    const c = document.createElement("canvas");
    c.width = STAGE_W;
    c.height = STAGE_H;
    const cctx = c.getContext("2d");
    if (!cctx) return still();
    cctx.fillStyle = "#0A0A0A";
    cctx.fillRect(0, 0, STAGE_W, STAGE_H);
    cctx.drawImage(video, 0, 0, STAGE_W, STAGE_H);
    video.src = "";
    return c;
  } catch {
    return still();
  }
}

export async function loadLockedOutroPaintAssets(): Promise<LockedOutroPaintAssets> {
  const [plate, qr] = await Promise.all([loadHoldPlate(), loadImage(BRAND_LOCKED.qrSrc)]);
  return { plate: plate as HTMLImageElement, qr };
}

function paintShine(ctx: CanvasRenderingContext2D, time: number) {
  const ix = ICON.cx - ICON.size / 2;
  const iy = ICON.cy - ICON.size / 2;
  const shineT = Math.min(1, Math.max(0, (time - 0.4) / 1.35));

  if (shineT <= 0 || shineT >= 1) {
    if (time > 1.8) {
      const idle = 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(time * Math.PI * 0.55));
      ctx.save();
      pathRoundRect(ctx, ix, iy, ICON.size, ICON.size, ICON.radius);
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
  pathRoundRect(ctx, ix, iy, ICON.size, ICON.size, ICON.radius);
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

let scratchCanvas: HTMLCanvasElement | null = null;
function getScratch(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = STAGE_W;
    scratchCanvas.height = STAGE_H;
  }
  const sctx = scratchCanvas.getContext("2d");
  if (!sctx) throw new Error("Canvas unsupported");
  return { canvas: scratchCanvas, ctx: sctx };
}

/** Paint one outro frame into ctx (dest size = width×height, source art is 1080×1920). */
export function paintLockedOutroFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    assets: LockedOutroPaintAssets;
    copy: UniversalOutroCopy;
    localTime: number;
    durationSec: number;
    width: number;
    height: number;
  },
) {
  const { assets, copy, width, height } = opts;
  const dur = Math.max(LOCKED_OUTRO_MIN_SEC, opts.durationSec || LOCKED_OUTRO_MIN_SEC);
  const t = Math.max(0, opts.localTime);
  const b = beats(dur);
  const languagesLine = copy.languagesLine || UNIVERSAL_OUTRO_EN.languagesLine;
  const ctaSubline = copy.ctaSubline || UNIVERSAL_OUTRO_EN.ctaSubline;
  const opLang = fadeIn(t, b.languages);
  const opCta = fadeIn(t, b.cta);
  const opSub = fadeIn(t, b.ctaSub);
  const opUrl = fadeIn(t, b.url);
  const opQr = fadeIn(t, b.qr);
  const fadeStart = dur - LOCKED_OUTRO_FADE_BLACK_SEC;
  const fadeBlack = t >= fadeStart ? Math.min(1, (t - fadeStart) / LOCKED_OUTRO_FADE_BLACK_SEC) : 0;

  const direct = width === STAGE_W && height === STAGE_H;
  const { canvas: scratch, ctx: g } = direct
    ? { canvas: null as unknown as HTMLCanvasElement, ctx }
    : getScratch();
  if (!direct) g.setTransform(1, 0, 0, 1, 0, 0);

  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.fillStyle = "#0A0A0A";
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  g.drawImage(assets.plate, 0, 0, STAGE_W, STAGE_H);
  paintShine(g, t);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;

  // Bottom gradient (matches UniversalBrandOutro overlay)
  const grad = g.createLinearGradient(0, STAGE_H * 0.62, 0, STAGE_H);
  grad.addColorStop(0, "rgba(10,10,10,0)");
  grad.addColorStop(0.28, "rgba(10,10,10,0.72)");
  grad.addColorStop(0.55, "rgba(10,10,10,0.96)");
  grad.addColorStop(1, "#0A0A0A");
  g.fillStyle = grad;
  g.fillRect(0, STAGE_H * 0.62, STAGE_W, STAGE_H * 0.38);

  g.textAlign = "center";
  g.textBaseline = "middle";

  // Match DOM flex column: lang → CTA → sub → url, padding-bottom 100
  const padBottom = 100;
  const langH = 48;
  const ctaH = 106; // padding 32 + 42px type + 32
  const subH = 40;
  const urlH = 46;
  const gapLangCta = 28;
  const gapCtaSub = 18;
  const gapSubUrl = 20;
  const stackH = langH + gapLangCta + ctaH + gapCtaSub + subH + gapSubUrl + urlH;
  const stackTop = STAGE_H - padBottom - stackH;
  const langY = stackTop + langH / 2;
  const ctaY = stackTop + langH + gapLangCta + ctaH / 2;
  const subY = stackTop + langH + gapLangCta + ctaH + gapCtaSub + subH / 2;
  const urlY = stackTop + langH + gapLangCta + ctaH + gapCtaSub + subH + gapSubUrl + urlH / 2;

  if (opLang > 0.01) {
    g.save();
    g.globalAlpha = opLang;
    g.fillStyle = "rgba(248,250,252,0.92)";
    g.font = `700 40px ${REEL_CAPTION_FONT}`;
    g.fillText(languagesLine.toUpperCase(), STAGE_W / 2, langY);
    g.restore();
  }

  if (opCta > 0.01) {
    g.save();
    g.globalAlpha = opCta;
    const label = copy.ctaHeadline;
    g.font = `800 42px ${REEL_CAPTION_FONT}`;
    const tw = Math.max(280, g.measureText(label).width);
    const padX = 56;
    const bw = Math.min(STAGE_W - 128, tw + padX * 2);
    const bh = ctaH;
    const bx = (STAGE_W - bw) / 2;
    const by = ctaY - bh / 2;

    const pill = g.createLinearGradient(bx, by, bx + bw, by + bh);
    pill.addColorStop(0, CYAN);
    pill.addColorStop(1, "#0EA5C6");
    g.fillStyle = pill;
    fillRoundRect(g, bx, by, bw, bh, bh / 2);

    g.strokeStyle = "rgba(255,255,255,0.2)";
    g.lineWidth = 2;
    pathRoundRect(g, bx, by, bw, bh, bh / 2);
    g.stroke();

    g.fillStyle = "#041018";
    g.font = `800 42px ${REEL_CAPTION_FONT}`;
    g.fillText(label, STAGE_W / 2, ctaY);
    g.restore();
  }

  if (opSub > 0.01) {
    g.save();
    g.globalAlpha = opSub;
    g.fillStyle = "rgba(255,255,255,0.78)";
    g.font = `600 34px ${REEL_CAPTION_FONT}`;
    g.fillText(ctaSubline, STAGE_W / 2, subY);
    g.restore();
  }

  if (opUrl > 0.01) {
    g.save();
    g.globalAlpha = opUrl;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.font = `700 38px ${REEL_CAPTION_FONT}`;
    g.fillText(BRAND_LOCKED.displayUrl, STAGE_W / 2, urlY);
    g.restore();
  }

  if (opQr > 0.01) {
    g.save();
    g.globalAlpha = opQr;
    const qs = 132;
    const qx = STAGE_W - 48 - qs;
    const qy = STAGE_H - 72 - qs;
    g.fillStyle = "#FFFFFF";
    fillRoundRect(g, qx, qy, qs, qs, 18);
    g.drawImage(assets.qr, qx + 10, qy + 10, qs - 20, qs - 20);
    g.restore();
  }

  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  if (fadeBlack > 0) {
    g.fillStyle = `rgba(0,0,0,${fadeBlack})`;
    g.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  if (!direct) {
    ctx.drawImage(scratch, 0, 0, width, height);
  }
}
