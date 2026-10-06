const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: Number(process.env.DATABASE_POOL_MAX || 10),
    })
  : null;

function dbEnabled() {
  return Boolean(pool);
}

function encryptionKey() {
  const raw = process.env.DIGIGURU_ENCRYPTION_KEY || "";
  if (!raw) throw new Error("DIGIGURU_ENCRYPTION_KEY is required to store client WhatsApp credentials securely.");

  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error("DIGIGURU_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptSecret(payload) {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted secret format.");

  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function query(sql, params = []) {
  if (!pool) return null;
  return pool.query(sql, params);
}

async function initDatabase() {
  if (!pool) {
    console.log("DATABASE_URL not configured. DigiGuru will use in-memory fallback state.");
    return false;
  }

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  await pool.query(
    `INSERT INTO clients (client_id, business_name, industry, status, is_demo)
     VALUES ('digiguru-demo', 'DigiGuru', 'Conversational Sales Systems', 'ACTIVE', TRUE)
     ON CONFLICT (client_id) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO client_configurations (client_id, timezone, capabilities)
     VALUES ('digiguru-demo', 'Africa/Nairobi', '{"booking": true}'::jsonb)
     ON CONFLICT (client_id) DO NOTHING`
  );

  console.log("DigiGuru multi-client database ready.");
  return true;
}

async function listClients() {
  const result = await query(
    `SELECT c.client_id, c.business_name, c.industry, c.status, c.is_demo,
            c.created_at, c.updated_at,
            o.commercial_status, o.discovery_status, o.meta_status,
            o.whatsapp_status, o.data_status, o.conversation_status,
            o.integration_status, o.testing_status, o.approval_status,
            o.go_live_status
       FROM clients c
       LEFT JOIN onboarding o ON o.client_id = c.client_id
      ORDER BY c.created_at DESC`
  );
  return result?.rows || [];
}

async function getClientById(clientId) {
  const result = await query(
    `SELECT c.client_id, c.business_name, c.industry, c.status, c.is_demo,
            cfg.business_description, cfg.sales_goal, cfg.system_instructions,
            cfg.knowledge, cfg.tone, cfg.language, cfg.timezone,
            cfg.owner_whatsapp, cfg.capabilities, cfg.business_rules,
            cfg.delivery_rules, cfg.payment_rules
       FROM clients c
       LEFT JOIN client_configurations cfg ON cfg.client_id = c.client_id
      WHERE c.client_id = $1`,
    [clientId]
  );
  return result?.rows?.[0] || null;
}

async function getClientByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;

  const result = await query(
    `SELECT c.client_id, c.business_name, c.industry, c.status,
            cfg.business_description, cfg.sales_goal, cfg.system_instructions,
            cfg.knowledge, cfg.tone, cfg.language, cfg.timezone,
            cfg.owner_whatsapp, cfg.capabilities, cfg.business_rules,
            cfg.delivery_rules, cfg.payment_rules,
            wc.waba_id, wc.phone_number_id, wc.display_phone_number,
            wc.verified_name, wc.access_token_encrypted
       FROM whatsapp_connections wc
       JOIN clients c ON c.client_id = wc.client_id
       LEFT JOIN client_configurations cfg ON cfg.client_id = c.client_id
      WHERE wc.phone_number_id = $1
        AND wc.status = 'ACTIVE'
        AND c.status <> 'ARCHIVED'
      LIMIT 1`,
    [phoneNumberId]
  );

  const row = result?.rows?.[0];
  if (!row) return null;

  return {
    ...row,
    access_token: decryptSecret(row.access_token_encrypted),
  };
}

async function ensureConversation(clientId, customerPhone) {
  const result = await query(
    `INSERT INTO conversations (client_id, customer_phone, last_message_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (client_id, customer_phone)
     DO UPDATE SET updated_at = NOW(), last_message_at = NOW()
     RETURNING id, client_id, customer_phone, stage, welcomed`,
    [clientId, customerPhone]
  );

  return result?.rows?.[0] || null;
}

async function getConversation(clientId, customerPhone, historyLimit = 12) {
  const conversation = await ensureConversation(clientId, customerPhone);
  if (!conversation) return null;

  const result = await query(
    `SELECT role, content, created_at
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [conversation.id, historyLimit]
  );

  const history = (result?.rows || [])
    .reverse()
    .map((row) => ({ role: row.role, content: row.content }));

  return { ...conversation, history };
}

async function claimInboundMessage(clientId, customerPhone, waMessageId, content) {
  const conversation = await ensureConversation(clientId, customerPhone);
  if (!conversation) return true;

  const result = await query(
    `INSERT INTO messages
       (client_id, conversation_id, direction, role, content, wa_message_id)
     VALUES ($1, $2, 'INBOUND', 'user', $3, $4)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING id`,
    [clientId, conversation.id, content, waMessageId || null]
  );

  return Boolean(result?.rows?.length);
}

async function recordOutboundMessage(clientId, customerPhone, content) {
  const conversation = await ensureConversation(clientId, customerPhone);
  if (!conversation) return;

  await query(
    `INSERT INTO messages
       (client_id, conversation_id, direction, role, content)
     VALUES ($1, $2, 'OUTBOUND', 'assistant', $3)`,
    [clientId, conversation.id, content]
  );
}

async function markConversationWelcomed(clientId, customerPhone) {
  await query(
    `UPDATE conversations
        SET welcomed = TRUE, updated_at = NOW(), last_message_at = NOW()
      WHERE client_id = $1 AND customer_phone = $2`,
    [clientId, customerPhone]
  );
}

async function createClient({
  clientId,
  businessName,
  industry,
  businessDescription = "",
  salesGoal = "",
  systemInstructions = "",
  knowledge = "",
  tone = "warm, natural and professional",
  language = "English",
  timezone = "Africa/Nairobi",
  ownerWhatsapp = "",
  capabilities = {},
  businessRules = {},
  deliveryRules = {},
  paymentRules = {},
}) {
  if (!dbEnabled()) throw new Error("DATABASE_URL is required.");

  const client = String(clientId || "").trim();
  const name = String(businessName || "").trim();

  if (!/^[a-z0-9][a-z0-9_-]{2,49}$/i.test(client)) {
    throw new Error("clientId must be 3 to 50 characters using letters, numbers, underscores or hyphens.");
  }
  if (!name) throw new Error("businessName is required.");

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");

    await dbClient.query(
      `INSERT INTO clients (client_id, business_name, industry)
       VALUES ($1, $2, $3)`,
      [client, name, industry || null]
    );

    await dbClient.query(
      `INSERT INTO client_configurations
       (client_id, business_description, sales_goal, system_instructions, knowledge,
        tone, language, timezone, owner_whatsapp, capabilities, business_rules,
        delivery_rules, payment_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb)`,
      [
        client,
        businessDescription,
        salesGoal,
        systemInstructions,
        knowledge,
        tone,
        language,
        timezone,
        ownerWhatsapp,
        JSON.stringify(capabilities || {}),
        JSON.stringify(businessRules || {}),
        JSON.stringify(deliveryRules || {}),
        JSON.stringify(paymentRules || {}),
      ]
    );

    await dbClient.query(
      `INSERT INTO onboarding (client_id, commercial_status)
       VALUES ($1, 'COMPLETE')`,
      [client]
    );

    await dbClient.query("COMMIT");
    return getClientById(client);
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
}

async function updateClientConfig(clientId, patch = {}) {
  if (!dbEnabled()) throw new Error("DATABASE_URL is required.");

  const current = await getClientById(clientId);
  if (!current) throw new Error("Client not found.");

  const fields = {
    businessDescription: "business_description",
    salesGoal: "sales_goal",
    systemInstructions: "system_instructions",
    knowledge: "knowledge",
    tone: "tone",
    language: "language",
    timezone: "timezone",
    ownerWhatsapp: "owner_whatsapp",
    capabilities: "capabilities",
    businessRules: "business_rules",
    deliveryRules: "delivery_rules",
    paymentRules: "payment_rules",
  };

  const setters = [];
  const values = [];
  let index = 1;

  for (const [inputKey, column] of Object.entries(fields)) {
    if (patch[inputKey] === undefined) continue;
    let value = patch[inputKey];

    if (["capabilities", "businessRules", "deliveryRules", "paymentRules"].includes(inputKey)) {
      value = JSON.stringify(value || {});
      setters.push(`${column} = $${index}::jsonb`);
    } else {
      setters.push(`${column} = $${index}`);
    }

    values.push(value);
    index += 1;
  }

  if (!setters.length) return current;

  values.push(clientId);
  await query(
    `UPDATE client_configurations
        SET ${setters.join(", ")}, updated_at = NOW()
      WHERE client_id = $${index}`,
    values
  );

  return getClientById(clientId);
}

async function saveWhatsappConnection({
  clientId,
  wabaId = "",
  phoneNumberId,
  displayPhoneNumber = "",
  verifiedName = "",
  accessToken,
}) {
  if (!dbEnabled()) throw new Error("DATABASE_URL is required.");
  if (!phoneNumberId || !accessToken) throw new Error("phoneNumberId and accessToken are required.");

  const encrypted = encryptSecret(accessToken);

  const result = await query(
    `INSERT INTO whatsapp_connections
       (client_id, waba_id, phone_number_id, display_phone_number, verified_name,
        access_token_encrypted, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
     ON CONFLICT (phone_number_id)
     DO UPDATE SET client_id = EXCLUDED.client_id,
                   waba_id = EXCLUDED.waba_id,
                   display_phone_number = EXCLUDED.display_phone_number,
                   verified_name = EXCLUDED.verified_name,
                   access_token_encrypted = EXCLUDED.access_token_encrypted,
                   status = 'ACTIVE',
                   updated_at = NOW()
     RETURNING client_id, waba_id, phone_number_id, display_phone_number, verified_name, status`,
    [clientId, wabaId, phoneNumberId, displayPhoneNumber, verifiedName, encrypted]
  );

  await query(
    `UPDATE onboarding
        SET meta_status = 'COMPLETE',
            whatsapp_status = 'COMPLETE',
            updated_at = NOW()
      WHERE client_id = $1`,
    [clientId]
  );

  return result?.rows?.[0] || null;
}

async function getOnboarding(clientId) {
  const result = await query(
    `SELECT * FROM onboarding WHERE client_id = $1`,
    [clientId]
  );
  return result?.rows?.[0] || null;
}

async function createProduct(clientId, product = {}) {
  if (!dbEnabled()) throw new Error("DATABASE_URL is required.");
  if (!product.name) throw new Error("product.name is required.");

  const result = await query(
    `INSERT INTO products
      (client_id, sku, name, description, price, currency, stock, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      clientId,
      product.sku || null,
      product.name,
      product.description || null,
      product.price ?? null,
      product.currency || "KES",
      product.stock ?? null,
      product.status || "ACTIVE",
      JSON.stringify(product.metadata || {}),
    ]
  );

  return result?.rows?.[0] || null;
}

module.exports = {
  dbEnabled,
  initDatabase,
  listClients,
  getClientById,
  getClientByPhoneNumberId,
  getConversation,
  claimInboundMessage,
  recordOutboundMessage,
  markConversationWelcomed,
  createClient,
  updateClientConfig,
  saveWhatsappConnection,
  getOnboarding,
  createProduct,
};
