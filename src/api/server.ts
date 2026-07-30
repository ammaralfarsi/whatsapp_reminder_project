import express from "express";
import cors from "cors";
import path from "path";
import { StorageAdapter } from "../storage/StorageAdapter";
import { config } from "../config";
import { usersRouter } from "./routes/users";
import { numbersRouter } from "./routes/numbers";
import { remindersRouter } from "./routes/reminders";
import { templatesRouter } from "./routes/templates";
import { settingsRouter } from "./routes/settings";
import { integrationsRouter } from "./routes/integrations";
import { gatewaysRouter } from "./routes/gateways";

export function createServer(storage: StorageAdapter) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  // Public, unauthenticated - just so the UI's footer can show the running
  // version without needing an API key.
  app.get("/api/version", (_req, res) => res.json({ version: config.appVersion }));

  // The Ingress panel (and a bare http://<host>:8086/) lands on "/" - there
  // was no route for it and no public/index.html, so express.static fell
  // through to Express's default 404 ("Cannot GET /"). Settings is the
  // natural landing page.
  app.get("/", (_req, res) => res.redirect("/settings.html"));

  app.use("/api", usersRouter(storage));
  app.use("/api", numbersRouter(storage));
  app.use("/api", remindersRouter(storage));
  app.use("/api", templatesRouter(storage));
  app.use("/api", settingsRouter());
  app.use("/api", integrationsRouter(storage));
  app.use("/api", gatewaysRouter(storage));

  // public/settings.html (storage backend setup) and public/reminder.html
  // (add a reminder from any browser, no Home Assistant/Lovelace needed) -
  // both plain static pages that only talk to the /api/* routes above.
  app.use(express.static(path.join(__dirname, "..", "..", "public")));

  return app;
}
