import { Router } from "express";
import {
  db,
  pool,
  usersTable,
  trialConsumedEmailsTable,
  feedbackTable,
  sessionsTable,
  supportTicketsTable,
  supportRepliesTable,
  errorLogsTable,
  loginEventsTable,
  shareEventsTable,
  adminActivityEventsTable,
} from "@workspace/db";
import { eq, sql, gt, isNull, isNotNull, and, desc, gte, lt, inArray, notInArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { hashPassword } from "../lib/password.js";
import {
  getTrialDaysRemaining,
  isTrialLikePlanType,
  userUsesMachineTranslationStack,
  TRIAL_LIKE_PLAN_TYPES,
} from "../lib/usage.js";
import {
  billingPlanTierDisplayName,
  billingProductKeyFromPlanType,
  subscriptionPeriodEndFallback,
} from "../lib/paypal.js";
import { sessionStore } from "../lib/session-store.js";
import { langConfig, updateLangConfig, ALL_LANGUAGES } from "../lib/lang-config.js";
import { sendAdminReplyEmail, sendTicketResolvedEmail } from "../lib/email.js";
import { computeTrialEndsAt, TRIAL_DAILY_LIMIT_MINUTES } from "../lib/trial-constants.js";
import { sendSubscriptionConfirmationEmail, sendTrialExtensionActivatedEmail } from "../lib/transactional-email.js";
import { appCalendarDayIsoKeyForDaysAgo, startOfAppDay, startOfAppDayMinusDays, startOfAppMonth } from "@workspace/app-timezone";

const router = Router();

/** Same 30-day fallback as PayPal when `subscription_period_ends_at` is missing (admin UI uses this for estimates). */
const BILLING_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000;

function paidBillingWindowForUser(
  u: (typeof usersTable)["$inferSelect"],
  minutesInPeriod: number,
): Record<string, string | number | boolean> | null {
  if (u.isAdmin || isTrialLikePlanType(u.planType)) return null;
  const start = new Date(u.subscriptionStartedAt ?? u.createdAt);
  const end = new Date(
    u.subscriptionPeriodEndsAt?.getTime() ?? start.getTime() + BILLING_FALLBACK_MS,
  );
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return null;
  const periodMs = end.getTime() - start.getTime();
  const daysInPeriod = Math.min(366, Math.max(1, Math.ceil(periodMs / 86_400_000)));
  const dailyCapMin = Number(u.dailyLimitMinutes);
  if (!Number.isFinite(dailyCapMin) || dailyCapMin <= 0) return null;
  const dailyHours = dailyCapMin / 60;
  const eligibleHours = dailyHours * daysInPeriod;
  const now = Date.now();
  const sliceEnd = Math.min(now, end.getTime());
  const elapsedMs = Math.max(0, sliceEnd - start.getTime());
  /** Avoid divide-by-zero on brand-new periods; extrapolate from at least ~1h elapsed. */
  const elapsedDays = Math.max(elapsedMs / 86_400_000, 1 / 24);
  const usedHours = minutesInPeriod / 60;
  const projectedHours = Math.min(eligibleHours, (usedHours / elapsedDays) * daysInPeriod);

  return {
    paidBillingPeriodStartAt: start.toISOString(),
    paidBillingPeriodEndAt: end.toISOString(),
    paidBillingPeriodDays: daysInPeriod,
    paidBillingDailyCapHours: Math.round((dailyCapMin / 60) * 100) / 100,
    paidBillingEligibleHours: Math.round(eligibleHours * 10) / 10,
    paidBillingMinutesUsedInPeriod: Math.round(minutesInPeriod * 10) / 10,
    paidBillingHoursUsedInPeriod: Math.round(usedHours * 10) / 10,
    paidBillingProjectedHoursAtPeriodEnd: Math.round(projectedHours * 10) / 10,
    paidBillingUsesSignupProxyForStart: !u.subscriptionStartedAt,
    paidBillingUsesEstimatedPeriodEnd: !u.subscriptionPeriodEndsAt,
  };
}

// ── Cost constants ─────────────────────────────────────────────────────────
// SONIOX_COST_PER_MIN is only used for estimating live (not-yet-ended) session
// Soniox cost, since audio goes browser→Soniox and we only know elapsed time.
// All completed sessions use the real stored total_session_cost from the DB.
const SONIOX_COST_PER_MIN = 0.0025; // $0.0025 / transcription-minute

const PLAN_PRICES: Record<string, number> = {
  basic: 59,
  "basic-libre":       59,
  "basic-openai":      59,
  professional:        99,
  "professional-libre": 99,
  "professional-openai": 99,
  platinum:            179,
  "platinum-libre":    179,
  unlimited:           179,
  trial:               0,
  "trial-openai":      0,
  "trial-libre":       0,
};

/** Analytics stack split mirrors strict live translation routing by effective plan family. */
const MACHINE_STACK_ANALYTICS_WHERE = sql`(
  LOWER(${usersTable.planType}) IN ('trial-hetzner', 'trial-libre', 'basic-libre', 'professional-libre', 'platinum-libre')
)`;
const OPENAI_STACK_ANALYTICS_WHERE = sql`NOT (${MACHINE_STACK_ANALYTICS_WHERE})`;

type ActiveSessionRow = {
  sessionId: number;
  userId: number;
  startedAt: Date;
  langPair: string | null;
  username: string;
  email: string | null;
  planType: string | null;
  trialEndsAt: Date | null;
  dailyLimitMinutes: number | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
};

type CoreLaneColor = "blue" | "violet";
type EnrichedCorePlacement = {
  coreLane: 1 | 2;
  coreLaneColor: CoreLaneColor;
  coreNodeLabel: string;
};

function isPaidPlanForCoreRouting(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (
    p === "basic-libre" ||
    p === "professional-libre" ||
    p === "platinum-libre" ||
    p === "basic" ||
    p === "professional" ||
    p === "platinum" ||
    p === "unlimited"
  );
}

function resolveCoreNodeLabelAndColor(): { coreNodeLabel: string; coreLaneColor: CoreLaneColor } {
  const rawNodeId = Number.parseInt((process.env.HETZNER_NODE_ID ?? "1").trim(), 10);
  const nodeId = Number.isFinite(rawNodeId) && rawNodeId >= 1 ? rawNodeId : 1;
  return {
    coreNodeLabel: `HZ-${nodeId}`,
    coreLaneColor: nodeId === 1 ? "blue" : "violet",
  };
}

function computeCorePlacement(rows: ActiveSessionRow[]): Map<number, EnrichedCorePlacement> {
  const out = new Map<number, EnrichedCorePlacement>();
  const node = resolveCoreNodeLabelAndColor();

  const sorted = [...rows].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const machineRows = sorted.filter((r) => userUsesMachineTranslationStack(r));
  const paidMachine = machineRows.filter((r) => isPaidPlanForCoreRouting(r.planType));
  const trialMachine = machineRows.filter((r) => !isPaidPlanForCoreRouting(r.planType));

  function place(sessionId: number, lane: 1 | 2) {
    out.set(sessionId, { coreLane: lane, coreLaneColor: node.coreLaneColor, coreNodeLabel: node.coreNodeLabel });
  }

  // Mirrors server two-lane router: paid → lane 1, trial machine → lane 2.
  for (const row of paidMachine) {
    place(row.sessionId, 1);
  }
  for (const row of trialMachine) {
    place(row.sessionId, 2);
  }
  return out;
}

/** Human-readable live `/translate` path + Hetzner lane (matches `userUsesMachineTranslationStack` + core router). */
function buildTranslationRouteDetail(
  r: ActiveSessionRow,
  translationStack: "libre" | "openai",
  coreLane: 1 | 2 | null,
): string {
  if (translationStack === "openai") {
    return "Live /translate: OpenAI";
  }
  if (coreLane === 1) {
    return "Live /translate: Hetzner · Core 1 (paid · :5001)";
  }
  if (coreLane === 2) {
    return "Live /translate: Hetzner · Core 2 (trial · :5002)";
  }
  return "Live /translate: Hetzner (lane assigning…)";
}

/**
 * Per-user open-session counts and ordinal (detect duplicate DB rows for one customer).
 */
function enrichActiveSessionRows<T extends ActiveSessionRow>(
  rows: T[],
): Array<
  T & {
    openSessionsForUser: number;
    openSessionOrdinal: number;
    translationStack: "libre" | "openai";
    translationRouteDetail: string;
    coreLane: 1 | 2 | null;
    coreLaneColor: CoreLaneColor | null;
    coreNodeLabel: string | null;
  }
> {
  const corePlacementBySessionId = computeCorePlacement(rows);
  const byUser = new Map<number, T[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }
  const ordinalBySessionId = new Map<number, number>();
  for (const list of byUser.values()) {
    list.forEach((r, i) => {
      ordinalBySessionId.set(r.sessionId, i + 1);
    });
  }
  return rows.map((r) => ({
    ...r,
    openSessionsForUser: byUser.get(r.userId)?.length ?? 1,
    openSessionOrdinal: ordinalBySessionId.get(r.sessionId) ?? 1,
    translationStack: userUsesMachineTranslationStack(r) ? "libre" : "openai",
    coreLane: corePlacementBySessionId.get(r.sessionId)?.coreLane ?? null,
    coreLaneColor: corePlacementBySessionId.get(r.sessionId)?.coreLaneColor ?? null,
    coreNodeLabel: corePlacementBySessionId.get(r.sessionId)?.coreNodeLabel ?? null,
  }));
}

function liveSessionSummaryFromEnriched(
  enriched: Array<{ userId: number; openSessionsForUser: number }>,
): { totalSessions: number; usersWithMultipleOpen: number } {
  const usersWithMulti = new Set<number>();
  for (const r of enriched) {
    if (r.openSessionsForUser > 1) usersWithMulti.add(r.userId);
  }
  return { totalSessions: enriched.length, usersWithMultipleOpen: usersWithMulti.size };
}

// ── List users ───────────────────────────────────────────────────────────────
router.get("/users", requireAdmin, async (_req, res) => {
  // Batch-reset daily usage for anyone whose lastUsageResetAt is before today's midnight (America/New_York).
  // This ensures inactive users (who never trigger getUserWithResetCheck) show 0 after the day rolls over in app TZ.
  const now = new Date();
  const todayStartNy = startOfAppDay(now);
  await db
    .update(usersTable)
    .set({ minutesUsedToday: 0, lastUsageResetAt: now })
    .where(lt(usersTable.lastUsageResetAt, todayStartNy));

  const [users, shareCounts, todayUsageRows, loginIpStats, userLoginIps, paidBillingRows] = await Promise.all([
    db.select().from(usersTable).orderBy(usersTable.createdAt),
    db.select({
      userId: shareEventsTable.userId,
      count:  sql<number>`COUNT(*)`,
    }).from(shareEventsTable).groupBy(shareEventsTable.userId),
    db.select({
      userId: sessionsTable.userId,
      minutesToday: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN ${sessionsTable.endedAt} IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - ${sessionsTable.startedAt}))
              ELSE COALESCE(${sessionsTable.audioSecondsProcessed}, ${sessionsTable.durationSeconds}, 0)
            END
          ),
          0
        ) / 60.0`,
    })
      .from(sessionsTable)
      .where(gte(sessionsTable.startedAt, todayStartNy))
      .groupBy(sessionsTable.userId),
    // IPs where 2+ distinct users have had at least one successful login (same person, multiple accounts).
    db
      .select({
        ip: loginEventsTable.ipAddress,
        accountCount: sql<number>`count(distinct ${loginEventsTable.userId})::int`,
      })
      .from(loginEventsTable)
      .where(
        and(
          eq(loginEventsTable.success, true),
          isNotNull(loginEventsTable.userId),
          isNotNull(loginEventsTable.ipAddress),
          sql`trim(${loginEventsTable.ipAddress}) <> ''`,
        ),
      )
      .groupBy(loginEventsTable.ipAddress)
      .having(sql`count(distinct ${loginEventsTable.userId}) >= 2`),
    db
      .selectDistinct({
        userId: loginEventsTable.userId,
        ip: loginEventsTable.ipAddress,
      })
      .from(loginEventsTable)
      .where(
        and(
          eq(loginEventsTable.success, true),
          isNotNull(loginEventsTable.userId),
          isNotNull(loginEventsTable.ipAddress),
          sql`trim(${loginEventsTable.ipAddress}) <> ''`,
        ),
      ),
    pool.query<{
      user_id: number;
      minutes_in_period: string | number;
    }>(`
      SELECT u.id AS user_id,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN s.ended_at IS NULL THEN COALESCE(s.audio_seconds_processed, 0)::double precision
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)::double precision
            END
          ) / 60.0
          FROM sessions s
          WHERE s.user_id = u.id
            AND s.started_at >= COALESCE(u.subscription_started_at, u.created_at)
            AND s.started_at < COALESCE(
              u.subscription_period_ends_at,
              COALESCE(u.subscription_started_at, u.created_at) + interval '30 days'
            )
        ), 0)::double precision AS minutes_in_period
      FROM users u
      WHERE u.is_admin = false
        AND LOWER(TRIM(COALESCE(u.plan_type, ''))) NOT IN ('trial', 'trial-libre', 'trial-openai')
    `),
  ]);

  const paidMinuteMap = new Map<number, number>(
    paidBillingRows.rows.map((r) => [Number(r.user_id), Number(r.minutes_in_period)]),
  );

  const shareMap = new Map(shareCounts.map(s => [s.userId, Number(s.count)]));
  const todayUsageMap = new Map(todayUsageRows.map((r) => [r.userId, Number(r.minutesToday)]));

  const ipAccountCount = new Map<string, number>();
  for (const row of loginIpStats) {
    const ip = row.ip?.trim();
    if (ip) ipAccountCount.set(ip, Number(row.accountCount));
  }

  const userToIps = new Map<number, string[]>();
  for (const row of userLoginIps) {
    const uid = row.userId;
    const ip = row.ip?.trim();
    if (uid == null || !ip) continue;
    const list = userToIps.get(uid);
    if (list) {
      if (!list.includes(ip)) list.push(ip);
    } else {
      userToIps.set(uid, [ip]);
    }
  }

  function loginIpDupMetrics(userId: number): { sharedLoginIpMaxAccounts: number; sharedLoginIps: string[] } {
    const ips = userToIps.get(userId) ?? [];
    let maxAc = 1;
    const flagged: string[] = [];
    for (const ip of ips) {
      const c = ipAccountCount.get(ip) ?? 1;
      if (c > maxAc) maxAc = c;
      if (c >= 2) flagged.push(ip);
    }
    return { sharedLoginIpMaxAccounts: maxAc, sharedLoginIps: flagged.slice(0, 8) };
  }

  const userById = new Map(users.map((u) => [u.id, u]));

  const ipToUserIdSet = new Map<string, Set<number>>();
  for (const row of userLoginIps) {
    const ip = row.ip?.trim();
    const uid = row.userId;
    if (!ip || uid == null) continue;
    if ((ipAccountCount.get(ip) ?? 1) < 2) continue;
    let set = ipToUserIdSet.get(ip);
    if (!set) {
      set = new Set();
      ipToUserIdSet.set(ip, set);
    }
    set.add(uid);
  }

  function accountsOnSharedIp(ip: string): Array<{ id: number; username: string; email: string | null }> {
    const ids = ipToUserIdSet.get(ip);
    if (!ids?.size) return [];
    return [...ids]
      .sort((a, b) => a - b)
      .map((id) => {
        const row = userById.get(id)!;
        return { id: row.id, username: row.username, email: row.email ?? null };
      });
  }

  function sharedLoginIpClustersForUser(userId: number): Array<{
    ip: string;
    accountCount: number;
    accounts: Array<{ id: number; username: string; email: string | null }>;
  }> {
    const ips = userToIps.get(userId) ?? [];
    const out: Array<{
      ip: string;
      accountCount: number;
      accounts: Array<{ id: number; username: string; email: string | null }>;
    }> = [];
    for (const ip of ips) {
      const c = ipAccountCount.get(ip) ?? 1;
      if (c < 2) continue;
      const accounts = accountsOnSharedIp(ip);
      if (accounts.length < 2) continue;
      out.push({
        ip,
        accountCount: Math.max(c, accounts.length),
        accounts,
      });
    }
    return out.sort((a, b) => b.accountCount - a.accountCount || a.ip.localeCompare(b.ip));
  }

  let paidBillingRollupEligible = 0;
  let paidBillingRollupUsed = 0;
  let paidBillingRollupProjected = 0;
  let paidBillingRollupUserCount = 0;

  const userPayloads = users.map((u) => {
    const dup = loginIpDupMetrics(u.id);
    const sharedLoginIpClusters = sharedLoginIpClustersForUser(u.id);
    const minutesInPaidWindow = paidMinuteMap.get(u.id) ?? 0;
    const paidBilling = paidBillingWindowForUser(u, minutesInPaidWindow);
    if (paidBilling) {
      paidBillingRollupUserCount++;
      paidBillingRollupEligible += Number(paidBilling.paidBillingEligibleHours);
      paidBillingRollupUsed += Number(paidBilling.paidBillingHoursUsedInPeriod);
      paidBillingRollupProjected += Number(paidBilling.paidBillingProjectedHoursAtPeriodEnd);
    }
    return {
      id:                 u.id,
      username:           u.username,
      email:              u.email ?? null,
      isAdmin:            u.isAdmin,
      isActive:           u.isActive,
      planType:           u.planType,
      trialStartedAt:     u.trialStartedAt,
      trialEndsAt:        u.trialEndsAt,
      subscriptionStatus: u.subscriptionStatus ?? null,
      subscriptionPlan:   u.subscriptionPlan ?? null,
      subscriptionStartedAt: u.subscriptionStartedAt ?? null,
      subscriptionPeriodEndsAt: u.subscriptionPeriodEndsAt ?? null,
      paypalSubscriptionId: u.paypalSubscriptionId ?? null,
      stripeSubscriptionId: u.stripeSubscriptionId ?? null,
      trialDaysRemaining: getTrialDaysRemaining(u),
      dailyLimitMinutes:  u.dailyLimitMinutes,
      // Live-accurate "today" usage for admin table/pills.
      minutesUsedToday:   todayUsageMap.get(u.id) ?? u.minutesUsedToday,
      totalMinutesUsed:   u.totalMinutesUsed,
      totalSessions:      u.totalSessions,
      totalShares:        shareMap.get(u.id) ?? 0,
      defaultLangA:       (u as { defaultLangA?: string }).defaultLangA ?? "en",
      defaultLangB:       (u as { defaultLangB?: string }).defaultLangB ?? "ar",
      lastActivityAt:     u.lastActivity ?? null,
      createdAt:          u.createdAt,
      /** Max distinct accounts seen on any single login IP for this user (1 = no sharing detected). */
      sharedLoginIpMaxAccounts: dup.sharedLoginIpMaxAccounts,
      /** Login IPs (successful) that also appear for other accounts — sample for review. */
      sharedLoginIps:           dup.sharedLoginIps,
      sharedLoginIpClusters,
      ...(paidBilling ?? {}),
    };
  });

  res.json({
    users: userPayloads,
    paidBillingRollup: {
      paidUsersInRollup: paidBillingRollupUserCount,
      totalEligibleHoursThisPeriod: Math.round(paidBillingRollupEligible * 10) / 10,
      totalHoursUsedThisPeriod: Math.round(paidBillingRollupUsed * 10) / 10,
      totalProjectedHoursAtPeriodEnd: Math.round(paidBillingRollupProjected * 10) / 10,
      description:
        "Admin-only estimate: non-admin paid plans. Billing window = subscription_started_at (or signup created_at) through subscription_period_ends_at (or start + 30 days). Eligible hours = (daily_limit_minutes/60) × days in that window. Session minutes counted when session started inside the window. Projected at renewal caps at eligible total and extrapolates from pace so far in the window.",
    },
  });
});

// ── Enhanced stats ───────────────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req, res) => {
  const now            = new Date();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  // Midnight America/New_York so "today" is a calendar day in app time, not a rolling 24h window.
  const startOfToday   = startOfAppDay(now);
  const sevenDaysAgo   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeRow,
    customerTotalRow,
    dauRow,
    minutesTodayRow,
    minutesWeekRow,
    minutesMonthRow,
    costTodayRow,
    activeSessionRows,
    allUsersForMrr,
    avgSessionRow,
    sessionsTodayRow,
    payingUsersRow,
    trialUsersRow,
    sessionsTodayCustomerRow,
    allRegisteredUsersRow,
  ] = await Promise.all([
    // Active users (all roles): last_activity within the past 5 minutes
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(gt(usersTable.lastActivity, fiveMinutesAgo)),

    // Non-admin users only — SaaS / MRR segment
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(sql`${usersTable.isAdmin} = false`),

    // Daily active users (all roles): last_activity since midnight (America/New_York) today
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(gt(usersTable.lastActivity, startOfToday)),

    // Minutes used today — non-admin users only (since midnight America/New_York).
    // Includes live sessions by using elapsed time when duration_seconds is not yet set.
    db.select({ total: sql<number>`COALESCE(SUM(CASE WHEN s.ended_at IS NULL THEN EXTRACT(EPOCH FROM (NOW() - s.started_at)) ELSE s.duration_seconds END), 0) / 60.0` })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfToday}`,
        sql`${usersTable.isAdmin} = false`,
      )),

    // Minutes used this week — non-admin users only
    db.select({ total: sql<number>`COALESCE(SUM(s.duration_seconds), 0) / 60.0` })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at > ${sevenDaysAgo}`,
        sql`${usersTable.isAdmin} = false`,
      )),

    // Minutes used this month — non-admin users only
    db.select({ total: sql<number>`COALESCE(SUM(s.duration_seconds), 0) / 60.0` })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at > ${thirtyDaysAgo}`,
        sql`${usersTable.isAdmin} = false`,
      )),

    // Real API cost breakdown today — non-admin users only (since midnight America/New_York).
    // Completed sessions: use real stored soniox_cost and translation_cost.
    // Live sessions: real translation_cost so far + Soniox estimate from elapsed time.
    db.select({
      soniox:      sql<number>`
        COALESCE(SUM(CASE
          WHEN s.ended_at IS NOT NULL
            THEN COALESCE(s.soniox_cost, 0)
          ELSE
            EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60.0 * ${SONIOX_COST_PER_MIN}
        END), 0)`,
      translation: sql<number>`
        COALESCE(SUM(COALESCE(s.translation_cost, 0)), 0)`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfToday}`,
        sql`${usersTable.isAdmin} = false`,
        sql`(s.duration_seconds >= 30 OR s.ended_at IS NULL)`,
      )),

    // Open (live) sessions — customer accounts only (aligns with /active-sessions; admin test tabs excluded)
    db.select({
      sessionId:  sessionsTable.id,
      userId:     sessionsTable.userId,
      startedAt:  sessionsTable.startedAt,
      langPair:   sessionsTable.langPair,
      username:   usersTable.username,
      email:      usersTable.email,
      planType:   usersTable.planType,
      trialEndsAt: usersTable.trialEndsAt,
      dailyLimitMinutes: usersTable.dailyLimitMinutes,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionPlan: usersTable.subscriptionPlan,
    })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(and(isNull(sessionsTable.endedAt), sql`${usersTable.isAdmin} = false`))
      .orderBy(sessionsTable.startedAt),

    // All non-admin users for MRR calculation
    db.select({ planType: usersTable.planType })
      .from(usersTable)
      .where(sql`${usersTable.isAdmin} = false`),

    // Average completed session duration (non-admin, last 30 days)
    db.select({ avg: sql<number>`COALESCE(AVG(s.duration_seconds), 0)` })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at > ${thirtyDaysAgo}`,
        sql`s.ended_at IS NOT NULL`,
        sql`s.duration_seconds > 0`,
        sql`${usersTable.isAdmin} = false`,
      )),

    // Session count today — all users (since midnight America/New_York).
    db.select({ count: sql<number>`COUNT(*)` })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfToday}`,
        sql`(s.duration_seconds >= 30 OR s.ended_at IS NULL)`,
      )),

    // Paying (non-trial, non-admin) users
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(and(
        notInArray(usersTable.planType, [...TRIAL_LIKE_PLAN_TYPES]),
        sql`${usersTable.isAdmin} = false`,
      )),

    // Trial users (non-admin)
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(and(
        inArray(usersTable.planType, [...TRIAL_LIKE_PLAN_TYPES]),
        sql`${usersTable.isAdmin} = false`,
      )),

    // Sessions today — non-admin only (pairs with costTodayRow for cost/session)
    db.select({ count: sql<number>`COUNT(*)` })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfToday}`,
        sql`${usersTable.isAdmin} = false`,
        sql`(s.duration_seconds >= 30 OR s.ended_at IS NULL)`,
      )),

    // All registered users (admins + customers) — headline "Total Users"
    db.select({ count: sql<number>`COUNT(*)` }).from(usersTable),
  ]);

  // Display minutes: non-admin users only
  const minutesToday = Number(minutesTodayRow[0]?.total ?? 0);
  const minutesWeek  = Number(minutesWeekRow[0]?.total  ?? 0);
  const minutesMonth = Number(minutesMonthRow[0]?.total ?? 0);

  // Real API cost breakdown today — from stored costs + live session estimate
  const sonioxCostToday    = +(Number(costTodayRow[0]?.soniox      ?? 0)).toFixed(4);
  const translateCostToday = +(Number(costTodayRow[0]?.translation ?? 0)).toFixed(4);
  const totalCostToday     = +(sonioxCostToday + translateCostToday).toFixed(4);

  // MRR estimate: sum up plan prices for all non-admin, non-trial users
  const mrrEstimate = allUsersForMrr.reduce((sum, u) => {
    return sum + (PLAN_PRICES[u.planType] ?? 0);
  }, 0);

  const payingCount    = Number(payingUsersRow[0]?.count ?? 0);
  const trialCount     = Number(trialUsersRow[0]?.count  ?? 0);
  const totalNonAdmin  = payingCount + trialCount;
  const conversionRate = totalNonAdmin > 0 ? +((payingCount / totalNonAdmin) * 100).toFixed(1) : 0;
  const customerUsers  = Number(customerTotalRow[0]?.count ?? 0);
  const allRegistered  = Number(allRegisteredUsersRow[0]?.count ?? 0);

  const avgSessionMin  = +(Number(avgSessionRow[0]?.avg ?? 0) / 60).toFixed(1);
  const sessionsToday  = Number(sessionsTodayRow[0]?.count ?? 0);
  const sessionsTodayCustomer = Number(sessionsTodayCustomerRow[0]?.count ?? 0);
  const costPerSession =
    sessionsTodayCustomer > 0 ? +(totalCostToday / sessionsTodayCustomer).toFixed(4) : 0;

  const enrichedLive = enrichActiveSessionRows(activeSessionRows);
  const liveSessionSummary = liveSessionSummaryFromEnriched(enrichedLive);

  res.json({
    activeUsers:       Number(activeRow[0]?.count  ?? 0),
    /** Every row in `users` (admins included). */
    totalUsers:        allRegistered,
    /** Non-admin accounts — SaaS metrics / costs still use this segment where noted. */
    customerUsers,
    dailyActiveUsers:  Number(dauRow[0]?.count     ?? 0),
    minutesToday,
    minutesWeek,
    minutesMonth,
    // Real API costs — from stored soniox_cost + translation_cost per session
    sonioxCostToday,
    translateCostToday,
    totalCostToday,
    // SaaS metrics
    mrrEstimate,
    conversionRate,
    avgSessionMin,
    sessionsToday,
    costPerSession,
    payingUsers:   payingCount,
    trialUsers:    trialCount,
    // Live sessions (customer accounts; duplicate opens per user surfaced in UI)
    activeSessions: enrichedLive.map(s => ({
      sessionId:            s.sessionId,
      userId:               s.userId,
      username:             s.username,
      email:                s.email ?? null,
      planType:             s.planType,
      langPair:             s.langPair ?? null,
      startedAt:            s.startedAt,
      durationSeconds:      Math.round((Date.now() - s.startedAt.getTime()) / 1000),
      hasSnapshot:          sessionStore.has(s.sessionId),
      micLabel:             sessionStore.get(s.sessionId)?.micLabel ?? null,
      openSessionsForUser:  s.openSessionsForUser,
      openSessionOrdinal:   s.openSessionOrdinal,
      translationStack:        s.translationStack,
      translationRouteDetail:  s.translationRouteDetail,
      coreLane:                  s.coreLane,
      coreLaneColor:             s.coreLaneColor,
      coreNodeLabel:             s.coreNodeLabel,
    })),
    liveSessionSummary,
  });
});

// ── Analytics endpoint ────────────────────────────────────────────────────────
router.get("/analytics", requireAdmin, async (_req, res) => {
  const now          = new Date();
  const todayStartNy = startOfAppDay(now);
  const thirtyAgo    = startOfAppDayMinusDays(now, 29);
  const fourteenAgo  = startOfAppDayMinusDays(now, 13);
  const startOfMonthNy = startOfAppMonth(now);

  const [
    growthRows,
    dauRows,
    usageTodayRow,
    usageMonthRow,
    conversionRows,
    topUsersRows,
    hetznerHoursMonthRow,
    openAiHoursMonthRow,
    paidUsersNowRow,
    churnSignalsRow,
  ] = await Promise.all([
    // New signups per day — last 30 days
    db.select({
      day:   sql<string>`TO_CHAR(DATE_TRUNC('day', timezone('America/New_York', ${usersTable.createdAt})), 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(*)`,
    })
      .from(usersTable)
      .where(and(gte(usersTable.createdAt, thirtyAgo), sql`${usersTable.isAdmin} = false`))
      .groupBy(sql`DATE_TRUNC('day', timezone('America/New_York', ${usersTable.createdAt}))`)
      .orderBy(sql`DATE_TRUNC('day', timezone('America/New_York', ${usersTable.createdAt}))`),

    // Daily active users — unique users with a real session each day, last 14 days
    db.select({
      day:   sql<string>`TO_CHAR(DATE_TRUNC('day', timezone('America/New_York', s.started_at)), 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(DISTINCT s.user_id)`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${fourteenAgo}`,
        sql`${usersTable.isAdmin} = false`,
        sql`(s.duration_seconds >= 30 OR s.ended_at IS NULL)`,
      ))
      .groupBy(sql`DATE_TRUNC('day', timezone('America/New_York', s.started_at))`)
      .orderBy(sql`DATE_TRUNC('day', timezone('America/New_York', s.started_at))`),

    // Minutes and real cost today
    db.select({
      minutes:     sql<number>`COALESCE(SUM(CASE WHEN s.ended_at IS NULL THEN EXTRACT(EPOCH FROM (NOW() - s.started_at)) ELSE s.duration_seconds END), 0) / 60.0`,
      sessions:    sql<number>`COUNT(*)`,
      costToday:   sql<number>`
        COALESCE(SUM(CASE
          WHEN s.ended_at IS NOT NULL
            THEN COALESCE(s.total_session_cost, 0)
          ELSE
            COALESCE(s.translation_cost, 0)
            + EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60.0 * ${SONIOX_COST_PER_MIN}
        END), 0)`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${todayStartNy}`,
        sql`${usersTable.isAdmin} = false`,
        sql`(s.duration_seconds >= 30 OR s.ended_at IS NULL)`,
      )),

    // Minutes transcribed this month
    db.select({
      minutes: sql<number>`COALESCE(SUM(s.duration_seconds), 0) / 60.0`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfMonthNy}`,
        sql`${usersTable.isAdmin} = false`,
        sql`s.duration_seconds >= 30`,
      )),

    // Conversion metrics
    db.select({
      planType: usersTable.planType,
      count:    sql<number>`COUNT(*)`,
    })
      .from(usersTable)
      .where(sql`${usersTable.isAdmin} = false`)
      .groupBy(usersTable.planType),

    // Top 10 users by live-accurate usage today (session-derived)
    db.select({
      username: usersTable.username,
      minutesToday: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) / 60.0`,
      totalMinutes: usersTable.totalMinutesUsed,
      planType: usersTable.planType,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${todayStartNy}`,
        sql`${usersTable.isAdmin} = false`,
      ))
      .groupBy(usersTable.id, usersTable.username, usersTable.totalMinutesUsed, usersTable.planType)
      .having(sql`COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) > 0`)
      .orderBy(desc(sql`COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        )`))
      .limit(10),

    // Hetzner MT usage hours MTD (machine-translation routes only; mirrors live routing semantics).
    db.select({
      hours: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) / 3600.0`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfMonthNy}`,
        sql`${usersTable.isAdmin} = false`,
        MACHINE_STACK_ANALYTICS_WHERE,
      )),

    // OpenAI usage hours MTD (complement of machine route split above).
    db.select({
      transcriptionHours: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) / 3600.0`,
      translationHours: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) / 3600.0`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfMonthNy}`,
        sql`${usersTable.isAdmin} = false`,
        OPENAI_STACK_ANALYTICS_WHERE,
      )),

    // Active paid base (current).
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(and(
        sql`${usersTable.isAdmin} = false`,
        notInArray(usersTable.planType, [...TRIAL_LIKE_PLAN_TYPES]),
      )),

    // Monthly churn signals among paid users.
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(and(
        sql`${usersTable.isAdmin} = false`,
        notInArray(usersTable.planType, [...TRIAL_LIKE_PLAN_TYPES]),
        sql`(
          COALESCE(${usersTable.subscriptionStatus}, '') ILIKE 'cancel%'
          OR COALESCE(${usersTable.subscriptionStatus}, '') ILIKE 'inactive%'
          OR ${usersTable.isActive} = false
        )`,
      )),
  ]);

  // Fill missing days with 0 for growth chart (last 30 days)
  const growthMap = new Map(growthRows.map(r => [r.day, Number(r.count)]));
  const growthChart: { day: string; users: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = appCalendarDayIsoKeyForDaysAgo(now, i);
    growthChart.push({ day: key, users: growthMap.get(key) ?? 0 });
  }

  // Fill missing days with 0 for DAU chart (last 14 days)
  const dauMap = new Map(dauRows.map(r => [r.day, Number(r.count)]));
  const dauChart: { day: string; users: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = appCalendarDayIsoKeyForDaysAgo(now, i);
    dauChart.push({ day: key, users: dauMap.get(key) ?? 0 });
  }

  const minutesToday       = Number(usageTodayRow[0]?.minutes   ?? 0);
  const minutesMonth       = Number(usageMonthRow[0]?.minutes   ?? 0);
  const sessionsTodayCount = Number(usageTodayRow[0]?.sessions  ?? 0);
  const realCostToday      = +(Number(usageTodayRow[0]?.costToday ?? 0)).toFixed(4);
  // Month cost: completed sessions only (no live-session adjustment needed for monthly view)
  const realCostMonth      = +(minutesMonth * SONIOX_COST_PER_MIN).toFixed(4);

  const hetznerTranslationHoursMtd = +Number(hetznerHoursMonthRow[0]?.hours ?? 0).toFixed(2);
  const openAiTranscriptionHoursMtd = +Number(openAiHoursMonthRow[0]?.transcriptionHours ?? 0).toFixed(2);
  const openAiTranslationHoursMtd = +Number(openAiHoursMonthRow[0]?.translationHours ?? 0).toFixed(2);
  const hetznerSavingsMtd = +(hetznerTranslationHoursMtd * 0.35).toFixed(2);
  const estimatedOpenAiBurnMtd = +(
    openAiTranscriptionHoursMtd * 0.15 +
    openAiTranslationHoursMtd * 0.35
  ).toFixed(2);
  const serverUtilizationPerDollar = +(hetznerTranslationHoursMtd / 13).toFixed(3);
  const effectiveHetznerCostPerHour = hetznerTranslationHoursMtd > 0
    ? +(13 / hetznerTranslationHoursMtd).toFixed(3)
    : 0;
  const churnPercentMonthly = (() => {
    const paidNow = Number(paidUsersNowRow[0]?.count ?? 0);
    const churnCount = Number(churnSignalsRow[0]?.count ?? 0);
    return paidNow > 0 ? +((churnCount / paidNow) * 100).toFixed(2) : 0;
  })();

  const planMap = new Map(conversionRows.map(r => [r.planType, Number(r.count)]));
  const trialCount  = [...planMap.entries()]
    .filter(([k]) => isTrialLikePlanType(k))
    .reduce((s, [, v]) => s + v, 0);
  const payingCount = [...planMap.entries()].filter(([k]) => !isTrialLikePlanType(k)).reduce((s, [, v]) => s + v, 0);
  const totalCount  = trialCount + payingCount;
  const activeMrr = [...planMap.entries()].reduce((sum, [planType, count]) => {
    const price = PLAN_PRICES[planType] ?? 0;
    return sum + price * count;
  }, 0);
  const ltvEstimate = churnPercentMonthly > 0 ? +(activeMrr / churnPercentMonthly).toFixed(2) : null;

  res.json({
    userGrowth:  growthChart,
    dau:         dauChart,
    usageStats: {
      minutesToday:    +minutesToday.toFixed(1),
      minutesMonth:    +minutesMonth.toFixed(1),
      costToday:       realCostToday,
      costMonth:       realCostMonth,
      sessionsToday:   sessionsTodayCount,
    },
    businessMetrics: {
      hetznerSavingsMtd,
      hetznerTranslationHoursMtd,
      estimatedOpenAiBurnMtd,
      openAiTranscriptionHoursMtd,
      openAiTranslationHoursMtd,
      serverUtilizationPerDollar,
      effectiveHetznerCostPerHour,
      ltvEstimate,
      churnPercentMonthly,
      activeMrr,
    },
    conversion: {
      totalUsers:     totalCount,
      trialUsers:     trialCount,
      paidUsers:      payingCount,
      conversionRate: totalCount > 0 ? +((payingCount / totalCount) * 100).toFixed(1) : 0,
    },
    topUsers: topUsersRows.map(u => ({
      username:     u.username,
      minutesToday: +Number(u.minutesToday).toFixed(1),
      totalMinutes: +Number(u.totalMinutes).toFixed(1),
      planType:     u.planType,
    })),
  });
});

// ── Extended analytics endpoint (new panels, time-filtered) ─────────────────
// Provides: cost breakdown, efficiency metrics, active session load, top trial users.
// Does NOT change the existing /analytics endpoint at all.
router.get("/analytics/extended", requireAdmin, async (req, res) => {
  const now = new Date();

  // ── Resolve time range ────────────────────────────────────────────────────
  let rangeStart: Date;
  const range = (req.query.range as string) ?? "30d";
  const fromQ  = req.query.from as string | undefined;
  const toQ    = req.query.to   as string | undefined;

  if (range === "custom" && fromQ && toQ) {
    rangeStart = new Date(fromQ + "T00:00:00Z");
  } else if (range === "24h") {
    rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (range === "7d") {
    rangeStart = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  } else {
    rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const [costRows, activeRows, trialRows] = await Promise.all([

    // ── Cost breakdown for the period ────────────────────────────────────────
    db.select({
      sonioxCost:      sql<number>`
        COALESCE(SUM(CASE
          WHEN s.ended_at IS NOT NULL
            THEN COALESCE(s.soniox_cost, 0)
          ELSE
            EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60.0 * ${SONIOX_COST_PER_MIN}
        END), 0)`,
      translationCost: sql<number>`COALESCE(SUM(COALESCE(s.translation_cost, 0)), 0)`,
      totalCost:       sql<number>`
        COALESCE(SUM(CASE
          WHEN s.ended_at IS NOT NULL
            THEN COALESCE(s.total_session_cost, 0)
          ELSE
            COALESCE(s.translation_cost, 0)
            + EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60.0 * ${SONIOX_COST_PER_MIN}
        END), 0)`,
      sessions:        sql<number>`COUNT(*)`,
      uniqueUsers:     sql<number>`COUNT(DISTINCT s.user_id)`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${rangeStart}`,
        sql`${usersTable.isAdmin} = false`,
        sql`(s.duration_seconds >= 30 OR s.ended_at IS NULL)`,
      )),

    // ── Live sessions load (always real-time — ignores range) ────────────────
    db.select({
      count:           sql<number>`COUNT(*)`,
      minutesLive:     sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 60.0), 0)`,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.ended_at IS NULL`,
        sql`${usersTable.isAdmin} = false`,
      )),

    // ── Top trial users by live-accurate usage today ────────────────────────
    db.select({
      username: usersTable.username,
      minutesToday: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) / 60.0`,
      dailyLimit: usersTable.dailyLimitMinutes,
    })
      .from(sql`sessions s`)
      .innerJoin(usersTable, sql`s.user_id = ${usersTable.id}`)
      .where(and(
        sql`s.started_at >= ${startOfAppDay(now)}`,
        sql`${usersTable.isAdmin} = false`,
        inArray(usersTable.planType, [...TRIAL_LIKE_PLAN_TYPES]),
      ))
      .groupBy(usersTable.id, usersTable.username, usersTable.dailyLimitMinutes)
      .having(sql`COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        ) > 0`)
      .orderBy(desc(sql`COALESCE(
          SUM(
            CASE
              WHEN s.ended_at IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - s.started_at))
              ELSE COALESCE(s.audio_seconds_processed, s.duration_seconds, 0)
            END
          ),
          0
        )`))
      .limit(10),
  ]);

  const cr            = costRows[0];
  const sonioxCost    = +(Number(cr?.sonioxCost    ?? 0)).toFixed(4);
  const translateCost = +(Number(cr?.translationCost ?? 0)).toFixed(4);
  const totalCost     = +(Number(cr?.totalCost     ?? 0)).toFixed(4);
  const sessions      =   Number(cr?.sessions      ?? 0);
  const uniqueUsers   =   Number(cr?.uniqueUsers   ?? 0);

  const ar            = activeRows[0];

  res.json({
    range: { label: range, start: rangeStart.toISOString() },
    costBreakdown: {
      sonioxCost,
      translateCost,
      totalCost,
      sessions,
      uniqueUsers,
    },
    efficiency: {
      costPerSession: sessions  > 0 ? +(totalCost / sessions ).toFixed(4) : 0,
      costPerUser:    uniqueUsers > 0 ? +(totalCost / uniqueUsers).toFixed(4) : 0,
    },
    activeSessions: {
      count:        Number(ar?.count       ?? 0),
      minutesLive:  +(Number(ar?.minutesLive ?? 0)).toFixed(1),
    },
    topTrialUsers: trialRows.map(u => ({
      username:    u.username,
      minutesToday: +Number(u.minutesToday).toFixed(1),
      dailyLimit:   Number(u.dailyLimit),
      pctUsed:      u.dailyLimit > 0 ? +(Number(u.minutesToday) / Number(u.dailyLimit) * 100).toFixed(1) : 0,
    })),
  });
});

// ── Lightweight active-sessions poll (for fast user-list status badges) ─────
// Returns only the fields needed to render Online/Offline badges.
// Much cheaper than /stats — single query + in-memory store lookup.
router.get("/active-sessions", requireAdmin, async (req, res) => {
  const rows = await db
    .select({
      sessionId:  sessionsTable.id,
      userId:     sessionsTable.userId,
      startedAt:  sessionsTable.startedAt,
      langPair:   sessionsTable.langPair,
      username:   usersTable.username,
      email:      usersTable.email,
      planType:   usersTable.planType,
      trialEndsAt: usersTable.trialEndsAt,
      dailyLimitMinutes: usersTable.dailyLimitMinutes,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionPlan: usersTable.subscriptionPlan,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(
      isNull(sessionsTable.endedAt),
      sql`${usersTable.isAdmin} = false`,
    ))
    .orderBy(sessionsTable.startedAt);

  const enriched = enrichActiveSessionRows(rows);
  res.json({
    activeSessions: enriched.map(s => ({
      sessionId:            s.sessionId,
      userId:               s.userId,
      username:             s.username,
      email:                s.email ?? null,
      planType:             s.planType,
      langPair:             s.langPair ?? null,
      startedAt:            s.startedAt,
      durationSeconds:      Math.round((Date.now() - s.startedAt.getTime()) / 1000),
      hasSnapshot:          sessionStore.has(s.sessionId),
      micLabel:             sessionStore.get(s.sessionId)?.micLabel ?? null,
      openSessionsForUser:  s.openSessionsForUser,
      openSessionOrdinal:   s.openSessionOrdinal,
      translationStack:        s.translationStack,
      translationRouteDetail:  s.translationRouteDetail,
      coreLane:                s.coreLane,
      coreLaneColor:           s.coreLaneColor,
      coreNodeLabel:           s.coreNodeLabel,
    })),
    liveSessionSummary: liveSessionSummaryFromEnriched(enriched),
  });
});

// ── View live session snapshot ───────────────────────────────────────────────
router.get("/session/:sessionId", requireAdmin, async (req, res) => {
  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const rows = await db
    .select({
      id:              sessionsTable.id,
      userId:          sessionsTable.userId,
      startedAt:       sessionsTable.startedAt,
      endedAt:         sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      langPair:        sessionsTable.langPair,
      username:        usersTable.username,
      email:           usersTable.email,
      planType:        usersTable.planType,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (!rows.length) { res.status(404).json({ error: "Session not found" }); return; }

  const session  = rows[0]!;
  const snapshot = sessionStore.get(sessionId) ?? null;

  const durationSeconds = session.endedAt
    ? (session.durationSeconds ?? 0)
    : Math.round((Date.now() - session.startedAt.getTime()) / 1000);

  res.json({
    sessionId:       session.id,
    userId:          session.userId,
    username:        session.username,
    email:           session.email ?? null,
    planType:        session.planType,
    langPair:        session.langPair ?? (snapshot ? `${snapshot.langA}↔${snapshot.langB}` : null),
    startedAt:       session.startedAt,
    endedAt:         session.endedAt ?? null,
    durationSeconds,
    isLive:          !session.endedAt,
    snapshot,
  });
});

// ── Terminate a live session ─────────────────────────────────────────────────
router.post("/session/:sessionId/terminate", requireAdmin, async (req, res) => {
  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const rows = await db
    .select({ id: sessionsTable.id, startedAt: sessionsTable.startedAt })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.endedAt)))
    .limit(1);

  if (!rows.length) { res.status(404).json({ error: "Session not found or already ended" }); return; }

  const session = rows[0]!;
  const durationSeconds = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

  await db.update(sessionsTable)
    .set({ endedAt: new Date(), durationSeconds })
    .where(eq(sessionsTable.id, sessionId));

  sessionStore.delete(sessionId);

  res.json({ ok: true, message: "Session terminated" });
});

// ── Session history for a user ───────────────────────────────────────────────
router.get("/users/:userId/sessions", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const effectiveDurationSecondsSql = sql<number>`
    CASE
      WHEN ${sessionsTable.endedAt} IS NULL
        THEN LEAST(10800, GREATEST(0, EXTRACT(EPOCH FROM (NOW() - ${sessionsTable.startedAt}))))
      WHEN COALESCE(${sessionsTable.durationSeconds}, 0) > 0
        THEN ${sessionsTable.durationSeconds}
      WHEN COALESCE(${sessionsTable.audioSecondsProcessed}, 0) > 0
        THEN ${sessionsTable.audioSecondsProcessed}
      -- Machine-stack historical fallback: session had heartbeats but stale-close stored zero duration.
      WHEN ${sessionsTable.lastActivityAt} IS NOT NULL
        AND EXTRACT(EPOCH FROM (${sessionsTable.lastActivityAt} - ${sessionsTable.startedAt})) >= 90
        THEN LEAST(10800, GREATEST(0, EXTRACT(EPOCH FROM (${sessionsTable.lastActivityAt} - ${sessionsTable.startedAt}))))
      -- Backfill historical rows that show 0 min despite real translated activity.
      WHEN COALESCE(${sessionsTable.translationTokens}, 0) > 0
        THEN LEAST(10800, GREATEST(0, EXTRACT(EPOCH FROM (${sessionsTable.endedAt} - ${sessionsTable.startedAt}))))
      ELSE 0
    END
  `;

  const rows = await db
    .select({
      id:              sessionsTable.id,
      startedAt:       sessionsTable.startedAt,
      endedAt:         sessionsTable.endedAt,
      durationSeconds: effectiveDurationSecondsSql,
      langPair:        sessionsTable.langPair,
      lastActivityAt:  sessionsTable.lastActivityAt,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.startedAt))
    .limit(100);

  res.json({
    sessions: rows.map(s => ({
      id:              s.id,
      startedAt:       s.startedAt,
      endedAt:         s.endedAt ?? null,
      durationSeconds: s.durationSeconds ?? 0,
      langPair:       s.langPair ?? null,
      minutesUsed:    +(Math.max(0, Number(s.durationSeconds ?? 0)) / 60).toFixed(2),
      isLive:         !s.endedAt,
    })),
  });
});

// ── Language config (read) ───────────────────────────────────────────────────
router.get("/config/languages", requireAdmin, async (_req, res) => {
  res.json({
    allLanguages:     ALL_LANGUAGES,
    enabledLanguages: langConfig.enabledLanguages,
    defaultLangA:     langConfig.defaultLangA,
    defaultLangB:     langConfig.defaultLangB,
  });
});

// ── Language config (write) ──────────────────────────────────────────────────
router.put("/config/languages", requireAdmin, async (req, res) => {
  const { enabledLanguages, defaultLangA, defaultLangB } = req.body as {
    enabledLanguages?: string[];
    defaultLangA?:     string;
    defaultLangB?:     string;
  };

  const allowed = new Set(ALL_LANGUAGES.map(l => l.value));
  let nextEnabled = enabledLanguages;
  if (enabledLanguages) {
    nextEnabled = [...new Set(enabledLanguages)].filter(c => allowed.has(c));
    if (nextEnabled.length < 2) {
      res.status(400).json({ error: "At least 2 configured languages must be enabled" });
      return;
    }
  }

  if (defaultLangA && !allowed.has(defaultLangA)) {
    res.status(400).json({ error: "defaultLangA must be one of the configured languages" });
    return;
  }
  if (defaultLangB && !allowed.has(defaultLangB)) {
    res.status(400).json({ error: "defaultLangB must be one of the configured languages" });
    return;
  }

  updateLangConfig({
    ...(nextEnabled && { enabledLanguages: nextEnabled }),
    ...(defaultLangA    && { defaultLangA }),
    ...(defaultLangB    && { defaultLangB }),
  });

  res.json({ ok: true, config: langConfig });
});

// ── Create user ──────────────────────────────────────────────────────────────
router.post("/users", requireAdmin, async (req, res) => {
  const { username, password, isAdmin, dailyLimitMinutes } = req.body as {
    username?: string;
    password?: string;
    isAdmin?: boolean;
    dailyLimitMinutes?: number;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Username already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const trialStartedAt = new Date();
  const trialEndsAt    = computeTrialEndsAt(trialStartedAt);

  const result = await db.insert(usersTable).values({
    username,
    passwordHash,
    isAdmin: isAdmin ?? false,
    isActive: true,
    planType: "trial-openai",
    trialStartedAt,
    trialEndsAt,
    dailyLimitMinutes: dailyLimitMinutes ?? TRIAL_DAILY_LIMIT_MINUTES,
    minutesUsedToday: 0,
    totalMinutesUsed: 0,
    totalSessions: 0,
    lastUsageResetAt: new Date(),
  }).returning();

  const user = result[0]!;
  res.status(201).json({
    id:                 user.id,
    username:           user.username,
    email:              user.email ?? null,
    isAdmin:            user.isAdmin,
    isActive:           user.isActive,
    planType:           user.planType,
    trialStartedAt:     user.trialStartedAt,
    trialEndsAt:        user.trialEndsAt,
    trialDaysRemaining: getTrialDaysRemaining(user),
    dailyLimitMinutes:  user.dailyLimitMinutes,
    minutesUsedToday:   user.minutesUsedToday,
    totalMinutesUsed:   user.totalMinutesUsed,
    totalSessions:      user.totalSessions,
    totalShares:        0,
    defaultLangA:       (user as { defaultLangA?: string }).defaultLangA ?? "en",
    defaultLangB:       (user as { defaultLangB?: string }).defaultLangB ?? "ar",
    lastActivityAt:     user.lastActivity ?? null,
    createdAt:          user.createdAt,
    sharedLoginIpMaxAccounts: 1,
    sharedLoginIps:           [],
    sharedLoginIpClusters:    [],
  });
});

// ── Update user ──────────────────────────────────────────────────────────────
router.patch("/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const rawBody = req.body as Record<string, unknown>;
  const { isActive, isAdmin, dailyLimitMinutes, password, planType, trialEndsAt, minutesUsedToday, defaultLangA, defaultLangB } = req.body as {
    isActive?: boolean;
    isAdmin?: boolean;
    dailyLimitMinutes?: number;
    password?: string;
    planType?: string;
    trialEndsAt?: string | null;
    minutesUsedToday?: number;
    defaultLangA?: string;
    defaultLangB?: string;
  };

  /** Canonical tiers (includes explicit `trial-hetzner` as full Hetzner trial). */
  const ADMIN_ASSIGNABLE_PLAN_TYPES = new Set([
    "trial",
    "trial-openai",
    "trial-hetzner",
    "trial-libre",
    "basic",
    "basic-libre",
    "professional",
    "professional-libre",
    "platinum",
    "platinum-libre",
  ]);
  if (planType && !ADMIN_ASSIGNABLE_PLAN_TYPES.has(planType.toLowerCase())) {
    res.status(400).json({ error: "Invalid plan type" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferSelect> = {};
  if (isActive !== undefined)             updates.isActive = isActive;
  if (isAdmin !== undefined)              updates.isAdmin = isAdmin;
  if (dailyLimitMinutes !== undefined)    updates.dailyLimitMinutes = dailyLimitMinutes;
  if (planType) updates.planType = planType.toLowerCase();
  if (password)                           updates.passwordHash = await hashPassword(password);
  let trialEndsAtParsed: Date | null = null;
  if (trialEndsAt !== undefined && trialEndsAt) {
    trialEndsAtParsed = new Date(trialEndsAt);
    updates.trialEndsAt = trialEndsAtParsed;
  }
  if (minutesUsedToday !== undefined && minutesUsedToday >= 0) updates.minutesUsedToday = minutesUsedToday;
  if (defaultLangA && defaultLangA.trim()) (updates as Record<string, unknown>).defaultLangA = defaultLangA.trim();
  if (defaultLangB && defaultLangB.trim()) (updates as Record<string, unknown>).defaultLangB = defaultLangB.trim();

  if (
    (updates as Record<string, unknown>).defaultLangA &&
    (updates as Record<string, unknown>).defaultLangB &&
    (updates as Record<string, unknown>).defaultLangA === (updates as Record<string, unknown>).defaultLangB
  ) {
    res.status(400).json({ error: "Default language pair must use two different languages" });
    return;
  }

  const planTypeEffectiveInput = planType ?? existing.planType;
  const effectivePlanLower = planTypeEffectiveInput.trim().toLowerCase();
  const subscriptionDatesApply = !isTrialLikePlanType(effectivePlanLower);
  if (
    trialEndsAtParsed &&
    Number.isFinite(trialEndsAtParsed.getTime()) &&
    trialEndsAtParsed.getTime() > Date.now() &&
    isTrialLikePlanType(effectivePlanLower)
  ) {
    // Immediate access after admin trial extension: restore today's available minutes.
    updates.minutesUsedToday = 0;
  }

  if (planType) {
    const pt = planType.toLowerCase();
    if (isTrialLikePlanType(pt)) {
      updates.subscriptionPlan = null;
      updates.subscriptionPeriodEndsAt = null;
      updates.subscriptionStartedAt = null;
    } else {
      const key = billingProductKeyFromPlanType(pt);
      if (key) {
        // Keep billing tier aligned with admin plan row (Basic / Pro / Platinum product key).
        updates.subscriptionPlan = key;

        const startInBody = "subscriptionStartedAt" in rawBody;
        const endInBody = "subscriptionPeriodEndsAt" in rawBody;

        // Backfill only when admin did not send explicit calendar fields this request.
        // Do not infer billing start from account createdAt (misleading for long-ago signups).
        if (!startInBody && !existing.subscriptionStartedAt) {
          const start = new Date();
          updates.subscriptionStartedAt = start;
          if (!endInBody) {
            updates.subscriptionPeriodEndsAt = subscriptionPeriodEndFallback(start);
          }
        } else if (!endInBody && !existing.subscriptionPeriodEndsAt && existing.subscriptionStartedAt) {
          updates.subscriptionPeriodEndsAt = subscriptionPeriodEndFallback(
            new Date(existing.subscriptionStartedAt),
          );
        }
      }
    }
  }

  function parseAdminDateField(label: string, v: unknown): Date | null | "invalid" {
    if (v === null || v === undefined || v === "") return null;
    const d = new Date(String(v));
    if (!Number.isFinite(d.getTime())) return "invalid";
    return d;
  }

  if (subscriptionDatesApply) {
    const hasStartKey = "subscriptionStartedAt" in rawBody;
    const hasEndKey = "subscriptionPeriodEndsAt" in rawBody;
    if (hasStartKey) {
      const parsed = parseAdminDateField("subscriptionStartedAt", rawBody.subscriptionStartedAt);
      if (parsed === "invalid") {
        res.status(400).json({ error: "Invalid subscriptionStartedAt (use ISO 8601 date-time)." });
        return;
      }
      updates.subscriptionStartedAt = parsed;
      // Single-field save: new period start without explicit end → same rule as PayPal fallback (30 days).
      if (parsed !== null && !hasEndKey) {
        updates.subscriptionPeriodEndsAt = subscriptionPeriodEndFallback(parsed);
      }
    }
    if (hasEndKey) {
      const parsed = parseAdminDateField("subscriptionPeriodEndsAt", rawBody.subscriptionPeriodEndsAt);
      if (parsed === "invalid") {
        res.status(400).json({ error: "Invalid subscriptionPeriodEndsAt (use ISO 8601 date-time)." });
        return;
      }
      updates.subscriptionPeriodEndsAt = parsed;
    }
  }

  const result = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = result[0]!;
  const previousPlanType = (existing.planType ?? "").trim().toLowerCase();
  const nextPlanType = (user.planType ?? "").trim().toLowerCase();
  const previousTrialEndsAtMs = existing.trialEndsAt?.getTime() ?? null;
  const nextTrialEndsAtMs = user.trialEndsAt?.getTime() ?? null;
  const nowMs = Date.now();
  const trialDateWasExplicitlyProvided = trialEndsAt !== undefined;
  const trialDateMovedLater =
    previousTrialEndsAtMs !== null &&
    nextTrialEndsAtMs !== null &&
    nextTrialEndsAtMs > previousTrialEndsAtMs;
  const explicitTrialExtension =
    trialDateWasExplicitlyProvided &&
    trialDateMovedLater &&
    nextTrialEndsAtMs !== null &&
    nextTrialEndsAtMs > nowMs;
  const switchedIntoMixedTrial =
    nextPlanType === "trial-libre" &&
    previousPlanType !== "trial-libre";

  // Email users only for:
  // 1) explicit extension of trial end date to a later future date, or
  // 2) an explicit switch into the mixed trial plan.
  const shouldSendTrialActivationEmail =
    isTrialLikePlanType(nextPlanType) &&
    (explicitTrialExtension || switchedIntoMixedTrial);

  if (shouldSendTrialActivationEmail) {
    const email = user.email?.trim().toLowerCase();
    if (email) {
      const daysRemaining = getTrialDaysRemaining(user);
      if (daysRemaining > 0) {
        void sendTrialExtensionActivatedEmail(
          email,
          user.username ?? null,
          user.trialEndsAt!,
          TRIAL_DAILY_LIMIT_MINUTES,
          user.id,
        );
      }
    }
  }
  const [shareAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shareEventsTable)
    .where(eq(shareEventsTable.userId, userId));
  res.json({
    id:                 user.id,
    username:           user.username,
    email:              user.email ?? null,
    isAdmin:            user.isAdmin,
    isActive:           user.isActive,
    planType:           user.planType,
    trialStartedAt:     user.trialStartedAt,
    trialEndsAt:        user.trialEndsAt,
    subscriptionStatus: user.subscriptionStatus ?? null,
    subscriptionPlan:   user.subscriptionPlan ?? null,
    subscriptionStartedAt: user.subscriptionStartedAt ?? null,
    subscriptionPeriodEndsAt: user.subscriptionPeriodEndsAt ?? null,
    paypalSubscriptionId: user.paypalSubscriptionId ?? null,
    stripeSubscriptionId: user.stripeSubscriptionId ?? null,
    trialDaysRemaining: getTrialDaysRemaining(user),
    dailyLimitMinutes:  user.dailyLimitMinutes,
    minutesUsedToday:   user.minutesUsedToday,
    totalMinutesUsed:   user.totalMinutesUsed,
    totalSessions:      user.totalSessions,
    totalShares:        Number(shareAgg?.count ?? 0),
    defaultLangA:       (user as { defaultLangA?: string }).defaultLangA ?? "en",
    defaultLangB:       (user as { defaultLangB?: string }).defaultLangB ?? "ar",
    lastActivityAt:     user.lastActivity ?? null,
    createdAt:          user.createdAt,
    sharedLoginIpMaxAccounts: 1,
    sharedLoginIps:           [],
    sharedLoginIpClusters:    [],
  });
});

/** Minutes at or above this are treated as "unlimited style" and skipped by bulk floor bumps. */
const ADMIN_DAILY_LIMIT_UNLIMITED_THRESHOLD = 9000;

// ── Bulk: raise daily limit floor (non-admin, below unlimited threshold) ─────
router.post("/users/bump-daily-limit-floor", requireAdmin, async (req, res) => {
  const raw = (req.body as { floorMinutes?: unknown }).floorMinutes;
  const floor = Math.floor(Number(raw));
  if (!Number.isFinite(floor) || floor < 1 || floor > 100_000) {
    res.status(400).json({ error: "floorMinutes must be between 1 and 100000" });
    return;
  }

  const rows = await db
    .update(usersTable)
    .set({
      dailyLimitMinutes: sql`GREATEST(${usersTable.dailyLimitMinutes}, ${floor})`,
    })
    .where(
      and(eq(usersTable.isAdmin, false), lt(usersTable.dailyLimitMinutes, ADMIN_DAILY_LIMIT_UNLIMITED_THRESHOLD)),
    )
    .returning({ id: usersTable.id });

  res.json({ updatedCount: rows.length, floorMinutes: floor });
});

// ── Delete user ──────────────────────────────────────────────────────────────
router.delete("/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [row] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, userId));

  const em = row.email?.trim().toLowerCase();
  if (em) {
    await db.delete(trialConsumedEmailsTable).where(eq(trialConsumedEmailsTable.email, em));
  }

  res.json({ message: "User deleted" });
});

// ── Reset daily usage ────────────────────────────────────────────────────────
router.post("/users/:userId/reset-usage", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  await db.update(usersTable)
    .set({ minutesUsedToday: 0, lastUsageResetAt: new Date() })
    .where(eq(usersTable.id, userId));

  res.json({ message: "Usage reset" });
});

// ── Feedback ─────────────────────────────────────────────────────────────────
router.get("/feedback", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id:        feedbackTable.id,
      userId:    feedbackTable.userId,
      username:  usersTable.username,
      email:     feedbackTable.email,
      userEmail: usersTable.email,
      rating:    feedbackTable.rating,
      recommend: feedbackTable.recommend,
      comment:   feedbackTable.comment,
      source:    feedbackTable.source,
      createdAt: feedbackTable.createdAt,
    })
    .from(feedbackTable)
    .innerJoin(usersTable, eq(feedbackTable.userId, usersTable.id))
    .orderBy(desc(feedbackTable.createdAt));

  res.json({
    feedback: rows.map((r) => ({
      id:        r.id,
      userId:    r.userId,
      username:  r.username,
      email:     r.email ?? r.userEmail ?? null,
      rating:    r.rating,
      recommend: r.recommend ?? null,
      comment:   r.comment ?? null,
      source:    r.source ?? null,
      createdAt: r.createdAt,
    })),
  });
});

// ── Support ticket management ─────────────────────────────────────────────────

// List all tickets
router.get("/support", requireAdmin, async (_req, res) => {
  const tickets = await db
    .select({
      id:        supportTicketsTable.id,
      userId:    supportTicketsTable.userId,
      email:     supportTicketsTable.email,
      subject:   supportTicketsTable.subject,
      message:   supportTicketsTable.message,
      status:    supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      updatedAt: supportTicketsTable.updatedAt,
      username:  usersTable.username,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .orderBy(desc(supportTicketsTable.createdAt));

  // Fetch reply counts
  const replyCountRows = await db
    .select({
      ticketId: supportRepliesTable.ticketId,
      cnt:      sql<number>`COUNT(*)`,
    })
    .from(supportRepliesTable)
    .groupBy(supportRepliesTable.ticketId);

  const replyCounts = Object.fromEntries(replyCountRows.map(r => [r.ticketId, Number(r.cnt)]));

  res.json({
    tickets: tickets.map(t => ({
      ...t,
      replyCount: replyCounts[t.id] ?? 0,
    })),
  });
});

// Get a single ticket with all replies
router.get("/support/:id", requireAdmin, async (req, res) => {
  const ticketId = parseInt(String(req.params.id), 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [ticket] = await db
    .select({
      id:        supportTicketsTable.id,
      userId:    supportTicketsTable.userId,
      email:     supportTicketsTable.email,
      subject:   supportTicketsTable.subject,
      message:   supportTicketsTable.message,
      status:    supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      username:  usersTable.username,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .where(eq(supportTicketsTable.id, ticketId));

  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return; }

  const replies = await db
    .select({
      id:        supportRepliesTable.id,
      isAdmin:   supportRepliesTable.isAdmin,
      message:   supportRepliesTable.message,
      createdAt: supportRepliesTable.createdAt,
      username:  usersTable.username,
    })
    .from(supportRepliesTable)
    .leftJoin(usersTable, eq(supportRepliesTable.authorId, usersTable.id))
    .where(eq(supportRepliesTable.ticketId, ticketId))
    .orderBy(supportRepliesTable.createdAt);

  res.json({ ticket, replies });
});

// Admin reply
router.post("/support/:id/reply", requireAdmin, async (req, res) => {
  const ticketId = parseInt(String(req.params.id), 10);
  const { message } = req.body as { message?: string };
  if (isNaN(ticketId) || !message?.trim()) {
    res.status(400).json({ error: "Message is required." }); return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return; }

  const [reply] = await db.insert(supportRepliesTable).values({
    ticketId,
    authorId: req.session.userId ?? null,
    isAdmin:  true,
    message:  message.trim(),
  }).returning();

  // Re-open on any non-open status (legacy closed statuses included) when admin replies.
  await db.update(supportTicketsTable)
    .set({ status: "open", updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId));

  // Email user
  void sendAdminReplyEmail(ticket.email, ticket.id, ticket.subject, message.trim(), ticket.userId);

  res.status(201).json({ reply });
});

// Update ticket status
router.put("/support/:id/status", requireAdmin, async (req, res) => {
  const ticketId = parseInt(String(req.params.id), 10);
  const { status } = req.body as { status?: string };
  if (isNaN(ticketId) || !["open", "resolved"].includes(status ?? "")) {
    res.status(400).json({ error: "Status must be 'open' or 'resolved'." }); return;
  }

  const [before] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
  if (!before) { res.status(404).json({ error: "Ticket not found." }); return; }

  const [updated] = await db
    .update(supportTicketsTable)
    .set({ status: status!, updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();

  // Email user when ticket is resolved
  if (status === "resolved" && before.status !== "resolved") {
    void sendTicketResolvedEmail(updated.email, updated.id, updated.subject, updated.userId);
  }

  res.json({ ticket: updated });
});

// ── Error logs ────────────────────────────────────────────────────────────────

router.get("/errors", requireAdmin, async (req, res) => {
  const limit    = Math.min(Number(req.query.limit ?? 100), 500);
  const type     = req.query.type as string | undefined;
  const since    = req.query.since ? new Date(req.query.since as string) : undefined;

  const conditions: ReturnType<typeof and>[] = [];
  if (type && type !== "all") conditions.push(eq(errorLogsTable.errorType, type));
  if (since) conditions.push(gte(errorLogsTable.createdAt, since));

  const rows = await db
    .select({
      id:           errorLogsTable.id,
      userId:       errorLogsTable.userId,
      username:     usersTable.username,
      email:        usersTable.email,
      sessionId:    errorLogsTable.sessionId,
      endpoint:     errorLogsTable.endpoint,
      method:       errorLogsTable.method,
      statusCode:   errorLogsTable.statusCode,
      errorType:    errorLogsTable.errorType,
      errorMessage: errorLogsTable.errorMessage,
      userAgent:    errorLogsTable.userAgent,
      ipAddress:    errorLogsTable.ipAddress,
      createdAt:    errorLogsTable.createdAt,
    })
    .from(errorLogsTable)
    .leftJoin(usersTable, eq(errorLogsTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(errorLogsTable.createdAt))
    .limit(limit);

  res.json({ errors: rows });
});

router.get("/errors/summary", requireAdmin, async (_req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since1h  = new Date(Date.now() - 60 * 60 * 1000);

  const [byType24h, byType1h, totalRow] = await Promise.all([
    db.select({
      errorType: errorLogsTable.errorType,
      count:     sql<number>`COUNT(*)::int`,
    })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, since24h))
      .groupBy(errorLogsTable.errorType)
      .orderBy(desc(sql`COUNT(*)`)),

    db.select({
      errorType: errorLogsTable.errorType,
      count:     sql<number>`COUNT(*)::int`,
    })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, since1h))
      .groupBy(errorLogsTable.errorType)
      .orderBy(desc(sql`COUNT(*)`)),

    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, since24h)),
  ]);

  const loginFailures24h = byType24h.find(r => r.errorType === "login_failure")?.count ?? 0;
  const rateLimited24h   = byType24h.find(r => r.errorType === "rate_limited")?.count ?? 0;
  const serverErrors24h  = byType24h.filter(r => r.errorType === "server_error" || r.errorType === "proxy_error")
    .reduce((s, r) => s + r.count, 0);

  res.json({
    total24h:        totalRow[0]?.count ?? 0,
    loginFailures24h,
    rateLimited24h,
    serverErrors24h,
    byType24h,
    byType1h,
  });
});

// ── Login events ─────────────────────────────────────────────────────────────
router.get("/login-events", requireAdmin, async (req, res) => {
  const limit  = Math.min(Number(req.query["limit"]) || 100, 500);
  const filter = (req.query["filter"] as string | undefined) ?? "all";
  const since  = req.query["since"] ? new Date(req.query["since"] as string) : null;

  const conditions = [];
  if (filter === "success")   conditions.push(eq(loginEventsTable.success, true));
  if (filter === "failure")   conditions.push(eq(loginEventsTable.success, false));
  if (filter === "admin")     conditions.push(eq(loginEventsTable.is2fa, false));
  if (filter === "2fa")       conditions.push(eq(loginEventsTable.is2fa, true));
  if (since)                  conditions.push(gte(loginEventsTable.createdAt, since));

  const rows = await db
    .select({
      id:            loginEventsTable.id,
      userId:        loginEventsTable.userId,
      email:         loginEventsTable.email,
      ipAddress:     loginEventsTable.ipAddress,
      userAgent:     loginEventsTable.userAgent,
      success:       loginEventsTable.success,
      failureReason: loginEventsTable.failureReason,
      is2fa:         loginEventsTable.is2fa,
      createdAt:     loginEventsTable.createdAt,
      username:      usersTable.username,
    })
    .from(loginEventsTable)
    .leftJoin(usersTable, eq(loginEventsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(loginEventsTable.createdAt))
    .limit(limit);

  res.json({ events: rows });
});

// ── System Monitor — health stats ────────────────────────────────────────────
router.get("/system-monitor", requireAdmin, async (_req, res) => {
  const now          = new Date();
  const startOfToday = startOfAppDay(now);
  const since5min    = new Date(Date.now() - 5 * 60 * 1000);

  const [
    activeUsersRow,
    activeSessionsRow,
    failedLoginsRow,
    successLoginsRow,
    apiErrorsRow,
    proxyFailuresRow,
    sessionExpirationsRow,
    sessionsStartedRow,
    sessionsEndedRow,
  ] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)::int` }).from(usersTable)
      .where(and(gt(usersTable.lastActivity, since5min), sql`${usersTable.isAdmin} = false`)),

    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(and(isNull(sessionsTable.endedAt), sql`${usersTable.isAdmin} = false`)),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(loginEventsTable)
      .where(and(gte(loginEventsTable.createdAt, startOfToday), eq(loginEventsTable.success, false))),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(loginEventsTable)
      .where(and(gte(loginEventsTable.createdAt, startOfToday), eq(loginEventsTable.success, true))),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(errorLogsTable)
      .where(gte(errorLogsTable.createdAt, startOfToday)),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(errorLogsTable)
      .where(and(gte(errorLogsTable.createdAt, startOfToday), eq(errorLogsTable.errorType, "proxy_error"))),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(errorLogsTable)
      .where(and(gte(errorLogsTable.createdAt, startOfToday), eq(errorLogsTable.statusCode, 401))),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(sessionsTable)
      .where(gte(sessionsTable.startedAt, startOfToday)),

    db.select({ count: sql<number>`COUNT(*)::int` }).from(sessionsTable)
      .where(and(gte(sessionsTable.endedAt!, startOfToday), sql`ended_at IS NOT NULL`)),
  ]);

  res.json({
    activeUsers:            activeUsersRow[0]?.count           ?? 0,
    /** Customer open sessions only (matches admin Live Sessions list). */
    activeSessions:         activeSessionsRow[0]?.count ?? 0,
    failedLoginsToday:      failedLoginsRow[0]?.count          ?? 0,
    successfulLoginsToday:  successLoginsRow[0]?.count         ?? 0,
    apiErrorsToday:         apiErrorsRow[0]?.count             ?? 0,
    proxyFailuresToday:     proxyFailuresRow[0]?.count         ?? 0,
    sessionExpirationsToday: sessionExpirationsRow[0]?.count   ?? 0,
    sessionsStartedToday:   sessionsStartedRow[0]?.count       ?? 0,
    sessionsEndedToday:     sessionsEndedRow[0]?.count         ?? 0,
  });
});

// ── System Monitor — unified event feed ──────────────────────────────────────
router.get("/system-events", requireAdmin, async (req, res) => {
  const limit   = Math.min(Number(req.query["limit"]) || 60, 200);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [loginRows, sessionRows, errorRows, activityRows] = await Promise.all([
    db.select({
      id:            loginEventsTable.id,
      email:         loginEventsTable.email,
      success:       loginEventsTable.success,
      failureReason: loginEventsTable.failureReason,
      is2fa:         loginEventsTable.is2fa,
      ipAddress:     loginEventsTable.ipAddress,
      createdAt:     loginEventsTable.createdAt,
      username:      usersTable.username,
    })
      .from(loginEventsTable)
      .leftJoin(usersTable, eq(loginEventsTable.userId, usersTable.id))
      .where(gte(loginEventsTable.createdAt, since24h))
      .orderBy(desc(loginEventsTable.createdAt))
      .limit(limit),

    db.select({
      id:              sessionsTable.id,
      startedAt:       sessionsTable.startedAt,
      endedAt:         sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      langPair:        sessionsTable.langPair,
      username:        usersTable.username,
    })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(gte(sessionsTable.startedAt, since24h))
      .orderBy(desc(sessionsTable.startedAt))
      .limit(limit),

    db.select({
      id:           errorLogsTable.id,
      endpoint:     errorLogsTable.endpoint,
      method:       errorLogsTable.method,
      statusCode:   errorLogsTable.statusCode,
      errorType:    errorLogsTable.errorType,
      errorMessage: errorLogsTable.errorMessage,
      ipAddress:    errorLogsTable.ipAddress,
      createdAt:    errorLogsTable.createdAt,
      username:     usersTable.username,
    })
      .from(errorLogsTable)
      .leftJoin(usersTable, eq(errorLogsTable.userId, usersTable.id))
      .where(gte(errorLogsTable.createdAt, since24h))
      .orderBy(desc(errorLogsTable.createdAt))
      .limit(limit),

    db
      .select({
        id: adminActivityEventsTable.id,
        eventType: adminActivityEventsTable.eventType,
        detail: adminActivityEventsTable.detail,
        createdAt: adminActivityEventsTable.createdAt,
        username: usersTable.username,
        email: usersTable.email,
      })
      .from(adminActivityEventsTable)
      .leftJoin(usersTable, eq(adminActivityEventsTable.userId, usersTable.id))
      .where(gte(adminActivityEventsTable.createdAt, since24h))
      .orderBy(desc(adminActivityEventsTable.createdAt))
      .limit(limit),
  ]);

  type SystemEvent = {
    id: string; type: string; title: string;
    description: string; timestamp: string;
    meta: Record<string, unknown>;
  };

  const events: SystemEvent[] = [];

  for (const a of activityRows) {
    const actor = a.username ?? a.email ?? "user";
    if (a.eventType === "email_reminder_unsubscribe") {
      events.push({
        id:          `activity-${a.id}`,
        type:        "email_reminder_unsubscribe",
        title:       "Trial reminders unsubscribed",
        description: `${actor}: ${a.detail ?? "disabled trial reminder emails"}`,
        timestamp:   a.createdAt.toISOString(),
        meta:        { username: a.username, email: a.email, detail: a.detail },
      });
    }
  }

  for (const e of loginRows) {
    const actor = e.username ?? e.email ?? "unknown";
    events.push({
      id:          `login-${e.id}`,
      type:        e.success ? "login_success" : "login_failure",
      title:       e.success ? "Login successful" : "Login failed",
      description: e.success
        ? `${actor} signed in${e.is2fa ? " with 2FA" : ""}${e.ipAddress ? ` from ${e.ipAddress}` : ""}`
        : `Failed login for ${actor}${e.failureReason ? ` (${e.failureReason.replace(/_/g, " ")})` : ""}${e.ipAddress ? ` from ${e.ipAddress}` : ""}`,
      timestamp: e.createdAt.toISOString(),
      meta: { username: e.username, email: e.email, ipAddress: e.ipAddress, is2fa: e.is2fa, failureReason: e.failureReason },
    });
  }

  for (const s of sessionRows) {
    events.push({
      id:          `session-start-${s.id}`,
      type:        "session_start",
      title:       "Session started",
      description: `${s.username} started a session${s.langPair ? ` (${s.langPair})` : ""}`,
      timestamp:   s.startedAt.toISOString(),
      meta: { username: s.username, langPair: s.langPair },
    });
    if (s.endedAt) {
      const mins = s.durationSeconds ? Math.round(s.durationSeconds / 60) : null;
      events.push({
        id:          `session-end-${s.id}`,
        type:        "session_end",
        title:       "Session ended",
        description: `${s.username} ended a session${mins != null ? ` after ${mins}m` : ""}`,
        timestamp:   s.endedAt.toISOString(),
        meta: { username: s.username, durationSeconds: s.durationSeconds },
      });
    }
  }

  for (const e of errorRows) {
    const isProxy = e.errorType === "proxy_error";
    events.push({
      id:          `error-${e.id}`,
      type:        isProxy ? "proxy_failure" : "api_error",
      title:       isProxy ? "Proxy failure" : `API error ${e.statusCode}`,
      description: `${e.method} ${e.endpoint} → ${e.statusCode}${e.errorMessage ? `: ${e.errorMessage.slice(0, 80)}` : ""}`,
      timestamp:   e.createdAt.toISOString(),
      meta: { endpoint: e.endpoint, method: e.method, statusCode: e.statusCode, errorType: e.errorType, username: e.username },
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json({ events: events.slice(0, limit) });
});

router.get("/login-events/summary", requireAdmin, async (req, res) => {
  const now  = new Date();
  const h24  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h1   = new Date(now.getTime() - 60 * 60 * 1000);

  const [total24h, failures24h, success24h, twoFa24h, lastHour] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(loginEventsTable).where(gte(loginEventsTable.createdAt, h24)),
    db.select({ c: sql<number>`count(*)::int` }).from(loginEventsTable).where(and(gte(loginEventsTable.createdAt, h24), eq(loginEventsTable.success, false))),
    db.select({ c: sql<number>`count(*)::int` }).from(loginEventsTable).where(and(gte(loginEventsTable.createdAt, h24), eq(loginEventsTable.success, true))),
    db.select({ c: sql<number>`count(*)::int` }).from(loginEventsTable).where(and(gte(loginEventsTable.createdAt, h24), eq(loginEventsTable.is2fa, true))),
    db.select({ c: sql<number>`count(*)::int` }).from(loginEventsTable).where(gte(loginEventsTable.createdAt, h1)),
  ]);

  const byReason = await db
    .select({ reason: loginEventsTable.failureReason, count: sql<number>`count(*)::int` })
    .from(loginEventsTable)
    .where(and(gte(loginEventsTable.createdAt, h24), eq(loginEventsTable.success, false)))
    .groupBy(loginEventsTable.failureReason)
    .orderBy(desc(sql`count(*)`));

  res.json({
    total24h:    total24h[0]?.c ?? 0,
    failures24h: failures24h[0]?.c ?? 0,
    success24h:  success24h[0]?.c ?? 0,
    twoFa24h:    twoFa24h[0]?.c ?? 0,
    lastHour:    lastHour[0]?.c ?? 0,
    byReason,
  });
});

/** Resend “subscription is active” email (e.g. after a missed webhook). Optional `force: true` sends even if already recorded. */
router.post("/resend-subscription-confirmation", requireAdmin, async (req, res) => {
  const { email, force } = req.body as { email?: string; force?: boolean };
  const em = email?.trim().toLowerCase();
  if (!em || !em.includes("@")) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.email, em)).limit(1);
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const key = billingProductKeyFromPlanType(u.planType ?? "");
  if (!key) {
    res.status(400).json({ error: "User plan does not map to a paid subscription tier" });
    return;
  }

  if (u.subscriptionConfirmationSentAt && !force) {
    res.status(409).json({ error: "Confirmation already recorded; pass force: true to resend" });
    return;
  }

  const ok = await sendSubscriptionConfirmationEmail(
    em,
    billingPlanTierDisplayName(key),
    "Your next billing date is available in your PayPal account",
    u.username,
    u.id,
  );
  if (!ok) {
    res.status(503).json({ error: "Email not sent (check RESEND_API_KEY and Resend logs)" });
    return;
  }

  await db
    .update(usersTable)
    .set({ subscriptionConfirmationSentAt: new Date() })
    .where(eq(usersTable.id, u.id));

  res.json({ ok: true });
});

export default router;
