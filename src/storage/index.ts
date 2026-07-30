import { StorageAdapter } from "./StorageAdapter";
import { PostgresAdapter } from "./PostgresAdapter";
import { SheetsAdapter } from "./SheetsAdapter";
import { HaLocalAdapter } from "./HaLocalAdapter";
import { MultiStorage } from "./MultiStorage";
import { LiveStorage } from "./LiveStorage";
import { loadSettings } from "../settings/settingsStore";

let instance: StorageAdapter | null = null;
let building: Promise<StorageAdapter> | null = null;

/**
 * Builds (once) and returns the active storage adapter, driven by the
 * multi-select in settingsStore rather than a fixed env var: any combination
 * of "postgres", "sheets" and "ha_local" can be enabled at once, in which
 * case writes fan out via MultiStorage and the first-listed backend is
 * primary for reads.
 */
export async function getStorage(): Promise<StorageAdapter> {
  if (instance) return instance;
  if (!building) building = buildStorage();
  instance = await building;
  building = null;
  return instance;
}

/**
 * Rebuilds the active storage adapter from current settings and swaps it in.
 * Called after the Settings page changes which backends are enabled, after
 * a Google Sheets connect/select, and after Postgres auto/manual setup - so
 * a change takes effect immediately, no restart needed. Anything holding a
 * reference to `liveStorage` (below) picks up the change on its very next
 * call automatically.
 */
export async function reloadStorage(): Promise<StorageAdapter> {
  building = buildStorage();
  instance = await building;
  building = null;
  return instance;
}

async function buildStorage(): Promise<StorageAdapter> {
  const settings = loadSettings();
  if (settings.enabledBackends.length === 0) {
    throw new Error("No storage backend enabled - enable at least one (Home Assistant local, Google Sheet, Postgres) in Settings");
  }

  const backends: StorageAdapter[] = settings.enabledBackends.map((kind) => {
    if (kind === "postgres") {
      if (!settings.postgres.databaseUrl) {
        throw new Error('Postgres is enabled but not set up yet - finish "Auto" or "Manual" Postgres setup in Settings');
      }
      return new PostgresAdapter(settings.postgres.databaseUrl, settings.postgres.ssl);
    }
    if (kind === "sheets") {
      if (!settings.sheets.spreadsheetId) {
        throw new Error('Google Sheets is enabled but no spreadsheet is selected yet - use "Connect with Google" in Settings');
      }
      return settings.sheets.authMode === "oauth" && settings.sheets.oauth?.refreshToken
        ? SheetsAdapter.fromOAuth(settings.sheets.spreadsheetId, settings.sheets.oauth)
        : new SheetsAdapter(settings.sheets.spreadsheetId, settings.sheets.serviceAccountKeyFile ?? "");
    }
    if (kind === "ha_local") {
      return new HaLocalAdapter(settings.haLocal.filePath);
    }
    throw new Error(`Unknown storage backend: ${kind}`);
  });

  const built = backends.length === 1 ? backends[0] : new MultiStorage(backends);
  await built.init();
  console.log(`[storage] active backend(s): ${settings.enabledBackends.join(", ")}`);
  return built;
}

/**
 * A StorageAdapter that always forwards to whatever getStorage() currently
 * returns. The API routes, the scheduler and the session manager are built
 * once at boot against this single stable object instead of a concrete
 * adapter, which is what makes reloadStorage() actually take effect
 * everywhere without restarting the process.
 */
export const liveStorage: StorageAdapter = new LiveStorage(getStorage);
