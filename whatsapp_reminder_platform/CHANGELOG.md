# Changelog

All notable changes to the WhatsApp Reminder Platform add-on are listed
here. Home Assistant's Supervisor reads this file directly and shows it on
the add-on's info page, so keep it in sync with `version:` in `config.yaml`
- bump one, add an entry here.

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
