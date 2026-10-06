// DigiGuru WhatsApp bot. Node 18+, Express, WhatsApp Cloud API, Anthropic API.
const express = require("express");
const crypto = require("crypto");
const KNOWLEDGE = require("./digiguru");
const db = require("./database");
const { resolveClientContext, buildClientSystemPrompt } = require("./client-context");
const { google } = require("googleapis");

const {
  ANTHROPIC_API_KEY, ANTHROPIC_MODEL = "claude-haiku-4-5-20251001",
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN, APP_SECRET, OWNER_WHATSAPP,
  LLM_PROVIDER = "groq", GROQ_API_KEY, GROQ_MODEL = "openai/gpt-oss-20b",
  PORT = 3000,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
  GOOGLE_CALENDAR_ID = "primary",
  BOOKING_TIME_ZONE = "Africa/Nairobi",
  BOOKING_DURATION_MINUTES = "20",
  MEETING_NAME = "DigiGuru Growth Conversation",
  GOOGLE_REDIRECT_URI = "https://roby-s-salon-bot.onrender.com/google/oauth2callback",
} = process.env;

const BOOKING_DURATION = Number(BOOKING_DURATION_MINUTES);

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
- The visitor has reached DigiGuru through a social channel, website, advertisement, referral or WhatsApp.
- As soon as the visitor sends their FIRST message, the application sends a brief receptionist style welcome before continuing the conversation.
- The visitor should never need to type “Hi” just to trigger an introduction.
- Treat the visitor as an inbound prospect who has shown interest in DigiGuru.
- For a simple greeting, the application sends the welcome plus one natural first sales question and the AI reply is not used for that first greeting.
- For a substantive first message, the application sends the welcome first, then the AI responds directly to what the prospect asked or said and moves naturally toward the next sales stage.
- Never start a substantive AI reply with another generic introduction or “How can I help?” question.
- Never send a second introduction after the application has already introduced Sakura.

INBOUND SALES FLOW
The goal is not to chat indefinitely. Guide the prospect naturally from interest to a useful business conversation and, when there is a fit, to a 20 minute call with Robin.

STAGE 1: ESTABLISH CONTEXT
Understand who the prospect is and what business they are looking at DigiGuru for. Ask one useful question at a time.
Start with the business only when it is not already known.
Example: “Which business are you looking at this for?”

STAGE 2: UNDERSTAND THE CURRENT JOURNEY
Once you know the business, understand the path from attention to enquiry to sale.
Ask about the part of the journey that is still unknown. Do not ask every channel question automatically.
Examples:
“Where are most of your enquiries coming from at the moment?”
“When someone reaches out, what usually happens next?”
If the prospect has already told you enquiries mainly come from Instagram, do not ask again where enquiries come from. Go deeper into what happens after the Instagram message.

STAGE 3: FIND THE LEAK
Identify a real business problem only when the conversation supports it.
Look for missed messages, slow replies, repeated questions, unclear next steps, weak website conversion, inconsistent follow up, staff workload, or enquiries dropping between channels.

IMPORTANT:
- Do not manufacture a problem from normal customer behaviour.
- A customer taking time to reply is not automatically a business leak.
- If the prospect says they respond quickly and customers usually book or confirm, acknowledge that the current process is already working reasonably well.
- Do not keep digging simply because there are more questions you could ask.
- Once you understand the meaningful friction, stop discovery and move forward.
- If there is no obvious pain, shift from diagnosis to opportunity: show how DigiGuru could reduce manual work, keep the experience consistent, improve follow up, or connect channels without claiming that the business currently has a serious problem.

STAGE 4: EXPLAIN DIGIGURU IN CONTEXT
Once you have enough context, connect DigiGuru to the situation the prospect actually described.
Do not dump features or invent a problem.
Explain only the relevant part of the system: WhatsApp conversations, website conversations, social enquiries, follow up, bookings, handoff to staff, or connected business tools.

Use a conversational bridge:
“What you have in place already sounds solid. Where DigiGuru can add another layer is making that process less dependent on someone being available every time a customer reaches out.”

The goal is to make the prospect understand the business impact, not to prove that their current process is broken.

STAGE 5: CONFIRM INTEREST
Before asking for a meeting, check that the solution is relevant.
Examples:
“Would it be useful to show you what that could look like for your business?”
“Does that sound like the part you’d want fixed?”

STAGE 6: MOVE TO THE CALL
When the prospect shows interest, asks for pricing, wants a demo, asks how DigiGuru would work for them, or agrees the problem is worth fixing, move toward the 20 minute DigiGuru Growth Conversation with Robin.
Do not keep asking discovery questions after enough context has been gathered.
Collect booking details one at a time and use the calendar flow.

SALES CONVERSATION RULES
- Every reply should have one clear conversational purpose: answer, uncover one useful piece of context, explain the next relevant part of DigiGuru, or move toward the call.
- Never ask a question merely to keep the conversation alive.
- Never turn the conversation into an interview or questionnaire.
- Discovery should normally take only a few meaningful questions. Once you understand the business, enquiry source, current process and any real friction, move on.
- Do not manufacture pain. A healthy process is allowed to be healthy.
- Never frame ordinary customer behaviour as a “hiccup”, “leak”, “problem” or “issue” unless the prospect describes it as one.
- Never use multi-part menu questions such as “Do you X, Y, or Z?” Ask one focused question when clarification is genuinely necessary.
- Never stack two discovery questions in the same reply.
- Never ask the same question twice, including a rephrased version, when the prospect has already answered it.
- Never ask a question whose answer is already clear from the conversation history.
- If the prospect answers positively about their current process, acknowledge the strength before exploring any opportunity.
- If the prospect gives an ambiguous answer such as “Yes I do”, clarify only the specific point that matters instead of starting another chain of questions.
- If there is no obvious pain after reasonable discovery, stop probing and transition to the value DigiGuru can add.
- If the prospect is already highly interested, shorten discovery and move toward booking.
- If the prospect asks for pricing early, answer honestly that pricing depends on the business and that Robin can share exact pricing on the call, then continue toward booking.
- Before sending a reply, mentally check it for duplicated sentences, duplicated questions, invented pain, or multiple questions.
- The desired end state is a qualified conversation and booked call, not an open ended chat.

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
Once you have enough context, give a short plain English observation about what you heard.
Only describe a gap when the prospect actually described one.
If their current process is working well, say so.
Example when there is a real gap:
“So the interest is there. The tricky part seems to be what happens after someone messages, especially when the team is busy.”
Example when the process is already strong:
“Sounds like you already have a pretty direct booking process. The opportunity may be less about fixing a broken process and more about making that experience consistent even when the team is busy.”
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

The booking is for a 20 minute “DigiGuru Growth Conversation”.
Booking hours are Monday to Friday, 9:00 AM to 5:00 PM Africa/Nairobi.
The calendar is the final authority on availability.
DATE AND WEEK RULES:
- Always use the CURRENT DATE AND TIME supplied at runtime as the source of truth.
- Treat “today”, “tomorrow”, “this Wednesday”, “this Thursday”, “Friday”, “next week” and similar relative dates according to that current date.
- If the visitor asks for a day during the current week, keep it in the current week. Never move it to next week unless the visitor explicitly asks for next week or all remaining days this week are unavailable and you clearly say that.
- Never spontaneously suggest “next week” when there are still bookable days in the current week.
- When suggesting an alternative, prefer the nearest available time on the requested day or the nearest available working day, not a date in the following week.
- Never invent or silently change the visitor’s requested weekday or date.
- A phrase such as “tomorrow Wednesday” must resolve to the actual Wednesday immediately following the current date when the weekday matches.
Before asking for a time, you may ask for the prospect’s email so the calendar invitation can be sent.

When the visitor has chosen a day and time and you already know their name, business and email, convert the chosen time into an exact ISO 8601 datetime with the Africa/Nairobi offset (+03:00).
Then output this action marker at the very end of your reply:
[[BOOKING: name | business | email | YYYY-MM-DDTHH:mm:00+03:00 | one line summary of their leak]]
Do not output a BOOKING marker until the visitor has actually agreed to that time.
Never tell the visitor that the time is confirmed before the booking action succeeds.
After a successful booking, the application will send the actual confirmation.

HUMAN HANDOFF
If the visitor asks for Robin or a human, do not make them repeat themselves. Carry their useful context forward.
If the visitor is upset, uncertain, or asks for something outside your knowledge, hand off cleanly.

ACTION MARKERS
- Booking: [[BOOKING: name | business | email | YYYY-MM-DDTHH:mm:00+03:00 | one line summary]]
- Human handoff: [[NOTIFY: HANDOFF | name if known | reason | one line summary]]
Action markers must be at the very end of the final bubble and are invisible to the visitor.

RULES
- Never invent prices, statistics, results, clients, testimonials, integrations or timelines.
- Never create fake urgency or pressure.
- Never pretend to be a human.
- Stay focused on DigiGuru and the visitor’s business.
- Never say “I cannot see Robin’s calendar.” The application checks the calendar when a booking is ready.
- ${KNOWLEDGE}`

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.raw = buf; } }));

const history = new Map();  // fallback cache only when Postgres is not configured
const welcomed = new Set(); // fallback first-message state
const seen = new Set();     // fallback webhook dedupe when Postgres is not configured
const recentInbound = new Map(); // client:phone -> { text, at }
const processing = new Map(); // client:phone -> Promise serializes concurrent webhook events per prospect
const MAX_TURNS = 12;
const DUPLICATE_WINDOW_MS = 8000;

app.get("/health", (_req, res) => res.send("ok")); // point a free uptime pinger here

function requireAdmin(req, res, next) {
  const expected = process.env.DIGIGURU_ADMIN_TOKEN;
  if (!expected) return res.status(503).json({ error: "DIGIGURU_ADMIN_TOKEN is not configured." });
  if (req.get("x-digiguru-admin-token") !== expected) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

app.get("/api/internal/clients", requireAdmin, async (_req, res) => {
  try {
    res.json(await db.listClients());
  } catch (error) {
    console.error("list clients error", error.message);
    res.status(500).json({ error: "Unable to list clients." });
  }
});

app.post("/api/internal/clients", requireAdmin, async (req, res) => {
  try {
    const client = await db.createClient(req.body || {});
    res.status(201).json(client);
  } catch (error) {
    console.error("create client error", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/internal/clients/:clientId/config", requireAdmin, async (req, res) => {
  try {
    const client = await db.updateClientConfig(req.params.clientId, req.body || {});
    res.json(client);
  } catch (error) {
    console.error("update client config error", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/internal/clients/:clientId/whatsapp", requireAdmin, async (req, res) => {
  try {
    const connection = await db.saveWhatsappConnection({
      clientId: req.params.clientId,
      ...req.body,
    });
    res.status(201).json(connection);
  } catch (error) {
    console.error("save whatsapp connection error", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/internal/clients/:clientId/onboarding", requireAdmin, async (req, res) => {
  try {
    const onboarding = await db.getOnboarding(req.params.clientId);
    if (!onboarding) return res.status(404).json({ error: "Client onboarding record not found." });
    res.json(onboarding);
  } catch (error) {
    console.error("get onboarding error", error.message);
    res.status(500).json({ error: "Unable to retrieve onboarding." });
  }
});

app.post("/api/internal/clients/:clientId/products", requireAdmin, async (req, res) => {
  try {
    const product = await db.createProduct(req.params.clientId, req.body || {});
    res.status(201).json(product);
  } catch (error) {
    console.error("create product error", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.get("/google/auth", (_req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).send("Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render first.");
  }

  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  const state = crypto.createHmac("sha256", GOOGLE_CLIENT_SECRET).update("digiguru-google-oauth").digest("hex");

  const authorizationUrl = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    login_hint: "robinmigwi@gmail.com",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.events.freebusy",
    ],
    state,
  });

  res.redirect(authorizationUrl);
});

app.get("/google/oauth2callback", async (req, res) => {
  try {
    const expectedState = crypto.createHmac("sha256", GOOGLE_CLIENT_SECRET || "").update("digiguru-google-oauth").digest("hex");
    if (!req.query.state || req.query.state !== expectedState) {
      return res.status(400).send("Invalid Google OAuth state.");
    }
    if (!req.query.code) return res.status(400).send("Missing Google OAuth code.");

    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const { tokens } = await auth.getToken(req.query.code);

    if (!tokens.refresh_token) {
      return res.status(400).send("Google did not return a refresh token. Start again from /google/auth and approve access again.");
    }

    res.type("text/plain").send(
      "Google authorization successful.\n\n" +
      "Copy the refresh token below into Render as GOOGLE_REFRESH_TOKEN.\n\n" +
      tokens.refresh_token +
      "\n\nDo not paste this token into chat or GitHub."
    );
  } catch (error) {
    console.error("google oauth error", error.message);
    res.status(500).send("Google authorization failed. Check the Render logs for the reason.");
  }
});


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

  const value = req.body?.entry?.[0]?.changes?.[0]?.value || {};
  const metadata = value.metadata || {};
  const msgs = value.messages || [];

  msgs.forEach((m) =>
    handle(m, metadata).catch((e) => console.error("handle error", e.message))
  );
});

async function handle(m, metadata = {}) {
  const phoneNumberId = metadata.phone_number_id;
  const clientContext = await resolveClientContext(phoneNumberId);

  if (!clientContext) {
    console.error("No DigiGuru client is configured for WhatsApp phone_number_id:", phoneNumberId);
    return;
  }

  const clientId = clientContext.clientId;
  const from = m.from;
  const key = `${clientId}:${from}`;

  if (m.type !== "text") {
    return sendReplyBubbles(
      from,
      "I can handle text here for now. Send me what you need help with and I’ll take it from there.",
      clientContext.connection,
      clientId
    );
  }

  const userText = m.text.body.trim();
  const previous = recentInbound.get(key);
  const now = Date.now();

  if (previous && previous.text === userText && now - previous.at < DUPLICATE_WINDOW_MS) return;
  recentInbound.set(key, { text: userText, at: now });

  const previousProcessing = processing.get(key) || Promise.resolve();
  const currentProcessing = previousProcessing.then(async () => {
    const databaseEnabled = db.dbEnabled();

    // Decide whether the welcome has already been sent before claiming the webhook event.
    const existingConversation = databaseEnabled
      ? await db.getConversation(clientId, from)
      : null;

    const isFirstInbound = existingConversation
      ? !existingConversation.welcomed
      : !welcomed.has(key);

    if (isFirstInbound) {
      const welcome = clientContext.isDemo
        ? "Hey, welcome to DigiGuru 👋 I’m Sakura. I’ll help you figure out where DigiGuru could make a difference in your business."
        : `Hey, welcome to ${clientContext.businessName} 👋 I’m here to help with whatever you need.`;

      await sendReplyBubbles(from, welcome, clientContext.connection, clientId);

      if (databaseEnabled) {
        await db.markConversationWelcomed(clientId, from);
      } else {
        welcomed.add(key);
      }
    }

    if (databaseEnabled) {
      const claimed = await db.claimInboundMessage(clientId, from, m.id, userText);
      if (!claimed) return;
    } else {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (seen.size > 2000) seen.clear();
    }

    const conversation = databaseEnabled
      ? await db.getConversation(clientId, from)
      : null;

    const turns = conversation?.history || history.get(key) || [];
    const isSimpleGreeting = /^(hi|hello|hey|hallo|hiya|good morning|good afternoon|good evening)[.!?\s]*$/i.test(userText);

    if (!databaseEnabled) {
      if (isFirstInbound) {
        const welcome = clientContext.isDemo
          ? "Hey, welcome to DigiGuru 👋 I’m Sakura. I’ll help you figure out where DigiGuru could make a difference in your business."
          : `Hey, welcome to ${clientContext.businessName} 👋 I’m here to help with whatever you need.`;
        turns.push({ role: "assistant", content: welcome });
      }
      turns.push({ role: "user", content: userText });
    }

    if (isFirstInbound && isSimpleGreeting) {
      const opening = clientContext.isDemo
        ? "What kind of business are you looking at this for?"
        : "What can I help you with today?";

      turns.push({ role: "assistant", content: opening });
      history.set(key, turns.slice(-MAX_TURNS));
      return sendReplyBubbles(from, opening, clientContext.connection, clientId);
    }

    const rawReply = await askClaude(turns, clientContext);
  const reply = sanitizeAssistantReply(rawReply);
  const bookingMatch = reply.match(/\[\[BOOKING:([\s\S]*?)\]\]/);
  const notifyMatch = reply.match(/\[\[NOTIFY:([\s\S]*?)\]\]/);
  const clean = reply.replace(/\[\[(?:BOOKING|NOTIFY):[\s\S]*?\]\]/g, "").trim();

  if (bookingMatch) {
    const booking = parseBookingMarker(bookingMatch[1]);

    if (!booking) {
      turns.push({ role: "assistant", content: "I need one more detail before I can book that." });
      history.set(key, turns.slice(-MAX_TURNS));
      return sendReplyBubbles(
        from,
        "I need one more detail before I can book that. What email should I send the invite to?",
        clientContext.connection,
        clientId
      );
    }

    const result = await createOrSuggestBooking(booking);

    if (result.status === "booked") {
      const dateText = formatBookingDate(result.start);
      const first = `You’re booked for ${dateText}.`;
      const second = result.meetLink
        ? `I’ve sent the Google Meet invite to ${booking.email}. Here’s the link: ${result.meetLink}`
        : `I’ve sent the Google Calendar invite to ${booking.email}. Google is adding the Meet link to the invite now.`;

      const confirmation = `${first}\n\n${second}\n\nSee you then 👋`;
      turns.push({ role: "assistant", content: confirmation });
      history.set(key, turns.slice(-MAX_TURNS));
      await sendReplyBubbles(from, confirmation, clientContext.connection, clientId);
      await notifyOwner(
        from,
        `BOOKING | ${booking.name} | ${booking.business} | ${dateText} | ${booking.email} | ${result.meetLink || result.eventLink}`,
        clientContext
      );
      return;
    }

    if (result.status === "unavailable") {
      const alternatives = result.alternatives.map(formatBookingDate);
      let response;
      if (alternatives.length >= 2) {
        response = `That time’s already taken.\n\nI can do ${alternatives[0]} or ${alternatives[1]}. Which works better?`;
      } else if (alternatives.length === 1) {
        response = `That time’s already taken.\n\nI can do ${alternatives[0]}. Would that work?`;
      } else {
        response = "That time’s already taken. Give me another day or time and I’ll check it.";
      }
      turns.push({ role: "assistant", content: response });
      history.set(key, turns.slice(-MAX_TURNS));
      return sendReplyBubbles(from, response, clientContext.connection, clientId);
    }

    const fallback = "I’ve got your details, but the booking system hit a small issue on my side. I don’t want to give you a false confirmation. Robin will follow up and confirm the appointment.";
    turns.push({ role: "assistant", content: fallback });
    history.set(key, turns.slice(-MAX_TURNS));
    await sendReplyBubbles(from, fallback, clientContext.connection, clientId);
    await notifyOwner(
      from,
      `BOOKING_ERROR | ${booking.name} | ${booking.business} | ${booking.email} | ${result.error || "unknown error"}`,
      clientContext
    );
    return;
  }

  const assistantContent = clean || reply;
  turns.push({ role: "assistant", content: assistantContent });
  history.set(key, turns.slice(-MAX_TURNS));

  await sendReplyBubbles(from, clean, clientContext.connection, clientId);
  if (notifyMatch) await notifyOwner(from, notifyMatch[1].trim(), clientContext);
  }).finally(() => {
    if (processing.get(key) === currentProcessing) processing.delete(key);
  });

  processing.set(key, currentProcessing);
  return currentProcessing;
}

function getGoogleCalendarClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google Calendar credentials are not configured");
  }

  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  return google.calendar({ version: "v3", auth });
}

function parseBookingMarker(value) {
  const parts = value.split("|").map((part) => part.trim());
  if (parts.length < 5) return null;

  const [name, business, email, startIso, ...summaryParts] = parts;
  const summary = summaryParts.join(" | ").trim();

  if (!name || !business || !/^\S+@\S+\.\S+$/.test(email)) return null;

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  if (!summary) return null;

  return { name, business, email, startIso, start, summary };
}

function getNairobiParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function isWithinBookingHours(start) {
  const startParts = getNairobiParts(start);
  const end = new Date(start.getTime() + BOOKING_DURATION * 60000);
  const endParts = getNairobiParts(end);
  const weekdays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

  if (!weekdays.has(startParts.weekday)) return false;
  if (!weekdays.has(endParts.weekday)) return false;

  const startMinutes = Number(startParts.hour) * 60 + Number(startParts.minute);
  const endMinutes = Number(endParts.hour) * 60 + Number(endParts.minute);

  return startMinutes >= 9 * 60 && endMinutes <= 17 * 60;
}

function formatBookingDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function toDateKey(date) {
  const p = getNairobiParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

function createNairobiDate(dateKey, hour, minute) {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`);
}

async function getBusyTimes(calendar, timeMin, timeMax) {
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: GOOGLE_CALENDAR_ID }],
    },
  });

  return response.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
}

function overlapsBusy(start, end, busy) {
  return busy.some((block) => {
    const busyStart = new Date(block.start).getTime();
    const busyEnd = new Date(block.end).getTime();
    return start.getTime() < busyEnd && end.getTime() > busyStart;
  });
}

async function createOrSuggestBooking(booking) {
  try {
    if (BOOKING_DURATION !== 20) {
      throw new Error("BOOKING_DURATION_MINUTES must remain 20 for this booking flow");
    }

    const start = booking.start;
    const end = new Date(start.getTime() + BOOKING_DURATION * 60000);

    if (!isWithinBookingHours(start)) {
      return { status: "unavailable", alternatives: [] };
    }

    if (start.getTime() <= Date.now()) {
      return { status: "unavailable", alternatives: [] };
    }

    const calendar = getGoogleCalendarClient();
    const horizonEnd = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const busy = await getBusyTimes(calendar, start, horizonEnd);

    if (overlapsBusy(start, end, busy)) {
      const alternatives = [];
      const requestedKey = toDateKey(start);

      for (let dayOffset = 0; dayOffset < 7 && alternatives.length < 2; dayOffset++) {
        const key = addDaysToDateKey(requestedKey, dayOffset);
        const dayStartHour = dayOffset === 0 ? Number(getNairobiParts(start).hour) : 9;
        const dayStartMinute = dayOffset === 0 ? Number(getNairobiParts(start).minute) + BOOKING_DURATION : 0;

        let totalMinutes = dayStartHour * 60 + dayStartMinute;
        totalMinutes = Math.ceil(totalMinutes / BOOKING_DURATION) * BOOKING_DURATION;

        for (; totalMinutes + BOOKING_DURATION <= 17 * 60 && alternatives.length < 2; totalMinutes += BOOKING_DURATION) {
          const candidate = createNairobiDate(key, Math.floor(totalMinutes / 60), totalMinutes % 60);
          const candidateEnd = new Date(candidate.getTime() + BOOKING_DURATION * 60000);

          if (!isWithinBookingHours(candidate)) continue;
          if (candidate.getTime() <= Date.now()) continue;
          if (!overlapsBusy(candidate, candidateEnd, busy) && !alternatives.some((a) => a.getTime() === candidate.getTime())) {
            alternatives.push(candidate);
          }
        }
      }

      return { status: "unavailable", alternatives };
    }

    const requestId = `digiguru-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const eventResponse = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      sendUpdates: "all",
      conferenceDataVersion: 1,
      requestBody: {
        summary: MEETING_NAME,
        description:
          `Business: ${booking.business}\n\nBooked through Sakura on WhatsApp.\n\nConversation summary:\n${booking.summary}`,
        start: {
          dateTime: start.toISOString(),
          timeZone: BOOKING_TIME_ZONE,
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: BOOKING_TIME_ZONE,
        },
        attendees: [{ email: booking.email, displayName: booking.name }],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    let event = eventResponse.data;

    for (let i = 0; i < 8 && !event.hangoutLink; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 500));
      const refreshed = await calendar.events.get({
        calendarId: GOOGLE_CALENDAR_ID,
        eventId: event.id,
      });
      event = refreshed.data;
    }

    const meetLink =
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ||
      null;

    return {
      status: "booked",
      start,
      eventLink: event.htmlLink,
      meetLink,
    };
  } catch (error) {
    console.error("booking error", error.message);
    return { status: "error", error: error.message };
  }
}

function sanitizeAssistantReply(body) {
  const parts = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const output = [];
  const seenParts = new Set();

  for (const rawPart of parts) {
    let part = rawPart.trim();

    // Collapse a model that accidentally repeats the entire same bubble twice.
    if (part.length > 0 && part.length % 2 === 0) {
      const half = part.length / 2;
      const firstHalf = part.slice(0, half).trim();
      const secondHalf = part.slice(half).trim();
      if (firstHalf && firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
        part = firstHalf;
      }
    }

    const key = part.toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
    if (!key || seenParts.has(key)) continue;
    seenParts.add(key);
    output.push(part);
  }

  return output.join("\n\n").trim();
}

async function askClaude(messages, clientContext) {
  try {
    const clientSystem = clientContext?.isDemo ? SYSTEM : buildClientSystemPrompt(clientContext);
    const clientTimeZone = clientContext?.timezone || BOOKING_TIME_ZONE;
    const nowContext = new Intl.DateTimeFormat("en-GB", { timeZone: clientTimeZone, dateStyle: "full", timeStyle: "short" }).format(new Date());
    const runtimeSystem = clientSystem + `\n\nCURRENT DATE AND TIME IN ${clientTimeZone}: ${nowContext}`;

    if (LLM_PROVIDER === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 400, system: runtimeSystem, messages }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(d));
      return d.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    }
    // Default: Groq (free tier, OpenAI style API, runs Llama)
    const payload = {
      model: GROQ_MODEL,
      max_tokens: 240,
      temperature: 0.65,
      reasoning_effort: "low",
      messages: [{ role: "system", content: runtimeSystem }, ...messages.slice(-12)],
    };

    let r;
    let d;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify(payload),
      });
      d = await r.json();

      if (r.ok) return d.choices[0].message.content;

      // GPT OSS can occasionally interpret the booking action marker as an
      // assistant tool call even though this application does not expose an
      // LLM tool. Groq then rejects the request with tool_use_failed, but the
      // failed_generation still contains the booking marker we need. Recover
      // that marker and let the application perform the real Calendar action.
      if (d?.error?.code === "tool_use_failed") {
        const failedGeneration = d?.error?.failed_generation || "";
        const bookingStart = failedGeneration.indexOf("[[BOOKING:");
        const bookingEnd = failedGeneration.indexOf("]]", bookingStart);
        if (bookingStart >= 0 && bookingEnd > bookingStart) {
          return failedGeneration.slice(bookingStart, bookingEnd + 2);
        }
      }

      // Groq's free/on-demand tier can briefly hit TPM limits. Wait for the
      // server-provided retry window once rather than exposing an LLM error
      // to the prospect.
      if (r.status === 429 && attempt === 0) {
        const retryAfter = Number(r.headers.get("retry-after") || 5);
        const waitMs = Math.min(Math.max(retryAfter * 1000, 3500), 8000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw new Error(JSON.stringify(d));
    }

    throw new Error("Groq request failed");
  } catch (e) {
    console.error("llm error", e.message);
    return "Sorry, I had a small hiccup. Robin from DigiGuru will follow up with you shortly.";
  }
}

async function send(to, body, connection = {}) {
  const phoneNumberId = connection.phoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = connection.accessToken || WHATSAPP_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("whatsapp send skipped: connection is not configured");
    return false;
  }

  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });

  if (!r.ok) {
    console.error("whatsapp send", r.status, await r.text());
    return false;
  }

  return true;
}

async function sendReplyBubbles(to, body, connection, clientId) {
  const bubbles = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  for (let i = 0; i < bubbles.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 350));
    const sent = await send(to, bubbles[i], connection);
    if (sent && clientId && db.dbEnabled()) {
      await db.recordOutboundMessage(clientId, to, bubbles[i]);
    }
  }
}

async function notifyOwner(from, info, clientContext) {
  const owner = clientContext.ownerWhatsapp || OWNER_WHATSAPP;
  const text = `${clientContext.businessName} conversation alert\nFrom: +${from}\n${info}\n\nReply to them directly: https://wa.me/${from}`;
  console.log(text); // always logged, so nothing is lost if WhatsApp refuses
  if (owner) await send(owner, text, clientContext.connection);
}

async function boot() {
  if (db.dbEnabled()) await db.initDatabase();
  app.listen(PORT, () => console.log("DigiGuru bot listening on", PORT));
}

boot().catch((error) => {
  console.error("startup error", error.message);
  process.exit(1);
});
