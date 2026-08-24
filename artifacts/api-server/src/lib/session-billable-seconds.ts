/**
 * Effective billable / display seconds for a session — same rules as admin
 * session-history reconstruction (prefer stored duration/audio, then activity /
 * wall-clock fallbacks). Used so admin TODAY/TOTAL and daily caps match what
 * operators see in session history.
 */

import { sql, type SQL } from "drizzle-orm";
import { sessionsTable } from "@workspace/db";

/** Cap aligned with admin session-history live/fallback windows (3h). */
export const MAX_SESSION_BILLABLE_SECONDS = 3 * 60 * 60;

/**
 * SQL expression: effective seconds for one `sessions` row (open or closed).
 * Prefer duration when > 0 (correct billed stop), then audio when > 0
 * (avoids COALESCE(0, duration) swallowing real duration), then activity /
 * translation wall-clock fallbacks used by admin history.
 */
export function effectiveSessionSecondsSql(): SQL<number> {
  return sql<number>`
    CASE
      WHEN ${sessionsTable.endedAt} IS NULL
        THEN LEAST(
          ${MAX_SESSION_BILLABLE_SECONDS},
          GREATEST(
            0,
            CASE
              WHEN COALESCE(${sessionsTable.audioSecondsProcessed}, 0) > 0
                THEN ${sessionsTable.audioSecondsProcessed}::double precision
              ELSE EXTRACT(EPOCH FROM (NOW() - ${sessionsTable.startedAt}))
            END
          )
        )
      WHEN COALESCE(${sessionsTable.durationSeconds}, 0) > 0
        THEN ${sessionsTable.durationSeconds}::double precision
      WHEN COALESCE(${sessionsTable.audioSecondsProcessed}, 0) > 0
        THEN ${sessionsTable.audioSecondsProcessed}::double precision
      WHEN ${sessionsTable.lastActivityAt} IS NOT NULL
        AND EXTRACT(EPOCH FROM (${sessionsTable.lastActivityAt} - ${sessionsTable.startedAt})) >= 90
        THEN LEAST(
          ${MAX_SESSION_BILLABLE_SECONDS},
          GREATEST(0, EXTRACT(EPOCH FROM (${sessionsTable.lastActivityAt} - ${sessionsTable.startedAt})))
        )
      WHEN COALESCE(${sessionsTable.translationTokens}, 0) > 0
        AND ${sessionsTable.endedAt} IS NOT NULL
        THEN LEAST(
          ${MAX_SESSION_BILLABLE_SECONDS},
          GREATEST(0, EXTRACT(EPOCH FROM (${sessionsTable.endedAt} - ${sessionsTable.startedAt})))
        )
      ELSE 0
    END
  `;
}

/** Raw SQL fragment for queries that alias the sessions table as `s`. */
export function effectiveSessionSecondsSqlAliasS(): string {
  const max = MAX_SESSION_BILLABLE_SECONDS;
  return `
    CASE
      WHEN s.ended_at IS NULL
        THEN LEAST(
          ${max},
          GREATEST(
            0,
            CASE
              WHEN COALESCE(s.audio_seconds_processed, 0) > 0
                THEN s.audio_seconds_processed::double precision
              ELSE EXTRACT(EPOCH FROM (NOW() - s.started_at))
            END
          )
        )
      WHEN COALESCE(s.duration_seconds, 0) > 0
        THEN s.duration_seconds::double precision
      WHEN COALESCE(s.audio_seconds_processed, 0) > 0
        THEN s.audio_seconds_processed::double precision
      WHEN s.last_activity_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (s.last_activity_at - s.started_at)) >= 90
        THEN LEAST(
          ${max},
          GREATEST(0, EXTRACT(EPOCH FROM (s.last_activity_at - s.started_at)))
        )
      WHEN COALESCE(s.translation_tokens, 0) > 0
        AND s.ended_at IS NOT NULL
        THEN LEAST(
          ${max},
          GREATEST(0, EXTRACT(EPOCH FROM (s.ended_at - s.started_at)))
        )
      ELSE 0
    END
  `;
}

export type SessionBillableFields = {
  startedAt: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  audioSecondsProcessed?: number | null;
  lastActivityAt?: Date | null;
  translationTokens?: number | null;
};

/**
 * JS equivalent for close/orphan/stale billing — credit real usage instead of 0
 * when the client never sent /session/stop.
 */
export function computeBillableSecondsFromSessionRow(
  s: SessionBillableFields,
  nowMs: number = Date.now(),
): number {
  const max = MAX_SESSION_BILLABLE_SECONDS;
  const audio = Math.max(0, Math.floor(Number(s.audioSecondsProcessed ?? 0) || 0));
  const duration = Math.max(0, Math.floor(Number(s.durationSeconds ?? 0) || 0));
  if (duration > 0) return Math.min(duration, max);
  if (audio > 0) {
    const activitySec =
      s.lastActivityAt && s.startedAt
        ? Math.max(0, (s.lastActivityAt.getTime() - s.startedAt.getTime()) / 1000)
        : 0;
    // Prefer the larger of reported PCM vs last-activity span when activity proves a long session.
    if (activitySec >= 90) return Math.min(Math.max(audio, Math.floor(activitySec)), max);
    return Math.min(audio, max);
  }
  if (s.lastActivityAt && s.startedAt) {
    const activitySec = (s.lastActivityAt.getTime() - s.startedAt.getTime()) / 1000;
    if (activitySec >= 90) return Math.min(Math.floor(activitySec), max);
  }
  const tokens = Number(s.translationTokens ?? 0);
  if (tokens > 0 && s.startedAt) {
    const endMs = s.endedAt?.getTime() ?? nowMs;
    const wall = Math.max(0, (endMs - s.startedAt.getTime()) / 1000);
    if (wall >= 30) return Math.min(Math.floor(wall), max);
  }
  return 0;
}
