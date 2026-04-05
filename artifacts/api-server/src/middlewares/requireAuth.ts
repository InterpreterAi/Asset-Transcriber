import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Not authenticated", code: "no_session" });
    return;
  }
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated", code: "not_authenticated" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Not authenticated", code: "no_session" });
    return;
  }
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated", code: "not_authenticated" });
    return;
  }
  if (!req.session.isAdmin) {
    res.status(403).json({ error: "Forbidden", code: "forbidden" });
    return;
  }
  next();
}
