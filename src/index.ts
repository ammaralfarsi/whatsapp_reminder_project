import { config } from "./config";
import { getStorage, liveStorage } from "./storage";
import { createServer } from "./api/server";
import { Scheduler } from "./reminders/scheduler";

async function main() {
  // Fail fast at boot if the configured/enabled backend(s) can't actually be
  // built (e.g. Postgres enabled but DATABASE_URL missing). Routes and the
  // scheduler below are wired against `liveStorage`, not this instance
  // directly, so later changes from the Settings page (reloadStorage())
  // take effect without a restart.
  await getStorage();

  const app = createServer(liveStorage);
  app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port}`);
  });

  const scheduler = new Scheduler(liveStorage);
  scheduler.start();
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
