import type { Token } from "../types/tokens";

export type SonioxFrame = {
  seq: number;
  tokens: Token[];
  endpoint: boolean;
  speaker?: string;
  language?: string;
  timestamp: number;
  /** SONIOX root fields when present — used for hypothesis lag / maturity heuristics. */
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
};
