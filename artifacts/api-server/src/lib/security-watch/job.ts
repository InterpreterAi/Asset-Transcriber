import { pool } from "@workspace/db";
import { analyzeSecurity, loadSecurityData, scopeIps, type SecurityCase } from "./detector.js";
import { resolveGeo, type GeoCache, type GeoInfo } from "./geo.js";
import { adminAlertEmail, formatAdminAlertTime } from "../admin-alert-email.js";
import { getStaticPublicBaseUrl } from "../authEnv.js";
import {
  emailBulletList,
  emailParagraph,
  emailSubheading,
  renderInterpreterAiEmail,
} from "../email-template.js";
import { isResendConfigured, RESEND_FROM_SECURITY, sendEmail } from "../resend-mail.js";
import { logger } from "../logger.js";

export type SecurityWatchRunSummary = {
  ranAt: string;
  durationMs: number;
  cases: number;
  high: number;
  medium: number;
  low: number;
  newAlerts: number;
  emailed: number;
};

const dbGeoCache: GeoCache = {
  async get(ips) {
    const out = new Map<string, GeoInfo>();
    if (!ips.length) return out;
    const r = await pool.query(
      `SELECT ip, city, region, country, org, is_vpn FROM security_ip_geo WHERE ip = ANY($1::text[])`,
      [ips],
    );
    for (const row of r.rows) {
      out.set(row.ip, { city: row.city, region: row.region, country: row.country, org: row.org, isVpn: row.is_vpn });
    }
    return out;
  },
  async set(entries) {
    if (!entries.length) return;
    await pool.query(
      `INSERT INTO security_ip_geo (ip, city, region, country, org, is_vpn)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[])
       ON CONFLICT (ip) DO UPDATE SET city = EXCLUDED.city, region = EXCLUDED.region, country = EXCLUDED.country,
         org = EXCLUDED.org, is_vpn = EXCLUDED.is_vpn, looked_up_at = NOW()`,
      [
        entries.map(([ip]) => ip),
        entries.map(([, g]) => g.city),
        entries.map(([, g]) => g.region),
        entries.map(([, g]) => g.country),
        entries.map(([, g]) => g.org),
        entries.map(([, g]) => g.isVpn),
      ],
    );
  },
};

async function persistCases(cases: SecurityCase[]): Promise<{ newAlerts: number; toEmail: Array<{ id: number; c: SecurityCase }> }> {
  let newAlerts = 0;
  const toEmail: Array<{ id: number; c: SecurityCase }> = [];
  for (const c of cases) {
    const r = await pool.query(
      `INSERT INTO security_alerts (pair_key, older_user_id, newer_user_id, score, confidence, report)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (pair_key) DO UPDATE SET
         score = EXCLUDED.score,
         confidence = EXCLUDED.confidence,
         report = EXCLUDED.report,
         updated_at = NOW(),
         status = CASE
           WHEN security_alerts.status = 'dismissed' AND EXCLUDED.confidence = 'high' AND security_alerts.confidence <> 'high'
             THEN 'open'
           ELSE security_alerts.status
         END
       RETURNING id, status, emailed_at, (xmax = 0) AS inserted`,
      [c.key, c.olderUserId, c.newerUserId, c.score, c.confidence, JSON.stringify(c)],
    );
    const row = r.rows[0];
    if (!row) continue;
    if (row.inserted) newAlerts++;
    if (c.confidence === "high" && row.status === "open" && !row.emailed_at) toEmail.push({ id: Number(row.id), c });
  }
  return { newAlerts, toEmail };
}

function caseEmailBlock(c: SecurityCase): string {
  const timeline = c.timeline.slice(0, 10).map((t) => `${formatAdminAlertTime(t.at)} · ${t.text}`);
  return [
    emailSubheading(`Score ${c.score} · ${c.confidence} confidence`),
    emailParagraph(c.summary),
    emailBulletList(c.signals.slice(0, 8).map((s) => s.text)),
    ...(c.counterSignals.length ? [emailParagraph("Against:"), emailBulletList(c.counterSignals.map((s) => s.text))] : []),
    ...(timeline.length ? [emailParagraph("Timeline:"), emailBulletList(timeline)] : []),
    emailParagraph(`Innocent explanation: ${c.innocentExplanation}`),
    emailParagraph(`What to do: ${c.recommendation}`),
  ].join("");
}

async function emailDigest(items: Array<{ id: number; c: SecurityCase }>): Promise<number> {
  const to = adminAlertEmail();
  if (!to || !items.length || !isResendConfigured()) return 0;
  const shown = items.slice(0, 10);
  const base = getStaticPublicBaseUrl().replace(/\/+$/, "");
  const first = shown[0]!.c;
  const subject =
    items.length === 1
      ? `[Security] #${first.newerUserId} and #${first.olderUserId} look like the same person`
      : `[Security] ${items.length} new suspicious account cases`;
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    appendReferralAndUnsubscribe: false,
    footerMode: "legal-only",
    heading: items.length === 1 ? "Suspicious account link found" : `${items.length} suspicious account links found`,
    bodyHtml: [
      emailParagraph(
        "Security Watch found accounts that very likely belong to the same person. Nothing was changed automatically; review and decide in the Security tab.",
      ),
      ...shown.map(({ c }) => caseEmailBlock(c)),
      ...(items.length > shown.length ? [emailParagraph(`…and ${items.length - shown.length} more in the Security tab.`)] : []),
    ].join(""),
    primaryButton: { href: `${base}/admin?tab=security`, label: "Open Security tab" },
  });
  const ok = await sendEmail({ from: RESEND_FROM_SECURITY, to, subject, html });
  if (!ok) return 0;
  await pool.query(`UPDATE security_alerts SET emailed_at = NOW() WHERE id = ANY($1::int[])`, [items.map((i) => i.id)]);
  return items.length;
}

let inFlight: Promise<SecurityWatchRunSummary> | null = null;
let lastSummary: SecurityWatchRunSummary | null = null;

export function lastSecurityWatchSummary(): SecurityWatchRunSummary | null {
  return lastSummary;
}

export function runSecurityWatch(): Promise<SecurityWatchRunSummary> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const started = Date.now();
    const data = await loadSecurityData(pool);
    const geo = await resolveGeo(scopeIps(data), dbGeoCache);
    const cases = analyzeSecurity(data, geo);
    const { newAlerts, toEmail } = await persistCases(cases);
    let emailed = 0;
    try {
      emailed = await emailDigest(toEmail);
    } catch (err) {
      logger.warn({ err }, "Security Watch digest email failed");
    }
    const summary: SecurityWatchRunSummary = {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      cases: cases.length,
      high: cases.filter((c) => c.confidence === "high").length,
      medium: cases.filter((c) => c.confidence === "medium").length,
      low: cases.filter((c) => c.confidence === "low").length,
      newAlerts,
      emailed,
    };
    lastSummary = summary;
    logger.info(summary, "Security Watch run complete");
    return summary;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/** First run 3 minutes after boot, then every 15 minutes. Never throws. */
export function scheduleSecurityWatchJob(): void {
  if (process.env.SECURITY_WATCH_DISABLED === "1") {
    logger.warn("SECURITY_WATCH_DISABLED=1 — Security Watch job not scheduled");
    return;
  }
  const run = () => {
    runSecurityWatch().catch((err) => logger.error({ err }, "Security Watch run failed"));
  };
  setTimeout(run, 3 * 60_000);
  setInterval(run, FIFTEEN_MIN_MS);
}
