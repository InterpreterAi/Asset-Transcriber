/**
 * InterpreterAIOutro — fixed deterministic brand outro (1080×1920).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  loadInterpreterAIOutroAssets,
  paintInterpreterAIOutroFrame,
  type InterpreterAIOutroAssets,
} from "@/lib/interpreterAIOutro";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import { LOCKED_OUTRO_FADE_BLACK_SEC, LOCKED_OUTRO_MIN_SEC } from "@/lib/universalBrandOutro";

const STAGE_W = 1080;
const STAGE_H = 1920;

export type InterpreterAIOutroProps = {
  localTime: number;
  durationSec: number;
  phraseTimings?: OutroPhraseTiming[];
  /** @deprecated Unused — kept for API compat. */
  syncToPhrases?: boolean;
  allowPointerEvents?: boolean;
};

export function InterpreterAIOutro({
  localTime,
  durationSec,
  allowPointerEvents = false,
}: InterpreterAIOutroProps) {
  const dur = Math.max(LOCKED_OUTRO_MIN_SEC, durationSec || LOCKED_OUTRO_MIN_SEC);
  const t = Math.max(0, localTime);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assetsRef = useRef<InterpreterAIOutroAssets | null>(null);
  const [, setAssetsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadInterpreterAIOutroAssets()
      .then((assets) => {
        if (cancelled) return;
        assetsRef.current = assets;
        setAssetsReady(true);
      })
      .catch(() => setAssetsReady(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const stage = canvasRef.current;
    const assets = assetsRef.current;
    if (!stage || !assets) return;
    const ctx = stage.getContext("2d");
    if (!ctx) return;

    paintInterpreterAIOutroFrame(ctx, { assets, localTimeSec: t });

    const fadeStart = dur - LOCKED_OUTRO_FADE_BLACK_SEC;
    const fadeBlack = t >= fadeStart ? Math.min(1, (t - fadeStart) / LOCKED_OUTRO_FADE_BLACK_SEC) : 0;
    if (fadeBlack > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fadeBlack})`;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
  }, [t, dur]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        overflow: "hidden",
        background: "#04060c",
        pointerEvents: allowPointerEvents ? "auto" : "none",
      }}
    >
      <canvas
        ref={canvasRef}
        width={STAGE_W}
        height={STAGE_H}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
