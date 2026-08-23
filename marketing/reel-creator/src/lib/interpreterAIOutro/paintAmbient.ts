/**
 * Continuous time-based ambient motion overlay.
 * Driven only by `time` (seconds) — never VO, never duration, never resets.
 */

import { OUTRO_H, OUTRO_W } from "@/lib/interpreterAIOutro/layout";

/** Deterministic ambient overlay — subtle cyan breathing + flowing light. */
export function paintInterpreterAIOutroAmbient(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  stageW = OUTRO_W,
  stageH = OUTRO_H,
): void {
  const t = Math.max(0, timeSec);

  const breathe = 0.5 + 0.5 * Math.sin(t * 0.31);
  const breathe2 = 0.5 + 0.5 * Math.sin(t * 0.19 + 1.7);
  const breathe3 = 0.5 + 0.5 * Math.sin(t * 0.13 + 3.1);

  ctx.save();

  // Very subtle whole-frame luminance pulse (barely perceptible).
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = `rgba(180, 230, 255, ${(0.018 + breathe * 0.012).toFixed(4)})`;
  ctx.fillRect(0, 0, stageW, stageH);

  ctx.globalCompositeOperation = "screen";

  // Top-right atmospheric glow — slow drift + breathe.
  const topGlowX = stageW * (0.8 + 0.035 * Math.sin(t * 0.17));
  const topGlowY = stageH * (0.07 + 0.02 * Math.cos(t * 0.14));
  const topGlowR = stageW * (0.55 + 0.05 * Math.sin(t * 0.23 + 0.8));
  const topAlpha = 0.045 + breathe * 0.028;
  let g = ctx.createRadialGradient(topGlowX, topGlowY, 8, topGlowX, topGlowY, topGlowR);
  g.addColorStop(0, `rgba(32, 212, 240, ${topAlpha.toFixed(4)})`);
  g.addColorStop(0.45, "rgba(20, 120, 180, 0.018)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, stageW, stageH);

  // Center soft halo behind logo zone.
  const centerX = stageW * (0.5 + 0.012 * Math.sin(t * 0.11));
  const centerY = stageH * (0.28 + 0.008 * Math.cos(t * 0.09));
  const centerR = stageW * (0.38 + 0.04 * breathe2);
  g = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, centerR);
  g.addColorStop(0, `rgba(32, 212, 240, ${(0.022 + breathe2 * 0.016).toFixed(4)})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, stageW, stageH);

  // Lower trail region — slow horizontal flow + vertical drift.
  const trailCx = stageW * (0.5 + 0.025 * Math.sin(t * 0.21 + 2.2));
  const trailCy = stageH * (0.56 + 0.012 * Math.sin(t * 0.16));
  const trailRx = stageW * (0.42 + 0.03 * breathe3);
  const trailRy = stageH * (0.11 + 0.015 * Math.sin(t * 0.18 + 1.1));
  ctx.save();
  ctx.translate(trailCx, trailCy);
  ctx.rotate(-0.06 + 0.012 * Math.sin(t * 0.12));
  g = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(trailRx, trailRy));
  g.addColorStop(0, `rgba(32, 212, 240, ${(0.035 + breathe3 * 0.022).toFixed(4)})`);
  g.addColorStop(0.55, "rgba(32, 180, 220, 0.012)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, trailRx, trailRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Secondary lower glow — opposite phase for depth.
  const trail2Cx = stageW * (0.48 + 0.02 * Math.cos(t * 0.15 + 4.0));
  const trail2Cy = stageH * (0.58 + 0.01 * Math.cos(t * 0.11 + 0.5));
  g = ctx.createRadialGradient(trail2Cx, trail2Cy, 6, trail2Cx, trail2Cy, stageW * 0.35);
  g.addColorStop(0, `rgba(80, 220, 255, ${(0.02 + breathe * 0.014).toFixed(4)})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, stageW, stageH);

  // Sparse drifting particles (deterministic, time-continuous).
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 24; i++) {
    const phase = i * 1.618 + 0.37;
    const px = ((i * 173.3 + t * (8 + (i % 5) * 1.2)) % stageW);
    const py =
      stageH * (0.48 + (i % 7) * 0.06) +
      Math.sin(t * (0.25 + (i % 4) * 0.06) + phase) * 28 +
      Math.cos(t * 0.08 + phase) * 12;
    const tw = 0.35 + 0.65 * Math.sin(t * (0.5 + (i % 3) * 0.15) + phase);
    const alpha = tw * 0.22;
    if (alpha < 0.04) continue;
    const r = 0.6 + (i % 3) * 0.35;
    ctx.fillStyle = `rgba(180, 235, 255, ${alpha.toFixed(4)})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
