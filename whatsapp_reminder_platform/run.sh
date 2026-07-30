#!/usr/bin/with-contenv bashio
# Reads the add-on's Settings UI options (config.yaml -> options/schema) and
# maps them onto the same env vars the plain Docker container / bare-metal
# app reads (see .env.example), then starts the server.

export PORT="8080"
# Gates the Settings page (storage backend selection, Postgres setup,
# "Connect with Google") - without this set, nobody can use those admin
# actions, so it's a required Configuration field (see config.yaml).
export ADMIN_API_KEYS=$(bashio::config 'admin_api_keys')
# "postgres+sheets+ha_local"-style combo values (see config.yaml's schema)
# become the comma-separated list src/config.ts expects.
export STORAGE_BACKENDS=$(bashio::config 'storage_backends' | sed 's/+/,/g')
# Google Sheets is OAuth-only - "Connect with Google" in Settings, no
# service account JSON or spreadsheet ID to set here. Which spreadsheet to
# use is picked from Settings after connecting.
export GOOGLE_OAUTH_CLIENT_ID=$(bashio::config 'google_oauth_client_id')
export GOOGLE_OAUTH_CLIENT_SECRET=$(bashio::config 'google_oauth_client_secret')
export WAHA_BASE_URL=$(bashio::config 'waha_base_url')
export WAHA_API_KEY=$(bashio::config 'waha_api_key')
export HA_NOTIFY_WEBHOOK_URL=$(bashio::config 'ha_notify_webhook_url')
export SCHEDULER_CRON=$(bashio::config 'scheduler_cron')
export DEFAULT_FOOTER_TEMPLATE=$(bashio::config 'default_footer_template')

# Persist settings.json (Settings page: storage backend selection, Google
# OAuth tokens, Postgres config) and the ha_local JSON store under the
# add-on's own persistent, editable storage (config.yaml: `addon_config:rw`)
# so they survive add-on updates/restarts.
export DATA_DIR="/config/addon_config/data"
mkdir -p "$DATA_DIR"

# Used to build the Google OAuth redirect URI (must exactly match an
# "Authorized redirect URI" in the Google Cloud OAuth client, so it can't be
# auto-detected reliably here - see README's "Google OAuth setup" section).
# Defaults to localhost, which only works if you access this add-on's UI
# from the same machine; set the `public_base_url` add-on option to your
# real HA URL (e.g. https://ha.example.com:8080) to use "Connect with
# Google" from elsewhere.
PUBLIC_BASE_URL=$(bashio::config 'public_base_url')
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:8080}"

# --- Postgres: fields instead of a hand-built URL ---
# Priority: an explicit `database_url` (advanced override) always wins;
# otherwise Manual mode builds one from the host/port/db/user/password
# fields; otherwise (Auto, or Manual left blank) DATABASE_URL stays empty.
# Note: "Auto" (self-provisioning a postgres:16-alpine container) does NOT
# work for this add-on - Home Assistant's docker_api option only grants
# read-only Docker API access, so container creation is always refused here.
# Auto only works in the plain Docker/docker-compose deployment. For this
# add-on, use Manual mode with a Postgres you already have (your own server,
# a managed one, or the official "PostgreSQL" add-on).
POSTGRES_MODE=$(bashio::config 'postgres_mode')
export POSTGRES_MODE="${POSTGRES_MODE:-manual}"
DATABASE_URL_OVERRIDE=$(bashio::config 'database_url')
POSTGRES_HOST=$(bashio::config 'postgres_host')
POSTGRES_PORT=$(bashio::config 'postgres_port')
POSTGRES_DATABASE=$(bashio::config 'postgres_database')
POSTGRES_USER=$(bashio::config 'postgres_user')
POSTGRES_PASSWORD=$(bashio::config 'postgres_password')
POSTGRES_SSL=$(bashio::config 'postgres_ssl')
export PGSSL="${POSTGRES_SSL:-false}"

if [ -n "$DATABASE_URL_OVERRIDE" ]; then
  export DATABASE_URL="$DATABASE_URL_OVERRIDE"
elif [ "$POSTGRES_MODE" = "manual" ] && [ -n "$POSTGRES_HOST" ]; then
  export DATABASE_URL="postgres://${POSTGRES_USER:-reminder_user}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT:-5432}/${POSTGRES_DATABASE:-reminders}"
else
  export DATABASE_URL=""
fi
# Initial details for Auto mode's first-boot provisioning (or for filling in
# Settings -> Postgres -> Auto's fields with something other than the
# built-in defaults). Password is auto-generated if left blank - see
# src/api/routes/postgresProvision.ts.
export POSTGRES_AUTO_DATABASE="${POSTGRES_DATABASE:-reminders}"
export POSTGRES_AUTO_USER="${POSTGRES_USER:-reminder_user}"
export POSTGRES_AUTO_PASSWORD="$POSTGRES_PASSWORD"
export POSTGRES_AUTO_PORT="${POSTGRES_PORT:-5432}"

# ha-whatsapp runs as a normal HA integration in the SAME Home Assistant
# instance this add-on is installed into, so we can default its base URL to
# the internal Supervisor API instead of asking the user to fill it in.
export HA_BASE_URL="http://supervisor/core"
export HA_LONG_LIVED_TOKEN="${SUPERVISOR_TOKEN}"
export HA_WHATSAPP_SERVICE="whatsapp.send_message"

bashio::log.info "Starting WhatsApp Reminder Platform (storage: ${STORAGE_BACKENDS})..."
exec node /app/dist/index.js
