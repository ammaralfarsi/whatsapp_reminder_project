import { Request, Response, NextFunction } from "express";
import { StorageAdapter } from "../storage/StorageAdapter";
import { User } from "../types";
import { config } from "../config";

export interface AuthedRequest extends Request {
  user?: User;
}

/**
 * Per-user auth: every request (from the mobile app, Home Assistant, or the
 * web UI) carries "X-Api-Key: <user's api key>". This is what makes the
 * platform multi-tenant at the HTTP layer - each user only ever sees their
 * own numbers, reminders and templates.
 */
export function requireUser(storage: StorageAdapter) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.header("X-Api-Key");
    if (!apiKey) return res.status(401).json({ error: "Missing X-Api-Key header" });

    const user = await storage.getUserByApiKey(apiKey);
    if (!user) return res.status(401).json({ error: "Invalid API key" });

    req.user = user;
    next();
  };
}

/**
 * Admin-only routes (creating users, Settings, storage/integration setup)
 * are gated by ADMIN_API_KEYS instead. Accepts the key either as the usual
 * X-Api-Key header (fetch() calls from settings.html) or a `?key=` query
 * param, since a few of these routes (Google OAuth connect) are plain
 * top-level browser redirects that can't attach custom headers.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header("X-Api-Key") ?? (req.query.key as string | undefined);
  if (!apiKey || !config.adminApiKeys.includes(apiKey)) {
    return res.status(401).json({ error: "Missing or invalid admin API key" });
  }
  next();
}
