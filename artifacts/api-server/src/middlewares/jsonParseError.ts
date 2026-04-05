import type { ErrorRequestHandler } from "express";
import { fullRequestPath } from "./globalErrorHandler.js";
import { logger } from "../lib/logger.js";

/**
 * Catches malformed JSON from express.json(). Must be registered immediately after express.json().
 */
export const jsonParseErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const se = err as SyntaxError & { status?: number; type?: string };
  const isBodyParserJson =
    err instanceof SyntaxError &&
    (se.status === 400 || se.type === "entity.parse.failed");

  if (isBodyParserJson) {
    logger.warn(
      { ip: req.ip, path: fullRequestPath(req), method: req.method },
      "Malformed JSON body rejected",
    );
    res.status(400).json({
      error: "Invalid JSON in request body",
      code: "malformed_json",
    });
    return;
  }
  next(err);
};
