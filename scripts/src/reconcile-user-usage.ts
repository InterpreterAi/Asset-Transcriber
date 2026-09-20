/**
 * Ops: set minutes_used_today from today's session-history billable minutes.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/scripts run reconcile-user-usage -- modyehab2479
 */
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: join(rootDir, ".env") });

/** Same rules as admin session-history / getBillableMinutesUsedToday. */
const EFFECTIVE_SECONDS_SQL = `
  CASE
    WHEN s.ended_at IS NULL
      THEN LEAST(
        43200,
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
        43200,
        GREATEST(0, EXTRACT(EPOCH FROM (s.last_activity_at - s.started_at)))
      )
    WHEN COALESCE(s.translation_tokens, 0) > 0
      AND s.ended_at IS NOT NULL
      THEN LEAST(
        43200,
        GREATEST(0, EXTRACT(EPOCH FROM (s.ended_at - s.started_at)))
      )
    ELSE 0
  END
`;

async function main() {
  const username = (process.argv[2] ?? "").trim();
  if (!username) {
    console.error("Usage: pnpm --filter @workspace/scripts run reconcile-user-usage -- <username>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const { pool } = await import("@workspace/db");
  const { startOfAppDay } = await import("@workspace/app-timezone");

  const userRes = await pool.query<{
    id: number;
    username: string;
    minutes_used_today: number;
    total_minutes_used: number;
    total_sessions: number;
  }>(
    `SELECT id, username, minutes_used_today, total_minutes_used, total_sessions
     FROM users WHERE username = $1 LIMIT 1`,
    [username],
  );
  const user = userRes.rows[0];
  if (!user) {
    console.error(`User not found: ${username}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const todayStart = startOfAppDay();
  const usageRes = await pool.query<{ minutes_today: string; session_count: string }>(
    `SELECT
       COALESCE(SUM(${EFFECTIVE_SECONDS_SQL}), 0) / 60.0 AS minutes_today,
       COUNT(*)::int AS session_count
     FROM sessions s
     WHERE s.user_id = $1 AND s.started_at >= $2`,
    [user.id, todayStart],
  );

  const reconciledMinutes = Number(usageRes.rows[0]?.minutes_today ?? 0);
  const previous = Number(user.minutes_used_today ?? 0);
  const todayDelta = Math.max(0, reconciledMinutes - previous);

  await pool.query(
    `UPDATE users
     SET minutes_used_today = $1,
         total_minutes_used = total_minutes_used + $2
     WHERE id = $3`,
    [reconciledMinutes, todayDelta, user.id],
  );

  console.log(
    JSON.stringify(
      {
        userId: user.id,
        username: user.username,
        previousMinutesUsedToday: previous,
        reconciledMinutesUsedToday: reconciledMinutes,
        totalMinutesUsedDelta: todayDelta,
        sessionsToday: Number(usageRes.rows[0]?.session_count ?? 0),
        totalMinutesUsedBefore: Number(user.total_minutes_used),
        totalSessions: Number(user.total_sessions),
      },
      null,
      2,
    ),
  );

  await pool.end().catch(() => {});
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { pool } = await import("@workspace/db");
    await pool.end().catch(() => {});
  } catch {
    /* ignore */
  }
  process.exit(1);
});
