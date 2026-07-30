import { config } from "./config";
import { getStorage, liveStorage } from "./storage";
import { createServer } from "./api/server";
import { Scheduler } from "./reminders/scheduler";

async function main() {
  // The server starts unconditionally, *before* storage is touched.
  // Settings (/settings.html, /api/settings, /api/integrations/*,
  // /api/settings/postgres/*) only ever talk to settingsStore directly, not
  // to a storage adapter - so even if the currently-enabled backend(s)
  // aren't configured yet (fresh install, bad DATABASE_URL, Sheets picked
  // before connecting Google, ...), the Settings page stays reachable to
  // fix it. Routes/the scheduler are wired against `liveStorage`, which
  // lazily builds storage on first real use and simply errors per-request/
  // per-tick until it's configured - it does not crash the process.
  const app = createServer(liveStorage);
  app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port}`);
  });

  const scheduler = new Scheduler(liveStorage);
  scheduler.start();

  try {
    await getStorage();
  } catch (err: any) {
    console.error(
      `[storage] not ready yet (${err.message}). The server is still running - ` +
        `open the Settings page (Ingress panel, or http://<host>:8080/settings.html) to finish configuring a storage backend.`
    );
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
