# InterpreterAI — Project Handoff

## Overview
InterpreterAI is a professional desktop AI transcription and translation web application designed for interpreters. It offers real-time speech-to-text using the Soniox WebSocket API and live translation via Google Translate (with MyMemory fallback). The application features a macOS-style UI, session-based authentication with trial and daily usage limits, and an administrative dashboard for user and usage management. The project aims to provide a robust, HIPAA-compliant platform for real-time interpretation, emphasizing data privacy by not storing any Protected Health Information (PHI).

## User Preferences
The user has deferred the Stripe integration and explicitly stated: "Do NOT re-propose it automatically. To activate Stripe, ask the user to provide their `STRIPE_SECRET_KEY` manually and store it as an environment secret."
The user also dismissed the Replit Resend connector and prefers that the `RESEND_API_KEY` be added as an environment secret directly.

## System Architecture

**Tech Stack:**
- **Monorepo:** pnpm workspaces
- **Node.js:** 24
- **API:** Express 5 + TypeScript
- **Database:** PostgreSQL + Drizzle ORM
- **Validation:** Zod v4 + drizzle-zod
- **API Contract:** OpenAPI 3 → Orval codegen → React Query hooks
- **Build:** esbuild (ESM)
- **Frontend:** React 19 + Vite + Tailwind CSS v4 + Framer Motion
- **Auth:** express-session + connect-pg-simple (cookie-based)
- **Password Hashing:** Node.js built-in `crypto.scrypt`

**Project Structure:**
- `artifacts/api-server/`: Express API with routes for authentication, transcription, usage, administration, feedback, and translation. Includes middlewares for authentication and session management.
- `artifacts/transcription-app/`: React + Vite frontend with pages for login, workspace, and admin, along with hooks and components.
- `lib/api-spec/`: OpenAPI specification (`openapi.yaml`) as the source of truth for API contracts.
- `lib/api-client-react/`: Generated React Query hooks and custom fetch utilities.
- `lib/api-zod/`: Generated Zod schemas.
- `lib/db/`: Drizzle schema and DB connection pool.
- `scripts/`: Utility scripts, e.g., for seeding admin users.

**Database Schema:**
- `users`: Stores user account details, including username, password hash, admin status, activity status, trial dates, daily limits, usage statistics, and 2FA fields (`two_factor_secret`, `two_factor_enabled`).
- `sessions`: Records transcription session metadata (start/end time, duration, `langPair` for language pair used).
- `feedback`: Stores star ratings and comments, displayed upon trial expiry.
- `support_tickets`: Stores support requests (userId FK nullable, email, subject, message, status open/resolved, timestamps).
- `support_replies`: Stores thread replies per ticket (ticketId FK, authorId FK nullable, isAdmin, message, createdAt).
- `error_logs`: Records all 4xx/5xx API responses with userId, sessionId, endpoint, method, statusCode, errorType, errorMessage, userAgent, ipAddress, createdAt.
- `login_events`: Records every login attempt with userId, email, ipAddress, userAgent, success (bool), failureReason, is2fa (bool), createdAt.
- `user_sessions`: Used by `connect-pg-simple` for Express session storage. This table must be created manually if the DB is reset.

**Frontend → Backend Connectivity:**
- Vite development server proxies `/api` requests to `http://localhost:8080`.
- All frontend fetch calls include `credentials: "include"` for cookie-based authentication.

**Key Features & Behaviors:**
- **Transcription Flow (Soniox stt-rt-v4):**
    1. User selects an audio input device and starts recording.
    2. Frontend obtains an API token and starts a transcription session.
    3. A single WebSocket connection is established with `wss://stt-rt.soniox.com/transcribe-websocket`.
    4. Configuration includes `model: "stt-rt-v4"`, `language_hints: ["en","ar"]`, `enable_language_identification: true`, `enable_speaker_diarization: true`.
    5. PCM audio is streamed; Soniox handles language switching internally.
    6. **Token Model:** Responses contain `tokens[]` with `is_final` and `language` fields.
    7. **Transcript State:** `finalizedSegments` (append-only) and `activeSegment` (updates in place). UI renders based on these, minimizing re-renders.
    8. **Flush Triggers:** Speaker change, sentence boundary, utterance boundary (Soniox VAD), or word cap (100 words).
    9. Auto-reconnect on WebSocket closure with a delay.
- **Soniox v4 API:** Uses `stt-rt-v4` model for 60+ languages, per-token language ID, speaker diarization, and sub-200ms latency. Audio is processed via AudioWorklet in 60ms chunks (48kHz → 16kHz downsampled).
- **Bidirectional Translation:** Supports two language selectors (default English ↔ Arabic). Each finalized phrase is auto-translated to the opposite language based on Soniox's detected language. Translations are displayed in a right panel with language badges.
- **UI Layout:** Features a 64px sidebar, 52px header, split panels for original transcript and translations, and a bottom toolbar for device selection, language settings, and recording controls.
- **Translation Implementation:** Each phrase finalizes, then `POST /api/translate` is called, and the result is shown inline. Uses MyMemory free API.
- **Authentication:** Cookie-based session with a 30-day expiry. Login initiates a session cookie for subsequent authenticated calls.
- **HIPAA — Ephemeral Processing Design:** The platform is designed for real-time interpretation only; no PHI is stored. Audio is streamed directly from the browser to Soniox. Transcribed and translated texts exist only in the browser DOM and are cleared upon session stop. Server logs do not contain content; only metadata like `id`, `method`, `url`, `statusCode` are logged. Translation cache has been removed to prevent PHI retention. Frontend automatically clears all transcription data when recording stops. No browser-side persistence mechanisms are used.
- **Admin Dashboard (6-tab):**
  - *Overview*: System Metrics (6 cards), SaaS Metrics (MRR, conversion rate, avg session, sessions today, cost/session), API Cost Monitoring, Live Sessions panel with "View Session" button
  - *Users*: Table with session status (Online/Idle/Offline), account status, plan, usage; click any row → Session History drawer (last 100 sessions, CSV/TXT export, per-session cost estimate)
  - *Languages*: Enable/disable 35+ languages, set default A/B pair (in-memory config, resets on restart)
  - *Feedback*: Star ratings + comments from users
  - *Support*: Ticket management with thread replies and status toggle
  - *Errors*: Two sub-tabs: "API Errors" (error_logs table, type filter, summary cards, breakdown bar) and "Login Events" (login_events table, success/failure filter, 2FA badge, failure reason breakdown)
- **View Session Modal:** Admin can view live transcript + translation snapshot for an active session (auto-refreshes every 5s). Snapshot includes lang pair, mic device label, and content. Admin can terminate the session. Snapshots are in-memory only — never persisted to DB.
- **Snapshot Push:** While recording, workspace pushes transcript/translation/lang pair/mic label to `PUT /api/transcription/session/snapshot` every 5 s. Data lives in the server's `sessionStore` Map and is cleared when the session ends.
- **Interpreter Productivity Tools:**
  - **Session Timer**: Live `MM:SS` elapsed-time badge (red, clock icon) appears in the header while recording. Uses a `useEffect` / `setInterval` that resets on each new session.
  - **Session Notes panel**: Small panel (`w-[13%]`, 120–180px) to the LEFT of the main transcript panel. In-memory only — cleared automatically when the session stops (HIPAA safe). Amber sticky-note icon and "NOTES" label; multiline textarea with placeholder examples.
  - **Mark Important Line**: Flag button in the header toolbar. Highlights the most recent transcript row with amber background and left border (`rgba(245,158,11,0.12)`). Does not modify the transcription hook.
  - **Sessions Today**: Shown in the Account (Profile) panel under "Today's Usage". Computed by a `COUNT(*)` query on the `sessions` table filtered to `started_at >= CURRENT_DATE`, returned from `GET /api/auth/me`.
  - **Glossary System**: New `glossary_entries` table (userId FK, term, translation, UNIQUE per user+term). Sidebar BookOpen icon → `GlossaryPanel.tsx` with list, add form, and delete. API: `GET/POST /api/glossary`, `DELETE /api/glossary/:id`. Translation endpoint (`/api/transcription/translate`) loads the user's glossary at request time and injects matching entries as extra `termHints` into the GPT-4o-mini system prompt — no changes to the Soniox WebSocket pipeline.
- **Terminology Search Panel:** New panel in the left column, positioned between Notes and Session History. Allows interpreters to quickly look up medical and legal terminology during live calls.
  - Search field with 500ms debounce — searches fire automatically as the user types
  - Results powered by GPT-4o-mini with a medical/legal interpreter system prompt — no data stored (HIPAA-safe)
  - Results show: source term → translated term (in the selected language pair), domain badge (Medical/Legal/General with icon), optional contextual note
  - Example term pills ("rotator cuff", "plaintiff", "hypertension", etc.) shown when search is empty for quick discovery
  - Language pair synced live with the workspace `langA`/`langB` selectors — same pair the transcription uses
  - "Reference only · Not stored · Verify with authoritative sources" disclaimer shown on results
  - API: `POST /api/terminology/search` with `{ term, sourceLang, targetLang }` — auth required, nothing persisted
- **Support Ticket System:** Full SaaS support flow:
  - Users: LifeBuoy icon in workspace sidebar opens a slide-in Support panel with "New Request" (email/subject/message form) and "My Requests" (thread view with admin replies)
  - Submission triggers: DB save, Telegram notification to admin, confirmation email to user (via Resend)
  - Admin dashboard: 5th tab "Support (N open)" shows all tickets with filter chips (All/Open/Resolved), clickable rows expand thread, reply form sends email notification, status toggle (Open ↔ Resolved)
  - Admin reply triggers an email to the user via Resend

## External Dependencies
- **Soniox WebSocket API:** Used for real-time speech-to-text (`wss://stt-rt.soniox.com/transcribe-websocket`).
- **MyMemory API:** Used for live translation (`https://api.mymemory.translated.net/get`).
- **PostgreSQL:** Primary database for storing user accounts, session metadata, and feedback.
- **Stripe:** Fully wired for payments but currently deferred. Requires `STRIPE_SECRET_KEY` for activation.
- **Resend:** For sending welcome emails on signup. Requires `RESEND_API_KEY` and a verified sender domain.