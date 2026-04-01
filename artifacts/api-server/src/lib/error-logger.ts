import { db, errorLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

export type ErrorType =
  | "login_failure"
  | "session_expired"
  | "api_error"
  | "rate_limited"
  | "proxy_error"
  | "auth_error"
  | "not_found"
  | "validation_error"
  | "server_error";

function classifyError(statusCode: number, endpoint: string): ErrorType {
  if (statusCode === 429) return "rate_limited";
  if (endpoint.includes("/auth/login") && statusCode === 401) return "login_failure";
  if (endpoint.includes("/auth/") && statusCode === 401) return "session_expired";
  if (statusCode === 401 || statusCode === 403) return "auth_error";
  if (statusCode === 404) return "not_found";
  if (statusCode === 422 || statusCode === 400) return "validation_error";
  if (statusCode >= 500) return "server_error";
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) return "proxy_error";
  return "api_error";
}

export interface LogErrorOptions {
  userId?:       number | null;
  sessionId?:    string | null;
  endpoint:      string;
  method:        string;
  statusCode:    number;
  errorType?:    ErrorType;
  errorMessage?: string | null;
  userAgent?:    string | null;
  ipAddress?:    string | null;
}

export async function logError(opts: LogErrorOptions): Promise<void> {
  try {
    const errorType = opts.errorType ?? classifyError(opts.statusCode, opts.endpoint);
    await db.insert(errorLogsTable).values({
      userId:       opts.userId ?? null,
      sessionId:    opts.sessionId ?? null,
      endpoint:     opts.endpoint,
      method:       opts.method,
      statusCode:   opts.statusCode,
      errorType,
      errorMessage: opts.errorMessage ?? null,
      userAgent:    opts.userAgent ?? null,
      ipAddress:    opts.ipAddress ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write error log to DB");
  }
}
