export type DebugEventKind =
  | "frame"
  | "endpoint_flush"
  | "speaker_pivot_confirmed"
  | "speaker_pivot_pending"
  | "hypothesis_change"
  | "ledger_append";

export type DebugEventPayload = Record<string, unknown> & {
  kind: DebugEventKind;
};

const RING_MAX = 200;
const GLOBAL_KEY = "__interpreterAiCanonAppendWsDbg";

export function emitDebugEvent(evt: DebugEventPayload): void {
  try {
    const g = globalThis as Record<string, unknown>;
    const ring = Array.isArray(g[GLOBAL_KEY]) ? g[GLOBAL_KEY] as DebugEventPayload[] : [];
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
    return Array.isArray(ring) ? [...ring] as DebugEventPayload[] : [];
  } catch {
    return [];
  }
}
