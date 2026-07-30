# Changelog

All notable changes to the WhatsApp Reminder Platform add-on are listed
here. Home Assistant's Supervisor reads this file directly and shows it on
the add-on's info page, so keep it in sync with `version:` in `config.yaml`
- bump one, add an entry here.

## 1.1.4

- Fixed a real lockout bug: this add-on never exposed `ADMIN_API_KEYS` as a
  Configuration option, so `requireAdmin` (Settings page, Postgres setup,
  "Connect with Google") had nothing to check against and rejected every
  request - there was no key you could enter that would ever work. Added
  `admin_api_keys` as a required Configuration field (mirrors `waha_api_key`),
  wired through `run.sh`. **After updating, set this field to your own value
  and use it in Settings** (paste it in the box at the top of the page -
  it's stored in your browser only, sent as `X-Api-Key`).

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
