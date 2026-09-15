// In-memory store for live session snapshots.
// Data lives only while the session is active — never written to disk or DB.
// Cleared when session ends (via stop or terminate).

export interface SessionSnapshot {
  langA:       string;
  langB:       string;
  micLabel:    string;
  transcript:  string;
  translation: string;
  /** Parallel rows per finalized segment (from client buffers). Preferred for admin UI so embedded newlines in speech do not split rows. */
  transcriptLines?: string[];
  translationLines?: string[];
  /** Monotonic per client session — stale snapshot PUTs (out-of-order HTTP) are ignored. */
  snapshotSeq?: number;
  /** User workspace viewer prefs — admin live view mirrors these. */
  viewerTheme?: "light" | "dark";
  workspaceFontPx?: number;
  layoutMode?: "stacked" | "side-by-side";
  updatedAt:   number;
}

export const sessionStore = new Map<number, SessionSnapshot>();

/** Heartbeats keep lastActivityAt fresh. Treat that as a live connection even without a transcript snapshot. */
export const LIVE_SESSION_HEARTBEAT_MS = 45_000;

export function isFreshSessionHeartbeat(
  lastActivityAt: Date | null | undefined,
  nowMs = Date.now(),
): boolean {
  return (
    lastActivityAt instanceof Date &&
    Number.isFinite(lastActivityAt.getTime()) &&
    nowMs - lastActivityAt.getTime() <= LIVE_SESSION_HEARTBEAT_MS
  );
}

export function liveSessionPresence(
  sessionId: number,
  lastActivityAt: Date | null | undefined,
  nowMs = Date.now(),
): { hasSnapshot: boolean; micLabel: string | null } {
  const id = Number(sessionId);
  const snap = Number.isFinite(id) ? sessionStore.get(id) : undefined;
  const heartbeatFresh = isFreshSessionHeartbeat(lastActivityAt, nowMs);
  return {
    hasSnapshot: Boolean(snap) || heartbeatFresh,
    micLabel: snap?.micLabel ?? (heartbeatFresh ? "Live" : null),
  };
}

/** First-seen marker so admin does not label a heartbeating session as a ghost. */
export function ensureLiveSnapshot(
  sessionId: number,
  opts?: { langA?: string | null; langB?: string | null; micLabel?: string },
): void {
  const id = Number(sessionId);
  if (!Number.isFinite(id) || id <= 0 || sessionStore.has(id)) return;
  const langA = (opts?.langA ?? "").trim() || "en";
  let langB = (opts?.langB ?? "").trim() || "ar";
  if (langB === langA) langB = langA === "en" ? "ar" : "en";
  sessionStore.set(id, {
    langA,
    langB,
    micLabel: opts?.micLabel?.trim() || "Live",
    transcript: "",
    translation: "",
    updatedAt: Date.now(),
  });
}

