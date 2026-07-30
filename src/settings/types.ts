// Runtime-editable platform settings: which storage backend(s) are active
// and the configuration each one needs. This is deliberately separate from
// src/config.ts (pure env vars, read once at boot) - these values are meant
// to be changed from the Settings web page while the app keeps running, via
// src/api/routes/settings.ts, src/api/routes/integrations.ts (Google) and
// src/api/routes/postgresProvision.ts (Postgres).

export type StorageKind = "postgres" | "sheets" | "ha_local";

export interface PostgresManualConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface PostgresAutoConfig {
  containerName: string;
  generatedPassword: string;
  provisioned: boolean;
  provisionedAt?: string;
}

export interface PostgresSettings {
  mode: "auto" | "manual";
  databaseUrl: string; // resolved connection string actually used, whichever mode
  ssl: boolean;
  manual?: PostgresManualConfig;
  auto?: PostgresAutoConfig;
}

export interface GoogleOAuthTokens {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  connectedEmail?: string;
}

export interface SheetsSettings {
  spreadsheetId: string;
  authMode: "service_account" | "oauth";
  serviceAccountKeyFile?: string;
  oauth?: GoogleOAuthTokens;
}

export interface HaLocalSettings {
  filePath: string;
}

export interface AppSettings {
  enabledBackends: StorageKind[]; // multi-select; first entry is primary when more than one is active
  postgres: PostgresSettings;
  sheets: SheetsSettings;
  haLocal: HaLocalSettings;
}
