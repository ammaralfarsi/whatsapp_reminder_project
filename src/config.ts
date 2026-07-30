import * as dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8086}`;

export const config = {
  port: Number(process.env.PORT ?? 8086),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  appVersion: (require("../package.json").version as string) ?? "0.0.0",
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
    // "auto": on boot, if Postgres is enabled and there's no working
    // connection yet, try to create one automatically using the fields
    // below (see src/api/routes/postgresProvision.ts / the boot-time hook
    // in src/index.ts). "manual" (the default) never does this on its own -
    // DATABASE_URL (built from postgres_* fields, or pasted directly) is
    // the only way in.
    mode: (process.env.POSTGRES_MODE ?? "manual").toLowerCase() === "auto" ? "auto" : ("manual" as "auto" | "manual"),
    autoDatabase: process.env.POSTGRES_AUTO_DATABASE || "reminders",
    autoUser: process.env.POSTGRES_AUTO_USER || "reminder_user",
    autoPassword: process.env.POSTGRES_AUTO_PASSWORD ?? "",
    autoPort: Number(process.env.POSTGRES_AUTO_PORT ?? 5433),
  },

  // Google Sheets connects only through OAuth (the "Connect with Google"
  // button, src/auth/googleOAuth.ts) - there's no service-account-JSON or
  // hand-set-spreadsheet-ID config path. This is a normal OAuth "Web
  // application" client created once in Google Cloud Console by whoever
  // deploys the app; end users never touch that console themselves, they
  // just click Connect and pick/create a spreadsheet from Settings.
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
