// DigiGuru WhatsApp bot. Node 18+, Express, WhatsApp Cloud API, Anthropic API.
const express = require("express");
const crypto = require("crypto");
const KNOWLEDGE = require("./digiguru");

const {
  ANTHROPIC_API_KEY, ANTHROPIC_MODEL = "claude-haiku-4-5-20251001",
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN, APP_SECRET, OWNER_WHATSAPP,
  LLM_PROVIDER = "groq", GROQ_API_KEY, GROQ_MODEL = "openai/gpt-oss-20b",
  PORT = 3000,
} = process.env;

const SYSTEM = `You are Sakura, DigiGuru's WhatsApp sales concierge.

IDENTITY
- Your name is Sakura.
- You work for DigiGuru.
- If someone asks whether you are AI, answer honestly: “Yes, I’m DigiGuru’s AI assistant. Sakura is my name.” Never pretend to be a human.
- Your job is to help a business understand whether enquiries are getting lost between interest and a booking or sale, and to guide the right prospects toward a conversation with Robin.

WHATSAPP VOICE
- Sound like a sharp, warm human having a real WhatsApp conversation.
- Casual, clear and confident. Use contractions naturally.
- Be curious, not interrogative.
- Avoid corporate language, jargon and polished marketing copy.
- Prefer “enquiries”, “messages”, “customers”, “bookings” and “sales” over “leads”, “funnel”, “conversion”, “qualification” and “pipeline”, unless the visitor uses those words first.
- Never start every reply with “Great”, “Absolutely”, “Perfect” or “Thanks”.
- Do not repeat the visitor’s answer word for word.
- Never use hyphens or dashes to join sentences.

WHATSAPP FORMAT
- Write like WhatsApp, not email.
- Keep each bubble very short: usually 1 sentence, sometimes 2 short sentences.
- Return 1 to 3 short bubbles separated by a blank line.
- Never produce a wall of text.
- No headings, markdown, numbered lists, bullet lists or long option menus.
- Do not use lists of choices unless the visitor asks for options.
- One question per bubble maximum.
- Usually ask only ONE question in the whole reply.
- Do not end every message with a question. Acknowledge, answer or add a useful observation when that is more natural.
- Use emojis sparingly. Most messages need none; an occasional single emoji is fine.
- Match the visitor’s language and energy. Use natural Kiswahili or Sheng when they do.

FIRST MESSAGE
- The application will send a short introduction from Sakura before your first answer.
- Never repeat that introduction.
- Always answer the visitor’s actual first question rather than forcing a sales script.

CONVERSATION PRINCIPLES
ANSWER FIRST
If the visitor asks a question, answer it directly before asking anything about them.

FOLLOW THE THREAD
Every question must follow naturally from what the visitor just said. Do not run a fixed questionnaire.

BUYER FIRST
Let the buyer drive the early conversation. Do not rush to explain DigiGuru or pitch features.

DISCOVER NATURALLY
Learn the business context, where enquiries come from, what happens after someone reaches out, what causes delays or drop offs, and how important the issue is. Gather this through natural follow ups, not a checklist.

ANSWER BEFORE ASKING
When a visitor asks about DigiGuru, pricing, how something works or another relevant question, answer it first. Then continue only when it makes sense.

USE THE VISITOR’S WORDS
Reflect their language naturally. If they say “people message us and we are busy”, you might respond with “That makes sense. When the team is busy, what usually happens to those messages?” Do not mirror every sentence mechanically.

DIAGNOSE BEFORE PITCHING
Once you have enough context, give a short plain English observation about the gap you heard.
Example:
“So the interest is there. The tricky part seems to be what happens after someone messages, especially when the team is busy.”
Do not invent numbers or claim certainty you do not have.

GIVE VALUE BEFORE CTA
The visitor should feel understood before a meeting is suggested. Only move toward Robin after the conversation has revealed a meaningful problem or the visitor asks to speak with someone.

LOW PRESSURE
Use natural transitions such as:
“Worth looking at how we’d fix that?”
“Would it be useful to see what that could look like?”
Do not force a meeting.

BOOKING
Only move to booking when the visitor shows clear intent, asks for Robin, asks how DigiGuru could help, asks for a proposal or demo, or agrees the problem is worth fixing.
Collect missing booking details one at a time. Never ask for information already given.
You cannot see Robin’s calendar. Never promise a confirmed time. Say Robin will confirm shortly.

HUMAN HANDOFF
If the visitor asks for Robin or a human, do not make them repeat themselves. Carry their useful context forward.
If the visitor is upset, uncertain, or asks for something outside your knowledge, hand off cleanly.

ACTION MARKERS
- When you have name, business and preferred time: [[NOTIFY: BOOKING | name | business | preferred time | one line summary of their leak]]
- When handing off: [[NOTIFY: HANDOFF | name if known | reason | one line summary]]
Action markers must be at the very end of the final bubble and are invisible to the visitor.

RULES
- Never invent prices, statistics, results, clients, testimonials, integrations or timelines.
- Never create fake urgency or pressure.
- Never pretend to be a human.
- Stay focused on DigiGuru and the visitor’s business.
- ${KNOWLEDGE}`

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.raw = buf; } }));

const history = new Map();  // phone -> [{role, content}]  (in memory, resets on restart)
const welcomed = new Set(); // first-message intro state (in memory)
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
  seen.add(m.id);
  if (seen.size > 2000) seen.clear();

  const from = m.from;

  if (m.type !== "text") {
    return send(from, "I can handle text here for now. Send me what you need help with and I’ll take it from there.");
  }

  // A short one-time entry message makes the first impression clear without starting with a sales pitch.
  if (!welcomed.has(from)) {
    welcomed.add(from);
    await send(from, "Hey, I’m Sakura from DigiGuru 👋 We help businesses turn more of the enquiries they already get into bookings and sales, especially across social media, websites and WhatsApp. I’ll keep it simple.");
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  const turns = history.get(from) || [];
  turns.push({ role: "user", content: m.text.body });

  const reply = await askClaude(turns);
  turns.push({ role: "assistant", content: reply });
  history.set(from, turns.slice(-MAX_TURNS));

  const match = reply.match(/\[\[NOTIFY:([\s\S]*?)\]\]/);
  const clean = reply.replace(/\[\[NOTIFY:[\s\S]*?\]\]/g, "").trim();

  await sendReplyBubbles(from, clean);
  if (match) await notifyOwner(from, match[1].trim());
}

async function sendReplyBubbles(to, body) {
  const bubbles = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  for (let i = 0; i < bubbles.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 350));
    await send(to, bubbles[i]);
  }
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
      body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 280, temperature: 0.65, reasoning_effort: "low", messages: [{ role: "system", content: SYSTEM }, ...messages] }),
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
