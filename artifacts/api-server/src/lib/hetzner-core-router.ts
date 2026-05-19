import { logger } from "./logger.js";

/** Libre worker lane → CORE1..CORE4 (typically :5001/:5002 per Hetzner host). */
export type CoreLane = 1 | 2 | 3 | 4;
export type CoreRoute = { lane: CoreLane; baseUrl: string };

/** Emergency: every lane uses the same single LibreTranslate (`:5000`). */
const USE_LEGACY_EMERGENCY = process.env.HETZNER_USE_LEGACY_SINGLE_STACK === "1";

const LEGACY_TRANSLATE_BASE = (process.env.HETZNER_TRANSLATE_LEGACY_BASE ?? "http://178.156.211.226:5000").trim();

function defaultLaneBases(): Record<1 | 2, string> {
  const raw = (process.env.HETZNER_WORKER_HOST ?? "178.156.211.226").trim();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const scheme = (process.env.HETZNER_WORKER_SCHEME ?? "http").trim().replace(/:+$/, "");
  const root = `${scheme}://${host}`;
  return { 1: `${root}:5001`, 2: `${root}:5002` };
}

const def = defaultLaneBases();
function envOrLane(envVal: string | undefined, lane: 1 | 2): string {
  const t = envVal?.trim();
  return t || def[lane];
}

const CORE1_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE1_TRANSLATE_BASE, 1)
).trim();
const CORE2_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE2_TRANSLATE_BASE, 2)
).trim();
/** Defaults duplicate CORE2 until CORE3/CORE4 env set (2-lane mode ignores these URLs). */
const CORE3_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : process.env.HETZNER_CORE3_TRANSLATE_BASE?.trim() || CORE2_BASE
).trim();
const CORE4_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : process.env.HETZNER_CORE4_TRANSLATE_BASE?.trim() || CORE2_BASE
).trim();

const laneToBase: Record<CoreLane, string> = {
  1: CORE1_BASE,
  2: CORE2_BASE,
  3: CORE3_BASE,
  4: CORE4_BASE,
};

/** Falsy trimmed CORE3/CORE4 env → `CORE3_BASE`/`CORE4_BASE` copy `CORE2_BASE` (module load). */
const core3EnvTrimmedForInit = (process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim();
const core4EnvTrimmedForInit = (process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim();

logger.info(
  {
    tag: "hetzner_lane_table_module_init",
    railwayReplicaId: (process.env.RAILWAY_REPLICA_ID ?? "").trim() || null,
    railwayDeploymentId: (process.env.RAILWAY_DEPLOYMENT_ID ?? "").trim() || null,
    /** Final strings wired into `laneToBase` — not env keys. */
    CORE1_BASE,
    CORE2_BASE,
    CORE3_BASE,
    CORE4_BASE,
    laneToBase: { ...laneToBase },
    USE_LEGACY_EMERGENCY,
    /** If true, CORE3/CORE4 ignored empty env and reused CORE2’s resolved base. */
    core3ResolvedViaCore2Fallback: !USE_LEGACY_EMERGENCY && !core3EnvTrimmedForInit,
    core4ResolvedViaCore2Fallback: !USE_LEGACY_EMERGENCY && !core4EnvTrimmedForInit,
    /** Trimmed env payloads (empty means fallback path ran). */
    HETZNER_CORE3_TRANSLATE_BASE_trimmed: core3EnvTrimmedForInit || null,
    HETZNER_CORE4_TRANSLATE_BASE_trimmed: core4EnvTrimmedForInit || null,
  },
  "hetzner_lane_table_module_init",
);

export function getHetznerLaneBaseUrl(lane: CoreLane | number | string): string {
  const n = typeof lane === "string" ? Number.parseInt(lane.trim(), 10) : Number(lane);
  if (!Number.isInteger(n) || n < 1 || n > 4) return "";
  return laneToBase[n as CoreLane];
}

function readFourLaneRouterEnv(): boolean {
  const v = (process.env.HETZNER_FOUR_LANE_ROUTER ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function computeNumSlots(): 2 | 4 {
  if (USE_LEGACY_EMERGENCY) return 2;
  if (!readFourLaneRouterEnv()) return 2;
  const c3 = (process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim();
  const c4 = (process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim();
  if (!c3 || !c4) {
    logger.warn(
      { hasCore3: Boolean(c3), hasCore4: Boolean(c4) },
      "Hetzner core router: HETZNER_FOUR_LANE_ROUTER set but CORE3/CORE4 bases incomplete — falling back to 2 lanes",
    );
    return 2;
  }
  return 4;
}

const NUM_SLOTS = computeNumSlots();

export function getHetznerRoutingNumSlots(): 2 | 4 {
  return NUM_SLOTS;
}

function warnIfCore34SecondaryHostnameMismatch(): void {
  const expected = process.env.HETZNER_EXPECT_CORE34_SECONDARY_HOSTNAME?.trim();
  if (!expected || USE_LEGACY_EMERGENCY || NUM_SLOTS !== 4) return;
  for (const lane of [3, 4] as const) {
    const url = laneToBase[lane];
    try {
      const host = new URL(url).hostname;
      if (host !== expected) {
        logger.warn(
          { lane, url, host, expected },
          "Hetzner: CORE lane host does not match HETZNER_EXPECT_CORE34_SECONDARY_HOSTNAME — fix env or expectation",
        );
      }
    } catch (err: unknown) {
      logger.warn({ lane, url, err: err instanceof Error ? err.message : String(err) }, "Hetzner: invalid CORE URL for secondary host check");
    }
  }
}

warnIfCore34SecondaryHostnameMismatch();

if (!USE_LEGACY_EMERGENCY && readFourLaneRouterEnv() && NUM_SLOTS === 2) {
  logger.warn(
    {
      NUM_SLOTS,
      core3EnvDefined: Boolean((process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim()),
      core4EnvDefined: Boolean((process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim()),
    },
    "Hetzner core router: HETZNER_FOUR_LANE_ROUTER is set but NUM_SLOTS=2 — runtime matches 2-lane semantics until both CORE3 and CORE4 URLs are non-empty",
  );
}

function urlHostname(baseUrl: string): string | null {
  try {
    return new URL(baseUrl.trim()).hostname;
  } catch {
    return null;
  }
}

/**
 * Operator-facing metal bucket: **hostname only** (not host:port).
 * CORE1/CORE3 env URLs typically end in `:5001` while CORE2/CORE4 use `:5002` on the same machines —
 * comparing `URL.host` would never classify `:5002` workers as HZ-1/HZ-2.
 *
 * - **HZ-1** — same hostname as `HETZNER_CORE1_TRANSLATE_BASE` (primary metal).
 * - **HZ-2** — same hostname as `HETZNER_CORE3_TRANSLATE_BASE` (secondary metal; CORE4 shares this host).
 */
export function hetznerWorkerHostGroupLabel(baseUrl: string): string {
  const h = urlHostname(baseUrl);
  if (!h) return "HZ";
  const primary = urlHostname(CORE1_BASE);
  const secondary = urlHostname(CORE3_BASE);
  if (primary && h === primary) return "HZ-1";
  if (secondary && h === secondary) return "HZ-2";
  const hostPort = (() => {
    try {
      return new URL(baseUrl.trim()).host;
    } catch {
      return null;
    }
  })();
  const snippet = hostPort ?? h;
  return snippet.length > 28 ? `${snippet.slice(0, 28)}…` : snippet;
}

export function isPaidMachinePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "basic-libre" || p === "professional-libre" || p === "platinum-libre";
}

function authoritativeRoute(lane: CoreLane): CoreRoute {
  return { lane, baseUrl: laneToBase[lane] };
}

function trialIdleSpreadSlotIndices(): readonly number[] {
  if (NUM_SLOTS === 4) return [1, 2, 3, 0];
  return [1, 0];
}

/**
 * Stateless routing for requests with **no** DB session (e.g. auxiliary `/translate`, leak repair).
 * Does not reflect cluster occupancy — session-bound MT always uses `sessions.hetzner_mt_*` lanes.
 */
export function selectAnonymousHetznerCoreRoute(planType: string): CoreRoute {
  const paid = isPaidMachinePlanType(planType);

  if (USE_LEGACY_EMERGENCY) {
    return authoritativeRoute(1);
  }

  if (paid) {
    return authoritativeRoute(1);
  }

  for (const i of trialIdleSpreadSlotIndices()) {
    if (i >= NUM_SLOTS) continue;
    const lane = (i + 1) as CoreLane;
    return authoritativeRoute(lane);
  }

  const fallbackLane = NUM_SLOTS as CoreLane;
  return authoritativeRoute(fallbackLane);
}

export function logHetznerCoreRouterStartupHint(): void {
  const fourLaneRequested = readFourLaneRouterEnv();
  const c1Raw = process.env.HETZNER_CORE1_TRANSLATE_BASE ?? null;
  const c2Raw = process.env.HETZNER_CORE2_TRANSLATE_BASE ?? null;
  const c3Raw = process.env.HETZNER_CORE3_TRANSLATE_BASE ?? null;
  const c4Raw = process.env.HETZNER_CORE4_TRANSLATE_BASE ?? null;
  const c3Trimmed = Boolean((c3Raw ?? "").trim());
  const c4Trimmed = Boolean((c4Raw ?? "").trim());

  logger.info(
    {
      tag: "hetzner_lane_to_base_boot_verify",
      purpose:
        "Compare raw Railway env on THIS replica to resolved laneToBase. If admin shows lane 4 + wrong URL, grep this tag per replica.",
      processIdentity: {
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV ?? null,
        railwayReplicaId: (process.env.RAILWAY_REPLICA_ID ?? "").trim() || null,
        railwayDeploymentId: (process.env.RAILWAY_DEPLOYMENT_ID ?? "").trim() || null,
        railwayServiceId: (process.env.RAILWAY_SERVICE_ID ?? "").trim() || null,
        hostname: (process.env.HOSTNAME ?? "").trim() || null,
      },
      hetznerCoreTranslateBaseEnvRaw: {
        HETZNER_CORE1_TRANSLATE_BASE: c1Raw,
        HETZNER_CORE2_TRANSLATE_BASE: c2Raw,
        HETZNER_CORE3_TRANSLATE_BASE: c3Raw,
        HETZNER_CORE4_TRANSLATE_BASE: c4Raw,
      },
      /** When CORE1/CORE2 env unset, `envOrLane` uses these defaults for :5001 / :5002. */
      hetznerWorkerHostFallbackInputs: {
        HETZNER_WORKER_HOST: process.env.HETZNER_WORKER_HOST ?? null,
        HETZNER_WORKER_SCHEME: process.env.HETZNER_WORKER_SCHEME ?? null,
      },
      routingFlags: {
        HETZNER_USE_LEGACY_SINGLE_STACK: USE_LEGACY_EMERGENCY,
        HETZNER_FOUR_LANE_ROUTER: process.env.HETZNER_FOUR_LANE_ROUTER ?? null,
        NUM_SLOTS,
        core3EnvNonEmpty: c3Trimmed,
        core4EnvNonEmpty: c4Trimmed,
        /** Empty CORE4 env → `CORE4_BASE` copies `CORE2_BASE` (lane 4 hits primary :5002). */
        core4ResolvedViaCore2Fallback: !c4Trimmed && !USE_LEGACY_EMERGENCY,
        core3ResolvedViaCore2Fallback: !c3Trimmed && !USE_LEGACY_EMERGENCY,
      },
      resolvedCoreBasesUsedForLaneTable: {
        CORE1_BASE,
        CORE2_BASE,
        CORE3_BASE,
        CORE4_BASE,
      },
      laneToBase: { ...laneToBase },
      getHetznerLaneBaseUrlResolved: {
        1: getHetznerLaneBaseUrl(1),
        2: getHetznerLaneBaseUrl(2),
        3: getHetznerLaneBaseUrl(3),
        4: getHetznerLaneBaseUrl(4),
      },
      hzMetalHostnames: {
        hz1: urlHostname(CORE1_BASE),
        hz2: urlHostname(CORE3_BASE),
      },
      paidExclusiveLaneFillOrder: NUM_SLOTS === 4 ? [1, 3, 4, 2] : [1, 2],
      trialIdleLaneScanOrder: NUM_SLOTS === 4 ? [2, 3, 4, 1] : [2, 1],
    },
    "hetzner_lane_to_base_boot_verify",
  );

  logger.info(
    {
      lanes: laneToBase,
      hzMetalHostnames: {
        hz1: urlHostname(CORE1_BASE),
        hz2: urlHostname(CORE3_BASE),
      },
      numSlots: NUM_SLOTS,
      fourLaneRouterEnv: fourLaneRequested,
      legacyEmergency: USE_LEGACY_EMERGENCY,
      legacyFallbackBase: LEGACY_TRANSLATE_BASE,
      paidExclusiveLaneFillOrder: NUM_SLOTS === 4 ? [1, 3, 4, 2] : [1, 2],
      trialIdleLaneScanOrder: NUM_SLOTS === 4 ? [2, 3, 4, 1] : [2, 1],
      core3EnvDefined: c3Trimmed,
      core4EnvDefined: c4Trimmed,
      semantics:
        NUM_SLOTS === 4
          ? "DB session lanes + anonymous tail; 4 workers paid 1→3→4→2"
          : "DB session lanes + anonymous tail; 2 workers paid priority",
    },
    USE_LEGACY_EMERGENCY
      ? "Hetzner core router: LEGACY SINGLE STACK (HETZNER_USE_LEGACY_SINGLE_STACK=1)"
      : NUM_SLOTS === 4
        ? "Hetzner core router: four workers — assignments persisted on `sessions`"
        : "Hetzner core router: two workers — assignments persisted on `sessions`",
  );
}
