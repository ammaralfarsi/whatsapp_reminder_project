import { config } from "./config";
import { getStorage, liveStorage, reloadStorage } from "./storage";
import { createServer } from "./api/server";
import { Scheduler } from "./reminders/scheduler";
import { loadSettings } from "./settings/settingsStore";
import { provisionPostgresAuto, applyProvisionResult, applyMigrations } from "./api/routes/postgresProvision";

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

  await maybeAutoProvisionPostgres();

  try {
    await getStorage();
  } catch (err: any) {
    console.error(
      `[storage] not ready yet (${err.message}). The server is still running - ` +
        `open the Settings page (Ingress panel, or http://<host>:${config.port}/settings.html) to finish configuring a storage backend.`
    );
  }
}

/**
 * If Postgres is one of the enabled backends, has no working connection
 * yet, and is set to "auto" (POSTGRES_MODE=auto, or the add-on's
 * postgres_mode option), try to create it ourselves using the initial
 * details from POSTGRES_AUTO_* (blank password -> generate one) instead of
 * making the person open Settings and click a button first. Never throws -
 * on failure this just logs the same guidance the /settings/postgres/auto
 * route would return (e.g. a docker-compose block to paste in), and leaves
 * the Settings page as the fallback.
 */
async function maybeAutoProvisionPostgres(): Promise<void> {
  const settings = loadSettings();
  if (!settings.enabledBackends.includes("postgres")) return;
  if (settings.postgres.databaseUrl) return; // already configured (manual, or already auto-provisioned)
  if (settings.postgres.mode !== "auto") return;

  console.log("[storage] Postgres is enabled with no connection yet and postgres_mode=auto - attempting to provision one...");
  try {
    const result = await provisionPostgresAuto({
      database: config.postgres.autoDatabase,
      user: config.postgres.autoUser,
      password: config.postgres.autoPassword || undefined,
      port: config.postgres.autoPort,
    });
    applyProvisionResult(result);
    if (result.started) {
      await applyMigrations(result.databaseUrl, false);
      await reloadStorage();
      console.log(`[storage] ${result.note}`);
    } else {
      console.warn(`[storage] Postgres auto-provisioning didn't run: ${result.note}`);
    }
  } catch (err: any) {
    console.error("[storage] Postgres auto-provisioning failed:", err.message);
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
