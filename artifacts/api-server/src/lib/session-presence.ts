/**
 * HMAC presence key so live heartbeat / snapshot / stop keep working after a
 * MemoryStore cookie wipe (deploy). The cookie is still preferred when present.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./authEnv.js";

export function sessionPresenceKey(userId: number, sessionId: number): string {
  return createHmac("sha256", getSessionSecret())
    .update(`presence:${userId}:${sessionId}`)
    .digest("base64url");
}

export function verifySessionPresenceKey(
  userId: number,
  sessionId: number,
  key: unknown,
): boolean {
  if (typeof key !== "string" || !key) return false;
  const expected = sessionPresenceKey(userId, sessionId);
  const a = Buffer.from(expected);
  const b = Buffer.from(key);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function presenceKeyFromBody(body: unknown): string | undefined {
  if (body == null || typeof body !== "object") return undefined;
  const raw = (body as { presenceKey?: unknown }).presenceKey;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Cookie user, or HMAC presence key bound to an open billing row. */
export async function userIdForOpenSession(
  req: { session?: { userId?: number } },
  sessionId: number,
  presenceKey?: string,
): Promise<number | null> {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return null;

  const { and, eq, isNull } = await import("drizzle-orm");
  const { db, sessionsTable } = await import("@workspace/db");

  const cookieUserId = req.session?.userId;
  if (typeof cookieUserId === "number" && cookieUserId > 0) {
    const owned = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.id, sessionId),
          eq(sessionsTable.userId, cookieUserId),
          isNull(sessionsTable.endedAt),
        ),
      )
      .limit(1);
    if (owned.length) return cookieUserId;
  }

  if (!presenceKey) return null;
  const rows = await db
    .select({ userId: sessionsTable.userId })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.endedAt)))
    .limit(1);
  const userId = rows[0]?.userId;
  if (typeof userId !== "number" || userId <= 0) return null;
  return verifySessionPresenceKey(userId, sessionId, presenceKey) ? userId : null;
}

/**
 * Owner of a session even after admin Terminate ended it.
 * Heartbeat uses this so the client can receive `sessionEnded` and stop locally
 * (open-session auth alone returns null once `ended_at` is set).
 */
export async function userIdForOwnedSession(
  req: { session?: { userId?: number } },
  sessionId: number,
  presenceKey?: string,
): Promise<number | null> {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return null;

  const { and, eq } = await import("drizzle-orm");
  const { db, sessionsTable } = await import("@workspace/db");

  const cookieUserId = req.session?.userId;
  if (typeof cookieUserId === "number" && cookieUserId > 0) {
    const owned = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, cookieUserId)))
      .limit(1);
    if (owned.length) return cookieUserId;
  }

  if (!presenceKey) return null;
  const rows = await db
    .select({ userId: sessionsTable.userId })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  const userId = rows[0]?.userId;
  if (typeof userId !== "number" || userId <= 0) return null;
  return verifySessionPresenceKey(userId, sessionId, presenceKey) ? userId : null;
}
