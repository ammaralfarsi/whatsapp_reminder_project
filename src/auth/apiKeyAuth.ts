import { Request, Response, NextFunction } from "express";
import { StorageAdapter } from "../storage/StorageAdapter";
import { User } from "../types";
import { config } from "../config";

export interface AuthedRequest extends Request {
  user?: User;
}

/** Home Assistant's Supervisor adds these headers to every request proxied
 * through Ingress, identifying whichever HA person is logged in - see
 * https://developers.home-assistant.io/docs/apps/security/ */
export function getIngressHaUser(req: Request): { id: string; name?: string } | null {
  const id = req.header("X-Remote-User-Id");
  if (!id) return null;
  return { id, name: req.header("X-Remote-User-Name") ?? undefined };
}

/**
 * Per-user auth: every request (from the mobile app, Home Assistant, or the
 * web UI) carries "X-Api-Key: <user's api key>". This is what makes the
 * platform multi-tenant at the HTTP layer - each user only ever sees their
 * own numbers, reminders and templates.
 *
 * If no X-Api-Key is sent at all (as opposed to an invalid one), and the
 * request came in through Home Assistant's Ingress proxy, we fall back to
 * recognizing the logged-in HA person automatically via User.haUserId - see
 * getIngressHaUser() - so reminder.html doesn't need an API key when opened
 * from the HA sidebar/panel. Direct/external access still needs a real key.
 */
export function requireUser(storage: StorageAdapter) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.header("X-Api-Key");

    if (!apiKey) {
      const haUser = getIngressHaUser(req);
      if (haUser) {
        const user = await storage.getUserByHaUserId(haUser.id);
        if (user) {
          req.user = user;
          return next();
        }
        return res.status(401).json({
          error: `No app user is linked to your Home Assistant account${haUser.name ? ` (${haUser.name})` : ""} yet. Ask the admin to link it in Settings -> Users - your HA user ID is ${haUser.id}.`,
          haUserId: haUser.id,
          haUserName: haUser.name,
        });
      }
      return res.status(401).json({ error: "Missing X-Api-Key header" });
    }

    const user = await storage.getUserByApiKey(apiKey);
    if (!user) {
      // The single most common mistake here: pasting the *admin* key (used
      // for Settings) into a per-user field like reminder.html. Give a
      // pointed error instead of a bare "Invalid API key" when that's
      // exactly what happened.
      if (config.adminApiKeys.includes(apiKey)) {
        return res.status(401).json({
          error:
            "That's the admin key, not a user key. Create a user in Settings -> Users (or POST /api/users) and use their personal API key here instead.",
        });
      }
      return res.status(401).json({ error: "Invalid API key" });
    }

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
