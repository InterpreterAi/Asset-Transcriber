import { db, loginEventsTable } from "@workspace/db";
import { logger } from "./logger.js";

interface LogLoginEvent {
  userId:        number | null;
  email:         string | null;
  ipAddress:     string | null;
  userAgent:     string | null;
  success:       boolean;
  failureReason?: string;
  is2fa?:        boolean;
}

export async function logLoginEvent(e: LogLoginEvent): Promise<void> {
  try {
    await db.insert(loginEventsTable).values({
      userId:        e.userId,
      email:         e.email,
      ipAddress:     e.ipAddress,
      userAgent:     e.userAgent,
      success:       e.success,
      failureReason: e.failureReason ?? null,
      is2fa:         e.is2fa ?? false,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write login event (non-fatal)");
  }
}
