import * as dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  adminApiKeys: (process.env.ADMIN_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean),

  storageBackends: (process.env.STORAGE_BACKENDS ?? "postgres")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as Array<"postgres" | "sheets">,

  postgres: {
    databaseUrl: process.env.DATABASE_URL ?? "",
    ssl: (process.env.PGSSL ?? "false").toLowerCase() === "true",
  },

  sheets: {
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "",
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
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
