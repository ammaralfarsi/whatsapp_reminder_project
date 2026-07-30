#!/usr/bin/with-contenv bashio
# Reads the add-on's Settings UI options (config.yaml -> options/schema) and
# maps them onto the same env vars the plain Docker container / bare-metal
# app reads (see .env.example), then starts the server.

export PORT="8080"
# "postgres+sheets+ha_local"-style combo values (see config.yaml's schema)
# become the comma-separated list src/config.ts expects.
export STORAGE_BACKENDS=$(bashio::config 'storage_backends' | sed 's/+/,/g')
export DATABASE_URL=$(bashio::config 'database_url')
export GOOGLE_SHEETS_SPREADSHEET_ID=$(bashio::config 'google_sheets_spreadsheet_id')
export GOOGLE_SERVICE_ACCOUNT_KEY_FILE="/config/addon_config/service-account.json"
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

# ha-whatsapp runs as a normal HA integration in the SAME Home Assistant
# instance this add-on is installed into, so we can default its base URL to
# the internal Supervisor API instead of asking the user to fill it in.
export HA_BASE_URL="http://supervisor/core"
export HA_LONG_LIVED_TOKEN="${SUPERVISOR_TOKEN}"
export HA_WHATSAPP_SERVICE="whatsapp.send_message"

bashio::log.info "Starting WhatsApp Reminder Platform (storage: ${STORAGE_BACKENDS})..."
exec node /app/dist/index.js
