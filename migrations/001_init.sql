-- WhatsApp Reminder Platform - initial schema
-- Multi-tenant: every table (except users) is scoped by user_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  gateway TEXT NOT NULL CHECK (gateway IN ('waha', 'ha-whatsapp')),
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qr','connected','disconnected','error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_number)
);

CREATE TABLE IF NOT EXISTS footer_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT NOT NULL DEFAULT 'none' CHECK (frequency IN ('daily','weekly','monthly','yearly','none')),
  template_id UUID REFERENCES footer_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','error','done')),
  days_left INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  moved_to_done BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, trigger_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id);
CREATE INDEX IF NOT EXISTS idx_numbers_user ON whatsapp_numbers (user_id);
