import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { requireUser, AuthedRequest } from "../../auth/apiKeyAuth";
import { TemplateService } from "../../reminders/templates";

/**
 * Lets each user edit (or replace) the footer appended to their outgoing
 * reminders - e.g. turning off "~Auto Reminder~ ~تذكير تلقائي~", translating
 * it, or adding their own branding, without touching code.
 */
export function templatesRouter(storage: StorageAdapter): Router {
  const router = Router();
  const auth = requireUser(storage);
  const templates = new TemplateService(storage);

  router.get("/templates", auth, async (req: AuthedRequest, res) => {
    const list = await storage.listTemplatesForUser(req.user!.id);
    if (list.length === 0) await templates.ensureUserDefault(req.user!.id);
    res.json(await storage.listTemplatesForUser(req.user!.id));
  });

  router.put("/templates/:id?", auth, async (req: AuthedRequest, res) => {
    const { name, body, isDefault } = req.body ?? {};
    if (body === undefined) return res.status(400).json({ error: "body is required" });

    const template = {
      id: req.params.id ?? uuidv4(),
      userId: req.user!.id,
      name: name ?? "Custom",
      body,
      isDefault: Boolean(isDefault),
    };
    await storage.upsertTemplate(template);
    res.json(template);
  });

  return router;
}
