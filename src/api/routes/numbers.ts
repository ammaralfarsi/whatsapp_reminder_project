import { Router } from "express";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { requireUser, AuthedRequest } from "../../auth/apiKeyAuth";
import { SessionManager } from "../../sessions/sessionManager";
import { GatewayKind } from "../../types";

export function numbersRouter(storage: StorageAdapter): Router {
  const router = Router();
  const sessions = new SessionManager(storage);
  const auth = requireUser(storage);

  // Add a new WhatsApp number for the current user. Always provisions a
  // brand-new gateway session - never reuses one.
  router.post("/numbers", auth, async (req: AuthedRequest, res) => {
    const { label, phoneNumber, gateway } = req.body ?? {};
    if (!label || !phoneNumber) return res.status(400).json({ error: "label and phoneNumber are required" });
    const gw: GatewayKind = gateway === "ha-whatsapp" ? "ha-whatsapp" : "waha";

    try {
      const number = await sessions.addNumber(req.user!.id, label, phoneNumber, gw);
      res.status(201).json(number);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get("/numbers", auth, async (req: AuthedRequest, res) => {
    res.json(await storage.listNumbersForUser(req.user!.id));
  });

  // Fetch the QR code (or connection status) for a number's session.
  router.get("/numbers/:id/qr", auth, async (req: AuthedRequest, res) => {
    const number = await storage.getNumberById(req.params.id);
    if (!number || number.userId !== req.user!.id) return res.status(404).json({ error: "Not found" });
    try {
      const result = await sessions.getQr(number.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/numbers/:id/refresh", auth, async (req: AuthedRequest, res) => {
    const number = await storage.getNumberById(req.params.id);
    if (!number || number.userId !== req.user!.id) return res.status(404).json({ error: "Not found" });
    res.json(await sessions.refreshStatus(number.id));
  });

  return router;
}
