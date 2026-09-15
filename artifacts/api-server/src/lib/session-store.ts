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

export const TAB_AUDIO_SNAPSHOT_LABEL = "Browser Tab Audio";

export function isPlaceholderAudioLabel(label: string | null | undefined): boolean {
  const l = (label ?? "").trim().toLowerCase();
  return !l || l === "live" || l === "connecting" || l === "connecting…";
}

function activityTimeMs(lastActivityAt: Date | string | null | undefined): number | null {
  if (lastActivityAt == null) return null;
  const t = lastActivityAt instanceof Date ? lastActivityAt.getTime() : Date.parse(String(lastActivityAt));
  return Number.isFinite(t) ? t : null;
}

export function isFreshSessionHeartbeat(
  lastActivityAt: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const t = activityTimeMs(lastActivityAt);
  return t != null && nowMs - t <= LIVE_SESSION_HEARTBEAT_MS;
}

function realMicLabel(raw: string | null | undefined): string | null {
  const label = (raw ?? "").trim();
  if (!label || isPlaceholderAudioLabel(label)) return null;
  return label;
}

export function liveSessionPresence(
  sessionId: number,
  lastActivityAt: Date | string | null | undefined,
  nowMs = Date.now(),
): { hasSnapshot: boolean; micLabel: string | null } {
  const id = Number(sessionId);
  const snap = Number.isFinite(id) ? sessionStore.get(id) : undefined;
  const heartbeatFresh = isFreshSessionHeartbeat(lastActivityAt, nowMs);
  return {
    hasSnapshot: Boolean(snap) || heartbeatFresh,
    micLabel: realMicLabel(snap?.micLabel),
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
    micLabel: realMicLabel(opts?.micLabel) ?? "",
    transcript: "",
    translation: "",
    updatedAt: Date.now(),
  });
}

/** Heartbeat / snapshot can name Mic vs Tab without waiting for transcript text. */
export function applyLiveSnapshotMicLabel(sessionId: number, micLabel: unknown): void {
  const id = Number(sessionId);
  const label = realMicLabel(typeof micLabel === "string" ? micLabel : null);
  if (!Number.isFinite(id) || id <= 0 || !label) return;
  const prev = sessionStore.get(id);
  if (prev) {
    if (prev.micLabel === label) return;
    sessionStore.set(id, { ...prev, micLabel: label, updatedAt: Date.now() });
    return;
  }
  ensureLiveSnapshot(id, { micLabel: label });
}

