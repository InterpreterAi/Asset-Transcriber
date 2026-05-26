import { morsyUrgentAppendOnlyTranscriptDomPath } from "@/hooks/morsy-isolated-transcript-canonical";

export const BASIC_MORSY_CANON_WS_ENGINE_LS = "interpreterai_basic_morsy_canon_ws_engine";

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
