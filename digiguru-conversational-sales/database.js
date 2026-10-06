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

const memoryClients = new Map();
const memoryConfigs = new Map();
const memoryOnboarding = new Map();
const memoryOnboardingTokens = new Map();
const memoryWhatsapp = new Map();
const memoryProducts = new Map();
const memoryConversations = new Map();
const memoryMessages = new Map();
const memoryMessageIds = new Set();

function seedMemoryClients() {
  if (memoryClients.size) return;

  const seed = [
    {
      clientId: "digiguru-demo",
      businessName: "DigiGuru",
      industry: "Conversational Sales Systems",
      status: "ACTIVE",
      isDemo: true,
      salesGoal: "Turn customer interest into qualified conversations and bookings.",
      businessDescription: "DigiGuru builds customized conversational sales systems.",
    },
    {
      clientId: "noka-foods",
      businessName: "Noka Foods",
      industry: "Food / Ecommerce",
      status: "PROSPECT",
      isDemo: false,
      salesGoal: "Increase completed WhatsApp orders.",
      businessDescription: "Prospective DigiGuru client.",
    },
    {
      clientId: "eish-accessories",
      businessName: "Eish Accessories",
      industry: "Services / Lead Generation",
      status: "PROSPECT",
      isDemo: false,
      salesGoal: "Respond faster and convert more enquiries.",
      businessDescription: "Prospective DigiGuru client.",
    },
    {
      clientId: "reila-kids-furniture",
      businessName: "Reila Kids Furniture",
      industry: "Furniture / Ecommerce",
      status: "PROSPECT",
      isDemo: false,
      salesGoal: "Turn product page interest into WhatsApp conversations and orders.",
      businessDescription: "Prospective DigiGuru client.",
    },
  ];

  for (const client of seed) {
    memoryClients.set(client.clientId, {
      ...client,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    memoryConfigs.set(client.clientId, {
      clientId: client.clientId,
      businessDescription: client.businessDescription,
      salesGoal: client.salesGoal,
      systemInstructions: "",
      knowledge: "",
      tone: "warm, natural and professional",
      language: "English",
      timezone: "Africa/Nairobi",
      ownerWhatsapp: process.env.OWNER_WHATSAPP || "",
      capabilities: client.clientId === "digiguru-demo" ? { booking: true } : {},
      businessRules: {},
      deliveryRules: {},
      paymentRules: {},
    });

    const empty = "NOT_STARTED";
    memoryOnboarding.set(client.clientId, {
      client_id: client.clientId,
      commercial_status: client.clientId === "digiguru-demo" ? "COMPLETE" : empty,
      discovery_status: empty,
      meta_status: empty,
      whatsapp_status: empty,
      data_status: empty,
      conversation_status: empty,
      integration_status: empty,
      testing_status: empty,
      approval_status: empty,
      go_live_status: client.clientId === "digiguru-demo" ? "COMPLETE" : empty,
    });
  }
}

function memoryClientRow(clientId) {
  const client = memoryClients.get(clientId);
  if (!client) return null;
  const cfg = memoryConfigs.get(clientId) || {};
  const onboarding = memoryOnboarding.get(clientId) || {};
  return {
    client_id: client.clientId,
    business_name: client.businessName,
    industry: client.industry,
    status: client.status,
    is_demo: client.isDemo,
    created_at: client.createdAt,
    updated_at: client.updatedAt,
    business_description: cfg.businessDescription || "",
    sales_goal: cfg.salesGoal || "",
    system_instructions: cfg.systemInstructions || "",
    knowledge: cfg.knowledge || "",
    tone: cfg.tone || "",
    language: cfg.language || "",
    timezone: cfg.timezone || "Africa/Nairobi",
    owner_whatsapp: cfg.ownerWhatsapp || "",
    capabilities: cfg.capabilities || {},
    business_rules: cfg.businessRules || {},
    delivery_rules: cfg.deliveryRules || {},
    payment_rules: cfg.paymentRules || {},
    ...onboarding,
  };
}

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
    seedMemoryClients();
    console.log("DATABASE_URL not configured. DigiGuru staging is using in-memory fallback state.");
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

  const prospects = [
    ['noka-foods', 'Noka Foods', 'Food / Ecommerce', 'Increase completed WhatsApp orders.', 'Prospective DigiGuru client.'],
    ['eish-accessories', 'Eish Accessories', 'Services / Lead Generation', 'Respond faster and convert more enquiries.', 'Prospective DigiGuru client.'],
    ['reila-kids-furniture', 'Reila Kids Furniture', 'Furniture / Ecommerce', 'Turn product page interest into WhatsApp conversations and orders.', 'Prospective DigiGuru client.'],
  ];

  for (const [clientId, businessName, industry, salesGoal, businessDescription] of prospects) {
    await pool.query(
      `INSERT INTO clients (client_id, business_name, industry, status, is_demo)
       VALUES ($1, $2, $3, 'PROSPECT', FALSE)
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId, businessName, industry]
    );

    await pool.query(
      `INSERT INTO client_configurations
        (client_id, business_description, sales_goal, timezone, capabilities)
       VALUES ($1, $2, $3, 'Africa/Nairobi', '{}'::jsonb)
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId, businessDescription, salesGoal]
    );

    await pool.query(
      `INSERT INTO onboarding (client_id)
       VALUES ($1)
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId]
    );
  }

  console.log("DigiGuru multi-client database ready.");
  return true;
}

async function listClients() {
  if (!pool) {
    seedMemoryClients();
    return [...memoryClients.keys()].map(memoryClientRow).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

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
  if (!pool) {
    seedMemoryClients();
    return memoryClientRow(clientId);
  }

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

  if (!pool) {
    seedMemoryClients();
    for (const [clientId, connection] of memoryWhatsapp.entries()) {
      if (connection.phone_number_id === phoneNumberId && connection.status === "ACTIVE") {
        return {
          ...memoryClientRow(clientId),
          waba_id: connection.waba_id || "",
          phone_number_id: connection.phone_number_id,
          display_phone_number: connection.display_phone_number || "",
          verified_name: connection.verified_name || "",
          access_token: connection.access_token || "",
        };
      }
    }
    return null;
  }

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
  if (!pool) {
    seedMemoryClients();
    const key = `${clientId}:${customerPhone}`;
    if (!memoryConversations.has(key)) {
      memoryConversations.set(key, {
        id: key,
        client_id: clientId,
        customer_phone: customerPhone,
        stage: "NEW",
        welcomed: false,
      });
      memoryMessages.set(key, []);
    }
    return memoryConversations.get(key);
  }

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

  if (!pool) {
    const history = (memoryMessages.get(conversation.id) || [])
      .slice(-historyLimit)
      .map((row) => ({ role: row.role, content: row.content }));

    return { ...conversation, history };
  }

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

  if (!pool) {
    if (waMessageId && memoryMessageIds.has(waMessageId)) return false;
    if (waMessageId) memoryMessageIds.add(waMessageId);
    const rows = memoryMessages.get(conversation.id) || [];
    rows.push({ role: "user", content, created_at: new Date().toISOString() });
    memoryMessages.set(conversation.id, rows);
    return true;
  }

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

  if (!pool) {
    const rows = memoryMessages.get(conversation.id) || [];
    rows.push({ role: "assistant", content, created_at: new Date().toISOString() });
    memoryMessages.set(conversation.id, rows);
    return;
  }

  await query(
    `INSERT INTO messages
       (client_id, conversation_id, direction, role, content)
     VALUES ($1, $2, 'OUTBOUND', 'assistant', $3)`,
    [clientId, conversation.id, content]
  );
}

async function markConversationWelcomed(clientId, customerPhone) {
  if (!pool) {
    const conversation = await ensureConversation(clientId, customerPhone);
    conversation.welcomed = true;
    return;
  }

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
  const client = String(clientId || "").trim();
  const name = String(businessName || "").trim();

  if (!/^[a-z0-9][a-z0-9_-]{2,49}$/i.test(client)) {
    throw new Error("clientId must be 3 to 50 characters using letters, numbers, underscores or hyphens.");
  }
  if (!name) throw new Error("businessName is required.");

  if (!pool) {
    seedMemoryClients();
    if (memoryClients.has(client)) throw new Error("A client with this ID already exists.");

    const now = new Date().toISOString();
    memoryClients.set(client, {
      clientId: client,
      businessName: name,
      industry: industry || "",
      status: "PROSPECT",
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    });

    memoryConfigs.set(client, {
      clientId: client,
      businessDescription,
      salesGoal,
      systemInstructions,
      knowledge,
      tone,
      language,
      timezone,
      ownerWhatsapp,
      capabilities: capabilities || {},
      businessRules: businessRules || {},
      deliveryRules: deliveryRules || {},
      paymentRules: paymentRules || {},
    });

    memoryOnboarding.set(client, {
      client_id: client,
      commercial_status: "NOT_STARTED",
      discovery_status: "NOT_STARTED",
      meta_status: "NOT_STARTED",
      whatsapp_status: "NOT_STARTED",
      data_status: "NOT_STARTED",
      conversation_status: "NOT_STARTED",
      integration_status: "NOT_STARTED",
      testing_status: "NOT_STARTED",
      approval_status: "NOT_STARTED",
      go_live_status: "NOT_STARTED",
    });

    return memoryClientRow(client);
  }

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
      `INSERT INTO onboarding (client_id)
       VALUES ($1)`,
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
  const current = await getClientById(clientId);
  if (!current) throw new Error("Client not found.");

  if (!pool) {
    const config = memoryConfigs.get(clientId);
    if (!config) throw new Error("Client not found.");

    const mapping = {
      businessDescription: "businessDescription",
      salesGoal: "salesGoal",
      systemInstructions: "systemInstructions",
      knowledge: "knowledge",
      tone: "tone",
      language: "language",
      timezone: "timezone",
      ownerWhatsapp: "ownerWhatsapp",
      capabilities: "capabilities",
      businessRules: "businessRules",
      deliveryRules: "deliveryRules",
      paymentRules: "paymentRules",
    };

    for (const [key, value] of Object.entries(patch)) {
      if (mapping[key]) config[mapping[key]] = value;
    }
    return memoryClientRow(clientId);
  }

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
  if (!phoneNumberId || !accessToken) throw new Error("phoneNumberId and accessToken are required.");

  if (!pool) {
    seedMemoryClients();
    if (!memoryClients.has(clientId)) throw new Error("Client not found.");
    const row = {
      client_id: clientId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      verified_name: verifiedName,
      access_token,
      status: "ACTIVE",
    };
    memoryWhatsapp.set(clientId, row);
    const onboarding = memoryOnboarding.get(clientId);
    if (onboarding) {
      onboarding.meta_status = "COMPLETE";
      onboarding.whatsapp_status = "COMPLETE";
    }
    return {
      client_id: clientId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      verified_name: verifiedName,
      status: "ACTIVE",
    };
  }

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
  if (!pool) {
    seedMemoryClients();
    return memoryOnboarding.get(clientId) || null;
  }

  const result = await query(
    `SELECT * FROM onboarding WHERE client_id = $1`,
    [clientId]
  );
  return result?.rows?.[0] || null;
}

function hashOnboardingToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function onboardingPayload(row) {
  if (!row) return null;
  return {
    clientId: row.client_id,
    businessName: row.business_name,
    industry: row.industry || "",
    status: row.status || "",
    contactName: row.contact_name || "",
    contactEmail: row.contact_email || "",
    submittedAt: row.submitted_at || null,
    intake: row.intake_data || {},
  };
}

async function createOnboardingLink(clientId) {
  const client = await getClientById(clientId);
  if (!client) throw new Error("Client not found.");
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = hashOnboardingToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (!pool) {
    seedMemoryClients();
    const row = memoryOnboarding.get(clientId);
    if (!row) throw new Error("Onboarding record not found.");
    row.access_token_hash = hash;
    row.access_token_created_at = createdAt.toISOString();
    row.access_token_expires_at = expiresAt.toISOString();
    memoryOnboardingTokens.set(hash, clientId);
  } else {
    await query("UPDATE onboarding SET access_token_hash = $1, access_token_created_at = $2, access_token_expires_at = $3, updated_at = NOW() WHERE client_id = $4", [hash, createdAt, expiresAt, clientId]);
  }
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    onboardingUrl: `/onboarding/${token}`,
    client: {clientId: client.client_id, businessName: client.business_name, industry: client.industry || ""},
  };
}

async function getPublicOnboarding(token) {
  const hash = hashOnboardingToken(token);
  let row = null;
  if (!pool) {
    seedMemoryClients();
    const clientId = memoryOnboardingTokens.get(hash);
    if (!clientId) return null;
    const onboarding = memoryOnboarding.get(clientId);
    const client = memoryClientRow(clientId);
    if (!onboarding || !client) return null;
    if (onboarding.access_token_expires_at && new Date(onboarding.access_token_expires_at) < new Date()) return null;
    row = {...onboarding, client_id: client.client_id, business_name: client.business_name, industry: client.industry, status: client.status, intake_data: onboarding.intake_data || {}};
  } else {
    const result = await query("SELECT c.client_id, c.business_name, c.industry, c.status, o.contact_name, o.contact_email, o.intake_data, o.submitted_at, o.access_token_expires_at FROM onboarding o JOIN clients c ON c.client_id = o.client_id WHERE o.access_token_hash = $1", [hash]);
    row = result?.rows?.[0] || null;
    if (row?.access_token_expires_at && new Date(row.access_token_expires_at) < new Date()) row = null;
  }
  return onboardingPayload(row);
}

function buildOnboardingKnowledge(intake) {
  const labels = {website:"Website", location:"Location / service area", discovery:"How customers find the business", currentJourney:"What happens after an enquiry", commonQuestions:"Common customer questions", friction:"Current friction or opportunity", desiredOutcome:"Desired outcome", productsServices:"Products or services", delivery:"Delivery / service rules", payment:"Payment rules", refunds:"Refund / cancellation rules", handoff:"Human handoff rules", channels:"Existing channels", integrations:"Existing tools / integrations", notes:"Additional notes"};
  return Object.entries(labels).filter(([key]) => String(intake?.[key] || "").trim()).map(([key,label]) => `${label}: ${String(intake[key]).trim()}`).join("\n");
}

async function updatePublicOnboarding(token, payload = {}, submit = false) {
  const hash = hashOnboardingToken(token);
  const safe = payload && typeof payload === "object" ? payload : {};
  const intake = safe.intake && typeof safe.intake === "object" ? safe.intake : {};
  if (!pool) {
    seedMemoryClients();
    const clientId = memoryOnboardingTokens.get(hash);
    if (!clientId) throw new Error("Onboarding link is invalid or expired.");
    const onboarding = memoryOnboarding.get(clientId);
    const client = memoryClients.get(clientId);
    if (!onboarding || !client) throw new Error("Onboarding record not found.");
    if (onboarding.access_token_expires_at && new Date(onboarding.access_token_expires_at) < new Date()) throw new Error("Onboarding link has expired.");
    onboarding.contact_name = String(safe.contactName || "").trim();
    onboarding.contact_email = String(safe.contactEmail || "").trim();
    onboarding.intake_data = {...(onboarding.intake_data || {}), ...intake};
    if (submit) onboarding.submitted_at = new Date().toISOString();
    onboarding.data_status = Object.keys(onboarding.intake_data).length ? "COMPLETE" : "NOT_STARTED";
    onboarding.discovery_status = onboarding.intake_data.discovery || onboarding.intake_data.currentJourney || onboarding.intake_data.friction ? "COMPLETE" : onboarding.discovery_status;
    onboarding.conversation_status = onboarding.intake_data.tone || onboarding.intake_data.handoff ? "COMPLETE" : onboarding.conversation_status;
    onboarding.integration_status = onboarding.intake_data.integrations ? "COMPLETE" : onboarding.integration_status;
    if (submit) onboarding.approval_status = "PENDING_REVIEW";
    const config = memoryConfigs.get(clientId) || {};
    config.businessDescription = String(safe.businessDescription || config.businessDescription || "");
    config.salesGoal = String(safe.salesGoal || config.salesGoal || "");
    config.tone = String(safe.tone || config.tone || "warm, natural and professional");
    config.language = String(safe.language || config.language || "English");
    config.timezone = String(safe.timezone || config.timezone || "Africa/Nairobi");
    config.ownerWhatsapp = String(safe.ownerWhatsapp || config.ownerWhatsapp || "");
    config.knowledge = buildOnboardingKnowledge(onboarding.intake_data);
    config.capabilities = {...(config.capabilities || {}), ...(onboarding.intake_data.capabilities || {})};
    config.businessRules = {...(config.businessRules || {}), handoff: onboarding.intake_data.handoff || "", delivery: onboarding.intake_data.delivery || "", payment: onboarding.intake_data.payment || "", refunds: onboarding.intake_data.refunds || ""};
    config.deliveryRules = {...(config.deliveryRules || {}), summary: onboarding.intake_data.delivery || ""};
    config.paymentRules = {...(config.paymentRules || {}), summary: onboarding.intake_data.payment || ""};
    memoryConfigs.set(clientId, config);
    return onboardingPayload({...onboarding, client_id: client.clientId, business_name: client.businessName, industry: client.industry, status: client.status});
  }
  const currentResult = await query("SELECT c.client_id, c.business_name, c.industry, c.status, o.intake_data, o.access_token_expires_at FROM onboarding o JOIN clients c ON c.client_id = o.client_id WHERE o.access_token_hash = $1", [hash]);
  const current = currentResult?.rows?.[0];
  if (!current) throw new Error("Onboarding link is invalid or expired.");
  if (current.access_token_expires_at && new Date(current.access_token_expires_at) < new Date()) throw new Error("Onboarding link has expired.");
  const mergedIntake = {...(current.intake_data || {}), ...intake};
  await query("UPDATE onboarding SET contact_name = COALESCE(NULLIF($1, ''), contact_name), contact_email = COALESCE(NULLIF($2, ''), contact_email), intake_data = $3::jsonb, discovery_status = CASE WHEN $4 THEN 'COMPLETE' ELSE discovery_status END, data_status = CASE WHEN $5 THEN 'COMPLETE' ELSE data_status END, conversation_status = CASE WHEN $6 THEN 'COMPLETE' ELSE conversation_status END, integration_status = CASE WHEN $7 THEN 'COMPLETE' ELSE integration_status END, submitted_at = CASE WHEN $8 THEN NOW() ELSE submitted_at END, approval_status = CASE WHEN $8 THEN 'PENDING_REVIEW' ELSE approval_status END, updated_at = NOW() WHERE client_id = $9", [String(safe.contactName || ""), String(safe.contactEmail || ""), JSON.stringify(mergedIntake), Boolean(mergedIntake.discovery || mergedIntake.currentJourney || mergedIntake.friction), Object.keys(mergedIntake).length > 0, Boolean(safe.tone || mergedIntake.handoff), Boolean(mergedIntake.integrations), submit, current.client_id]);
  await query("UPDATE client_configurations SET business_description = COALESCE(NULLIF($1, ''), business_description), sales_goal = COALESCE(NULLIF($2, ''), sales_goal), tone = COALESCE(NULLIF($3, ''), tone), language = COALESCE(NULLIF($4, ''), language), timezone = COALESCE(NULLIF($5, ''), timezone), owner_whatsapp = COALESCE(NULLIF($6, ''), owner_whatsapp), knowledge = $7, capabilities = $8::jsonb, business_rules = jsonb_build_object('delivery', NULLIF($9, ''), 'payment', NULLIF($10, ''), 'refunds', NULLIF($11, ''), 'handoff', NULLIF($12, '')), delivery_rules = jsonb_build_object('summary', NULLIF($9, '')), payment_rules = jsonb_build_object('summary', NULLIF($10, '')), updated_at = NOW() WHERE client_id = $13", [String(safe.businessDescription || ""), String(safe.salesGoal || ""), String(safe.tone || ""), String(safe.language || ""), String(safe.timezone || ""), String(safe.ownerWhatsapp || ""), buildOnboardingKnowledge(mergedIntake), JSON.stringify(safe.capabilities || mergedIntake.capabilities || {}), String(mergedIntake.delivery || ""), String(mergedIntake.payment || ""), String(mergedIntake.refunds || ""), String(mergedIntake.handoff || ""), current.client_id]);
  return getPublicOnboarding(token);
}

async function updateOnboardingStatus(clientId, stage, status, internalNotes) {
  const allowedStages = new Set([
    "commercial_status","discovery_status","meta_status","whatsapp_status",
    "data_status","conversation_status","integration_status","testing_status",
    "approval_status","go_live_status"
  ]);
  const allowedStatuses = new Set([
    "NOT_STARTED","IN_PROGRESS","BLOCKED","PENDING_REVIEW","COMPLETE"
  ]);
  if (!allowedStages.has(stage)) throw new Error("Invalid onboarding stage.");
  if (!allowedStatuses.has(status)) throw new Error("Invalid onboarding status.");
  if (!pool) {
    seedMemoryClients();
    const row = memoryOnboarding.get(clientId);
    if (!row) throw new Error("Onboarding record not found.");
    row[stage] = status;
    if (internalNotes !== undefined) row.internal_notes = String(internalNotes || "");
    row.updated_at = new Date().toISOString();
    return row;
  }
  const fields = [stage + " = $1"];
  const values = [status];
  let index = 2;
  if (internalNotes !== undefined) {
    fields.push("internal_notes = $" + index);
    values.push(String(internalNotes || ""));
    index += 1;
  }
  values.push(clientId);
  const result = await query(
    "UPDATE onboarding SET " + fields.join(", ") + ", updated_at = NOW() WHERE client_id = $" + index + " RETURNING *",
    values
  );
  if (!result?.rows?.[0]) throw new Error("Onboarding record not found.");
  return result.rows[0];
}
async function createProduct(clientId, product = {}) {
  if (!product.name) throw new Error("product.name is required.");

  if (!pool) {
    seedMemoryClients();
    if (!memoryClients.has(clientId)) throw new Error("Client not found.");
    const key = `${clientId}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
    const row = {
      id: key,
      client_id: clientId,
      sku: product.sku || null,
      name: product.name,
      description: product.description || null,
      price: product.price ?? null,
      currency: product.currency || "KES",
      stock: product.stock ?? null,
      status: product.status || "ACTIVE",
      metadata: product.metadata || {},
    };
    memoryProducts.set(key, row);
    return row;
  }

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
  createOnboardingLink,
  getPublicOnboarding,
  updatePublicOnboarding,
  updateOnboardingStatus,
  createProduct,
};
