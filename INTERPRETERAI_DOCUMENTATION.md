# InterpreterAI — Complete Operator Documentation

> **Version:** April 2026  
> **Purpose:** Full technical reference for independent operation and maintenance of the InterpreterAI SaaS platform.

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [Full Feature List](#2-full-feature-list)
3. [Database Structure](#3-database-structure)
4. [Environment Variables & Secrets](#4-environment-variables--secrets)
5. [Deployment Configuration](#5-deployment-configuration)
6. [Running Outside Replit](#6-running-outside-replit)
7. [API Usage & Cost Model](#7-api-usage--cost-model)
8. [Admin Operations Guide](#8-admin-operations-guide)
9. [Security Overview](#9-security-overview)
10. [Scaling Considerations](#10-scaling-considerations)

---

## 1. Project Architecture

### Overview

InterpreterAI is a full-stack SaaS application structured as a **pnpm monorepo** — a single repository containing multiple interconnected packages.

```
workspace/
├── artifacts/
│   ├── transcription-app/     ← React frontend (user-facing web app)
│   └── api-server/            ← Express backend (REST API)
├── lib/
│   ├── db/                    ← Shared database schema (Drizzle ORM)
│   └── api-client-react/      ← Auto-generated TypeScript API client
└── pnpm-workspace.yaml        ← Monorepo configuration
```

### Frontend (`artifacts/transcription-app`)

- **Framework:** React 18 with TypeScript
- **Build tool:** Vite
- **Routing:** Wouter (lightweight client-side router)
- **Styling:** Tailwind CSS with shadcn/ui component library
- **State & data fetching:** TanStack Query (React Query) for server state; React hooks for local state
- **Animations:** Framer Motion
- **API communication:** Generated TypeScript client from `lib/api-client-react`

**Pages:**
| Page | Route | Purpose |
|---|---|---|
| Landing | `/` | Marketing page, product overview |
| Login | `/login` | Email/password + Google OAuth login |
| Sign Up | `/signup` | New account registration |
| Forgot Password | `/forgot-password` | Password reset request |
| Reset Password | `/reset-password` | Password reset via email token |
| Workspace | `/workspace` | Main transcription/translation interface |
| Admin | `/admin` | Full admin dashboard |
| Terms | `/terms` | Terms of service |
| Privacy | `/privacy` | Privacy policy |
| 404 | `*` | Not found page |

### Backend (`artifacts/api-server`)

- **Framework:** Express.js with TypeScript
- **Runtime:** Node.js (ESM modules)
- **Build:** esbuild (bundles to `dist/index.mjs`)
- **Logging:** Pino (structured JSON logging, HIPAA-safe — no request bodies ever logged)
- **Session management:** `express-session` with PostgreSQL session store
- **Rate limiting:** `express-rate-limit` (separate limiters for login, auth, transcription, and general routes)

**API Route Groups:**
| Prefix | File | Purpose |
|---|---|---|
| `/api/auth` | `routes/auth.ts` | Login, signup, logout, Google OAuth, 2FA, password reset |
| `/api/transcription` | `routes/transcription.ts` | Soniox token, session start/stop/heartbeat, translation |
| `/api/admin` | `routes/admin.ts` | All admin management endpoints |
| `/api/glossary` | `routes/glossary.ts` | User personal glossary CRUD |
| `/api/terminology` | `routes/terminology.ts` | Built-in medical/legal terminology search |
| `/api/usage` | `routes/usage.ts` | User usage statistics |
| `/api/feedback` | `routes/feedback.ts` | User feedback submission |
| `/api/support` | `routes/support.ts` | Support ticket creation and replies |
| `/api/stripe` | `routes/stripe.ts` | Stripe checkout and webhook |
| `/api/health` | `routes/health.ts` | Server health check |

### Database

- **Type:** PostgreSQL (managed by Replit's built-in database)
- **ORM:** Drizzle ORM (type-safe, schema-first)
- **Schema location:** `lib/db/src/schema/`
- **Connection:** `DATABASE_URL` environment variable (auto-set by Replit)

### Authentication System

- **Session-based authentication** using HTTP-only cookies
- Sessions stored in PostgreSQL via `connect-pg-simple`
- **Google OAuth** via OpenID Connect (optional — users can also use email/password)
- **Two-factor authentication (2FA)** using TOTP (Google Authenticator compatible)
- **Password hashing:** bcrypt with 10 salt rounds
- Login events are logged to the `login_events` table (IP address, device type, success/failure)

### Admin Panel Structure

The admin dashboard (`/admin`) is a single-page panel with tabbed navigation:

1. **Dashboard** — Platform-wide KPI cards (users, revenue, sessions, errors)
2. **Users** — Full user management table with search, filter, edit drawer
3. **Sessions** — Live and historical session monitoring
4. **Languages** — Manage available source/target language pairs
5. **Feedback** — View user-submitted ratings and comments
6. **Support** — Support ticket inbox with admin reply capability
7. **Error Logs** — API error log viewer

Admin routes are protected by both session authentication (`isAdmin: true`) and an optional IP allowlist (`ADMIN_ALLOWED_IPS` env var).

### Session Management System

Each "recording session" in the app follows this lifecycle:

1. **Start** — `POST /api/transcription/session/start` creates a row in the `sessions` table
2. **Heartbeat** — Frontend calls `POST /api/transcription/session/heartbeat` every 30 seconds to keep the session alive
3. **Snapshot** — Frontend pushes `PUT /api/transcription/session/snapshot` every 5 seconds with the current transcript/translation (held in server RAM only, never persisted)
4. **Stop** — `POST /api/transcription/session/stop` closes the session, records duration, updates user usage counters

Sessions older than 60 seconds with no heartbeat are automatically closed on the next server restart (stale session cleanup runs on every boot).

### How Transcription Works

Audio never touches the InterpreterAI server. The flow is:

1. User clicks "Start" → frontend calls `/api/transcription/token` to get a **Soniox API key**
2. The browser opens a **WebSocket directly to Soniox's servers** using that key
3. Microphone audio streams from the browser to Soniox in real time
4. Soniox sends back transcribed text segments to the browser via the WebSocket
5. The browser displays transcription live; final segments are sent to `/api/transcription/translate` for translation
6. The translated text is returned and displayed alongside the original

### How Translation Works

Translation uses **OpenAI GPT-4o-mini** via the `/api/transcription/translate` endpoint:

- A highly detailed system prompt instructs the model to behave as a professional simultaneous interpreter
- The prompt enforces: literal translation only, no added context, ambiguity preservation, MSA Arabic output (for Arabic targets), dialect handling for Arabic sources
- Personal glossary entries and built-in terminology hints are injected into the prompt for consistent term translation
- Translation results are returned to the browser immediately and discarded server-side (HIPAA compliance — no speech content is stored)

### Usage Tracking & Cost Calculation

- When a session ends, `durationSeconds` is recorded and `minutesUsedToday` / `totalMinutesUsed` on the user record are incremented
- Each day at midnight (detected lazily on the next API call), `minutesUsedToday` is reset to 0
- **Estimated API cost** = `totalMinutesUsed × $0.0027` (Soniox $0.0025/min + OpenAI GPT-4o-mini $0.0002/min)
- A global platform safety cap of **200 hours/day (12,000 minutes)** prevents runaway costs

---

## 2. Full Feature List

### User Features

#### Login & Authentication
- **What:** Email/password login, Google OAuth ("Continue with Google"), optional 2FA
- **Where:** `/login` page
- **How:** Session cookie is set on success; `isActive` flag is checked; failed attempts are rate-limited (5 per 10 minutes per IP) and logged

#### Sign Up
- **What:** Create a new account with username, email, and password; starts a 14-day trial automatically
- **Where:** `/signup` page
- **How:** Password is bcrypt-hashed; welcome email sent via email integration; Telegram notification sent to admin

#### Forgot/Reset Password
- **What:** Request a password reset link by email; click the link to set a new password
- **Where:** `/forgot-password` and `/reset-password` pages
- **How:** A cryptographically random token is generated and stored in `password_reset_tokens`; token expires after 1 hour

#### Real-Time Transcription
- **What:** Live speech-to-text from the user's microphone, displayed word-by-word as the interpreter speaks
- **Where:** Main workspace panel (left column)
- **How:** Browser connects directly to Soniox WebSocket using a short-lived API key from the server; no audio passes through InterpreterAI servers

#### Real-Time Translation
- **What:** Each completed transcription segment is translated into the target language and displayed side-by-side
- **Where:** Workspace right panel
- **How:** Completed transcript segments are POSTed to `/api/transcription/translate`, processed by GPT-4o-mini, result shown instantly

#### Language Selection
- **What:** Choose source and target language before or during a session (35+ languages)
- **Where:** Language selector in workspace toolbar
- **How:** Language codes sent with each translation request; language pair saved on the session record

#### Session History
- **What:** List of all past sessions with start time, duration, and language pair; filterable by today/week/month/all
- **Where:** Left sidebar panel in workspace
- **How:** `GET /api/transcription/sessions` returns sessions from DB with aggregate stats

#### Personal Glossary
- **What:** User can save custom term→translation pairs; these are automatically used in live translation
- **Where:** Glossary panel in workspace sidebar
- **How:** Glossary entries stored in `glossary_entries` table; loaded on each translate request and injected into the GPT-4o-mini prompt

#### Built-in Terminology
- **What:** Pre-loaded medical, legal, and insurance terminology in multiple language pairs
- **Where:** Terminology panel in workspace (searchable)
- **How:** Static data file (`data/terminology.ts`); hints injected into translation prompt when terms appear in the transcribed text

#### Notes
- **What:** Free-text notes area the interpreter can type into during a live session
- **Where:** Notes panel in workspace sidebar
- **How:** Client-side only; not persisted to the server

#### Usage Display
- **What:** Shows minutes used today vs. daily limit, trial status, days remaining
- **Where:** Usage bar in workspace header
- **How:** Data from `/api/auth/me`; updated in real time

#### Feedback
- **What:** Star rating + optional comment after a session
- **Where:** Feedback modal that appears after session ends
- **How:** Stored in `feedback` table via `POST /api/feedback`

#### Support Tickets
- **What:** Submit a support request; receive admin replies in-app
- **Where:** Support panel in workspace sidebar
- **How:** Stored in `support_tickets` and `support_replies` tables

#### Audio Level Meter
- **What:** Visual microphone level indicator showing if audio is being detected
- **Where:** Next to the microphone button in workspace
- **How:** Web Audio API analyser node reading mic input

---

### Admin Features

#### Platform Dashboard
- **What:** Cards showing total users, active users, sessions today, minutes today, MRR estimate, API cost today, error count, avg session length
- **Where:** Dashboard tab in `/admin`
- **How:** Aggregated queries from `users` and `sessions` tables

#### User Management Table
- **What:** Full list of all users with real-time search, plan filter, status filter, sortable columns
- **Where:** Users tab in `/admin`
- **How:** `GET /api/admin/users` with optional query params

#### Edit User Drawer
- **What:** Per-user panel to change plan, trial end date, daily limit, active status; view usage stats and estimated API cost
- **Where:** Opens from the pencil icon in each user row
- **How:** `PATCH /api/admin/users/:userId`

#### Live Session Monitor
- **What:** View currently active transcription sessions with language pair and live transcript/translation snapshot
- **Where:** Sessions tab in `/admin`
- **How:** `GET /api/admin/sessions/live` reads from the in-memory session store

#### Historical Session Monitor
- **What:** Browse all completed sessions by user, date, duration, language pair; export to CSV
- **Where:** Sessions tab (history view) in `/admin`
- **How:** `GET /api/admin/sessions` with pagination

#### Language Management
- **What:** Enable/disable language pairs available to users; set display names
- **Where:** Languages tab in `/admin`
- **How:** Language config stored server-side in `lib/lang-config.ts`

#### Feedback Management
- **What:** View all user feedback with ratings and comments; filter by rating
- **Where:** Feedback tab in `/admin`
- **How:** `GET /api/admin/feedback`

#### Support Ticket Management
- **What:** View all open and closed tickets; send admin replies; change ticket status
- **Where:** Support tab in `/admin`
- **How:** `GET/PATCH /api/admin/support/tickets` and `POST /api/admin/support/tickets/:id/reply`

#### Error Log Viewer
- **What:** Log of all 4xx/5xx API errors with user, endpoint, error type, IP address
- **Where:** Error Logs tab in `/admin`
- **How:** Logged by `errorLoggerMiddleware` into `error_logs` table

---

### System Features

#### HIPAA-Safe Design
- No audio is ever sent to InterpreterAI servers
- No transcript or translation text is ever stored in the database or logs
- Request body logging is explicitly disabled in Pino
- Translation cache was intentionally removed to prevent PHI retention in server RAM

#### Automatic Daily Usage Reset
- `minutesUsedToday` is reset to 0 lazily when the next API call detects a new calendar day

#### Global Platform Safety Cap
- If total `minutesUsedToday` across all users exceeds 12,000 minutes (200 hours), new sessions are blocked until the next day

#### Stale Session Cleanup
- On every server restart, sessions with no heartbeat for 60+ seconds are automatically closed

#### Stripe Payment Integration
- Users can subscribe via Stripe Checkout
- Webhooks automatically update `planType` and `stripeSubscriptionId` on the user record
- Graceful degradation: server starts normally even if Stripe is not configured

#### Telegram Admin Notifications
- New user signups send a notification to a configured Telegram chat
- Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` env vars

#### Two-Factor Authentication
- Users can enable TOTP-based 2FA from their account settings
- Compatible with Google Authenticator and any standard TOTP app

---

## 3. Database Structure

### Table: `users`
Primary table for all accounts.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Auto-incrementing unique user ID |
| `username` | text (unique) | Login username |
| `email` | text (unique, nullable) | Email address |
| `password_hash` | text | bcrypt hash of password |
| `is_admin` | boolean | Whether user has admin access |
| `is_active` | boolean | Whether user can log in |
| `email_verified` | boolean | Whether email has been verified |
| `plan_type` | text | `trial`, `basic`, `professional`, or `unlimited` |
| `trial_started_at` | timestamp | When the trial began |
| `trial_ends_at` | timestamp | When the trial expires |
| `daily_limit_minutes` | integer | Max transcription minutes per day |
| `minutes_used_today` | real | Minutes used so far today |
| `total_minutes_used` | real | Cumulative all-time minutes |
| `total_sessions` | integer | Total number of sessions ever started |
| `last_usage_reset_at` | timestamp | When daily counter was last reset to 0 |
| `stripe_customer_id` | text (nullable) | Stripe customer ID |
| `stripe_subscription_id` | text (nullable) | Active Stripe subscription ID |
| `google_account_id` | text (unique, nullable) | Google OAuth account identifier |
| `last_activity` | timestamp (nullable) | Last API activity timestamp |
| `two_factor_secret` | text (nullable) | TOTP secret (base32-encoded) |
| `two_factor_enabled` | boolean | Whether 2FA is enabled |
| `created_at` | timestamp | Account creation timestamp |

### Table: `password_reset_tokens`
Tracks password reset requests.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Token ID |
| `user_id` | integer (FK → users) | User who requested the reset |
| `token` | text (unique) | Cryptographically random token |
| `expires_at` | timestamp | Token expiry (1 hour from creation) |
| `used_at` | timestamp (nullable) | When the token was consumed |
| `created_at` | timestamp | Creation time |

### Table: `sessions`
Records each transcription session (metadata only — no content).

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Session ID |
| `user_id` | integer (FK → users) | Which user ran this session |
| `started_at` | timestamp | When the session started |
| `ended_at` | timestamp (nullable) | When it ended (null = still active) |
| `duration_seconds` | integer (nullable) | Total duration in seconds |
| `last_activity_at` | timestamp (nullable) | Last heartbeat timestamp |
| `lang_pair` | text (nullable) | e.g. "English → Arabic" |

### Table: `glossary_entries`
User's personal translation glossary.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Entry ID |
| `user_id` | integer (FK → users, cascade delete) | Owning user |
| `term` | text | Source-language term |
| `translation` | text | Target-language translation |
| `created_at` | timestamp | When the entry was created |

### Table: `feedback`
User satisfaction ratings.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Feedback ID |
| `user_id` | integer (FK → users, cascade delete) | Who submitted it |
| `rating` | integer | 1–5 star rating |
| `comment` | text (nullable) | Optional text comment |
| `created_at` | timestamp | Submission time |

### Table: `support_tickets`
User support requests.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Ticket ID |
| `user_id` | integer (FK → users, set null on delete) | Submitting user (nullable) |
| `email` | text | Contact email |
| `subject` | text | Ticket subject |
| `message` | text | Initial message |
| `status` | text | `open`, `in_progress`, or `closed` |
| `created_at` | timestamp | Submission time |
| `updated_at` | timestamp | Last update time |

### Table: `support_replies`
Admin or user replies to support tickets.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Reply ID |
| `ticket_id` | integer (FK → support_tickets, cascade delete) | Parent ticket |
| `author_id` | integer (FK → users, set null on delete) | Who wrote the reply |
| `is_admin` | boolean | Whether the reply is from an admin |
| `message` | text | Reply body |
| `created_at` | timestamp | When it was sent |

### Table: `error_logs`
API error records for monitoring.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Log entry ID |
| `user_id` | integer (FK → users, set null on delete) | User who triggered the error (nullable) |
| `session_id` | text (nullable) | Session ID if relevant |
| `endpoint` | text | API path (e.g. `/api/transcription/token`) |
| `method` | text | HTTP method |
| `status_code` | integer | HTTP status code (e.g. 401, 500) |
| `error_type` | text | Short error category |
| `error_message` | text (nullable) | Error detail message |
| `user_agent` | text (nullable) | Browser/device user agent |
| `ip_address` | text (nullable) | Client IP address |
| `created_at` | timestamp | When the error occurred |

### Table: `login_events`
Audit log of all login attempts.

| Column | Type | Description |
|---|---|---|
| `id` | serial (PK) | Event ID |
| `user_id` | integer (FK → users, set null) | User (nullable if not found) |
| `email` | text (nullable) | Email used in the attempt |
| `ip_address` | text (nullable) | Client IP |
| `user_agent` | text (nullable) | Browser/device |
| `success` | boolean | Whether login succeeded |
| `failure_reason` | text (nullable) | `user_not_found`, `wrong_password`, `account_disabled` |
| `is_2fa` | boolean | Whether this was a 2FA step |
| `created_at` | timestamp | Attempt timestamp |

### Relationships Summary
- `sessions` → `users` (many sessions per user; cascade delete)
- `glossary_entries` → `users` (cascade delete)
- `feedback` → `users` (cascade delete)
- `support_tickets` → `users` (set null on delete)
- `support_replies` → `support_tickets` (cascade delete) + `users` (set null)
- `error_logs` → `users` (set null on delete)
- `login_events` → `users` (set null on delete)
- `password_reset_tokens` → `users` (cascade delete)

---

## 4. Environment Variables & Secrets

### Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Set automatically by Replit's database integration. |
| `SESSION_SECRET` | Secret key used to sign session cookies. Must be long (32+ chars) and random. Change this and all existing sessions are invalidated. |
| `SONIOX_API_KEY` | API key for Soniox speech-to-text. Without this, the transcription Start button is blocked for all users. |

### AI / Translation

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o-mini translation. If not set, the system falls back to `AI_INTEGRATIONS_OPENAI_API_KEY`. |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Alternative base URL when using Replit's AI proxy instead of a direct OpenAI key. |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | API key used with the Replit AI proxy. |

### Payments

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key. If not set, payment features are disabled but the rest of the app works normally. |
| `STRIPE_WEBHOOK_SECRET` | Used to verify Stripe webhook signatures. Required for plan upgrades triggered by payment events. |

### Admin

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | If set, the admin account's password is reset to this value on every server startup. Remove after setting a permanent password if you prefer not to reset on each restart. |
| `ADMIN_ALLOWED_IPS` | Comma-separated IP addresses allowed to access `/api/admin/*`. If empty, all IPs are allowed. Example: `203.0.113.1,198.51.100.5` |

### Notifications

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token for the Telegram bot used to send admin notifications on new user signup. |
| `TELEGRAM_CHAT_ID` | Telegram chat or group ID where notifications are delivered. |

### Email

| Variable | Purpose |
|---|---|
| `EMAIL_HOST` | SMTP server hostname for sending emails (password reset, welcome email). |
| `EMAIL_PORT` | SMTP port (usually 587 for TLS, 465 for SSL). |
| `EMAIL_USER` | SMTP authentication username. |
| `EMAIL_PASS` | SMTP authentication password. |
| `EMAIL_FROM` | Sender address shown on outgoing emails. |

### Google OAuth

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID. Required for "Continue with Google" login. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret. |

### Runtime (Auto-set by Replit)

| Variable | Purpose |
|---|---|
| `PORT` | Port the API server binds to. Set by Replit — do not override. |
| `REPLIT_DOMAINS` | Comma-separated list of the app's public domains. Used to build Stripe webhook URLs. |
| `NODE_ENV` | `development` or `production`. |

---

## 5. Deployment Configuration

### How the App is Structured on Replit

The project runs as three concurrent workflows on Replit:

| Workflow | Command | Purpose |
|---|---|---|
| `API Server` | `pnpm --filter @workspace/api-server run dev` | Builds and starts the Express backend |
| `transcription-app: web` | `pnpm --filter @workspace/transcription-app run dev` | Runs the Vite dev server for the React frontend |
| `Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` | Design tool only (not user-facing) |

### Build Process

**API Server:**
1. `pnpm run build` — esbuild bundles all TypeScript from `src/` into `dist/index.mjs`
2. `pnpm run start` — Node.js runs `dist/index.mjs`
3. On startup: schema migration runs, stale sessions are closed, admin user is ensured, Stripe is initialized

**Frontend:**
1. Vite compiles React + TypeScript into static HTML/JS/CSS
2. In production (deployed), the output is `dist/` which is served as static files

### Deploying to Production on Replit

1. Click the **Deploy** button in the Replit UI (or go to the Deployments tab)
2. Replit builds both packages and hosts them under your `.replit.app` domain
3. The `DATABASE_URL` in production points to a **separate production database** from the development one
4. All secrets set in Replit Secrets are available in both development and production

### Redeploying After Code Changes

1. Make and test your changes in the development environment
2. Click **Deploy** again — Replit rebuilds and hot-swaps the production deployment
3. Zero-downtime redeploy: old requests are finished before the new version takes over

### Custom Domain

In the Replit Deployments tab, you can point a custom domain (e.g. `interpreterai.com`) at your deployment. Replit handles TLS/SSL certificates automatically.

---

## 6. Running Outside Replit

### Required Software

- **Node.js** v20 or later
- **pnpm** v9 or later (`npm install -g pnpm`)
- **PostgreSQL** v14 or later (local install or managed service like Supabase, Neon, or Railway)

### Step-by-Step Setup

#### 1. Clone/export the codebase

```bash
git clone <your-repo-url> interpreterai
cd interpreterai
```

#### 2. Install dependencies

```bash
pnpm install
```

#### 3. Set up environment variables

Create a `.env` file in `artifacts/api-server/`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/interpreterai
SESSION_SECRET=<generate a 64-character random string>
SONIOX_API_KEY=<your Soniox key>
OPENAI_API_KEY=<your OpenAI key>
ADMIN_PASSWORD=<your admin password>
PORT=8080
```

#### 4. Set up the database

Create the database in PostgreSQL:

```sql
CREATE DATABASE interpreterai;
```

The schema is created automatically on first startup via the migration script in `index.ts`. No manual SQL is needed.

#### 5. Build the API server

```bash
cd artifacts/api-server
pnpm run build
```

#### 6. Start the API server

```bash
pnpm run start
# Server starts on PORT (default 8080)
```

#### 7. Build the frontend

```bash
cd artifacts/transcription-app
pnpm run build
# Output: dist/
```

#### 8. Serve the frontend

The `dist/` folder is standard static HTML. Serve it with any static file server:

```bash
# Simple option using npx serve:
npx serve dist -p 3000

# Or configure Nginx to serve dist/ and proxy /api/* to localhost:8080
```

#### 9. Nginx configuration (recommended for production)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve frontend
    root /path/to/interpreterai/artifacts/transcription-app/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to Express
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

---

## 7. API Usage & Cost Model

### External APIs Used

#### Soniox (Speech-to-Text)

- **What:** Real-time streaming speech recognition
- **How used:** The server issues a short-lived API key via `/api/transcription/token`. The browser then connects directly to Soniox — audio never passes through the InterpreterAI server.
- **Pricing:** Approximately **$0.0025 per minute** of audio transcribed
- **Key:** `SONIOX_API_KEY` environment variable
- **Website:** https://soniox.com

#### OpenAI GPT-4o-mini (Translation)

- **What:** Large language model used to translate transcribed text
- **How used:** Each finalized transcription segment is sent to the OpenAI Chat Completions API with a detailed system prompt
- **Model:** `gpt-4o-mini` (fast, low-cost, high quality for translation tasks)
- **Pricing:** Approximately **$0.0002 per minute** of transcription (based on average token count per translation)
- **Key:** `OPENAI_API_KEY` environment variable
- **Website:** https://platform.openai.com

#### Stripe (Payments)

- **What:** Subscription billing for paid plans
- **How used:** Checkout sessions, webhook events update user plan in database
- **Pricing:** Stripe charges 2.9% + $0.30 per transaction (standard card rate)
- **Key:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- **Website:** https://stripe.com

### Cost Per User Per Minute

| Component | Cost/minute |
|---|---|
| Soniox STT | $0.0025 |
| OpenAI GPT-4o-mini | $0.0002 |
| **Total** | **$0.0027** |

### Example Monthly Cost Scenarios

| Users | Avg minutes/day | Monthly API cost |
|---|---|---|
| 10 users | 60 min/day | ~$49 |
| 50 users | 60 min/day | ~$243 |
| 100 users | 60 min/day | ~$486 |
| 500 users | 60 min/day | ~$2,430 |

### Platform Safety Cap

To prevent runaway costs, the system enforces a hard limit of **12,000 total minutes per day** across all users. If this is reached, new session starts return a 503 error until the next calendar day.

You can adjust this cap in `artifacts/api-server/src/routes/transcription.ts`:
```typescript
const GLOBAL_CAP_MINUTES = 200 * 60; // 200 hours = 12,000 minutes
```

---

## 8. Admin Operations Guide

### Accessing the Admin Dashboard

1. Go to `https://yourdomain.com/admin`
2. Log in with the `admin` username and the password set in `ADMIN_PASSWORD`
3. Admin routes are protected — non-admin accounts cannot access any `/api/admin/*` endpoints

### Managing Users

**To find a user:** Use the search box at the top of the Users tab. Search by username or email. Filter by plan type or active/inactive status.

**To edit a user:**
1. Click the purple pencil icon in the user's row
2. The Edit User drawer opens on the right
3. Changes available:
   - **Enable/disable account** — toggle the Active switch. Disabled users cannot log in.
   - **Change plan type** — set to trial, basic, professional, or unlimited
   - **Extend trial** — choose trial plan type and use the +7/+14/+30 day buttons, or set a specific date
   - **Change daily limit** — set how many minutes per day this user can transcribe
   - **Override today's usage** — manually adjust `minutesUsedToday` (use "Reset to 0" to give them a fresh day)
4. Click **Save Changes**

**To delete a user:**
1. Open the Edit User drawer
2. Click the red Delete button
3. This permanently removes the user and all their sessions, glossary, and feedback (cascade delete)

### Resetting a User's Daily Usage

**Quick reset (from table):** Click the refresh icon in the user's row → resets `minutesUsedToday` to 0 immediately.

**From Edit drawer:** Set the "Today's Usage Override" field to 0 and save.

### Assigning/Managing Trial Credits

1. Open Edit User drawer for the user
2. Set **Plan Type** to "trial"
3. Use the **+7/+14/+30 day** buttons or pick a specific expiry date
4. Save changes — user immediately gets the extended trial period

### Monitoring Usage & API Costs

**Platform-wide:** Dashboard tab shows:
- Total minutes transcribed today across all users
- Estimated API cost today (minutes × $0.0027)
- API cost this month (estimate)

**Per-user:** Edit User drawer shows:
- Total transcription time (all time)
- Total sessions
- Estimated total API cost for this user
- Estimated cost today

### Monitoring Platform Health

**Dashboard tab:**
- Error rate: number of API errors in the last 24 hours
- Active users: users who have logged in recently
- Sessions today: how many recording sessions were started

**Error Logs tab:**
- Every 4xx and 5xx API error is logged
- Filterable by date, user, endpoint, error type
- Use this to spot broken integrations or abuse patterns

### Managing Language Pairs

**Languages tab** in the admin panel:
- Toggle individual language pairs on or off
- Languages turned off here no longer appear in the workspace dropdown for users

### Handling Feedback

**Feedback tab:**
- Shows all ratings (1–5 stars) with comments
- Filter by rating to find negative feedback quickly
- No reply mechanism on feedback — for replies, use Support tickets

### Handling Support Tickets

**Support tab:**
- Shows all tickets sorted by newest first
- Click a ticket to see the full conversation thread
- Type a reply in the text box and click Send — user sees the reply in their Support panel in the workspace
- Change status to "closed" when resolved

### Monitoring Active Sessions

**Sessions tab → Live view:**
- Shows every currently running transcription session
- Displays username, language pair, duration so far
- Snapshot view shows the last pushed transcript/translation (from the in-memory snapshot, updates every 5 seconds)

---

## 9. Security Overview

### Authentication

- Sessions use HTTP-only cookies — JavaScript cannot access the session token
- Session secret (`SESSION_SECRET`) signs all cookies; if rotated, all existing sessions are invalidated
- Failed logins are rate-limited to 5 attempts per 10 minutes per IP address
- All login attempts (success and failure) are logged with IP address and device type

### Password Storage

- Passwords are hashed with **bcrypt** (10 salt rounds)
- Raw passwords are never stored, logged, or transmitted after the initial hashing
- The admin password is reset on startup from `ADMIN_PASSWORD` env var — the env var contains the desired password, not the hash; the server hashes it before storing

### Admin Security

- Admin access requires both a valid session and `isAdmin: true` on the user record
- Optional IP allowlist via `ADMIN_ALLOWED_IPS` — restricts admin API to specific IPs
- Admin account is always kept on the `unlimited` plan and cannot be degraded via normal API calls

### API Key Protection

- `SONIOX_API_KEY` is never exposed to the frontend directly — a temporary proxy is used (`/api/transcription/token` returns the key but it is short-lived at 1 hour)
- `OPENAI_API_KEY` and `STRIPE_SECRET_KEY` only exist server-side and are never included in any API response
- All secrets are stored in Replit Secrets (encrypted at rest), not in code or `.env` files checked into version control

### PHI / HIPAA Design

- No audio is processed or stored server-side
- No transcript or translation text is stored in the database or logs
- Request body logging is explicitly disabled in Pino
- Server logs contain only: HTTP method, URL path (no query strings), response status code
- In-memory session snapshots (for admin live view) contain transcript text temporarily but are never written to the database and are lost on server restart

### Rate Limiting

| Route | Limit |
|---|---|
| `/api/auth/login` | 5 requests / 10 min / IP (login attempts only) |
| `/api/auth/*` | 20 requests / min / IP |
| `/api/transcription/token` | 10 requests / min / user |
| `/api/*` (general) | 200 requests / min / IP |

### Abuse Prevention

- Global daily transcription cap (12,000 minutes platform-wide) limits worst-case API cost
- Per-user daily minute limits prevent single accounts from consuming excessive resources
- Trial expiry enforcement prevents indefinite free access
- Disabled accounts (`isActive: false`) are blocked at every authenticated endpoint

### Two-Factor Authentication

- Users can enable TOTP-based 2FA (Google Authenticator compatible)
- 2FA state is stored as an encrypted secret in `two_factor_secret` column
- Login with 2FA enabled requires both password and TOTP code; partial sessions (`pending2faUserId`) cannot access any protected resources

---

## 10. Scaling Considerations

### Current Architecture Limits

The application is built as a single-process Node.js server with in-memory state for live session snapshots. This is suitable for small to medium deployments.

### Session Snapshot Memory

The `sessionStore` (in-memory Map) holds live transcript snapshots for the admin live view. With many concurrent sessions, this grows proportionally. If you run multiple server processes (horizontal scaling), snapshots on one process would not be visible to another.

**Solution at scale:** Replace the in-memory `session-store.ts` with a Redis store.

### Daily Usage Reset

The current reset mechanism checks `lastUsageResetAt` lazily on each API call per user. At large scale (thousands of users making simultaneous calls at midnight), this creates a brief burst of DB writes.

**Solution at scale:** Add a scheduled job (cron) that resets `minutesUsedToday` and `lastUsageResetAt` in bulk once per day at midnight.

### Database Connection Pool

The PostgreSQL pool is shared across all requests. Default pool size is adequate for hundreds of concurrent users. For thousands:

**Solution:** Increase pool size in `lib/db/src/index.ts` or add PgBouncer as a connection pooler in front of PostgreSQL.

### Horizontal Scaling

To run multiple API server instances behind a load balancer:

1. Sessions must be stored in a shared backend — currently uses PostgreSQL via `connect-pg-simple` which already supports this
2. In-memory session snapshots need to be moved to Redis (see above)
3. The global cap cache (`globalCapCache` in `transcription.ts`) is per-process — move to Redis for accurate global enforcement

### Static Assets

The Vite-built frontend (`dist/`) is pure static files. Serve via a CDN (CloudFront, Cloudflare, Vercel, etc.) to eliminate frontend load from the server entirely. Only `/api/*` requests need to reach the Express server.

### Cost Monitoring

As usage grows, set up alerts on your OpenAI and Soniox dashboards for daily/monthly spend thresholds. The built-in platform cap (12,000 min/day) is a safety net, not a substitute for billing alerts.

### Stripe & Subscription Management

Currently plan upgrades are triggered by Stripe webhooks. If webhook delivery fails, users may pay but not get their plan upgraded. For reliability at scale, implement webhook replay verification and idempotency checks on the `customer.subscription.updated` handler.

---

*End of documentation. Last updated: April 2026.*
