import { createHash } from "node:crypto";
import { isPublicIp, type GeoInfo } from "./geo.js";

export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export type SecUser = {
  id: number;
  username: string;
  email: string | null;
  planType: string;
  isActive: boolean;
  createdAt: Date;
  trialEndsAt: Date | null;
  googleAccountId: string | null;
  paypalSubscriptionId: string | null;
  totalMinutesUsed: number;
  dailyLimitMinutes: number;
  lastActivity: Date | null;
};

export type Sighting = { userId: number; ip: string; ua: string | null; firstSeen: Date; lastSeen: Date; hits: number };
export type SecSession = { userId: number; startedAt: Date; endedAt: Date; langPair: string | null; seconds: number };
export type BlockEvent = { userId: number; at: Date; kind: "session_start" | "login" };
export type TicketEvent = { userId: number; at: Date; ticketId: number; subject: string };

export type SecurityData = {
  now: Date;
  lookbackStart: Date;
  users: SecUser[];
  sightings: Sighting[];
  sessions: SecSession[];
  blocks: BlockEvent[];
  tickets: TicketEvent[];
};

export type Confidence = "high" | "medium" | "low";

export type Signal = { key: string; points: number; text: string };

export type AccountBrief = {
  id: number;
  username: string;
  email: string | null;
  planType: string;
  isActive: boolean;
  createdAt: string;
  trialEndsAt: string | null;
  totalMinutes: number;
  sessionCount: number;
  topLangPair: string | null;
  locations: string[];
  devices: string[];
};

export type TimelineEntry = { at: string; userId: number | null; text: string };

export type SecurityCase = {
  key: string;
  olderUserId: number;
  newerUserId: number;
  score: number;
  confidence: Confidence;
  summary: string;
  signals: Signal[];
  counterSignals: Signal[];
  timeline: TimelineEntry[];
  innocentExplanation: string;
  recommendation: string;
  draftReply: string;
  accounts: [AccountBrief, AccountBrief];
};

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

// ── Data loading (SELECT only) ──────────────────────────────────────────────

export async function loadSecurityData(q: Queryable, lookbackDays = 45): Promise<SecurityData> {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - lookbackDays * DAY_MS);
  const hasSightingsTable = Boolean(
    (await q.query(`SELECT to_regclass('public.security_ip_sightings') AS r`)).rows[0]?.r,
  );

  const sightingsUnion = [
    `SELECT user_id, trim(ip_address) AS ip, user_agent AS ua, min(created_at) AS first_seen, max(created_at) AS last_seen, count(*)::int AS hits
       FROM login_events
      WHERE success AND user_id IS NOT NULL AND ip_address IS NOT NULL AND created_at > $1
      GROUP BY 1, 2, 3`,
    `SELECT user_id, trim(ip_address), user_agent, min(created_at), max(created_at), count(*)::int
       FROM error_logs
      WHERE user_id IS NOT NULL AND ip_address IS NOT NULL AND created_at > $1
      GROUP BY 1, 2, 3`,
  ];
  if (hasSightingsTable) {
    sightingsUnion.push(
      `SELECT user_id, ip_address, user_agent, first_seen, last_seen, hits
         FROM security_ip_sightings
        WHERE last_seen > $1`,
    );
  }

  const [usersRes, sightingsRes, sessionsRes, blocksRes, ticketsRes] = await Promise.all([
    q.query(
      `SELECT id, username, email, plan_type, is_active, created_at, trial_ends_at, google_account_id,
              paypal_subscription_id, total_minutes_used, daily_limit_minutes, last_activity
         FROM users
        WHERE is_admin = false`,
    ),
    q.query(
      `SELECT user_id, ip, ua, min(first_seen) AS first_seen, max(last_seen) AS last_seen, sum(hits)::int AS hits
         FROM (${sightingsUnion.join(" UNION ALL ")}) x
        WHERE ip <> '' AND ip <> 'unknown'
        GROUP BY 1, 2, 3`,
      [lookbackStart],
    ),
    q.query(
      `SELECT user_id, started_at,
              coalesce(ended_at, last_activity_at, started_at + make_interval(secs => coalesce(duration_seconds, 0))) AS ended_at,
              lang_pair,
              coalesce(duration_seconds, 0) AS seconds
         FROM sessions
        WHERE started_at > $1`,
      [lookbackStart],
    ),
    q.query(
      `SELECT user_id, created_at AS at, 'session_start' AS kind
         FROM error_logs
        WHERE user_id IS NOT NULL AND status_code = 403 AND endpoint LIKE '%/session/start%' AND created_at > $1
       UNION ALL
       SELECT user_id, created_at, 'login'
         FROM login_events
        WHERE user_id IS NOT NULL AND NOT success AND failure_reason = 'account_disabled' AND created_at > $1`,
      [lookbackStart],
    ),
    q.query(
      `SELECT user_id, created_at AS at, id, subject FROM support_tickets WHERE user_id IS NOT NULL AND created_at > $1`,
      [lookbackStart],
    ),
  ]);

  return {
    now,
    lookbackStart,
    users: usersRes.rows.map((r) => ({
      id: Number(r.id),
      username: String(r.username),
      email: r.email ?? null,
      planType: String(r.plan_type ?? ""),
      isActive: Boolean(r.is_active),
      createdAt: new Date(r.created_at),
      trialEndsAt: r.trial_ends_at ? new Date(r.trial_ends_at) : null,
      googleAccountId: r.google_account_id?.trim() || null,
      paypalSubscriptionId: r.paypal_subscription_id?.trim() || null,
      totalMinutesUsed: Number(r.total_minutes_used ?? 0),
      dailyLimitMinutes: Number(r.daily_limit_minutes ?? 0),
      lastActivity: r.last_activity ? new Date(r.last_activity) : null,
    })),
    sightings: sightingsRes.rows.map((r) => ({
      userId: Number(r.user_id),
      ip: String(r.ip).trim(),
      ua: r.ua ?? null,
      firstSeen: new Date(r.first_seen),
      lastSeen: new Date(r.last_seen),
      hits: Number(r.hits ?? 1),
    })),
    sessions: sessionsRes.rows.map((r) => ({
      userId: Number(r.user_id),
      startedAt: new Date(r.started_at),
      endedAt: new Date(r.ended_at),
      langPair: r.lang_pair ?? null,
      seconds: Number(r.seconds ?? 0),
    })),
    blocks: blocksRes.rows.map((r) => ({ userId: Number(r.user_id), at: new Date(r.at), kind: r.kind })),
    tickets: ticketsRes.rows.map((r) => ({
      userId: Number(r.user_id),
      at: new Date(r.at),
      ticketId: Number(r.id),
      subject: String(r.subject ?? ""),
    })),
  };
}

export function scopeIps(data: SecurityData): Set<string> {
  return new Set(data.sightings.map((s) => s.ip));
}

// ── Per-account profile ─────────────────────────────────────────────────────

type Profile = {
  user: SecUser;
  ips: Set<string>;
  cleanIps: Set<string>;
  vpnIps: Set<string>;
  subnets: Set<string>;
  uas: Set<string>;
  cities: Map<string, boolean>;
  regions: Set<string>;
  sessions: SecSession[];
  blocks: BlockEvent[];
  tickets: TicketEvent[];
  topLangPair: string | null;
  capHitDays: string[];
  emailStem: string | null;
  emailTokens: Set<string>;
};

function isTrialPlan(p: string): boolean {
  return p.trim().toLowerCase().startsWith("trial");
}

function subnetOf(ip: string): string | null {
  const v4 = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.0/24`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}::/48`;
  return null;
}

function emailStemOf(email: string | null): string | null {
  const local = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  const stem = local.replace(/\+.*$/, "").replace(/[^a-z0-9]/g, "").replace(/\d+$/, "");
  return stem.length >= 4 ? stem : null;
}

function emailNameTokensOf(email: string | null): Set<string> {
  const local = (email ?? "").split("@")[0]?.toLowerCase().replace(/\+.*$/, "") ?? "";
  return new Set(local.split(/[^a-z]+/).filter((t) => t.length >= 4));
}

function cityKey(g: GeoInfo): string | null {
  return g.city && g.country ? `${g.city}, ${g.region ?? ""}, ${g.country}` : null;
}

function cityLabel(key: string): string {
  const [city, region, country] = key.split(", ");
  return [city, region && region !== city ? region : null, country].filter(Boolean).join(", ");
}

export function describeDevice(ua: string): string {
  const os = /Windows NT 10/.test(ua)
    ? "Windows 10/11"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iPhone/iPad"
          : /Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown OS";
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[0]?.replace("Edg/", "Edge ") ??
    /SamsungBrowser\/(\d+)/.exec(ua)?.[0]?.replace("SamsungBrowser/", "Samsung Browser ") ??
    /OPR\/(\d+)/.exec(ua)?.[0]?.replace("OPR/", "Opera ") ??
    /Firefox\/(\d+)/.exec(ua)?.[0]?.replace("Firefox/", "Firefox ") ??
    /Chrome\/(\d+)/.exec(ua)?.[0]?.replace("Chrome/", "Chrome ") ??
    (/Safari\//.test(ua) ? "Safari" : "Unknown browser");
  return `${browser} on ${os}`;
}

function buildProfiles(data: SecurityData, geo: Map<string, GeoInfo>): Map<number, Profile> {
  const profiles = new Map<number, Profile>();
  for (const u of data.users) {
    profiles.set(u.id, {
      user: u,
      ips: new Set(),
      cleanIps: new Set(),
      vpnIps: new Set(),
      subnets: new Set(),
      uas: new Set(),
      cities: new Map(),
      regions: new Set(),
      sessions: [],
      blocks: [],
      tickets: [],
      topLangPair: null,
      capHitDays: [],
      emailStem: emailStemOf(u.email),
      emailTokens: emailNameTokensOf(u.email),
    });
  }
  for (const s of data.sightings) {
    const p = profiles.get(s.userId);
    if (!p || !isPublicIp(s.ip)) continue;
    p.ips.add(s.ip);
    if (s.ua) p.uas.add(s.ua);
    const g = geo.get(s.ip);
    if (g?.isVpn) p.vpnIps.add(s.ip);
    else {
      p.cleanIps.add(s.ip);
      const sn = subnetOf(s.ip);
      if (sn) p.subnets.add(sn);
    }
    if (g) {
      const ck = cityKey(g);
      if (ck) p.cities.set(ck, (p.cities.get(ck) ?? true) && g.isVpn);
      if (g.region && g.country) p.regions.add(`${g.region}, ${g.country}`);
    }
  }
  for (const s of data.sessions) profiles.get(s.userId)?.sessions.push(s);
  for (const b of data.blocks) profiles.get(b.userId)?.blocks.push(b);
  for (const t of data.tickets) profiles.get(t.userId)?.tickets.push(t);

  for (const p of profiles.values()) {
    p.sessions.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    p.blocks.sort((a, b) => a.at.getTime() - b.at.getTime());
    const langCounts = new Map<string, number>();
    const perDay = new Map<string, number>();
    for (const s of p.sessions) {
      if (s.langPair) langCounts.set(s.langPair, (langCounts.get(s.langPair) ?? 0) + 1);
      const d = s.startedAt.toISOString().slice(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + s.seconds);
    }
    p.topLangPair = [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const capSec = p.user.dailyLimitMinutes * 60 * 0.95;
    if (capSec > 0 && p.user.dailyLimitMinutes < 1000) {
      p.capHitDays = [...perDay.entries()].filter(([, sec]) => sec >= capSec).map(([d]) => d).sort();
    }
  }
  return profiles;
}

// ── Pair scoring ────────────────────────────────────────────────────────────

function countBy<T>(profiles: Iterable<Profile>, keysOf: (p: Profile) => Iterable<T>): Map<T, number> {
  const m = new Map<T, number>();
  for (const p of profiles) for (const k of new Set(keysOf(p))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function fmtMinutes(ms: number): string {
  const m = Math.round(ms / MIN_MS);
  if (m < 90) return `${m} min`;
  const h = Math.round((m / 60) * 10) / 10;
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

type TurnStats = { overlaps: number; switches: number; sharedDays: number };

function turnTaking(a: SecSession[], b: SecSession[]): TurnStats {
  const merged = [...a.map((s) => ({ s, o: 0 })), ...b.map((s) => ({ s, o: 1 }))].sort(
    (x, y) => x.s.startedAt.getTime() - y.s.startedAt.getTime(),
  );
  let overlaps = 0;
  for (const x of a) {
    for (const y of b) {
      const ov = Math.min(x.endedAt.getTime(), y.endedAt.getTime()) - Math.max(x.startedAt.getTime(), y.startedAt.getTime());
      if (ov > MIN_MS) overlaps++;
    }
  }
  let switches = 0;
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1]!;
    const cur = merged[i]!;
    if (prev.o !== cur.o && cur.s.startedAt.getTime() - prev.s.endedAt.getTime() <= 3 * 60 * MIN_MS) switches++;
  }
  const daysA = new Set(a.map((s) => s.startedAt.toISOString().slice(0, 10)));
  const sharedDays = new Set(b.map((s) => s.startedAt.toISOString().slice(0, 10)).filter((d) => daysA.has(d))).size;
  return { overlaps, switches, sharedDays };
}

type Ctx = {
  scopeSize: number;
  ipUsers: Map<string, number>;
  uaUsers: Map<string, number>;
  cityUsers: Map<string, number>;
  regionUsers: Map<string, number>;
  langUsers: Map<string, number>;
  geo: Map<string, GeoInfo>;
};

function scorePair(older: Profile, newer: Profile, ctx: Ctx) {
  const signals: Signal[] = [];
  const counter: Signal[] = [];
  let linked = false;
  const A = `#${older.user.id}`;
  const B = `#${newer.user.id}`;

  if (older.user.googleAccountId && older.user.googleAccountId === newer.user.googleAccountId) {
    signals.push({ key: "same_google", points: 100, text: "Both accounts are tied to the same Google account." });
    linked = true;
  }
  if (older.user.paypalSubscriptionId && older.user.paypalSubscriptionId === newer.user.paypalSubscriptionId) {
    signals.push({ key: "same_paypal", points: 100, text: "Both accounts share the same PayPal subscription." });
    linked = true;
  }
  if (older.emailStem && newer.emailStem) {
    if (older.emailStem === newer.emailStem) {
      signals.push({ key: "email_same_stem", points: 30, text: `The email addresses are nearly identical (${older.user.email} / ${newer.user.email}).` });
      linked = true;
    } else if (
      Math.min(older.emailStem.length, newer.emailStem.length) >= 5 &&
      (older.emailStem.startsWith(newer.emailStem) || newer.emailStem.startsWith(older.emailStem))
    ) {
      signals.push({ key: "email_similar", points: 20, text: `The email addresses look alike (${older.user.email} / ${newer.user.email}).` });
      linked = true;
    }
  }
  if (!signals.some((s) => s.key.startsWith("email_"))) {
    const sharedNames = [...older.emailTokens].filter((t) => newer.emailTokens.has(t));
    if (sharedNames.length >= 2) {
      signals.push({
        key: "email_shared_names",
        points: 30,
        text: `Both email addresses contain the same names (${sharedNames.join(", ")}): ${older.user.email} / ${newer.user.email}.`,
      });
      linked = true;
    }
  }

  const sharedClean = [...older.cleanIps].filter((ip) => newer.cleanIps.has(ip));
  const sharedVpn = [...older.vpnIps].filter((ip) => newer.vpnIps.has(ip));
  if (sharedClean.length) {
    const rare = sharedClean.some((ip) => (ctx.ipUsers.get(ip) ?? 0) <= 3);
    signals.push({
      key: "shared_ip",
      points: rare ? 45 : 25,
      text: `Both accounts connected from the same IP address (${sharedClean.slice(0, 3).join(", ")})${rare ? "" : ", although other accounts also use it"}.`,
    });
    linked = true;
  } else {
    const sharedSubnet = [...older.subnets].filter((s) => newer.subnets.has(s));
    if (sharedSubnet.length) {
      signals.push({ key: "shared_subnet", points: 15, text: `Both accounts connected from the same small network block (${sharedSubnet[0]}).` });
      linked = true;
    }
  }
  if (sharedVpn.length) {
    signals.push({ key: "shared_vpn_ip", points: 10, text: `Both accounts used the same VPN exit address (${sharedVpn[0]}).` });
  }

  const sharedCities = [...older.cities.keys()].filter((c) => newer.cities.has(c));
  if (sharedCities.length) {
    const best = sharedCities.sort((x, y) => (ctx.cityUsers.get(x) ?? 0) - (ctx.cityUsers.get(y) ?? 0))[0]!;
    const n = ctx.cityUsers.get(best) ?? 0;
    const onlyViaVpn = Boolean(older.cities.get(best)) && Boolean(newer.cities.get(best));
    let pts = n <= 3 ? 30 : n <= 8 ? 20 : n <= 15 ? 10 : 0;
    if (onlyViaVpn) pts = Math.round(pts / 2);
    if (pts > 0) {
      signals.push({
        key: "same_city",
        points: pts,
        text:
          `Both accounts connect from ${cityLabel(best)}` +
          (n <= 3 ? `, and only ${n} active account${n === 1 ? "" : "s"} on the whole platform ever connected from there.` : ` (${n} active accounts connect from there).`),
      });
      linked = true;
    }
  } else {
    const sharedRegions = [...older.regions].filter((r) => newer.regions.has(r));
    const rareRegion = sharedRegions.find((r) => (ctx.regionUsers.get(r) ?? 0) <= 5);
    if (rareRegion) {
      signals.push({ key: "same_region", points: 10, text: `Both accounts connect from the same region (${rareRegion}), which very few users share.` });
      linked = true;
    }
  }

  if (!linked) return null;

  const sharedUas = [...older.uas].filter((ua) => newer.uas.has(ua));
  const rareDevice = sharedUas.some((ua) => (ctx.uaUsers.get(ua) ?? 0) <= 3);
  if (sharedUas.length) {
    signals.push({
      key: "same_device",
      points: rareDevice ? 20 : 10,
      text: `Both accounts use the exact same browser version (${describeDevice(sharedUas[0]!)})${rareDevice ? ", which almost no other user has" : ""}.`,
    });
  }

  // Timing and usage patterns only mean something once the accounts share a concrete trace.
  const strongLink =
    rareDevice ||
    signals.some(
      (s) =>
        ["same_google", "same_paypal", "shared_ip", "shared_subnet"].includes(s.key) ||
        s.key.startsWith("email_") ||
        (s.key === "same_city" && s.points >= 15),
    );
  const behavior = (pts: number) => (strongLink ? pts : Math.floor(pts / 2));

  const newerVpnOnly = newer.vpnIps.size > 0 && newer.cleanIps.size === 0;
  if (newerVpnOnly) {
    const org = ctx.geo.get([...newer.vpnIps][0]!)?.org ?? "a VPN provider";
    signals.push({
      key: "vpn_hides_ip",
      points: 5,
      text: `The newer account ${B} only ever connected through a VPN/proxy (${org.replace(/^AS\d+\s*/, "")}), which hides the real IP address.`,
    });
  }

  if (older.topLangPair && older.topLangPair === newer.topLangPair) {
    const share = (ctx.langUsers.get(older.topLangPair) ?? 0) / Math.max(1, ctx.scopeSize);
    signals.push({
      key: "same_lang_pair",
      points: behavior(share < 0.15 ? 10 : 5),
      text: `Both accounts mostly use the same language pair (${older.topLangPair}).`,
    });
  }

  const turns = turnTaking(older.sessions, newer.sessions);
  if (turns.overlaps === 0 && turns.switches >= 3) {
    signals.push({
      key: "turn_taking",
      points: behavior(25),
      text: `The two accounts took turns: ${turns.switches} switches back and forth, and they were never in a session at the same time.`,
    });
  } else if (turns.overlaps === 0 && turns.switches >= 1) {
    signals.push({ key: "turn_taking_light", points: behavior(10), text: `When one account stopped, the other started soon after (${turns.switches} switch${turns.switches === 1 ? "" : "es"}), never overlapping.` });
  }
  if (turns.overlaps >= 2) {
    counter.push({ key: "simultaneous_use", points: -30, text: `The accounts were in sessions at the same time ${turns.overlaps} times, which points to two different people.` });
  } else if (turns.overlaps === 1) {
    counter.push({ key: "simultaneous_use_once", points: -10, text: "The accounts overlapped in a session once." });
  }

  const handoffs: string[] = [];
  for (const [blocked, other] of [
    [newer, older],
    [older, newer],
  ] as const) {
    for (const b of blocked.blocks) {
      const next = other.sessions.find(
        (s) => s.startedAt.getTime() > b.at.getTime() && s.startedAt.getTime() - b.at.getTime() <= 45 * MIN_MS,
      );
      if (next) {
        handoffs.push(
          `#${blocked.user.id} was blocked, and ${fmtMinutes(next.startedAt.getTime() - b.at.getTime())} later #${other.user.id} started a session.`,
        );
        break;
      }
    }
  }
  if (handoffs.length) {
    signals.push({ key: "block_handoff", points: strongLink ? 25 : 5, text: handoffs[0]! });
  }

  const newerCreated = newer.user.createdAt.getTime();
  if (isTrialPlan(older.user.planType) && older.user.trialEndsAt) {
    const untilEnd = older.user.trialEndsAt.getTime() - newerCreated;
    if (untilEnd >= -DAY_MS && untilEnd <= 4 * DAY_MS) {
      signals.push({
        key: "trial_ending_handoff",
        points: behavior(15),
        text:
          untilEnd >= 0
            ? `${B} was created ${fmtMinutes(untilEnd)} before ${A}'s free trial ends.`
            : `${B} was created right after ${A}'s free trial ended.`,
      });
    }
  }
  const capBefore = older.capHitDays.filter((d) => new Date(`${d}T23:59:59Z`).getTime() <= newerCreated + DAY_MS);
  if (capBefore.length) {
    signals.push({
      key: "hit_daily_cap",
      points: behavior(10),
      text: `${A} used up the full daily limit on ${capBefore.length} day${capBefore.length === 1 ? "" : "s"} before ${B} appeared.`,
    });
  }
  const lastOlderBefore = [...older.sessions].reverse().find((s) => s.endedAt.getTime() <= newerCreated);
  if (lastOlderBefore && newerCreated - lastOlderBefore.endedAt.getTime() <= 90 * MIN_MS) {
    signals.push({
      key: "signup_right_after",
      points: behavior(10),
      text: `${B} signed up ${fmtMinutes(newerCreated - lastOlderBefore.endedAt.getTime())} after ${A} finished a session.`,
    });
  }

  const score = [...signals, ...counter].reduce((sum, s) => sum + s.points, 0);
  return { score, signals, counter, turns };
}

function confidenceFor(score: number): Confidence | null {
  if (score >= 90) return "high";
  if (score >= 60) return "medium";
  if (score >= 40) return "low";
  return null;
}

// ── Report writing ──────────────────────────────────────────────────────────

function brief(p: Profile, geo: Map<string, GeoInfo>): AccountBrief {
  const locs = new Map<string, number>();
  for (const ip of p.ips) {
    const g = geo.get(ip);
    const label = g
      ? `${[g.city, g.country].filter(Boolean).join(", ") || "Unknown"}${g.isVpn ? ` (VPN: ${(g.org ?? "").replace(/^AS\d+\s*/, "")})` : ""}`
      : `${ip} (location unknown)`;
    locs.set(label, (locs.get(label) ?? 0) + 1);
  }
  return {
    id: p.user.id,
    username: p.user.username,
    email: p.user.email,
    planType: p.user.planType,
    isActive: p.user.isActive,
    createdAt: p.user.createdAt.toISOString(),
    trialEndsAt: p.user.trialEndsAt?.toISOString() ?? null,
    totalMinutes: Math.round(p.user.totalMinutesUsed),
    sessionCount: p.sessions.length,
    topLangPair: p.topLangPair,
    locations: [...locs.keys()].slice(0, 5),
    devices: [...new Set([...p.uas].map(describeDevice))].slice(0, 4),
  };
}

function buildTimeline(older: Profile, newer: Profile): TimelineEntry[] {
  const from = newer.user.createdAt.getTime() - 4 * 60 * MIN_MS;
  const to = newer.user.createdAt.getTime() + 20 * 60 * MIN_MS;
  const inWin = (d: Date) => d.getTime() >= from && d.getTime() <= to;
  const out: Array<TimelineEntry & { t: number }> = [];
  out.push({
    t: newer.user.createdAt.getTime(),
    at: newer.user.createdAt.toISOString(),
    userId: newer.user.id,
    text: `#${newer.user.id} account created`,
  });
  for (const p of [older, newer]) {
    for (const s of p.sessions.filter((x) => inWin(x.startedAt))) {
      out.push({
        t: s.startedAt.getTime(),
        at: s.startedAt.toISOString(),
        userId: p.user.id,
        text: `#${p.user.id} session, ${fmtMinutes(Math.max(s.seconds * 1000, s.endedAt.getTime() - s.startedAt.getTime()))}${s.langPair ? `, ${s.langPair}` : ""}`,
      });
    }
    const blocks = p.blocks.filter((b) => inWin(b.at));
    for (let i = 0; i < blocks.length; ) {
      let j = i;
      while (j + 1 < blocks.length && blocks[j + 1]!.at.getTime() - blocks[j]!.at.getTime() <= 15 * MIN_MS) j++;
      const n = j - i + 1;
      out.push({
        t: blocks[i]!.at.getTime(),
        at: blocks[i]!.at.toISOString(),
        userId: p.user.id,
        text: `#${p.user.id} blocked (account disabled)${n > 1 ? `, ${n} attempts` : ""}`,
      });
      i = j + 1;
    }
    for (const t of p.tickets.filter((x) => inWin(x.at))) {
      out.push({ t: t.at.getTime(), at: t.at.toISOString(), userId: p.user.id, text: `#${p.user.id} opened support ticket #${t.ticketId}: "${t.subject}"` });
    }
  }
  return out
    .sort((a, b) => a.t - b.t)
    .slice(0, 24)
    .map(({ t: _t, ...rest }) => rest);
}

function writeReport(older: Profile, newer: Profile, score: number, confidence: Confidence, signals: Signal[], counter: Signal[]) {
  const A = `#${older.user.id} (${older.user.email ?? older.user.username})`;
  const B = `#${newer.user.id} (${newer.user.email ?? newer.user.username})`;
  const verdict =
    confidence === "high"
      ? "very likely the same person"
      : confidence === "medium"
        ? "possibly the same person"
        : "weakly linked";
  const summary = `${B} and ${A} are ${verdict}. ${signals.length} matching signal${signals.length === 1 ? "" : "s"}${counter.length ? `, ${counter.length} against` : ""}.`;

  const keys = new Set(signals.map((s) => s.key));
  const deviceOrIp = keys.has("same_device") || keys.has("shared_ip") || keys.has("shared_subnet");
  const innocentExplanation = keys.has("same_google") || keys.has("same_paypal")
    ? "Hard to explain innocently: the accounts share a login or payment identity."
    : deviceOrIp
      ? "Two people sharing one computer or office network (for example colleagues or family) would look like this."
      : "Two unrelated users who happen to live in the same area and use similar software could look like this.";

  let recommendation: string;
  if (!newer.user.isActive && older.user.isActive) {
    recommendation = `Keep #${newer.user.id} disabled. #${older.user.id} is still active, so the person is not locked out. Reply politely without naming the other account.`;
  } else if (newer.user.isActive && older.user.isActive) {
    recommendation =
      confidence === "high"
        ? `Consider disabling the newer account #${newer.user.id} and keeping #${older.user.id}. Nothing is changed automatically.`
        : `Keep an eye on both accounts. No action is needed yet.`;
  } else if (!newer.user.isActive && !older.user.isActive) {
    recommendation = "Both accounts are already disabled. No further action needed unless they write in.";
  } else {
    recommendation = `#${older.user.id} is disabled and #${newer.user.id} is active. If #${older.user.id} was disabled for abuse, consider disabling #${newer.user.id} too.`;
  }

  const draftReply = [
    "Hi,",
    "",
    "Thanks for reaching out. Our free trial is limited to one account per person. Our system linked this account to an existing trial account used from the same device and location, so it was paused.",
    "",
    "Your existing account is still available for the rest of its trial. If you'd like to keep using InterpreterAI after that, you can upgrade to a paid plan at any time from the Pricing page, and we'd be glad to help you choose one.",
    "",
    "If you think we've made a mistake and this account belongs to a different person, just reply and let us know and we'll review it.",
    "",
    "Best regards,",
    "The InterpreterAI Team",
  ].join("\n");

  return { summary, innocentExplanation, recommendation, draftReply };
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function analyzeSecurity(data: SecurityData, geo: Map<string, GeoInfo>): SecurityCase[] {
  const profiles = buildProfiles(data, geo);
  const since = data.lookbackStart.getTime();
  const scope = [...profiles.values()].filter(
    (p) =>
      p.user.createdAt.getTime() >= since ||
      p.ips.size > 0 ||
      p.sessions.length > 0,
  );

  const ctx: Ctx = {
    scopeSize: scope.length,
    ipUsers: countBy(scope, (p) => p.ips),
    uaUsers: countBy(scope, (p) => p.uas),
    cityUsers: countBy(scope, (p) => p.cities.keys()),
    regionUsers: countBy(scope, (p) => p.regions),
    langUsers: countBy(scope, (p) => (p.topLangPair ? [p.topLangPair] : [])),
    geo,
  };

  const anchors = new Map<string, number[]>();
  const addAnchor = (k: string, id: number) => {
    const list = anchors.get(k) ?? [];
    list.push(id);
    anchors.set(k, list);
  };
  for (const p of scope) {
    const id = p.user.id;
    for (const ip of p.ips) addAnchor(`ip:${ip}`, id);
    for (const sn of p.subnets) addAnchor(`sn:${sn}`, id);
    for (const c of p.cities.keys()) addAnchor(`city:${c}`, id);
    for (const r of p.regions) addAnchor(`region:${r}`, id);
    if (p.user.googleAccountId) addAnchor(`g:${p.user.googleAccountId}`, id);
    if (p.user.paypalSubscriptionId) addAnchor(`pp:${p.user.paypalSubscriptionId}`, id);
    if (p.emailStem) addAnchor(`em:${p.emailStem}`, id);
    for (const t of p.emailTokens) addAnchor(`emt:${t}`, id);
  }
  const maxGroup = (k: string) =>
    k.startsWith("city:") ? 15 : k.startsWith("region:") || k.startsWith("em:") ? 5 : 8;
  const pairs = new Set<string>();
  for (const [k, ids] of anchors) {
    if (ids.length < 2 || ids.length > maxGroup(k)) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = Math.min(ids[i]!, ids[j]!);
        const b = Math.max(ids[i]!, ids[j]!);
        pairs.add(`${a}-${b}`);
      }
    }
  }

  const cases: SecurityCase[] = [];
  for (const key of pairs) {
    const [idA, idB] = key.split("-").map(Number) as [number, number];
    const pa = profiles.get(idA)!;
    const pb = profiles.get(idB)!;
    const [older, newer] = pa.user.createdAt <= pb.user.createdAt ? [pa, pb] : [pb, pa];
    if (!isTrialPlan(newer.user.planType) && !isTrialPlan(older.user.planType)) continue;
    if (newer.user.createdAt.getTime() < since) continue;

    const scored = scorePair(older, newer, ctx);
    if (!scored) continue;
    const confidence = confidenceFor(scored.score);
    if (!confidence) continue;
    const report = writeReport(older, newer, scored.score, confidence, scored.signals, scored.counter);
    cases.push({
      key,
      olderUserId: older.user.id,
      newerUserId: newer.user.id,
      score: scored.score,
      confidence,
      ...report,
      signals: scored.signals.sort((x, y) => y.points - x.points),
      counterSignals: scored.counter,
      timeline: buildTimeline(older, newer),
      accounts: [brief(older, geo), brief(newer, geo)],
    });
  }
  return cases.sort((a, b) => b.score - a.score);
}

export function uaHash(ua: string | null | undefined): string {
  return createHash("md5").update(ua ?? "").digest("hex");
}
