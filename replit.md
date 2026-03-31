# InterpretAI — Project Handoff

## What This Is

A professional desktop AI transcription and translation web app for interpreters. Built with a light Apple/macOS-style UI ("Soniox Desktop" aesthetic). Real-time speech-to-text via Soniox WebSocket API, live translation via Google Translate (with MyMemory fallback), session-based auth with trial + daily limits, and an admin dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Node.js | 24 |
| API | Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4 + drizzle-zod |
| API contract | OpenAPI 3 → Orval codegen → React Query hooks |
| Build | esbuild (ESM) |
| Frontend | React 19 + Vite + Tailwind CSS v4 + Framer Motion |
| Auth | express-session + connect-pg-simple (cookie-based) |
| Password hashing | Node.js built-in `crypto.scrypt` |

---

## Project Structure

```
artifacts/
  api-server/          Express API (port 8080)
    src/
      routes/          auth, transcription, usage, admin, feedback, translate
      middlewares/     requireAuth, session, requireAdmin
      lib/             password.ts (scrypt hash/verify), usage.ts, logger.ts
  transcription-app/   React + Vite frontend
    src/
      pages/           login.tsx, workspace.tsx, admin.tsx
      hooks/           use-transcription.ts, use-audio-devices.ts
      components/      AudioMeter.tsx, FeedbackModal.tsx, ui-components.tsx
      lib/             utils.ts (formatMinutes)
lib/
  api-spec/            openapi.yaml (source of truth) + orval.config.ts
  api-client-react/    Generated React Query hooks + custom-fetch.ts
  api-zod/             Generated Zod schemas
  db/                  Drizzle schema + DB connection pool
scripts/
  src/seed-admin.ts    Seeds the admin user
```

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Accounts: username, password_hash, is_admin, is_active, trial dates, daily limit, usage stats |
| `sessions` | Transcription session records (start/end time, duration) |
| `feedback` | Star ratings + comments (shown on trial expiry) |
| `user_sessions` | Express session store — **must exist before starting the server** |

### Critical: user_sessions table
`connect-pg-simple` is configured with `createTableIfMissing: false` to avoid an esbuild path issue.
The table must be created manually if the DB is reset:
```sql
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
```

---

## Environment Secrets (all already set)

| Secret | Used by |
|---|---|
| `SESSION_SECRET` | Express session signing |
| `SONIOX_API_KEY` | Served to browser via `/api/transcription/token` — never exposed directly |
| `DATABASE_URL` | Auto-provisioned PostgreSQL |

---

## Admin Credentials

- **Username**: `admin`
- **Password**: `admin123`
- Change via Admin panel after first login.

---

## API Routes

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/transcription/token          → returns { apiKey } for Soniox WS
POST   /api/transcription/session/start  → returns { sessionId }
POST   /api/transcription/session/stop   → records usage minutes

POST   /api/translate                    → MyMemory proxy { text, sourceLang, targetLang }

GET    /api/usage/me

POST   /api/feedback

GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
DELETE /api/admin/users/:id
POST   /api/admin/users/:id/reset-usage
GET    /api/admin/feedback
```

---

## Frontend → Backend Connectivity

Vite dev server proxies `/api` → `http://localhost:8080` via `vite.config.ts`:
```ts
proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } }
```
All fetch calls use `credentials: "include"` for cookie auth (set in `lib/api-client-react/src/custom-fetch.ts`).

---

## Key Behaviors

### Transcription Flow — Single-Socket Bilingual (stt-rt-v4)
1. User selects any audio input device from dropdown; clicks **Start** — no language toggle needed
2. Frontend calls `POST /api/transcription/token` + `POST /api/transcription/session/start`
3. Frontend opens **ONE** WebSocket to `wss://stt-rt.soniox.com/transcribe-websocket`
4. Config: `model: "stt-rt-v4"`, `language_hints: ["en","ar"]`, `enable_language_identification: true`, `enable_speaker_diarization: true`
5. Same PCM audio streamed to the single WS — stt-rt-v4 handles EN/AR switching internally (60+ languages)
6. **Token model**: each response message contains `tokens[]` with per-token `is_final: bool` and `language` field
7. **Final tokens** (`is_final: true`) → delta-appended to `finalBufRef` (committed text, never changes)
8. **Non-final tokens** (`is_final: false`) → REPLACE `nfDisplayRef` each message (provisional suffix)
9. **Transcript state** = two independent structures, NEVER rebuilt from scratch:
   - `finalizedSegments: Phrase[]` — append-only; once pushed, never modified again
   - `activeSegment: ActiveSegment | null` — updates in place (`finalBuf + nfDisplay`) as tokens stream
10. **UI rendering**: `finalizedSegments.map(SegmentRow)` + `activeSegment && <ActiveRow>` — finalized rows never re-render; only the active row changes
11. **flush()** — always immediate; computes modal speaker from `speakerHistoryRef`, appends to `finalizedSegments`, clears refs, sets `activeSegment = null`
12. **Finalization triggers** (three):
    - **Speaker change** — speaker A token arrives when segment is open for speaker B → flush before appending
    - **Sentence boundary** — token ends with `.?!` → flush after appending
    - **Utterance boundary** — all tokens in message are final (Soniox VAD) → flush
    - **Word cap** (100 words) — last-resort safety valve
13. Per-token processing order: (1) open segment if none, (2) speaker-change check BEFORE append, (3) append text, (4) sentence-boundary check AFTER append
14. Auto-reconnect on unexpected WS close (200ms delay); `apiErrorOccurred` prevents loops
15. Stop → promote nfDisplay to finalBuf if needed → `flush()` → `POST /api/transcription/session/stop`
16. Translation is currently disabled (removed; to re-enable add `translatePhrase` calls in workspace.tsx)

### Soniox v4 API Notes
- **Endpoint**: `wss://stt-rt.soniox.com/transcribe-websocket` (v4, released Feb 5 2026)
- **Model**: `stt-rt-v4` — 60+ languages, per-token language ID, speaker diarization, sub-200ms latency
- **Old endpoint** `wss://api.soniox.com` with models `en_v2_lowlatency` / `ar_v1` is legacy
- **Init format**: `{ api_key, model, audio_format: "pcm_s16le", sample_rate_hertz: 16000, num_audio_channels: 1, language_hints, enable_language_identification, enable_speaker_diarization }`
- **Response**: `{ tokens: [{text, is_final, language?, speaker?}], audio_final_proc_ms, audio_total_proc_ms, finished? }`
- **AudioWorklet**: 60ms chunks (48kHz → 16kHz downsampled), no `sampleRate` in `AudioContext` constructor

### Phrase & LiveTranscript interfaces
```typescript
interface Phrase {
  id: string;
  speakerLabel: string;  // "Speaker" | "Speaker 2" | ...
  text: string;          // complete sentence committed after 800ms silence
  language: "en" | "ar"; // from stt-rt-v4 token.language field
}

interface LiveTranscript {
  text: string;          // finalBuf + nfDisplay (one growing live line)
  language: "en" | "ar"; // detected from latest token batch
  speakerLabel: string;
}
```

### Bidirectional Translation
- Two language selectors in the toolbar: Language A ↔ Language B (default: English ↔ Arabic)
- Each phrase is auto-translated: if detected as Language A → translate to B, if detected as Language B → translate to A
- Language detected from Soniox `lang` field; falls back to Arabic Unicode character ratio
- Right panel shows translation with a language badge for the target language

### UI Layout
- **Sidebar** (64px): User / Mic / Globe / Admin icons + logout at bottom
- **Header** (52px): "InterpretAI" branding + trial badge + daily usage badge
- **Split panels**: Left = original transcript (chat bubbles), Right = translations (mirrored bubbles)
- **Bottom toolbar**: Row 1 = single device selector (all system inputs) + VU meter; Row 2 = Language A + swap + Language B + Record button (centred)
- Per-bubble copy icon (appears on hover), no "Copy All"
- Column headers update dynamically with selected language names

### Translation
- Per-phrase: each Phrase finalizes → `POST /api/translate` → result shown inline in the right panel
- MyMemory free API (no key required): `https://api.mymemory.translated.net/get`

### Auth
- Cookie session, 30-day expiry
- After login: `POST /api/auth/login` → session cookie → all subsequent calls include cookie automatically

---

## Running Codegen

After any change to `lib/api-spec/openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
```

## Running DB Push

After any Drizzle schema change in `lib/db/src/schema/`:
```bash
pnpm --filter @workspace/db run push
```

---

## Known Decisions / Gotchas

| Topic | Decision |
|---|---|
| Password hashing | `crypto.scrypt` (bcrypt/argon2 had native build issues in pnpm) |
| Session store | `createTableIfMissing: false` — table must exist before server start |
| Audio | 48kHz native capture, no virtual drivers needed |
| Soniox key | Fetched server-side, sent to browser via `/api/transcription/token`; browser connects to Soniox WS directly |
| Translation | MyMemory free tier (500 chars/request, ~5 req/sec limit) |
| Soniox API v10 | Response uses `fw`/`nfw` word arrays; `spk` index per word (0 = Interpreter, 1 = Caller) |

---

## Stripe Integration (not yet connected)

All Stripe code is fully wired and ready. The integration was deferred by the user.

**To enable Stripe payments:**

1. Open the **Integrations** tab in the Replit sidebar
2. Find **Stripe** and complete the OAuth flow
3. Once connected, `STRIPE_SECRET_KEY` will be automatically injected
4. Restart the API server — it will auto-run migrations, set up webhooks, and sync data
5. Run the seed script to create subscription products:
   ```bash
   pnpm --filter @workspace/scripts run seed-products
   ```

**What's already built:**
- `artifacts/api-server/src/lib/stripeClient.ts` — authenticated Stripe client
- `artifacts/api-server/src/lib/stripeService.ts` — checkout, portal, customer creation
- `artifacts/api-server/src/lib/storage.ts` — queries `stripe.*` schema tables
- `artifacts/api-server/src/lib/webhookHandlers.ts` — webhook processor
- `artifacts/api-server/src/routes/stripe.ts` — `/api/stripe/*` routes (products, checkout, portal, subscription)
- `artifacts/api-server/src/index.ts` — calls `runMigrations()` + `getStripeSync()` + `syncBackfill()` on startup
- `artifacts/api-server/src/app.ts` — webhook route registered BEFORE `express.json()` (critical)
- `scripts/src/seed-products.ts` — creates Basic ($19/mo), Professional ($49/mo), Unlimited ($99/mo) plans
- Frontend upgrade modal in `workspace.tsx` — fetches plans, redirects to Stripe Checkout
- DB schema has `stripe_customer_id` and `stripe_subscription_id` columns on `users`

**Connector ID** (for future reference): `connector:ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y`

---

## What Still Could Be Improved

- Diarization mapping is heuristic (tag 1 → Interpreter). A smarter approach would track which device audio first activated which tag.
- Translation could be batched or cached to avoid repeated MyMemory calls for the same text.
- Admin panel could support bulk user import.
- Per-user custom domains not supported.
- After a user pays via Stripe, their `planType` in the DB should be updated via webhook — this webhook handler extension is the one remaining piece once Stripe is connected.
