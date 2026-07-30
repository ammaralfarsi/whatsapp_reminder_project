#!/usr/bin/with-contenv bashio
# Reads the add-on's Settings UI options (config.yaml -> options/schema) and
# maps them onto the same env vars the plain Docker container / bare-metal
# app reads (see .env.example), then starts the server.

export PORT="8080"
export STORAGE_BACKENDS=$(bashio::config 'storage_backends' | sed 's/postgres+sheets/postgres,sheets/')
export DATABASE_URL=$(bashio::config 'database_url')
export GOOGLE_SHEETS_SPREADSHEET_ID=$(bashio::config 'google_sheets_spreadsheet_id')
export GOOGLE_SERVICE_ACCOUNT_KEY_FILE="/config/addon_config/service-account.json"
export WAHA_BASE_URL=$(bashio::config 'waha_base_url')
export WAHA_API_KEY=$(bashio::config 'waha_api_key')
export HA_NOTIFY_WEBHOOK_URL=$(bashio::config 'ha_notify_webhook_url')
export SCHEDULER_CRON=$(bashio::config 'scheduler_cron')
export DEFAULT_FOOTER_TEMPLATE=$(bashio::config 'default_footer_template')

# ha-whatsapp runs as a normal HA integration in the SAME Home Assistant
# instance this add-on is installed into, so we can default its base URL to
# the internal Supervisor API instead of asking the user to fill it in.
export HA_BASE_URL="http://supervisor/core"
export HA_LONG_LIVED_TOKEN="${SUPERVISOR_TOKEN}"
export HA_WHATSAPP_SERVICE="whatsapp.send_message"

bashio::log.info "Starting WhatsApp Reminder Platform (storage: ${STORAGE_BACKENDS})..."
exec node /app/dist/index.js
