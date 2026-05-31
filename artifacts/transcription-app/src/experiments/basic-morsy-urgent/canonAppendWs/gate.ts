import { morsyUrgentAppendOnlyTranscriptDomPath } from "@/hooks/morsy-isolated-transcript-canonical";

import { CANON_SILENCE_SEGMENT_MS as CANON_SILENCE_SEGMENT_MS_POLICY } from "./policies/segmentation-constants";

export const BASIC_MORSY_CANON_WS_ENGINE_LS = "interpreterai_basic_morsy_canon_ws_engine";

/** Plans that use the isolated canonAppendWs Soniox STT engine (shared segmentation/diarization). */
export const CANON_APPEND_WS_STT_PLAN_TYPES = [
  "morsy-urgent",
  /** Transcription-only tier — same canonAppendWs STT as Morsy; translation disabled client-side. */
  "legacy2",
  "trial-openai",
  "trial-hetzner",
  "trial-libre",
  "basic-openai",
  "professional-openai",
  "platinum-openai",
  "basic-libre",
  "professional-libre",
  "platinum-libre",
  /** Legacy DB plan_type values (same STT path). */
  "trial",
  "basic",
  "professional",
  "platinum",
  "unlimited",
] as const;

export function planUsesCanonAppendWsStt(planTypeLower: string): boolean {
  const p = planTypeLower.trim().toLowerCase();
  return (CANON_APPEND_WS_STT_PLAN_TYPES as readonly string[]).includes(p);
}

/** Milliseconds without SONIOX tokens before *considering* utterance row close (secondary gates apply). canonAppendWs ONLY. */
export const CANON_SILENCE_SEGMENT_MS = CANON_SILENCE_SEGMENT_MS_POLICY;

/**
 * **Basic · Morsy Urgent + canonAppendWs path**: isolated SONIOX engine is **ON by default**
 * (`morsyUrgentAppendOnlyTranscriptDomPath` match).
 *
 * Opt back to legacy WebSocket/transcript reconciliation:
 * ```
 * localStorage.setItem(BASIC_MORSY_CANON_WS_ENGINE_LS, "0")
 * ```
 * Remove the key or set to anything other than `"0"` for isolated engine.
 */
export function readCanonAppendWsIsolatedOptOutLegacy(): boolean {
  try {
    return (
      typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(BASIC_MORSY_CANON_WS_ENGINE_LS) === "0"
    );
  } catch {
    return false;
  }
}

export function gateCanonAppendWsIsolatedRebuild(args: {
  planTypeLower: string;
  segmentBehaviorMode: string;
  transcriptSegmentIsolationEnabled: boolean;
}): boolean {
  if (readCanonAppendWsIsolatedOptOutLegacy()) return false;
  return morsyUrgentAppendOnlyTranscriptDomPath({
    planTypeLower: args.planTypeLower,
    segmentBehaviorMode: args.segmentBehaviorMode,
    transcriptSegIsolation: args.transcriptSegmentIsolationEnabled,
  });
}
