CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'ONBOARDING',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_configurations (
  client_id TEXT PRIMARY KEY REFERENCES clients(client_id) ON DELETE CASCADE,
  business_description TEXT,
  sales_goal TEXT,
  system_instructions TEXT,
  knowledge TEXT,
  tone TEXT,
  language TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  owner_whatsapp TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  business_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  waba_id TEXT,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone_number TEXT,
  verified_name TEXT,
  access_token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_client_id
  ON whatsapp_connections(client_id);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'NEW',
  welcomed BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_conversations_client_phone
  ON conversations(client_id, customer_phone);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  wa_message_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2),
  currency TEXT DEFAULT 'KES',
  stock NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_client_status
  ON products(client_id, status);

CREATE TABLE IF NOT EXISTS onboarding (
  client_id TEXT PRIMARY KEY REFERENCES clients(client_id) ON DELETE CASCADE,
  commercial_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  discovery_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  meta_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  whatsapp_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  data_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  conversation_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  integration_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  testing_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  approval_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  go_live_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT,
  wa_message_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_client_created
  ON webhook_events(client_id, created_at);
