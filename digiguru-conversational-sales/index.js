// DigiGuru WhatsApp bot. Node 18+, Express, WhatsApp Cloud API, Anthropic API.
const express = require("express");
const crypto = require("crypto");
const KNOWLEDGE = require("./knowledge/digiguru");

const {
  ANTHROPIC_API_KEY, ANTHROPIC_MODEL = "claude-haiku-4-5-20251001",
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN, APP_SECRET, OWNER_WHATSAPP,
  LLM_PROVIDER = "groq", GROQ_API_KEY, GROQ_MODEL = "llama-3.3-70b-versatile",
  PORT = 3000,
} = process.env;

const SYSTEM = `You are the DigiGuru Concierge on WhatsApp. You represent DigiGuru using ONLY the facts below.

STYLE
- Simple, clear English by default. If the person writes in Kiswahili, Sheng or another language, understand it and reply in that language, still in simple words.
- Short messages, 1 to 4 sentences. One question at a time. Warm, direct, commercial. No jargon, no hype, no emojis spam.
- Never use hyphens or dashes to join sentences.

GOAL
Help the visitor see where their leads are being lost and whether DigiGuru fits. Naturally find out: their business type, where their leads come from (Meta, TikTok, Google, referrals, walk-ins), how enquiries are handled today, and what goes wrong. Reflect back a short diagnosis in plain words. Then offer a call with Robin.

BOOKING
You cannot see Robin's calendar. To arrange a call, collect the visitor's name, business, and preferred day and time, then say Robin will confirm shortly. Never promise a confirmed slot.

RULES
- Never invent prices, statistics, results, clients, testimonials, integrations or timelines. If you do not know, say so and offer to pass it to Robin.
- If the visitor asks for a human, is upset, or you are unsure, hand off.
- Stay on DigiGuru and the visitor's business. Politely decline unrelated requests.

ACTION MARKERS (invisible to the visitor, put at the very end of your reply, only when needed)
- When you have name, business and a preferred time: [[NOTIFY: BOOKING | name | business | preferred time | one line summary of their leak]]
- When handing off: [[NOTIFY: HANDOFF | name if known | reason | one line summary]]

KNOWLEDGE
${KNOWLEDGE}`;

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.raw = buf; } }));

const history = new Map();  // phone -> [{role, content}]  (in memory, resets on restart)
const seen = new Set();     // processed message ids (dedupe webhook retries)
const MAX_TURNS = 20;

app.get("/health", (_req, res) => res.send("ok")); // point a free uptime pinger here

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN)
    return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

function validSignature(req) {
  if (!APP_SECRET) return true; // set APP_SECRET in production
  const sig = (req.get("x-hub-signature-256") || "").replace("sha256=", "");
  const mac = crypto.createHmac("sha256", APP_SECRET).update(req.raw || "").digest("hex");
  return sig.length === mac.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac));
}

app.post("/webhook", (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // acknowledge fast, process after
  const msgs = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
  msgs.forEach((m) => handle(m).catch((e) => console.error("handle error", e.message)));
});

async function handle(m) {
  if (seen.has(m.id)) return;
  seen.add(m.id); if (seen.size > 2000) seen.clear();
  const from = m.from;
  if (m.type !== "text") return send(from, "I can read text messages for now. Please type your question and I will help.");

  const turns = history.get(from) || [];
  turns.push({ role: "user", content: m.text.body });
  const reply = await askClaude(turns);
  turns.push({ role: "assistant", content: reply });
  history.set(from, turns.slice(-MAX_TURNS));

  const match = reply.match(/\[\[NOTIFY:([\s\S]*?)\]\]/);
  const clean = reply.replace(/\[\[NOTIFY:[\s\S]*?\]\]/g, "").trim();
  await send(from, clean);
  if (match) await notifyOwner(from, match[1].trim());
}

async function askClaude(messages) {
  try {
    if (LLM_PROVIDER === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 400, system: SYSTEM, messages }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(d));
      return d.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    }
    // Default: Groq (free tier, OpenAI style API, runs Llama)
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 400, temperature: 0.4, messages: [{ role: "system", content: SYSTEM }, ...messages] }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(d));
    return d.choices[0].message.content;
  } catch (e) {
    console.error("llm error", e.message);
    return "Sorry, I had a small hiccup. Robin from DigiGuru will follow up with you shortly.";
  }
}

async function send(to, body) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  if (!r.ok) console.error("whatsapp send", r.status, await r.text());
}

async function notifyOwner(from, info) {
  const text = `DigiGuru bot alert\nFrom: +${from}\n${info}\n\nReply to them directly: https://wa.me/${from}`;
  console.log(text); // always logged, so nothing is lost if WhatsApp refuses
  if (OWNER_WHATSAPP) await send(OWNER_WHATSAPP, text);
}

app.listen(PORT, () => console.log("DigiGuru bot listening on", PORT));
