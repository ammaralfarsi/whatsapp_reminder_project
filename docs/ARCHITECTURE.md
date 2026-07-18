# File map

```
src/
  config.ts                    env var loading, one place all config is read from
  types.ts                     User, WhatsAppNumber, Reminder, FooterTemplate

  storage/
    StorageAdapter.ts          interface every backend implements
    PostgresAdapter.ts         pg-backed implementation
    SheetsAdapter.ts           googleapis-backed implementation (one spreadsheet, 4 tabs)
    MultiStorage.ts            fans writes to N backends, reads from the first
    index.ts                   builds the active adapter from STORAGE_BACKENDS

  gateways/
    WhatsAppGateway.ts         interface every WhatsApp transport implements
    WahaGateway.ts             full WAHA HTTP client (sessions, QR, typing, send)
    HaWhatsappGateway.ts       stub adapter for faserf/ha-whatsapp (see README caveats)
    index.ts                   builds/caches gateway instances by kind

  sessions/
    sessionManager.ts          "new number -> new gateway session" logic

  reminders/
    templates.ts                per-user footer template rendering
    scheduler.ts                 node-cron loop: find due reminders, send, recur, notify HA

  auth/
    apiKeyAuth.ts                per-user (X-Api-Key) and admin auth middleware

  api/
    server.ts                    express app assembly
    routes/users.ts               admin: create users; self: GET /api/me
    routes/numbers.ts             connect numbers, fetch QR, refresh status
    routes/reminders.ts           CRUD, Flutter/HA-compatible payload parsing
    routes/templates.ts           get/set footer template

  db/migrate.ts                  applies migrations/*.sql against DATABASE_URL
  index.ts                       bootstrap: init storage -> start API -> start scheduler

migrations/001_init.sql          Postgres schema
repository.yaml                  marks this repo as a Home Assistant add-on repository (required by Supervisor)
whatsapp_reminder_platform/      the HA app (formerly "add-on") itself - config.yaml, Dockerfile, run.sh, dashboard-example.yaml.
                                  No build.yaml - since Supervisor 2026.04.0 that file isn't read; the base image is
                                  set directly via FROM in the Dockerfile instead. Self-contained: the Dockerfile
                                  `git clone`s src/ + package.json from this same repo at build time, since the
                                  Supervisor only gives it this one folder as context.
Dockerfile, docker-compose.yml   plain container deployment (uses src/ directly, no cloning needed)
```

# Why an interface for storage and gateways

The original script had `sendReminders()` directly calling `UrlFetchApp.fetch`
against a hardcoded WAHA URL and reading/writing one sheet by column index.
That's fine for one person. For multiple people and "sheets and/or postgres,
togglable," the storage and transport had to stop being assumptions baked
into the scheduling logic and become swappable pieces - hence
`StorageAdapter` and `WhatsAppGateway`. `src/reminders/scheduler.ts` and
`src/api/routes/*.ts` never import `pg`, `googleapis`, or `axios` directly;
they only depend on the two interfaces.
