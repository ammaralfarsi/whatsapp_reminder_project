import { config } from "../config";
import { StorageAdapter } from "./StorageAdapter";
import { PostgresAdapter } from "./PostgresAdapter";
import { SheetsAdapter } from "./SheetsAdapter";
import { MultiStorage } from "./MultiStorage";

let instance: StorageAdapter | null = null;

/**
 * Builds the active storage adapter from STORAGE_BACKENDS.
 * "postgres"          -> PostgresAdapter only
 * "sheets"             -> SheetsAdapter only
 * "postgres,sheets"    -> MultiStorage(Postgres primary, Sheets mirrored)
 * "sheets,postgres"    -> MultiStorage(Sheets primary, Postgres mirrored)
 */
export async function getStorage(): Promise<StorageAdapter> {
  if (instance) return instance;

  const backends: StorageAdapter[] = config.storageBackends.map((kind) => {
    if (kind === "postgres") {
      if (!config.postgres.databaseUrl) throw new Error("DATABASE_URL is required when STORAGE_BACKENDS includes postgres");
      return new PostgresAdapter(config.postgres.databaseUrl, config.postgres.ssl);
    }
    if (kind === "sheets") {
      if (!config.sheets.spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is required when STORAGE_BACKENDS includes sheets");
      return new SheetsAdapter(config.sheets.spreadsheetId, config.sheets.keyFile);
    }
    throw new Error(`Unknown storage backend: ${kind}`);
  });

  instance = backends.length === 1 ? backends[0] : new MultiStorage(backends);
  await instance.init();
  console.log(`[storage] active backend(s): ${config.storageBackends.join(", ")}`);
  return instance;
}
