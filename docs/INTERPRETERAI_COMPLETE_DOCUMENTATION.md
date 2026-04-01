# InterpreterAI — Complete Project Documentation

> Generated: April 2026 | Version: 1.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Full Feature List](#4-full-feature-list)
5. [Database Structure](#5-database-structure)
6. [API Reference](#6-api-reference)
7. [Environment Variables](#7-environment-variables)
8. [Deployment Configuration](#8-deployment-configuration)
9. [Admin Panel Functionality](#9-admin-panel-functionality)
10. [Referral & Invitation System](#10-referral--invitation-system)
11. [Security Overview](#11-security-overview)
12. [Cost Model & API Usage Tracking](#12-cost-model--api-usage-tracking)
13. [Session Monitoring System](#13-session-monitoring-system)
14. [Scaling Considerations](#14-scaling-considerations)

---

## 1. Project Overview

**InterpreterAI** is a real-time AI transcription and translation SaaS platform built specifically for professional interpreters. It enables interpreters to capture live speech (via microphone or browser tab audio), receive a real-time transcript, and see a side-by-side AI translation — all within a HIPAA-conscious ephemeral processing pipeline. No audio or transcript content is ever persisted to disk or database.

### Key Value Propositions

- Real-time speech-to-text via Soniox (sub-second latency WebSocket STT)
- Intelligent AI translation via OpenAI GPT-4o
- Multi-script Unicode language detection (17 scripts supported)
- Personal glossary/terminology management
- 14-day free trial, then Stripe-managed subscriptions
- HIPAA-conscious: ephemeral-only processing — no content stored
- Full admin dashboard with live session monitoring
- Referral/invitation system for organic growth
- Two-factor authentication (TOTP)
- Google OAuth sign-in

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User's Browser                       │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │        transcription-app (React + Vite)           │   │
│  │                                                  │   │
│  │  Audio capture (Mic / Browser Tab)               │   │
│  │  AudioWorklet → PCM buffer                       │   │
│  │  WebSocket ──────────────────────────────────►  │   │
│  │                                        Soniox    │   │
│  │  ◄── STT transcripts                   Cloud    │   │
│  │                                                  │   │
│  │  Polling → /api/transcription/translate           │   │
│  │  ◄── OpenAI translation (via api-server)         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                        │  REST + Session Cookie
                        ▼
┌─────────────────────────────────────────────────────────┐
│               api-server (Express + Node.js)             │
│                                                         │
│  Auth (Sessions, Google OAuth, 2FA/TOTP)                │
│  Soniox token provisioning (per-request short-lived)    │
│  OpenAI translation proxy                               │
│  Stripe billing (Checkout, Portal, Webhooks)            │
│  Admin endpoints                                        │
│  Referral tracking                                      │
│  Support ticket management                              │
└───────────────────┬─────────────────────────────────────┘
                    │ Drizzle ORM
                    ▼
          ┌─────────────────┐        ┌──────────────────┐
          │   PostgreSQL DB  │        │  External Services│
          │                 │        │                  │
          │  users          │        │  Soniox (STT)    │
          │  sessions       │        │  OpenAI (GPT-4o) │
          │  referrals      │        │  Stripe (Billing)│
          │  glossary       │        │  Resend (Email)  │
          │  support        │        │  Telegram (Notif)│
          │  feedback       │        │  Google (OAuth)  │
          │  login_events   │        └──────────────────┘
          │  error_logs     │
          └─────────────────┘
```

### Service Communication

| From | To | Method |
|------|----|--------|
| Frontend | API Server | REST (HTTP-only session cookie) |
| Frontend | Soniox | WebSocket (wss://) with short-lived token from API |
| API Server | OpenAI | HTTPS (server-side proxy, key never exposed to client) |
| API Server | PostgreSQL | Drizzle ORM (connection pool) |
| API Server | Stripe | HTTPS + Webhook (signature verified) |
| API Server | Resend | HTTPS |
| API Server | Telegram | HTTPS (async notifications) |

---

## 3. Monorepo Structure

```
workspace/
├── artifacts/
│   ├── api-server/              Express.js backend
│   │   ├── src/
│   │   │   ├── index.ts         Entry point, startup migration, Stripe sync
│   │   │   ├── app.ts           Express app setup, middleware
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      Authentication (login, signup, OAuth, 2FA)
│   │   │   │   ├── transcription.ts  Session management, Soniox token, translation
│   │   │   │   ├── admin.ts     Admin dashboard endpoints
│   │   │   │   ├── stripe.ts    Billing endpoints + webhook handler
│   │   │   │   ├── glossary.ts  User glossary CRUD
│   │   │   │   ├── support.ts   Support ticket endpoints
│   │   │   │   ├── feedback.ts  User feedback submission
│   │   │   │   ├── referrals.ts Referral tracking + analytics
│   │   │   │   ├── translate.ts Generic translation proxy
│   │   │   │   └── terminology.ts AI terminology lookup
│   │   │   ├── middlewares/
│   │   │   │   ├── requireAuth.ts    Session-based auth guard
│   │   │   │   ├── requireAdmin.ts   Admin role guard
│   │   │   │   ├── adminIpGuard.ts   IP allowlist for admin
│   │   │   │   └── session.ts        Express-session with PG store
│   │   │   └── lib/
│   │   │       ├── usage.ts     Usage tracking helpers
│   │   │       ├── email.ts     Resend email integration
│   │   │       ├── telegram.ts  Telegram notification integration
│   │   │       ├── totp.ts      TOTP/2FA logic (speakeasy)
│   │   │       ├── password.ts  Argon2 hash/verify
│   │   │       ├── logger.ts    Pino structured logger
│   │   │       ├── login-events.ts  Auth audit log
│   │   │       ├── session-store.ts In-memory live session snapshots
│   │   │       └── stripeClient.ts  Stripe SDK singleton
│   │
│   ├── transcription-app/       React frontend (Vite)
│   │   ├── src/
│   │   │   ├── App.tsx          Router + query client
│   │   │   ├── pages/
│   │   │   │   ├── landing.tsx      Marketing landing page
│   │   │   │   ├── login.tsx        Login form + 2FA
│   │   │   │   ├── signup.tsx       Registration with referral support
│   │   │   │   ├── workspace.tsx    Main interpreter workspace
│   │   │   │   ├── admin.tsx        Admin dashboard (full SPA)
│   │   │   │   ├── invite.tsx       Referral redirect page
│   │   │   │   ├── forgot-password.tsx
│   │   │   │   ├── reset-password.tsx
│   │   │   │   ├── terms.tsx
│   │   │   │   └── privacy.tsx
│   │   │   ├── components/
│   │   │   │   ├── InviteModal.tsx       Share invite link modal
│   │   │   │   ├── FeedbackModal.tsx     Internal feedback form
│   │   │   │   ├── UserFeedbackModal.tsx User-facing feedback
│   │   │   │   ├── ReportIssueModal.tsx  Bug/issue report
│   │   │   │   ├── GlossaryPanel.tsx     Glossary management
│   │   │   │   ├── SupportPanel.tsx      In-app support
│   │   │   │   ├── TerminologyPanel.tsx  AI terminology lookup
│   │   │   │   ├── SessionHistoryPanel.tsx  Session history view
│   │   │   │   └── ui/                  Shadcn UI components
│   │   │   └── hooks/
│   │   │       ├── use-transcription.ts  Core STT/translation pipeline
│   │   │       └── use-audio-devices.ts  Media device enumeration
│   │
│   └── mockup-sandbox/          Isolated UI component preview server
│
├── lib/
│   ├── db/                      Drizzle ORM schema + PG client
│   │   └── src/schema/          One file per table
│   ├── api-spec/                OpenAPI specification
│   ├── api-zod/                 Zod validation schemas (generated)
│   └── api-client-react/        TanStack Query hooks (generated via Orval)
│
├── scripts/                     CLI utilities (seed admin, Stripe products)
└── pnpm-workspace.yaml
```

---

## 4. Full Feature List

### Authentication & Accounts
- Email + password registration (Argon2 hashing)
- Google OAuth 2.0 sign-in / sign-up
- Two-factor authentication (TOTP via Speakeasy + QR code)
- Password reset via email token (Resend)
- Session management (PostgreSQL-backed express-session)
- HTTP-only cookies (secure in production)

### Transcription Workspace
- Real-time speech-to-text via Soniox WebSocket API
- Microphone input with device selector
- Browser Tab audio capture (screen share audio)
- AudioWorklet-based PCM processing (no audio stored)
- Real-time translation via OpenAI GPT-4o
- 17-script Unicode language detection (Latin, Arabic, Hebrew, Greek, Cyrillic, Devanagari, Thai, Georgian, Armenian, Hangul, CJK, Hiragana, Katakana, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati)
- Language dominance override at ≥60% script match
- Practice output panel (left column)
- Session history panel (right, top)
- Notes panel (right, middle)
- Terminology lookup panel (right, bottom)
- Personal glossary management (add/edit/delete terms)

### Billing
- 14-day free trial (no credit card required)
- Stripe Checkout for subscription creation
- Stripe Customer Portal for subscription management
- Webhook-driven subscription status sync
- Per-user daily minute limits (configurable per plan)
- Usage tracking (per day, per session, total lifetime)

### Admin Dashboard
- Overview stats (MRR, DAU, total minutes, API cost)
- Live session monitor with user/language/duration display
- User management (create, edit, suspend, delete, reset usage)
- Language configuration (enable/disable language pairs)
- Feedback viewer (star ratings + comments)
- Support ticket system with admin reply thread
- Error log viewer (grouped by endpoint + error type)
- Login event audit log (success/failure, IP, 2FA)
- System monitor (server health, memory, event feed)
- Referral analytics tab

### Referral System
- Unique invite link per user (`/invite?ref=<userId>`)
- Click tracking (stored as referral record)
- Registration attribution (links new user to referrer)
- Session activation tracking (`hasStartedSession`)
- In-app invite modal (Copy, WhatsApp, Telegram, Email, LinkedIn, native share)
- Admin analytics endpoint with per-user breakdown

### Support
- In-app support ticket submission
- Admin reply thread per ticket
- Ticket status management (open / resolved)
- Telegram notifications on new tickets
- Email notifications via Resend

### Security
- Argon2id password hashing
- TOTP-based 2FA
- IP allowlist for admin routes
- HTTP-only session cookies
- Stripe webhook signature verification
- No content stored (HIPAA-conscious ephemeral pipeline)
- Rate limiting on auth endpoints
- Admin IP guard middleware

---

## 5. Database Structure

See `DATABASE_SCHEMA_REFERENCE.md` for full schema details.

### Table Summary

| Table | Purpose |
|-------|---------|
| `users` | User accounts, plan, usage, Stripe IDs |
| `password_reset_tokens` | Email-based password recovery tokens |
| `sessions` | Transcription session records (start/end/duration) |
| `glossary_entries` | User-defined term→translation pairs |
| `referrals` | Referral click/registration/activation tracking |
| `feedback` | Star ratings and comments from users |
| `support_tickets` | User support requests |
| `support_replies` | Threaded replies on support tickets |
| `login_events` | Authentication audit log |
| `error_logs` | System error tracking |

---

## 6. API Reference

All endpoints are prefixed with `/api`. Authentication uses HTTP-only session cookies.

### Authentication (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Email/password login |
| POST | `/signup` | — | New account registration |
| POST | `/logout` | — | Session destruction |
| GET | `/me` | User | Current user profile |
| POST | `/change-password` | User | Password update |
| POST | `/forgot-password` | — | Password reset token |
| POST | `/reset-password` | — | Apply reset token |
| GET | `/google` | — | Initiate Google OAuth |
| GET | `/google/callback` | — | Google OAuth callback |
| POST | `/2fa/setup` | User | Generate TOTP + QR |
| POST | `/2fa/enable` | User | Confirm and enable 2FA |
| POST | `/2fa/verify` | Pending | Complete 2FA login |
| POST | `/2fa/disable` | User | Disable 2FA |
| GET | `/2fa/status` | User | 2FA enabled status |
| POST | `/heartbeat` | User | Keep session alive |

### Transcription (`/api/transcription`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/token` | User | Get Soniox API token |
| POST | `/session/start` | User | Open new session |
| POST | `/session/heartbeat` | User | Keep session alive |
| POST | `/session/stop` | User | End session + tally usage |
| PUT | `/session/snapshot` | User | Push live snapshot to admin monitor |
| GET | `/sessions` | User | Session history |
| POST | `/translate` | User | Translate a text segment (ephemeral) |

### Admin (`/api/admin`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Admin | List all users |
| POST | `/users` | Admin | Create user |
| PATCH | `/users/:id` | Admin | Update user |
| DELETE | `/users/:id` | Admin | Delete user |
| POST | `/users/:id/reset-usage` | Admin | Reset daily usage |
| GET | `/stats` | Admin | Platform metrics |
| GET | `/session/:id` | Admin | View session/snapshot |
| POST | `/session/:id/terminate` | Admin | Force-end session |
| GET | `/feedback` | Admin | All feedback |
| GET | `/support` | Admin | All tickets |
| POST | `/support/:id/reply` | Admin | Reply to ticket |
| PUT | `/support/:id/status` | Admin | Update ticket status |
| GET | `/errors` | Admin | Error log |
| GET | `/login-events` | Admin | Auth audit log |
| GET | `/system-monitor` | Admin | System health |

### Referrals (`/api/referrals`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/click` | — | Track referral link click |
| GET | `/my` | User | My referral stats |
| GET | `/admin/analytics` | Admin | Platform-wide analytics |
| GET | `/admin/user/:id` | Admin | Per-user referral data |

### Other
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/healthz` | — | Health check |
| GET | `/api/usage/me` | User | Usage limits & trial status |
| POST | `/api/feedback` | User | Submit rating |
| GET/POST/DELETE | `/api/glossary` | User | Glossary CRUD |
| POST | `/api/terminology/search` | User | AI terminology lookup |
| POST | `/api/translate` | User | Generic text translation |
| GET | `/api/stripe/products-with-prices` | — | Subscription plans |
| POST | `/api/stripe/checkout` | User | Create checkout session |
| POST | `/api/stripe/portal` | User | Create portal session |

---

## 7. Environment Variables

See `ENVIRONMENT_VARIABLES_REFERENCE.md` for full details.

### Required Variables Summary

| Variable | Service |
|----------|---------|
| `DATABASE_URL` | PostgreSQL |
| `SESSION_SECRET` | Express sessions |
| `ADMIN_PASSWORD` | Admin account reset |
| `OPENAI_API_KEY` | Translation |
| `SONIOX_API_KEY` | Speech-to-text |
| `STRIPE_SECRET_KEY` | Payments |
| `GOOGLE_CLIENT_ID` | OAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth |
| `RESEND_API_KEY` | Email |
| `TELEGRAM_BOT_TOKEN` | Notifications |
| `TELEGRAM_CHAT_ID` | Notifications |

---

## 8. Deployment Configuration

### Replit Deployment
The project is deployed on Replit using the built-in deployment system:
- **Frontend**: Served as a static Vite build, path-routed under the Replit proxy
- **API Server**: Long-running Express process on `$PORT`
- **Database**: Replit-managed PostgreSQL (connection via `DATABASE_URL`)

### Startup Sequence (`api-server/src/index.ts`)
1. Run `migrateSchema()` — creates all tables if not present (idempotent `CREATE TABLE IF NOT EXISTS`)
2. Run `clearStaleSessions()` — marks orphaned sessions as ended
3. Start Stripe product sync (`stripe-replit-sync`)
4. Reset admin password if `ADMIN_PASSWORD` env var is set
5. Start listening on `$PORT`

### Frontend Build
```bash
pnpm --filter @workspace/transcription-app run build
```

### API Build
```bash
pnpm --filter @workspace/api-server run build
```

### Development
```bash
pnpm --filter @workspace/api-server run dev        # API on $PORT
pnpm --filter @workspace/transcription-app run dev  # Vite HMR
```

---

## 9. Admin Panel Functionality

Access the admin panel at `/admin` (requires admin account).

### Tabs

| Tab | Purpose |
|-----|---------|
| Overview | Platform KPIs: MRR, DAU, total minutes used, estimated API cost |
| Monitor | Live session view — user, language pair, duration, mic/tab label, snapshot |
| Users | Full user list with search, create, edit drawer, suspend/delete |
| Languages | Enable/disable language pairs system-wide |
| Feedback | Star ratings and comments submitted by users |
| Support | Support ticket queue with threaded replies |
| Errors | Error log grouped by endpoint/type |
| Referrals | Referral funnel analytics |

### User Edit Drawer
From the Users tab, clicking a user opens a drawer with:
- Edit email, username, plan type, daily limit, active/admin status
- Usage stats (total minutes, sessions, cost estimate)
- Account info (ID, admin status, member since)
- Invited Interpreters section (referrals attributed to this user)
- Reset usage button
- Delete user button

### Admin Password Reset
Set `ADMIN_PASSWORD` environment variable. On every server startup, the admin account password is reset to this value. This ensures you can always regain access.

---

## 10. Referral & Invitation System

### Flow
1. Logged-in user opens **Invite Modal** (Share2 button in workspace sidebar)
2. Modal displays their unique invite link: `https://[domain]/invite?ref=[userId]`
3. Share options: Copy link, WhatsApp, Telegram, Email, LinkedIn, native device share
4. Invitee clicks the link → lands on `/invite?ref=[userId]`
5. `invite.tsx` calls `POST /api/referrals/click` → receives `referralId`
6. `referralId` stored in `sessionStorage`; invitee redirected to `/signup`
7. On signup, `referralId` sent in request body → `referrals` record updated with `registeredUserId`
8. When invitee starts their first transcription session → `hasStartedSession = true`

### Database Tracking
```
referrals table:
  referrer_id         → who shared the link
  clicked_at          → when the link was clicked
  registered_user_id  → who signed up via the link
  registered_at       → when they signed up
  has_started_session → whether they ran a transcription
```

### Admin Analytics
`GET /api/referrals/admin/analytics` returns per-referrer breakdown:
- Total clicks
- Total registrations
- Total activations (started a session)
- Conversion rates

---

## 11. Security Overview

### Authentication Security
- **Passwords**: Hashed with Argon2id (memory-hard, GPU-resistant)
- **Sessions**: PostgreSQL-backed express-session, HTTP-only + Secure cookies in production
- **2FA**: TOTP (RFC 6238) via Speakeasy; QR code setup; can disable with password or current TOTP
- **Google OAuth**: State parameter validated; account linked by `googleAccountId`

### API Security
- All sensitive routes behind `requireAuth` middleware (checks session)
- Admin routes additionally behind `requireAdmin` + `adminIpGuard` (IP allowlist via `ADMIN_ALLOWED_IPS`)
- Stripe webhook signature verified with `STRIPE_WEBHOOK_SECRET`
- Rate limiting on authentication endpoints (express-rate-limit)

### Data Privacy (HIPAA-Conscious Design)
- **No audio stored**: Raw audio buffers are processed in-browser via AudioWorklet and sent directly to Soniox over WebSocket — never to the app's servers
- **No transcripts stored**: Transcript/translation content is never written to the database or logs
- **Ephemeral translation**: `POST /api/transcription/translate` processes and discards; only the user sees results
- **Session snapshots**: In-memory only (`session-store.ts`); cleared on server restart

### Infrastructure Security
- `NODE_ENV=production` enables secure cookies
- `SESSION_SECRET` must be a long random string
- Database credentials via `DATABASE_URL` (never hardcoded)
- All API keys in environment variables / Replit Secrets

---

## 12. Cost Model & API Usage Tracking

### Per-Minute Costs
| Service | Cost per minute |
|---------|----------------|
| Soniox STT | $0.0025 / min |
| OpenAI Translation | $0.0002 / min |
| **Total** | **$0.0027 / min** |

### Usage Tracking
- `minutesUsedToday` — resets daily at midnight UTC
- `totalMinutesUsed` — lifetime accumulation
- `totalSessions` — count of sessions started
- `dailyLimitMinutes` — admin-configurable per user (default: 300 min = 5 hours)

### Admin Cost Visibility
The admin Overview tab displays:
- Estimated daily API cost (sum of all users' today usage × $0.0027)
- Total lifetime API cost estimate

### Cost Control Mechanisms
- Hard daily limit per user (configurable)
- Trial expiry after 14 days
- Admin can suspend any account instantly
- Admin can reset a user's daily usage counter

---

## 13. Session Monitoring System

### Live Session Store (`lib/session-store.ts`)
- In-memory Map keyed by `sessionId`
- Frontend sends `PUT /api/transcription/session/snapshot` with current transcript/translation
- Admin `GET /api/admin/session/:id` reads the snapshot
- Admin can call `POST /api/admin/session/:id/terminate` to force-stop a session
- Store is cleared on server restart (ephemeral by design)

### Session Lifecycle
```
POST /session/start  →  DB record created, sessionId returned
                         hasStartedSession updated on referrals
POST /session/heartbeat  →  lastActivityAt updated (every 30s)
PUT /session/snapshot    →  live content pushed to in-memory store
POST /session/stop   →  DB record closed, duration + minutes calculated
```

### Stale Session Cleanup
On startup, `clearStaleSessions()` closes any sessions with `lastActivityAt` older than 2 hours and no `endedAt`, calculating their duration from available timestamps.

---

## 14. Scaling Considerations

### Current Architecture Limits
- **Single process**: The API server runs as a single Node.js process. For high traffic, consider clustering or a load balancer.
- **In-memory session store**: Live session snapshots are in-memory. Not shared across multiple instances. For multi-instance deployment, migrate to Redis.
- **PostgreSQL**: Replit-managed Postgres is suitable for moderate load. For high scale, consider connection pooling (PgBouncer) or a managed PG service.

### Recommended Scaling Path
1. **Phase 1** (current): Single Replit deployment — handles dozens of concurrent users
2. **Phase 2**: Add Redis for session snapshot sharing + rate limit coordination
3. **Phase 3**: Containerize API server, horizontal scaling with a load balancer
4. **Phase 4**: CDN for frontend static assets; database read replicas

### Bottlenecks to Watch
- Soniox WebSocket connections are per-user and handled client-side — not a server bottleneck
- OpenAI translation calls are the main server-side latency source — consider caching identical segments
- PostgreSQL connection pool should be tuned (`max` connections in Drizzle config)

---

*End of documentation. Last updated: April 2026.*
