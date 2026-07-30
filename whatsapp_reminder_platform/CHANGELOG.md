# Changelog

All notable changes to the WhatsApp Reminder Platform add-on are listed
here. Home Assistant's Supervisor reads this file directly and shows it on
the add-on's info page, so keep it in sync with `version:` in `config.yaml`
- bump one, add an entry here.

## 1.7.1

- **Fixed: `ha_notify_webhook_url` default pointed at https instead of http.**
  The internal Supervisor proxy only listens on plain HTTP inside the add-on's
  private docker network - the `https://supervisor/...` default from 1.4.0
  onward failed every single time with `ECONNREFUSED ...:443`, spamming the
  log with a full axios stack trace on both `reminder_sent` and the new
  `session_down` notifications (functionally harmless - the reminder itself
  still sends/skips correctly either way - but the notification never
  reached HA). Default is now `http://supervisor/core/api/webhook/reminder_sent`.
  **Only affects new installs** - Home Assistant add-ons keep whatever value
  you already have saved in Configuration even after this default changes.
  If you're already running this add-on, manually change
  `ha_notify_webhook_url` to `http://supervisor/core/api/webhook/reminder_sent`
  yourself (Configuration tab) to pick up the fix.

## 1.7.0

- **New: Home Assistant-style theming.** All three pages
  (`/reminder.html`, `/settings.html`, `/dashboard.html`) now share a common
  `/public/ha-theme.css` approximating HA's default Material look: a
  colored top app bar with tab-style navigation (current page underlined),
  `ha-card`-style rounded/shadowed cards, HA's default primary blue, and
  automatic light/dark switching via `prefers-color-scheme`. Note: since
  this app runs inside HA's Ingress panel as a separate embedded document
  (not a native Lovelace card), it can't literally inherit your live HA
  theme/CSS variables - this approximates HA's default look rather than
  mirroring your custom theme exactly. All three pages now cross-link to
  each other (Dashboard / Reminders / Settings tabs) instead of one-off
  links.

## 1.6.0

- **New: Google Contacts recipient search**. `/reminder.html`'s recipient
  field is now a searchable name+number dropdown, backed by the same Google
  account already connected for Sheets (People API, read-only). New scope
  `contacts.readonly` added to the OAuth request - if you connected Google
  before this release, click **Connect with Google** again in Settings to
  grant it (consent is always re-prompted). New endpoint:
  `GET /api/integrations/google/contacts?q=...` (any user, cached 5 min
  server-side, reads up to the first 1,000 contacts). Falls back to plain
  manual entry if Google isn't connected or the lookup fails. Enable the
  **People API** in Google Cloud Console alongside Sheets/Drive if you want
  this (see README's "Google OAuth setup").

## 1.5.0

- **New: Status dashboard (`/dashboard.html`)**. A stats row (total, sent,
  pending, failed, archived reminders) plus a live connection-status card
  per WhatsApp number - any number not `connected` gets checked against the
  gateway immediately and shows its QR code inline to reconnect, no need to
  reopen `/reminder.html`'s Add-number flow. Same API key/HA auto-login as
  the other pages. Added a "Dashboard" nav link on `/reminder.html` and
  `/settings.html`. No new backend endpoints - built entirely on the
  existing `GET /api/reminders`, `GET /api/numbers` and
  `POST /api/numbers/:id/refresh`.

## 1.4.0

- **Fixed: reminders not sending at their scheduled time.** The scheduler was
  gating sends on a cached `status` field on the number that's only ever
  refreshed when someone has the QR/status page open - if a session
  connected while nobody was watching (tab closed right after scanning, a
  refresh, etc.), that field could get stuck on `qr`/`pending` forever, even
  though the session was really connected, silently blocking every reminder
  on that number. The scheduler now checks the gateway's *live* status
  before sending and self-corrects the stored value if it drifted.
- **Fixed: timezone-ambiguous reminder times.** `datetime-local` inputs carry
  no timezone marker, so they were being interpreted using the server's own
  timezone (UTC by default in Docker) rather than yours. `/reminder.html`'s
  create/edit form now always converts to/from an explicit UTC instant
  client-side, so it's correct regardless of server timezone. For the two
  paths that still send timezone-naive values - the Lovelace dashboard
  card's `input_datetime`, and the legacy Flutter app's date format - added
  a `timezone` add-on option / `TZ` env var (defaults to `Asia/Muscat` for
  this deployment; change or blank it out for UTC). The plain-Docker
  `Dockerfile` now installs `tzdata` so named zones resolve correctly there
  too.
- **New: notified when a session is down.** If a reminder is due but its
  WhatsApp number isn't actually connected, the scheduler now posts
  `{ event: "session_down", numberLabel, status, message }` to
  `ha_notify_webhook_url`/`HA_NOTIFY_WEBHOOK_URL` (debounced to once per 30
  minutes per number) instead of failing silently. Successful sends now post
  `{ event: "reminder_sent", ... }` to the same webhook (was previously
  unlabeled `{ recipient, message }` - existing automations keyed off those
  two fields keep working, `event` is additive).

## 1.3.0

- **Reminders can now be managed, not just created**: `/reminder.html` shows
  an Active/Archived list below the form - edit, delete, **Send now**
  (bypasses the scheduled time, reuses the exact same send path as the
  cron scheduler), and archive/restore (the same `movedToDone` flag the
  scheduler already sets automatically for sent, non-recurring reminders).
  New endpoints: `DELETE /api/reminders/:id`,
  `POST /api/reminders/:id/send-now`, `.../archive`, `.../unarchive`.
- **Home Assistant person auto-recognition**: link a user to their HA
  account (Settings -> Users - paste their HA user ID, shown via the new
  `GET /api/ha-context`) and opening `/reminder.html` through the HA
  sidebar/Ingress panel logs them in automatically, no API key needed there
  (`X-Remote-User-Id`, which Supervisor's Ingress proxy already sends -
  `requireUser()` now falls back to it when no `X-Api-Key` is present).
  Direct/external access still requires the personal key as before. New
  `PATCH /api/users/:id` (admin) to link/unlink; `User.haUserId` added
  across every storage backend (Postgres migration
  `002_ha_user_id.sql`, Sheets `Users` tab gets a new column, HA-local/
  Multi/Live storage updated to match).

## 1.2.0

- Added a footer to Settings and `/reminder.html`: "Developed by: Ammar Al
  Farsi", the running version (new public `GET /api/version`, backed by
  `package.json`, now kept in sync with `config.yaml` on every bump), and a
  GitHub link icon.
- Added `webui` to `config.yaml`, so the add-on's Info tab gets an "Open Web
  UI" button that opens the app in its own new browser tab, separate from
  the embedded sidebar panel.

## 1.1.9

- Clearer error when the admin key is pasted into a per-user field (like
  `/reminder.html`'s API key box) by mistake: instead of a bare "Invalid API
  key", it now says "That's the admin key, not a user key. Create a user in
  Settings -> Users ... and use their personal API key here instead."

## 1.1.8

- `/reminder.html` can now connect a WhatsApp number directly - **+ Add
  number**: choose the gateway (WAHA or ha-whatsapp), and for WAHA either a
  brand-new session or an existing one (new `GET /api/gateways/waha/sessions`
  lists what's already on your WAHA instance), with the QR code shown and
  polled inline until it's scanned. No curl required to connect a number
  anymore.
- `POST /api/numbers` accepts an optional `sessionId` to attach to an
  existing WAHA session instead of always creating a new one
  (`SessionManager.addNumber`).

## 1.1.7

- Fixed the "Invalid API key" confusion on `/reminder.html`: there was no
  way to create a user (and get their personal API key) without a manual
  `curl -X POST /api/users` command - easy to miss that the *admin* key and
  a *user's* key are different things. Added a **Users** section to
  Settings: create a user (email + display name), see the generated API
  key, copy it with one click. Entering the admin key into `/reminder.html`
  will still (correctly) fail - it's not a user key.

## 1.1.6

- Fixed "Cannot GET /" when opening the web UI (Ingress panel, or a bare
  `http://<host>:8086/`): there was no route for `/` and no
  `public/index.html`, so it fell through to Express's default 404. `/` now
  redirects to `/settings.html`.

## 1.1.5

- Changed the default port from `8080` to `8086` everywhere (add-on
  `ingress_port`/`ports`, `run.sh`, plain Docker `Dockerfile`/
  `docker-compose.yml`, `.env.example`, `src/config.ts` fallback, README,
  dashboard example). If you're upgrading the plain Docker/docker-compose
  deployment, update your own port mapping/reverse proxy accordingly - the
  HA add-on picks this up automatically.
- Also fixed the plain-Docker `Dockerfile`: it never copied `public/` into
  the final image, so `/settings.html` and `/reminder.html` would 404
  there (same bug already fixed for the HA add-on's Dockerfile in 1.1.0).

## 1.1.4

- Fixed a real lockout bug: this add-on never exposed `ADMIN_API_KEYS` as a
  Configuration option, so `requireAdmin` (Settings page, Postgres setup,
  "Connect with Google") had nothing to check against and rejected every
  request - there was no key you could enter that would ever work. Added
  `admin_api_keys` as a Configuration field. **Leave it blank and `run.sh`
  auto-generates one for you on first boot**, persists it under the add-on's
  own storage so it survives restarts/updates, and logs it once to this
  add-on's Log tab - copy that value into the box at the top of the Settings
  page (`/settings.html`). Set the field yourself instead if you'd rather
  pick your own key.

## 1.1.3

- Corrected a wrong assumption from 1.1.0: Home Assistant's `docker_api`
  option only ever grants **read-only** access to the Docker API (this is
  documented Supervisor behavior, not something this add-on can work
  around), so Postgres "Auto" mode can never create a container from
  inside this add-on, no matter how it's configured. Turned `docker_api`
  back off in `config.yaml` (it wasn't helping and only cost the add-on its
  "protected" status), and reworked the Auto-provisioning code so a
  permission-denied response degrades to clear guidance ("use Manual mode
  with a Postgres you already have, e.g. the official PostgreSQL add-on")
  instead of a confusing error. Auto mode is unaffected and still works
  normally in the plain Docker/docker-compose deployment, where a real,
  writable `docker.sock` can be bind-mounted in.
- Updated README/config.yaml/run.sh docs to stop suggesting Auto works on
  the HA add-on.

## 1.1.2

- Fixed the CI build failure (`npm run build` exit code 2): `package.json`
  had reverted back to `googleapis@144.0.0`, a version with a genuine parse
  error in its shipped type definitions (unrelated to any app code) -
  re-pinned to `^173.0.0` and dropped the now-redundant direct
  `google-auth-library` dependency.
- Added a committed `package-lock.json` and switched both Dockerfiles from
  `npm install` to `npm ci`, so CI resolves the exact same dependency
  versions every time instead of re-resolving fresh (which is what let the
  above regression happen silently).

## 1.1.1

- Google Sheets is now OAuth-only: removed the legacy service account
  JSON / spreadsheet ID config fields from `config.yaml` and `.env.example`.
  "Connect with Google" in Settings is the only way to connect a
  spreadsheet - no manual credential entry anywhere, including at deploy
  time.

## 1.1.0

- **Storage is now managed live from a Settings page** (`/settings.html`,
  reachable via the Ingress panel or `http://<host>:8080/settings.html`)
  instead of only through `config.yaml`. Check any combination of:
  - **Home Assistant local** - a JSON file on disk, nothing to configure.
  - **Google Sheet** - "Connect with Google" (OAuth) instead of a
    hand-created service account JSON.
  - **Postgres** - separate host/port/database/user/password fields
    instead of one connection string, with an **Auto** mode that creates a
    `postgres:16-alpine` container for you (needs `docker_api: true`, on by
    default) using initial details you can review or leave as defaults.
  Changes apply immediately - no restart needed.
- The app no longer crashes at boot if a storage backend isn't configured
  yet. The server (and Settings page) always starts, so a bad/missing
  connection can be fixed live instead of causing a crash loop.
- Postgres Auto mode can now also run automatically at boot
  (`postgres_mode: auto` in Configuration), so filling in the Configuration
  tab can be enough on its own.
- New `/reminder.html` page to add a reminder from any browser or phone,
  alongside the existing Lovelace card.
- New add-on icon and logo.

## 1.0.1

- Switched to a prebuilt multi-arch image published via GitHub Actions to
  GHCR, instead of building on-device - fixes install hangs/RAM exhaustion
  on small devices (seen on a Raspberry Pi 4 during testing).

## 1.0.0

- Initial multi-tenant rewrite of the original single-user Google Apps
  Script reminder bot: multiple users, multiple WhatsApp numbers per user,
  Postgres and/or Google Sheets storage, WAHA gateway, `node-cron`
  scheduler, Home Assistant add-on packaging.
