import type { NextFunction, Request, Response } from "express";
import { fullRequestPath } from "./globalErrorHandler.js";
import { logger } from "../lib/logger.js";

/**
 * Rejects non-JSON-object bodies (undefined, array, primitive) for mutating AI/transcription calls.
 * Skips GET/HEAD/OPTIONS. Allows `{}` for endpoints like Soniox token that need no fields.
 */
export function requireJsonObjectBody(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const b = req.body;
  if (b === undefined || typeof b !== "object" || b === null || Array.isArray(b)) {
    logger.warn(
      { ip: req.ip, path: fullRequestPath(req), method: req.method },
      "AI endpoint rejected: body must be a JSON object",
    );
    res.status(400).json({
      error: "Request body must be a JSON object",
      code: "invalid_json_body",
    });
    return;
  }
  next();
}
