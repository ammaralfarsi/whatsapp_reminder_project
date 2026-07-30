import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { requireAdmin, requireUser, getIngressHaUser, AuthedRequest } from "../../auth/apiKeyAuth";

export function usersRouter(storage: StorageAdapter): Router {
  const router = Router();

  // Public (no key needed) - just echoes back whatever Home Assistant's
  // Ingress proxy says about the currently logged-in person, if any, so the
  // admin can copy the ID into a user's "Home Assistant user" field in
  // Settings, and so reminder.html can show a helpful message when a
  // logged-in HA person isn't linked to an app user yet.
  router.get("/ha-context", async (req, res) => {
    const haUser = getIngressHaUser(req);
    if (!haUser) return res.json({ haUserId: null, haUserName: null, linkedUser: null });
    const linkedUser = await storage.getUserByHaUserId(haUser.id).catch(() => null);
    res.json({
      haUserId: haUser.id,
      haUserName: haUser.name ?? null,
      linkedUser: linkedUser ? { id: linkedUser.id, displayName: linkedUser.displayName } : null,
    });
  });

  // Admin: create a new tenant user. This is the "onboard a new person" step
  // that makes the platform usable by others, not just you.
  router.post("/users", requireAdmin, async (req, res) => {
    const { email, displayName } = req.body ?? {};
    if (!email || !displayName) return res.status(400).json({ error: "email and displayName are required" });

    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "A user with this email already exists", user: existing });

    const user = {
      id: uuidv4(),
      email,
      displayName,
      apiKey: crypto.randomBytes(24).toString("hex"),
      createdAt: new Date().toISOString(),
    };
    await storage.createUser(user);
    res.status(201).json(user);
  });

  router.get("/users", requireAdmin, async (_req, res) => {
    res.json(await storage.listUsers());
  });

  // Admin: link (or unlink, with haUserId: "") a Home Assistant person to an
  // app user - see /ha-context above for how to find their haUserId. Once
  // linked, that person can open the app via the HA sidebar/Ingress panel
  // without entering an API key at all (see requireUser's ingress fallback).
  router.patch("/users/:id", requireAdmin, async (req, res) => {
    const user = await storage.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "Not found" });

    const { haUserId } = req.body ?? {};
    if (haUserId) {
      const existing = await storage.getUserByHaUserId(haUserId);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ error: `That Home Assistant account is already linked to ${existing.displayName}` });
      }
    }
    user.haUserId = haUserId || undefined;
    await storage.updateUser(user);
    res.json(user);
  });

  // Self: fetch your own profile with your api key.
  router.get("/me", requireUser(storage), async (req: AuthedRequest, res) => {
    res.json(req.user);
  });

  return router;
}
