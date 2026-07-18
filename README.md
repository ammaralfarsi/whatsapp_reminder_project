# WhatsApp Reminder Platform

A multi-tenant rewrite of the original single-user Google Apps Script / Sheets
reminder bot. Multiple people can now use one deployment, each connecting
their own WhatsApp number(s), each with their own reminders, footer template,
and storage. Runs as a plain Docker container or as a Home Assistant add-on.

## What changed vs. the original Apps Script

| Original | This project |
|---|---|
| One hardcoded WAHA session (`"default"`) | One session per user per phone number, auto-created |
| One shared Google Sheet, no user concept | Users table; every row scoped by `user_id` |
| Hardcoded footer text in code | Per-user, editable footer template (`PUT /api/templates`) |
| Sheets only | Sheets and/or Postgres, togglable, can run both at once |
| Apps Script triggers | `node-cron` scheduler inside the app (Docker or HA add-on) |
| Single WAHA gateway | Gateway interface: WAHA (fully implemented) + ha-whatsapp (adapter stub, see caveats below) |

## Architecture

```
                     ┌─────────────────────────┐
 Flutter app / HA -->│   Express API (/api/*)  │
 curl / your own UI  │   auth: X-Api-Key        │
                     └────────────┬─────────────┘
                                  │
                     ┌────────────▼─────────────┐
                     │      StorageAdapter        │  <- interface
                     │  ┌───────────┬───────────┐ │
                     │  │ Postgres  │  Sheets   │ │  <- pick one, or both (MultiStorage)
                     │  └───────────┴───────────┘ │
                     └────────────┬─────────────┘
                                  │
                     ┌────────────▼─────────────┐
                     │   Scheduler (node-cron)    │  scans due reminders every N minutes
                     └────────────┬─────────────┘
                                  │
                     ┌────────────▼─────────────┐
                     │    WhatsAppGateway          │  <- interface
                     │  ┌───────────┬───────────┐ │
                     │  │   WAHA    │ha-whatsapp│ │  <- per number, chosen at creation
                     │  └───────────┴───────────┘ │
                     └─────────────────────────────┘
```

Every layer (`src/storage`, `src/gateways`) is written against an interface,
not a concrete implementation, specifically so this can grow (a third storage
backend, a third gateway, a real auth system) without touching the scheduler
or API routes.

## Multi-tenancy model

- **User** - one row per person, identified by an `apiKey` sent as
  `X-Api-Key` on every request.
- **WhatsAppNumber** - a phone number a user has connected. Each one gets its
  own gateway session (`u<userId8>_<phone>` for WAHA), created the moment the
  number is added via `POST /api/numbers`. Adding a second number for the
  same user creates a second, independent session - numbers never share
  sessions.
- **Reminder** - always tied to both a `userId` and the `numberId` that
  should send it.
- **FooterTemplate** - per-user; the text appended after the reminder body.
  Supports `{{message}}` and any extra vars you pass in.

## Storage: Sheets, Postgres, or both

Set `STORAGE_BACKENDS` in `.env`:

- `postgres` - Postgres only (recommended for real multi-user use; the bundled
  `docker-compose.yml` includes a Postgres container and applies
  `migrations/001_init.sql` automatically on first boot).
- `sheets` - Google Sheets only, one spreadsheet with `Users` / `Numbers` /
  `Reminders` / `Templates` tabs (auto-created on first run). Needs a service
  account JSON with edit access to the sheet
  (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `GOOGLE_SHEETS_SPREADSHEET_ID`).
- `postgres,sheets` - both at once. Postgres is primary (used for reads and
  for the scheduler's due-reminder scan); every write is mirrored into the
  Sheet too, so it stays a live, human-editable copy. This is best-effort
  dual-write, not a transaction - if the Sheets write fails it's logged but
  doesn't fail the request.

## WhatsApp gateways: WAHA and ha-whatsapp

- **WAHA** (`src/gateways/WahaGateway.ts`) - fully implemented, ported
  directly from the original script's session creation, QR fetch, typing
  indicators, and `sendText` logic, generalized to take an explicit
  `sessionId` per call instead of assuming one global session.

- **ha-whatsapp** ([faserf.github.io/ha-whatsapp](https://faserf.github.io/ha-whatsapp/))
  (`src/gateways/HaWhatsappGateway.ts`) - **adapter stub, not verified**.
  ha-whatsapp is a Home Assistant custom integration built around one WhatsApp
  Web session per HA instance, paired manually through the HA config-flow UI
  - it doesn't expose the kind of multi-session HTTP API WAHA does. The
    adapter calls HA's generic "call a service" REST endpoint
    (`POST /api/services/<domain>/<service>`) with a guessed payload shape.
  Before relying on it:
  1. Install ha-whatsapp in HA and pair it once through the UI.
  2. Open **Developer Tools -> Actions**, find the real service it registers
     (likely under `whatsapp.*` or `notify.*`), and check its exact field
     names.
  3. Update `HA_WHATSAPP_SERVICE` in `.env` and the payload keys in
     `sendText()` in `HaWhatsappGateway.ts` to match.
  Until then, use WAHA for every number - it's the fully-supported path and
  is what the HA add-on's own reminder-sending number uses by default.

## Setup

### Local development

```bash
cp .env.example .env      # fill in DATABASE_URL, WAHA_BASE_URL, WAHA_API_KEY
npm install
npm run migrate:dev        # only if STORAGE_BACKENDS includes postgres
npm run dev
```

### Docker (recommended for self-hosting outside Home Assistant)

```bash
cp .env.example .env
docker compose up -d --build
```

This starts both the app and a Postgres container; `migrations/001_init.sql`
is applied automatically on first boot via
`docker-entrypoint-initdb.d`.

### Home Assistant add-on

The repo root has a `repository.yaml` and the add-on itself lives in its own
self-contained folder, `whatsapp_reminder_platform/` - this is the structure
the Supervisor requires; a repo with `config.yaml` buried in a subfolder and
no `repository.yaml` is what produces the "not a valid add-on repository"
error.

**The app is not built on-device.** Compiling TypeScript and running
`npm install` at install time can exhaust RAM on a small device (this
happened on a Raspberry Pi 4 during testing and hung the whole box).
Instead, `.github/workflows/build-app-image.yml` builds a multi-arch
(amd64 + arm64) image on GitHub's servers on every push to `main` and
publishes it to GHCR; `config.yaml`'s `image:` field points Supervisor at
that prebuilt image, so installing is just a `docker pull`, not a build.

1. Push to `main` (or run the workflow manually from the **Actions** tab).
   Wait for **Build and publish app image** to finish - check the Actions
   tab on GitHub.
2. **First time only:** the published package defaults to private, and
   Supervisor can't authenticate to pull it. Go to your GitHub profile ->
   **Packages** -> `whatsapp-reminder-platform` -> **Package settings** ->
   change visibility to **Public**.
3. In HA: **Settings -> Add-ons -> Add-on Store -> ⋮ (top right) ->
   Repositories**, and add your GitHub repo URL, e.g.
   `https://github.com/ammaralfarsi/whatsapp_reminder_project`. Click **Add**,
   then close and reopen the Add-on Store.
4. "WhatsApp Reminder Platform" should now appear under a new "Ammar's
   Add-ons" section. Install it - this pulls the image from GHCR instead of
   building, so it should be fast and light even on a Pi.
5. Fill in the add-on's **Configuration** tab (storage backend, WAHA URL/key,
   optional Postgres URL / Sheets spreadsheet ID).
6. Start the add-on. It listens on port 8080 and exposes an Ingress panel.
7. Wire up your dashboard using `whatsapp_reminder_platform/dashboard-example.yaml`,
   which adapts your existing mushroom-card dashboard to call the new API
   instead of the old Apps Script web app - same look, same helpers, new
   backend.

Every time you bump `version:` in `whatsapp_reminder_platform/config.yaml`
and push, CI publishes a new tag and HA will offer an update - there's no
separate "rebuild" step to remember.

If the repository still won't add: repo must be public (or added with a
token HA can use), `repository.yaml` must sit at the repo root, and the
add-on folder must contain `config.yaml` directly at its own root (not
nested further) - all true here after this restructure, so a stale Supervisor
cache is the next thing to check (⋮ -> Reload in the Add-on Store, or
restart Supervisor). If install fails specifically on pulling the image,
the GHCR package is probably still private - see step 2 above.

The add-on defaults `HA_BASE_URL`/`HA_LONG_LIVED_TOKEN` to the internal
Supervisor API, so `HA_NOTIFY_WEBHOOK_URL` and any `ha-whatsapp` calls reach
your own HA instance without extra configuration.

## Onboarding a new user (what makes this "scalable to others")

```bash
curl -X POST https://your-host:8080/api/users \
  -H "X-Api-Key: <ADMIN_API_KEYS value>" \
  -H "Content-Type: application/json" \
  -d '{"email":"friend@example.com","displayName":"A Friend"}'
# -> { "id": "...", "apiKey": "<give this to the user>", ... }
```

The new user then:

```bash
# 1. Connect a WhatsApp number (creates a fresh WAHA session)
curl -X POST https://your-host:8080/api/numbers \
  -H "X-Api-Key: <their apiKey>" -H "Content-Type: application/json" \
  -d '{"label":"Personal","phoneNumber":"96895537783","gateway":"waha"}'

# 2. Get the QR code to scan in WhatsApp
curl https://your-host:8080/api/numbers/<numberId>/qr -H "X-Api-Key: <their apiKey>"

# 3. Create reminders
curl -X POST https://your-host:8080/api/reminders \
  -H "X-Api-Key: <their apiKey>" -H "Content-Type: application/json" \
  -d '{
        "numberId":"<numberId>",
        "recipient":"96895537783",
        "message":"تجديد اشتراك iCloud",
        "triggerDateTime":"2026-12-24T10:10:00",
        "recurrence":"Yes",
        "frequency":"Yearly"
      }'
```

Every user is fully isolated: separate numbers, separate sessions, separate
reminders, separate footer template - all enforced by `userId` scoping in
every storage query and by the `X-Api-Key` auth middleware.

## Migrating from the old spreadsheet

Your existing `Reminders` tab (S/N, Timestamp, Date of Reminder, Reminder To,
Reminder Message, Recureing, Type of Recureing, Recureing ID, Status, Days
Left, `__PowerAppsId__`, Move to Done) maps onto `POST /api/reminders` like
this:

| Old column | New field |
|---|---|
| Date of Reminder | `triggerDateTime` |
| Reminder To | `recipient` (goes with the `numberId` you create for that number) |
| Reminder Message | `message` |
| Recureing | `recurrence` |
| Type of Recureing | `frequency` |
| Status | `status` (0/1 -> `pending`/`sent`) |

A small one-off script to read the old sheet with `googleapis` and POST each
row through the new API is the fastest path - happy to write that importer
once you've decided which storage backend you're standardizing on.

## Not carried over (yet)

- `assignLabelToChat` (WAHA label assignment) and `syncContactsToHA` (Google
  Contacts -> HA `input_select` sync) from the original script aren't ported.
  Both are straightforward to add as extra routes/cron jobs using the same
  `WahaGateway`/`axios` patterns already in this repo - ask if you want them
  wired in.
- User self-service signup (currently admin-only via `ADMIN_API_KEYS`) - fine
  for "a few people I trust," would need real auth (passwords/OAuth) for
  public signup.

## Security notes

- Rotate the `WAHA_API_KEY` and `ADMIN_API_KEYS` shown in the original script
  - they were pasted in plaintext into shared code.
- Per-user `apiKey`s are generated with `crypto.randomBytes(24)` and should be
  treated like passwords - send over HTTPS only.
- The Google service account key and any HA long-lived tokens should live in
  `secrets/` / the HA add-on's `addon_config` mount, never committed to git.
