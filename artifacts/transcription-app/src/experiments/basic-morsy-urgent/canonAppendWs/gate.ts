import { morsyUrgentAppendOnlyTranscriptDomPath } from "@/hooks/morsy-isolated-transcript-canonical";

export const BASIC_MORSY_CANON_WS_ENGINE_LS = "interpreterai_basic_morsy_canon_ws_engine";

export function readCanonAppendWsFullEngineEnabled(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(BASIC_MORSY_CANON_WS_ENGINE_LS) === "1";
  } catch {
    return false;
  }
}

export function gateCanonAppendWsIsolatedRebuild(args: {
  planTypeLower: string;
  segmentBehaviorMode: string;
  transcriptSegmentIsolationEnabled: boolean;
}): boolean {
  if (!readCanonAppendWsFullEngineEnabled()) return false;
  return morsyUrgentAppendOnlyTranscriptDomPath({
    planTypeLower: args.planTypeLower,
    segmentBehaviorMode: args.segmentBehaviorMode,
    transcriptSegIsolation: args.transcriptSegmentIsolationEnabled,
  });
}
