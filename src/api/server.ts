import express from "express";
import cors from "cors";
import { StorageAdapter } from "../storage/StorageAdapter";
import { usersRouter } from "./routes/users";
import { numbersRouter } from "./routes/numbers";
import { remindersRouter } from "./routes/reminders";
import { templatesRouter } from "./routes/templates";

export function createServer(storage: StorageAdapter) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", usersRouter(storage));
  app.use("/api", numbersRouter(storage));
  app.use("/api", remindersRouter(storage));
  app.use("/api", templatesRouter(storage));

  return app;
}
