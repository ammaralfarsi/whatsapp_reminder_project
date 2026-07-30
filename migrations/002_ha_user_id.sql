-- Optional link from an app user to a Home Assistant person, so opening the
-- app via the Ingress panel can auto-recognize who's logged in (see
-- src/auth/apiKeyAuth.ts) instead of requiring a personal API key every time.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ha_user_id TEXT UNIQUE;
