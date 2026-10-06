# DigiGuru Client Onboarding and Implementation SOP

This document is the internal implementation playbook for turning a signed DigiGuru client into a live, business-specific conversational sales system.

## Core principle

DigiGuru is one reusable conversational sales engine with business-specific configuration.

We do not rebuild the underlying engine for every client. We customize the customer journey, business rules, knowledge, integrations, tone, products/services, and enabled capabilities for each business.

Client owns its Meta, WhatsApp, website, ecommerce, payment and other business assets. DigiGuru receives the permissions needed to implement and operate the agreed system.

## Client lifecycle

1. COMMERCIAL
2. DISCOVERY
3. TECHNICAL ACCESS
4. META + WHATSAPP CONNECTION
5. BUSINESS DATA CONFIGURATION
6. CONVERSATION DESIGN
7. INTEGRATIONS
8. INTERNAL TESTING
9. CLIENT ACCEPTANCE
10. GO LIVE
11. MONITORING
12. OPTIMIZATION

## 1. Commercial

Collect:
- Signed agreement
- Setup fee
- Service package
- Primary client contact
- Desired launch window
- Scope and exclusions

Create a client record with a stable DigiGuru client ID such as `DG0007`.

## 2. Discovery questionnaire

### Business
- Business name
- Industry
- Business description
- Website
- Instagram
- Facebook
- TikTok
- Google profile
- Physical locations
- Opening hours
- Team members handling enquiries

### Objective
- Primary outcome
- Secondary outcomes
- What success looks like
- Current sales or customer handling bottleneck
- Important channels
- Current tools

### Customer journey
- Where attention comes from
- What happens after a customer messages
- Who responds
- Typical customer questions
- What information the customer needs before buying
- How orders/bookings/quotes are completed
- Where follow-up currently happens
- When a human must take over

### Products or services
Capture the source of truth for:
- Names
- SKUs where relevant
- Prices
- Variants
- Availability
- Descriptions
- Promotions
- Bundles
- Best sellers
- High-margin items

### Business rules
Document:
- What the concierge can say
- What it may recommend
- What it may collect
- What it may confirm
- What it must never claim
- When to hand off
- Escalation contact
- Refund/exchange policy
- Payment rules
- Delivery rules
- Booking rules where relevant

## 3. Technical access

Never ask a client to send Facebook or WhatsApp passwords.

Request the minimum permissions required.

### Meta / WhatsApp
- Meta Business Portfolio access
- WhatsApp Business Account access
- WhatsApp business phone number
- Meta business verification status
- Facebook Page access where required
- Instagram access where relevant
- Meta Ads access where included in scope

### Other systems
Request only what the agreed implementation needs:
- Website or ecommerce admin
- Shopify or WooCommerce
- Payment provider
- M-Pesa
- CRM
- Google Calendar
- Delivery system
- Analytics
- Email

## 4. WhatsApp connection

Target architecture:

Client Meta
  -> WhatsApp Business
  -> Business phone number
  -> DigiGuru connection
  -> DigiGuru webhook
  -> Client configuration
  -> Conversation engine

For new production onboarding, prefer Meta's current supported business onboarding flow rather than collecting credentials manually.

Store the client connection against the DigiGuru client ID. Access tokens are stored encrypted server-side and never committed to GitHub, frontend code or plain configuration files.

## 5. Business configuration

Each client receives a configuration record containing:
- Business identity
- Industry
- Business description
- Sales goal
- Tone
- Language
- Timezone
- Business knowledge
- Custom system instructions
- Capabilities
- Business rules
- Delivery rules
- Payment rules
- Human handoff rules
- Owner notification destination

## 6. Conversation design

Design the journey from entry point to business outcome.

Examples:

### Ecommerce
Interest -> product discovery -> recommendation -> quantity -> location -> delivery -> order -> payment -> confirmation -> fulfilment follow-up

### Service business
Interest -> service discovery -> questions -> suitability -> availability -> booking/quote -> confirmation -> follow-up

### Lead generation
Interest -> context -> qualification -> useful explanation -> handoff/meeting -> follow-up

The engine remains common. The journey is customized.

## 7. Integrations

Define the source of truth for every important piece of business data.

Example:
- Product price: ecommerce catalogue
- Stock: ecommerce system
- Delivery charge: DigiGuru business rules
- Payment confirmation: payment provider
- Customer record: DigiGuru database or CRM
- Human handoff: client WhatsApp/staff workflow

Do not allow the model to invent values that should come from a system of record.

## 8. Internal testing

Before launch, test at minimum:
- New conversation
- Simple greeting
- Product/service question
- Price question
- Availability/stock
- Unknown question
- Wrong or unsupported request
- Human handoff
- Order or booking path
- Payment path
- Delivery path
- Follow-up
- After-hours behavior
- Duplicate webhook delivery
- Restart/recovery
- API failure
- Missing business information

Every scenario is marked PASS, FAIL, or NEEDS REVIEW.

## 9. Client acceptance

Client reviews:
- Accuracy
- Tone
- Business rules
- Products/services
- Prices
- Delivery
- Payment instructions
- Handoff behavior
- Conversation flow

Do not launch until the client approves the agreed production flow.

## 10. Go live

Final checklist:
- Production WhatsApp connection active
- Webhook verified
- Business configuration complete
- Secrets present in Render
- Database connected
- End-to-end smoke test passed
- Human fallback confirmed
- Client notified

## 11. Monitoring

Track:
- Conversations
- Customer questions
- Qualified enquiries
- Orders/bookings
- Handoffs
- Abandoned conversations
- Failed intents
- API errors
- Response quality
- Conversion signals

## 12. Optimization

Use actual conversation data to improve:
- Questions
- Product/service recommendations
- Follow-up timing
- Offers
- Handoff triggers
- Business knowledge
- Ads and landing pages
- Integrations
- Reporting

## Current multi-client foundation

The repository now contains:
- `schema.sql` for the persistent multi-client data model
- `database.js` for Postgres persistence and secure credential encryption
- `client-context.js` for resolving a business from its WhatsApp phone number and building its business-specific AI context
- Internal client management endpoints
- Product storage foundation
- Client-scoped conversation history and webhook deduplication
- Client-specific WhatsApp connection handling
- The original DigiGuru/Sakura demo preserved as the fallback demo client

## Internal API foundation

Authenticated with the `x-digiguru-admin-token` header.

Create client:
`POST /api/internal/clients`

Update business configuration:
`PATCH /api/internal/clients/:clientId/config`

Connect WhatsApp:
`POST /api/internal/clients/:clientId/whatsapp`

View onboarding:
`GET /api/internal/clients/:clientId/onboarding`

Add product:
`POST /api/internal/clients/:clientId/products`

List clients:
`GET /api/internal/clients`

## Required Render configuration

For persistent multi-client mode:
- `DATABASE_URL`
- `DATABASE_SSL=true`
- `DATABASE_POOL_MAX`
- `DIGIGURU_ENCRYPTION_KEY`
- `DIGIGURU_ADMIN_TOKEN`

Keep LLM and platform secrets in Render environment variables or another secret store. Never commit real values.

## Next implementation milestones

### Milestone A
Provision Render Postgres and connect the service.

### Milestone B
Create the first real client records for Noka Foods and Aish Accessories.

### Milestone C
Connect their WhatsApp numbers and validate webhook routing by phone number ID.

### Milestone D
Build their business configurations and conversation journeys.

### Milestone E
Use those implementations to identify what should become reusable onboarding UI, automation, templates and integrations.

### Milestone F
Add a proper DigiGuru admin/client portal once the first real deployments prove the workflow.

## Definition of done for the foundation

The foundation is ready when:
1. Multiple clients can coexist in one DigiGuru application.
2. Each WhatsApp number resolves to exactly one client configuration.
3. Conversations persist across Render restarts.
4. Client WhatsApp credentials are encrypted at rest.
5. Client-specific knowledge and rules control the AI behavior.
6. The original DigiGuru demo still works.
7. Adding a client does not require editing the core engine.
8. No production deploy is required merely to create or configure a client once the admin layer is active.
