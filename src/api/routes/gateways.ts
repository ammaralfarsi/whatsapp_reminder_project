import { Router } from "express";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { requireUser } from "../../auth/apiKeyAuth";
import { getGateway } from "../../gateways";

/**
 * Read-only helpers for the "add a number" UI - currently just listing
 * existing WAHA sessions so a number can attach to one instead of always
 * getting a brand-new session (see SessionManager.addNumber).
 */
export function gatewaysRouter(storage: StorageAdapter): Router {
  const router = Router();
  const auth = requireUser(storage);

  router.get("/gateways/waha/sessions", auth, async (_req, res) => {
    try {
      const gw = getGateway("waha");
      if (typeof gw.listSessions !== "function") return res.json([]);
      res.json(await gw.listSessions());
    } catch (err: any) {
      // Most common cause: WAHA_BASE_URL not configured, or WAHA unreachable
      // - not fatal, just means "no existing sessions to offer".
      res.json([]);
    }
  });

  return router;
}
