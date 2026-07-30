import fs from "fs";
import path from "path";
import { config } from "../config";
import { AppSettings, StorageKind } from "./types";

// Where the persisted settings live. Defaults to ./data next to wherever the
// app runs from - which is /app/data inside the plain Docker image (bind-
// mount it if you want it to survive a container recreate) and
// /config/addon_config/data under the Home Assistant add-on's persistent
// `addon_config:rw` map (see whatsapp_reminder_platform/config.yaml + run.sh).
const SETTINGS_PATH =
  process.env.SETTINGS_FILE ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "settings.json");

let cached: AppSettings | null = null;

function defaults(): AppSettings {
  const envBackends = config.storageBackends.filter((b): b is StorageKind =>
    ["postgres", "sheets", "ha_local"].includes(b)
  );
  return {
    enabledBackends: envBackends.length ? envBackends : ["ha_local"],
    postgres: {
      mode: config.postgres.databaseUrl ? "manual" : "auto",
      databaseUrl: config.postgres.databaseUrl,
      ssl: config.postgres.ssl,
    },
    sheets: {
      spreadsheetId: config.sheets.spreadsheetId,
      authMode: "service_account",
      serviceAccountKeyFile: config.sheets.keyFile,
    },
    haLocal: {
      filePath:
        process.env.HA_LOCAL_DATA_FILE ??
        path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "ha_local_store.json"),
    },
  };
}

/** Loads settings from disk on first call, seeding the file from env-var
 * defaults if it doesn't exist yet; every call after that returns the
 * in-memory cache (kept in sync by saveSettings/updateSettings). */
export function loadSettings(): AppSettings {
  if (cached) return cached;

  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      cached = mergeDefaults(parsed);
      return cached;
    } catch (err) {
      console.error(`[settings] failed to parse ${SETTINGS_PATH}, falling back to env-derived defaults:`, err);
    }
  }
  cached = defaults();
  writeToDisk(cached);
  return cached;
}

function mergeDefaults(partial: Partial<AppSettings>): AppSettings {
  const base = defaults();
  return {
    ...base,
    ...partial,
    postgres: { ...base.postgres, ...partial.postgres },
    sheets: { ...base.sheets, ...partial.sheets },
    haLocal: { ...base.haLocal, ...partial.haLocal },
  };
}

function writeToDisk(settings: AppSettings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function saveSettings(next: AppSettings): AppSettings {
  writeToDisk(next);
  cached = next;
  return cached;
}

/** Shallow-merges a patch into the current settings (one level deep for the
 * postgres/sheets/haLocal sub-objects), persists it, and returns the result.
 * Used by the Settings page, the Google OAuth callback, and Postgres
 * auto/manual provisioning - each only ever touches its own slice. */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  return saveSettings({
    ...current,
    ...patch,
    postgres: patch.postgres ? { ...current.postgres, ...patch.postgres } : current.postgres,
    sheets: patch.sheets ? { ...current.sheets, ...patch.sheets } : current.sheets,
    haLocal: patch.haLocal ? { ...current.haLocal, ...patch.haLocal } : current.haLocal,
  });
}
