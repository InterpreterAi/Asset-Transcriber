import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { lastSecurityWatchSummary, runSecurityWatch } from "../lib/security-watch/job.js";
import { logger } from "../lib/logger.js";

const router = Router();

const STATUSES = new Set(["open", "dismissed", "handled"]);

router.get("/counts", requireAdmin, async (_req, res) => {
  const r = await pool.query(
    `SELECT
       count(*) FILTER (WHERE status = 'open' AND confidence = 'high')::int   AS open_high,
       count(*) FILTER (WHERE status = 'open' AND confidence = 'medium')::int AS open_medium
     FROM security_alerts`,
  );
  res.json({ openHigh: r.rows[0]?.open_high ?? 0, openMedium: r.rows[0]?.open_medium ?? 0 });
});

router.get("/alerts", requireAdmin, async (req, res) => {
  const status = String(req.query.status ?? "open");
  const includeLow = req.query.includeLow === "1";
  const params: unknown[] = [];
  const where: string[] = [];
  if (STATUSES.has(status)) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  if (!includeLow) where.push(`a.confidence <> 'low'`);

  const [rows, counts] = await Promise.all([
    pool.query(
      `SELECT a.id, a.status, a.score, a.confidence, a.report, a.first_detected_at, a.updated_at, a.emailed_at, a.resolved_at,
              a.older_user_id, a.newer_user_id,
              uo.is_active AS older_is_active, uo.plan_type AS older_plan_type,
              un.is_active AS newer_is_active, un.plan_type AS newer_plan_type
         FROM security_alerts a
         LEFT JOIN users uo ON uo.id = a.older_user_id
         LEFT JOIN users un ON un.id = a.newer_user_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY CASE a.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.score DESC, a.updated_at DESC
        LIMIT 200`,
      params,
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE status = 'open' AND confidence = 'high')::int   AS open_high,
         count(*) FILTER (WHERE status = 'open' AND confidence = 'medium')::int AS open_medium,
         count(*) FILTER (WHERE status = 'open' AND confidence = 'low')::int    AS open_low,
         count(*) FILTER (WHERE status = 'dismissed')::int                      AS dismissed,
         count(*) FILTER (WHERE status = 'handled')::int                        AS handled
       FROM security_alerts`,
    ),
  ]);

  res.json({
    alerts: rows.rows.map((r) => ({
      id: r.id,
      status: r.status,
      score: r.score,
      confidence: r.confidence,
      firstDetectedAt: r.first_detected_at,
      updatedAt: r.updated_at,
      emailedAt: r.emailed_at,
      resolvedAt: r.resolved_at,
      report: r.report,
      current: {
        [r.older_user_id]: { isActive: r.older_is_active, planType: r.older_plan_type },
        [r.newer_user_id]: { isActive: r.newer_is_active, planType: r.newer_plan_type },
      },
    })),
    counts: {
      openHigh: counts.rows[0]?.open_high ?? 0,
      openMedium: counts.rows[0]?.open_medium ?? 0,
      openLow: counts.rows[0]?.open_low ?? 0,
      dismissed: counts.rows[0]?.dismissed ?? 0,
      handled: counts.rows[0]?.handled ?? 0,
    },
    lastRun: lastSecurityWatchSummary(),
  });
});

router.patch("/alerts/:id", requireAdmin, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  const status = String((req.body as { status?: string })?.status ?? "");
  if (!Number.isFinite(id) || !STATUSES.has(status)) {
    res.status(400).json({ error: "Valid id and status (open | dismissed | handled) are required." });
    return;
  }
  const r = await pool.query(
    `UPDATE security_alerts
        SET status = $2, resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE NOW() END
      WHERE id = $1
      RETURNING id, status, resolved_at`,
    [id, status],
  );
  if (!r.rows[0]) {
    res.status(404).json({ error: "Alert not found." });
    return;
  }
  res.json({ alert: r.rows[0] });
});

router.post("/run", requireAdmin, async (_req, res) => {
  try {
    const summary = await runSecurityWatch();
    res.json({ summary });
  } catch (err) {
    logger.error({ err }, "Manual Security Watch run failed");
    res.status(500).json({ error: "Security scan failed. Check server logs." });
  }
});

export default router;
