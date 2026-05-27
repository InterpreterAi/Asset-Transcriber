export type SegmentCloseReason =
  | "speaker_switch"
  | "language_switch"
  | "endpoint"
  | "silence"
  | "max_duration"
  | "manual_finalize";

export type DebugEventKind =
  | "frame"
  | "endpoint_flush"
  | "segment_close"
  | "utterance_finalize"
  | "speaker_pivot_confirmed"
  | "speaker_pivot_pending"
  | "hypothesis_change"
  | "ledger_append";

export type SegmentCloseDebugPayload = {
  kind: "segment_close";
  reason: SegmentCloseReason;
  tokenCount: number;
  utteranceDurationMs: number;
  priorSpeaker?: string;
  priorLanguage?: string;
  nextSpeaker?: string;
  nextLanguage?: string;
};

export type UtteranceFinalizeDebugPayload = {
  kind: "utterance_finalize";
  reason: SegmentCloseReason;
  tokenCount: number;
  utteranceDurationMs: number;
  segmentCount: number;
  priorSpeaker?: string;
  priorLanguage?: string;
  nextSpeaker?: string;
  nextLanguage?: string;
};

export type DebugEventPayload =
  | (Record<string, unknown> & { kind: DebugEventKind })
  | SegmentCloseDebugPayload
  | UtteranceFinalizeDebugPayload;

const RING_MAX = 200;
const GLOBAL_KEY = "__interpreterAiCanonAppendWsDbg";

export function emitDebugEvent(evt: DebugEventPayload): void {
  try {
    const g = globalThis as Record<string, unknown>;
    const ring = Array.isArray(g[GLOBAL_KEY]) ? (g[GLOBAL_KEY] as DebugEventPayload[]) : [];
    ring.push({ ...evt, t: Date.now() });
    while (ring.length > RING_MAX) ring.shift();
    g[GLOBAL_KEY] = ring;
  } catch {
    /* ignore */
  }
}

export function readDebugRing(): DebugEventPayload[] {
  try {
    const g = globalThis as Record<string, unknown>;
    const ring = g[GLOBAL_KEY];
    return Array.isArray(ring) ? ([...ring] as DebugEventPayload[]) : [];
  } catch {
    return [];
  }
}
