# InterpreterAI — Environment Variables Reference

> All secrets are managed via Replit Secrets (environment variables). Never hardcode these values.

---

## Database & Infrastructure

### `DATABASE_URL`
**Purpose:** PostgreSQL connection string for the main application database.  
**Format:** `postgresql://user:password@host:port/dbname`  
**Used in:**
- `lib/db/src/index.ts` — Drizzle ORM client initialization
- `lib/db/drizzle.config.ts` — Drizzle Kit migration config
- `artifacts/api-server/src/index.ts` — Connection pool setup

---

### `PORT`
**Purpose:** TCP port the API server and Vite dev servers listen on. Replit assigns this automatically.  
**Format:** Integer (e.g., `3000`, `5000`)  
**Used in:**
- `artifacts/api-server/src/index.ts` — Express listen port
- `artifacts/transcription-app/vite.config.ts` — Vite dev server port
- `artifacts/mockup-sandbox/vite.config.ts` — Component preview server port

---

### `NODE_ENV`
**Purpose:** Determines runtime environment mode.  
**Values:** `development` | `production`  
**Used in:**
- `artifacts/api-server/src/lib/logger.ts` — Log level (pretty-print in dev)
- `artifacts/api-server/src/middlewares/session.ts` — Cookie `secure` flag in production
- `artifacts/api-server/src/routes/auth.ts` — Google OAuth callback URL

---

### `LOG_LEVEL`
**Purpose:** Controls verbosity of the Pino structured logger.  
**Values:** `trace` | `debug` | `info` | `warn` | `error` | `fatal`  
**Default:** `info`  
**Used in:** `artifacts/api-server/src/lib/logger.ts`

---

## Authentication & Security

### `SESSION_SECRET`
**Purpose:** Secret key used to sign and verify session cookies. Must be a long, random string (32+ characters).  
**Used in:** `artifacts/api-server/src/middlewares/session.ts`  
**Note:** Changing this value will invalidate all existing user sessions.

---

### `ADMIN_PASSWORD`
**Purpose:** On every server startup, the admin account password is reset to this value. Ensures admin access is always recoverable.  
**Used in:** `artifacts/api-server/src/index.ts`  
**Note:** If not set, the admin password is not automatically reset.

---

### `ADMIN_EMAIL`
**Purpose:** Email address assigned to the admin account when it is first created. Fully configurable — set to any address you control.  
**Format:** `your@email.com`  
**Default:** `admin@interpreterai.com` (used only if `ADMIN_EMAIL` is not set)  
**Used in:** `artifacts/api-server/src/index.ts` — First-boot admin account creation

---

### `ADMIN_USERNAME`
**Purpose:** Username of the admin account to create/update on startup.  
**Used in:**
- `scripts/src/seed-admin.ts` — Initial admin seed script
- `artifacts/api-server/src/index.ts` — Startup admin password reset

---

### `ADMIN_ALLOWED_IPS`
**Purpose:** Comma-separated list of IP addresses that are allowed to access admin API routes.  
**Format:** `1.2.3.4,5.6.7.8` (or leave empty to allow all IPs)  
**Used in:** `artifacts/api-server/src/middlewares/adminIpGuard.ts`

---

### `GOOGLE_CLIENT_ID`
**Purpose:** OAuth 2.0 client ID from Google Cloud Console.  
**Used in:** `artifacts/api-server/src/routes/auth.ts` — Google OAuth initiation and callback

---

### `GOOGLE_CLIENT_SECRET`
**Purpose:** OAuth 2.0 client secret from Google Cloud Console.  
**Used in:** `artifacts/api-server/src/routes/auth.ts` — Google OAuth token exchange

---

## AI & Transcription Services

### `SONIOX_API_KEY`
**Purpose:** API key for Soniox real-time speech-to-text service.  
**Used in:** `artifacts/api-server/src/routes/transcription.ts` — Provisioning short-lived Soniox tokens for client WebSocket connections.  
**Note:** The key is never sent to the browser. The server exchanges it for a short-lived token.

---

### `OPENAI_API_KEY`
**Purpose:** Primary API key for OpenAI (GPT-4o translation, terminology lookup).  
**Used in:**
- `artifacts/api-server/src/routes/transcription.ts` — Translation
- `artifacts/api-server/src/routes/terminology.ts` — Terminology search

---

### `AI_INTEGRATIONS_OPENAI_API_KEY`
**Purpose:** Alternative OpenAI API key (Replit AI Integrations proxy). Used as fallback/override for the OpenAI client.  
**Used in:** `artifacts/api-server/src/routes/transcription.ts`

---

### `AI_INTEGRATIONS_OPENAI_BASE_URL`
**Purpose:** Base URL for the Replit-managed OpenAI proxy endpoint.  
**Used in:** `artifacts/api-server/src/routes/transcription.ts`

---

## Payments

### `STRIPE_SECRET_KEY`
**Purpose:** Stripe secret API key for server-side Stripe operations (checkout, portal, webhook verification).  
**Used in:**
- `artifacts/api-server/src/lib/stripeClient.ts` — Stripe SDK initialization
- `artifacts/api-server/src/index.ts` — Stripe webhook registration
- `scripts/src/stripeClient.ts` — Product seeding scripts

---

### `STRIPE_WEBHOOK_SECRET`
**Purpose:** Signing secret for verifying incoming Stripe webhook payloads.  
**Used in:** `artifacts/api-server/src/routes/stripe.ts`  
**Note:** Obtained from the Stripe Dashboard → Webhooks → Signing secret.

---

## Communications

### `RESEND_API_KEY`
**Purpose:** API key for Resend email service (password reset, welcome emails).  
**Used in:** `artifacts/api-server/src/lib/email.ts`

---

### `TELEGRAM_BOT_TOKEN`
**Purpose:** Bot token for the Telegram Bot API, used to send admin notifications.  
**Used in:** `artifacts/api-server/src/lib/telegram.ts`

---

### `TELEGRAM_CHAT_ID`
**Purpose:** Telegram chat or channel ID where admin notifications are sent.  
**Used in:** `artifacts/api-server/src/lib/telegram.ts`

---

## Replit Platform (Auto-Injected)

These are automatically set by the Replit environment and do not need manual configuration:

### `REPL_ID`
**Purpose:** Unique identifier for the Replit deployment. Used for environment detection and webhook URL generation.

### `REPLIT_DOMAINS`
**Purpose:** Comma-separated list of public domains for this Replit app. Used for constructing callback URLs (Google OAuth, Stripe webhooks).

### `BASE_PATH`
**Purpose:** Base URL prefix for the frontend application routing (Vite `base` config).

---

## Frontend Build-Time Variables (Vite)

These are injected at build time via Vite and are embedded into the frontend bundle:

### `BASE_URL` (Vite Internal)
**Purpose:** The base URL path for the app, used for building referral invite links and routing.  
**Used in:**
- `artifacts/transcription-app/src/App.tsx`
- `artifacts/transcription-app/src/components/InviteModal.tsx`
- `artifacts/transcription-app/src/components/SessionHistoryPanel.tsx`

---

## Minimum Required Variables Checklist

| Variable | Required | Default |
|----------|----------|---------|
| `DATABASE_URL` | ✅ Yes | — |
| `SESSION_SECRET` | ✅ Yes | — |
| `ADMIN_PASSWORD` | ✅ Yes (required for admin) | — |
| `ADMIN_EMAIL` | Optional | `admin@interpreterai.com` |
| `SONIOX_API_KEY` | ✅ Yes | — |
| `OPENAI_API_KEY` | ✅ Yes | — |
| `STRIPE_SECRET_KEY` | ✅ Yes | — |
| `STRIPE_WEBHOOK_SECRET` | ✅ Yes | — |
| `GOOGLE_CLIENT_ID` | Optional | OAuth disabled |
| `GOOGLE_CLIENT_SECRET` | Optional | OAuth disabled |
| `RESEND_API_KEY` | Optional | Emails disabled |
| `TELEGRAM_BOT_TOKEN` | Optional | Notifications disabled |
| `TELEGRAM_CHAT_ID` | Optional | Notifications disabled |
| `ADMIN_ALLOWED_IPS` | Optional | All IPs allowed |
| `LOG_LEVEL` | Optional | `info` |
