import {
  readMorsyBasicCleanTranslationExperiment,
  writeMorsyBasicCleanTranslationExperiment,
} from "./cleanTranslation/gate";
import {
  readMorsyChunkTranslationV2Experiment,
  writeMorsyChunkTranslationV2Experiment,
} from "./chunkTranslationV2/gate";

export type MorsyTranslationStackMode = "default" | "clean" | "chunk-v2";

export type MorsyTranslationStackFlags = {
  clean: boolean;
  chunkV2: boolean;
};

/** Mutual exclusion — never both on (fixes stale localStorage after toggles). */
export function resolveMorsyTranslationStackFlags(): MorsyTranslationStackFlags {
  let chunkV2 = readMorsyChunkTranslationV2Experiment();
  let clean = readMorsyBasicCleanTranslationExperiment();
  if (chunkV2 && clean) {
    clean = false;
    writeMorsyBasicCleanTranslationExperiment(false);
  }
  return { clean, chunkV2 };
}

export function parseMorsyTranslationStackFromSearch(search: string): MorsyTranslationStackMode | null {
  const mt = new URLSearchParams(search).get("mt")?.trim().toLowerCase();
  if (!mt) return null;
  if (mt === "clean") return "clean";
  if (mt === "chunk-v2" || mt === "chunkv2" || mt === "chunk") return "chunk-v2";
  if (mt === "default" || mt === "off" || mt === "prod") return "default";
  return null;
}

export function flagsFromMorsyTranslationStackMode(
  mode: MorsyTranslationStackMode,
): MorsyTranslationStackFlags {
  if (mode === "clean") return { clean: true, chunkV2: false };
  if (mode === "chunk-v2") return { clean: false, chunkV2: true };
  return { clean: false, chunkV2: false };
}

export function morsyTranslationStackModeFromFlags(
  flags: MorsyTranslationStackFlags,
): MorsyTranslationStackMode {
  if (flags.chunkV2) return "chunk-v2";
  if (flags.clean) return "clean";
  return "default";
}

export function readMorsyTranslationStackInitial(): MorsyTranslationStackFlags {
  if (typeof window !== "undefined") {
    const fromUrl = parseMorsyTranslationStackFromSearch(window.location.search);
    if (fromUrl) {
      const flags = flagsFromMorsyTranslationStackMode(fromUrl);
      persistMorsyTranslationStackFlags(flags);
      return flags;
    }
  }
  return resolveMorsyTranslationStackFlags();
}

export function persistMorsyTranslationStackFlags(flags: MorsyTranslationStackFlags): void {
  const chunkV2 = flags.chunkV2 && !flags.clean;
  const clean = flags.clean && !chunkV2;
  writeMorsyChunkTranslationV2Experiment(chunkV2);
  writeMorsyBasicCleanTranslationExperiment(clean);
}

export function workspacePathWithMtQuery(
  pathname: string,
  search: string,
  flags: MorsyTranslationStackFlags,
): string {
  const params = new URLSearchParams(search);
  if (flags.chunkV2) params.set("mt", "chunk-v2");
  else if (flags.clean) params.set("mt", "clean");
  else params.delete("mt");
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}
