/**
 * InterpreterAIOutro — fixed deterministic brand outro composition.
 */

export {
  INTERPRETER_AI_OUTRO_COPY,
  INTERPRETER_AI_OUTRO_VO,
  INTERPRETER_AI_OUTRO_VO_LINES,
} from "@/lib/interpreterAIOutro/lockedCopy";

export {
  INTERPRETER_AI_OUTRO_DURATION_SEC,
  INTERPRETER_AI_OUTRO_FPS,
  INTERPRETER_AI_OUTRO_TIMELINE,
} from "@/lib/interpreterAIOutro/timeline";

export { OUTRO_LAYOUT, OUTRO_COLORS, OUTRO_W, OUTRO_H } from "@/lib/interpreterAIOutro/layout";

export {
  paintInterpreterAIOutroFrame,
  type InterpreterAIOutroAssets,
  type PaintInterpreterAIOutroFrameOpts,
} from "@/lib/interpreterAIOutro/paintFrame";

export { paintInterpreterAIOutroAmbient } from "@/lib/interpreterAIOutro/paintAmbient";

import { BRAND_LOCKED } from "@/lib/universalBrandOutro";
import type { InterpreterAIOutroAssets } from "@/lib/interpreterAIOutro/paintFrame";

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export type InterpreterAIOutroConfig = {
  durationSec: number;
  fps: number;
  voiceoverUrl?: string | null;
  plateSrc: string;
};

export const DEFAULT_INTERPRETER_AI_OUTRO_CONFIG: InterpreterAIOutroConfig = {
  durationSec: 5,
  fps: 30,
  voiceoverUrl: BRAND_LOCKED.canonicalAudio,
  plateSrc: BRAND_LOCKED.outroPlateSrc,
};

export async function loadInterpreterAIOutroAssets(
  config: Pick<InterpreterAIOutroConfig, "plateSrc"> = DEFAULT_INTERPRETER_AI_OUTRO_CONFIG,
): Promise<InterpreterAIOutroAssets> {
  const plate = await loadImage(config.plateSrc);
  return { plate };
}
