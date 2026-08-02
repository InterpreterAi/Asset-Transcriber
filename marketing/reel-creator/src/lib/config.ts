import rawConfig from "../../reel.config.json";

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

export type ReelConfig = {
  /** Live Admin Marketing Demo URL — record this page; never recreate it. */
  demoUrl: string;
  intro: {
    enabled: boolean;
    durationMs: number;
    transparent: boolean;
  };
  outro: {
    enabled: boolean;
    durationMs: number;
  };
  referralLink: string;
  cta: string;
  export: {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    filename: string;
    format: "mp4";
    codec: "h264";
    /** exact = recording must already be 1080×1920; blit 1:1 only. */
    fit: "exact";
    background: string;
  };
};

export const reelConfig = rawConfig as ReelConfig;

export function compositionDurationMs(videoDurationSec: number, cfg: ReelConfig = reelConfig): number {
  const intro = cfg.intro.enabled ? cfg.intro.durationMs : 0;
  const outro = cfg.outro.enabled ? cfg.outro.durationMs : 0;
  return intro + Math.max(0, videoDurationSec) * 1000 + outro;
}

export type CompPhase = "idle" | "intro" | "video" | "outro" | "done";

export function phaseAt(
  elapsedMs: number,
  videoDurationSec: number,
  cfg: ReelConfig = reelConfig,
): CompPhase {
  if (videoDurationSec <= 0 && elapsedMs <= 0) return "idle";
  const intro = cfg.intro.enabled ? cfg.intro.durationMs : 0;
  const videoMs = Math.max(0, videoDurationSec) * 1000;
  const outro = cfg.outro.enabled ? cfg.outro.durationMs : 0;
  if (elapsedMs < intro) return "intro";
  if (elapsedMs < intro + videoMs) return "video";
  if (elapsedMs < intro + videoMs + outro) return "outro";
  return "done";
}

/** Map composition time → source video time (seconds). */
export function videoTimeAt(
  elapsedMs: number,
  videoDurationSec: number,
  cfg: ReelConfig = reelConfig,
): number {
  const intro = cfg.intro.enabled ? cfg.intro.durationMs : 0;
  const t = (elapsedMs - intro) / 1000;
  return Math.min(Math.max(0, t), Math.max(0, videoDurationSec - 0.001));
}
