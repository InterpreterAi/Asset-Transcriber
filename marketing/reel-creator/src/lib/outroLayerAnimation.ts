/**
 * Outro layer reveal timing + subtle animation presets (shared preview + export).
 */

import type { OutroAnimationPreset, OutroLayerDef, OutroLayerId } from "@/lib/outroLayerLayout";
import {
  CANONICAL_LAYER_FALLBACK_START,
  phraseTimingsForLayer,
  type OutroPhraseTiming,
} from "@/lib/outroVoPacing";

export type LayerAnimState = {
  progress: number;
  alpha: number;
  offsetY: number;
  scale: number;
  blurPx: number;
};

export const OUTRO_ANIMATION_LABELS: Record<OutroAnimationPreset, string> = {
  none: "None",
  fade: "Fade",
  fadeRise: "Fade and rise",
  softScale: "Soft scale",
  blurClear: "Blur to clear",
};

function easeOutCubic(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - p, 3);
}

function fallbackStartForLayer(layerId: OutroLayerId, layer: Pick<OutroLayerDef, "phraseDelaySec">): number | null {
  const fb = CANONICAL_LAYER_FALLBACK_START[layerId];
  if (fb == null) return null;
  return fb + (layer.phraseDelaySec ?? 0);
}

/** When syncToPhrases is false, layers stay fully visible (edit mode). */
export function resolveLayerAnimWindow(
  layer: Pick<OutroLayerDef, "animStartSec" | "animDurationSec" | "phraseDelaySec" | "phraseIndex">,
  layerId: OutroLayerId,
  phraseTimings: OutroPhraseTiming[],
  syncToPhrases: boolean,
): { startSec: number; durationSec: number } {
  const durationSec = Math.max(0.05, layer.animDurationSec || 0.35);
  if (!syncToPhrases) {
    return { startSec: 0, durationSec };
  }

  const phrase = phraseTimingsForLayer(layerId, layer.phraseIndex, phraseTimings);
  if (phrase) {
    return { startSec: phrase.startSec + (layer.phraseDelaySec ?? 0), durationSec };
  }

  const fallback = fallbackStartForLayer(layerId, layer);
  if (fallback != null) {
    return { startSec: fallback, durationSec };
  }

  if (layer.phraseIndex < 0 && phraseTimings.length > 0) {
    const urlPhrase = phraseTimings.find((p) => p.layerId === "url");
    if (urlPhrase && layerId === "qr") {
      return { startSec: (CANONICAL_LAYER_FALLBACK_START.qr ?? urlPhrase.startSec + 0.15), durationSec };
    }
    if (urlPhrase && layerId === "ctaSubline") {
      const ctaPhrase = phraseTimings.find((p) => p.layerId === "ctaHeadline");
      const base = ctaPhrase?.startSec ?? CANONICAL_LAYER_FALLBACK_START.ctaSubline ?? 4.5;
      return { startSec: base + (layer.phraseDelaySec ?? 0), durationSec };
    }
  }

  return { startSec: layer.animStartSec, durationSec };
}

function rawProgress(
  localTime: number,
  startSec: number,
  durationSec: number,
  preset: OutroAnimationPreset,
): number {
  if (localTime < startSec) return 0;
  if (preset === "none") return 1;
  return Math.min(1, (localTime - startSec) / durationSec);
}

export function computeLayerAnimState(
  layer: OutroLayerDef,
  layerId: OutroLayerId,
  localTime: number,
  phraseTimings: OutroPhraseTiming[],
  syncToPhrases: boolean,
): LayerAnimState {
  if (!syncToPhrases) {
    return { progress: 1, alpha: 1, offsetY: 0, scale: 1, blurPx: 0 };
  }

  const { startSec, durationSec } = resolveLayerAnimWindow(
    layer,
    layerId,
    phraseTimings,
    syncToPhrases,
  );
  const eased = easeOutCubic(rawProgress(localTime, startSec, durationSec, layer.animation));
  if (eased <= 0) {
    return { progress: 0, alpha: 0, offsetY: 0, scale: 1, blurPx: 0 };
  }

  switch (layer.animation) {
    case "none":
      return { progress: 1, alpha: 1, offsetY: 0, scale: 1, blurPx: 0 };
    case "fadeRise":
      return { progress: eased, alpha: eased, offsetY: (1 - eased) * 28, scale: 1, blurPx: 0 };
    case "softScale":
      return { progress: eased, alpha: eased, offsetY: 0, scale: 0.9 + 0.1 * eased, blurPx: 0 };
    case "blurClear":
      return { progress: eased, alpha: eased, offsetY: 0, scale: 1, blurPx: (1 - eased) * 10 };
    case "fade":
    default:
      return { progress: eased, alpha: eased, offsetY: 0, scale: 1, blurPx: 0 };
  }
}

export function shouldDrawAnimatedLayer(state: LayerAnimState): boolean {
  return state.progress > 0 && state.alpha > 0.01;
}
