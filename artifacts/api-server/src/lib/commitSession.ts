import type { Request } from "express";

/** Persist session to the store before sending the response (avoids silent save failures). */
export function commitSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
