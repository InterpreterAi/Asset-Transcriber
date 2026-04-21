import { logger } from "./logger.js";

/** Two lanes only: **1 = paid** machine MT, **2 = trial** machine MT (fits small RAM hosts). */
export type CoreLane = 1 | 2;
export type CoreRoute = { lane: CoreLane; baseUrl: string };

/** Emergency: every lane uses the same single LibreTranslate (`:5000`). */
const USE_LEGACY_EMERGENCY = process.env.HETZNER_USE_LEGACY_SINGLE_STACK === "1";

const LEGACY_TRANSLATE_BASE = (process.env.HETZNER_TRANSLATE_LEGACY_BASE ?? "http://178.156.211.226:5000").trim();

function defaultLaneBases(): Record<CoreLane, string> {
  const raw = (process.env.HETZNER_WORKER_HOST ?? "178.156.211.226").trim();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const scheme = (process.env.HETZNER_WORKER_SCHEME ?? "http").trim().replace(/:+$/, "");
  const root = `${scheme}://${host}`;
  return { 1: `${root}:5001`, 2: `${root}:5002` };
}

const def = defaultLaneBases();
function envOrLane(envVal: string | undefined, lane: CoreLane): string {
  const t = envVal?.trim();
  return t || def[lane];
}

const CORE1_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE1_TRANSLATE_BASE, 1)
).trim();
const CORE2_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE2_TRANSLATE_BASE, 2)
).trim();

const twoLaneIsolation = !USE_LEGACY_EMERGENCY;

const laneToBase: Record<CoreLane, string> = {
  1: CORE1_BASE,
  2: CORE2_BASE,
};

const sessionLane = new Map<number, CoreLane>();
const paidActiveSessions = new Set<number>();

function isPaidPlan(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "basic-libre" || p === "professional-libre" || p === "platinum-libre";
}

/** While any paid session is active, trial sessions must not use lane 1. */
function moveTrialsOffPaidLane(): void {
  if (paidActiveSessions.size === 0) return;
  for (const [sid, lane] of sessionLane.entries()) {
    if (paidActiveSessions.has(sid)) continue;
    if (lane === 1) {
      sessionLane.set(sid, 2);
      logger.info(
        {
          sessionId: sid,
          fromLane: 1,
          toLane: 2,
          paidMachineSessions: paidActiveSessions.size,
        },
        "Hetzner core router: trial machine session moved off paid lane (paid active)",
      );
    }
  }
}

/**
 * @param machineTranslationEnabled When false, the session does not use Hetzner (e.g. trial OpenAI phase);
 *   it must not occupy paid/trial core slots.
 */
export function registerSessionStartForCoreRouting(
  sessionId: number,
  planType: string,
  machineTranslationEnabled = true,
): void {
  if (!Number.isFinite(sessionId)) return;
  if (!machineTranslationEnabled) {
    unregisterSessionForCoreRouting(sessionId);
    return;
  }
  if (isPaidPlan(planType)) {
    paidActiveSessions.add(sessionId);
    sessionLane.set(sessionId, 1);
    logger.info(
      { sessionId, planType: planType.trim().toLowerCase(), lane: 1 },
      "Hetzner core router: paid machine session registered on lane 1",
    );
    moveTrialsOffPaidLane();
    return;
  }
  sessionLane.set(sessionId, 2);
}

export function unregisterSessionForCoreRouting(sessionId: number): void {
  sessionLane.delete(sessionId);
  paidActiveSessions.delete(sessionId);
}

export function selectHetznerCoreRoute(planType: string, sessionId?: number): CoreRoute {
  if (typeof sessionId === "number" && Number.isFinite(sessionId)) {
    const assigned = sessionLane.get(sessionId);
    if (assigned) {
      return { lane: assigned, baseUrl: laneToBase[assigned] };
    }
    registerSessionStartForCoreRouting(sessionId, planType);
    const fresh = sessionLane.get(sessionId);
    if (fresh) {
      return { lane: fresh, baseUrl: laneToBase[fresh] };
    }
  }

  if (isPaidPlan(planType)) {
    return { lane: 1, baseUrl: laneToBase[1] };
  }
  return { lane: 2, baseUrl: laneToBase[2] };
}

export function logHetznerCoreRouterStartupHint(): void {
  logger.info(
    {
      lanes: laneToBase,
      twoLaneIsolation,
      legacyEmergency: USE_LEGACY_EMERGENCY,
      legacyFallbackBase: LEGACY_TRANSLATE_BASE,
      semantics: "two lanes: paid → 1, trial machine → 2; paid session forces trials off lane 1",
    },
    USE_LEGACY_EMERGENCY
      ? "Hetzner core router: LEGACY SINGLE STACK (HETZNER_USE_LEGACY_SINGLE_STACK=1)"
      : "Hetzner core router: two-lane (5001 paid, 5002 trial) — see deploy/MEMORY-BUDGET-2LANE.md",
  );
}
