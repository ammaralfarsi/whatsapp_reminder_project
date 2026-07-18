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
.github/workflows/build-app-image.yml  builds the app image on GitHub's servers (not on-device) and publishes it to
                                  GHCR on every push to main - see "Not built on-device" below
whatsapp_reminder_platform/      the HA app (formerly "add-on") itself - config.yaml, Dockerfile, run.sh, dashboard-example.yaml.
                                  No build.yaml - since Supervisor 2026.04.0 that file isn't read. config.yaml sets
                                  `image: ghcr.io/ammaralfarsi/whatsapp-reminder-platform`, so Supervisor pulls the
                                  CI-built image instead of building locally.
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

# Not built on-device

The HA app used to build itself locally on the Supervisor: `git clone` the
repo, `npm install`, compile TypeScript, all inside the Docker build step
that runs on whatever device HA is on. On a Raspberry Pi 4 that ran the box
out of RAM during install and hung it. `.github/workflows/build-app-image.yml`
now does that same build on GitHub's runners instead, publishing a
multi-arch image to GHCR; `whatsapp_reminder_platform/config.yaml`'s
`image:` field tells Supervisor to pull that finished image rather than
build anything itself. The app's Dockerfile still exists, but it's CI-only
now - it expects a repo-root build context (which CI provides via
`context: .` / `file: whatsapp_reminder_platform/Dockerfile`), not the
single-folder context the Supervisor gives a local build.
