import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { requireAdmin, requireUser, AuthedRequest } from "../../auth/apiKeyAuth";

export function usersRouter(storage: StorageAdapter): Router {
  const router = Router();

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

  // Self: fetch your own profile with your api key.
  router.get("/me", requireUser(storage), async (req: AuthedRequest, res) => {
    res.json(req.user);
  });

  return router;
}
