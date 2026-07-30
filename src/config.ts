import * as dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;

export const config = {
  port: Number(process.env.PORT ?? 8080),
  publicBaseUrl,
  adminApiKeys: (process.env.ADMIN_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean),

  // Bootstrap-only default(s) for the first boot; after that, which
  // backend(s) are active lives in settingsStore (editable from the
  // Settings page without a restart). "ha_local" needs no further config -
  // "postgres" and "sheets" fall back to the values below until configured
  // through Settings / the Postgres provisioning routes / the Google OAuth
  // connect flow.
  storageBackends: (process.env.STORAGE_BACKENDS ?? "ha_local")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as Array<"postgres" | "sheets" | "ha_local">,

  postgres: {
    databaseUrl: process.env.DATABASE_URL ?? "",
    ssl: (process.env.PGSSL ?? "false").toLowerCase() === "true",
  },

  sheets: {
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "",
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
  },

  // OAuth client for the "Connect with Google" button (src/auth/googleOAuth.ts)
  // - a redirect-based sign-in instead of asking the user to create a
  // service account and paste a JSON key. This is a normal OAuth "Web
  // application" client created once in Google Cloud Console; end users
  // never touch the console themselves, they just click Connect.
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${publicBaseUrl}/api/integrations/google/callback`,
  },

  waha: {
    baseUrl: process.env.WAHA_BASE_URL ?? "",
    apiKey: process.env.WAHA_API_KEY ?? "",
  },

  haWhatsapp: {
    baseUrl: process.env.HA_BASE_URL ?? "",
    token: process.env.HA_LONG_LIVED_TOKEN ?? "",
    service: process.env.HA_WHATSAPP_SERVICE ?? "whatsapp.send_message",
  },

  haNotifyWebhookUrl: process.env.HA_NOTIFY_WEBHOOK_URL ?? "",

  schedulerCron: process.env.SCHEDULER_CRON ?? "*/1 * * * *",
  typingDelayMs: Number(process.env.TYPING_DELAY_MS ?? 10000),

  defaultFooterTemplate:
    process.env.DEFAULT_FOOTER_TEMPLATE ?? "\n\n~Auto Reminder~      ~تذكير تلقائي~",
};

export { required };
