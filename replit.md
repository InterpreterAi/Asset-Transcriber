# InterpretAI — Project Handoff

## What This Is

A professional desktop AI transcription and translation web app for interpreters. Built with a light Apple/macOS-style UI ("Soniox Desktop" aesthetic). Real-time speech-to-text via Soniox WebSocket API, live translation via MyMemory, session-based auth with trial + daily limits, and an admin dashboard.

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

### Transcription Flow
1. User clicks Record → frontend calls `POST /api/transcription/token` (gets Soniox key) + `POST /api/transcription/session/start`
2. Frontend opens up to **4** `wss://api.soniox.com/transcribe-websocket` connections directly from the browser
3. Audio captured at native hardware rate (48 kHz typical) via Web Audio API; manually downsampled to 16 kHz via linear interpolation
4. Mic and system audio are **never mixed** — each source has its own pair of WebSocket connections:
   - `wsMicEn` (en_v2, spkOffset=0) + `wsMicAr` (ar_v1, spkOffset=100) — microphone/interpreter audio
   - `wsSysEn` (en_v2, spkOffset=200) + `wsSysAr` (ar_v1, spkOffset=300) — system audio/caller (only opened when a system audio device is selected)
5. Soniox response format: `fw[]` (final words); diarization via `spk` field per word
6. Final words grouped into `Phrase[]` objects. Each phrase has `source: "mic" | "sys"` and `speakerLabel: "Interpreter" | "Caller"`
7. Each finalized phrase (active → false) is individually translated via `POST /api/translate`
8. When stopped → `POST /api/transcription/session/stop` with duration in seconds
9. If both mic WebSockets die while recording → auto-stop. If sys WebSockets die → warn but continue with mic.

### Soniox API Notes
- **Endpoint**: `wss://api.soniox.com/transcribe-websocket`
- **Valid models**: ONLY `en_v2` (English) and `ar_v1` (Arabic). Any other model returns `<invalid_model>`.
- **Init format**: `{ api_key, model, audio_format: "pcm_s16le", sample_rate_hertz: 16000, num_audio_channels: 1, include_nonfinal: false }`
- **CRITICAL**: `include_nonfinal` MUST be `false` — setting it to `true` causes Soniox to close the connection after ~3 seconds on en_v2/ar_v1
- **Response format**: `{ fw: [{t, spk, lang}] }` — `fw` = final words only (no partial words)
- **Speaker diarization**: `spk` index (0-indexed) per word; offset per connection ensures global uniqueness
- **Language filter**: ar_v1 output validated by Arabic Unicode char ratio ≥35%; en_v2 output must NOT pass that test
- **Audio**: Capture at native browser rate (48 kHz), downsample via `downsampleLinear()` to 16 kHz before sending PCM

### Phrase interface
```typescript
interface Phrase {
  id: string;
  speakerIndex: number;   // global: 0-99 = mic/en, 100-199 = mic/ar, 200-299 = sys/en, 300-399 = sys/ar
  speakerLabel: string;   // "Interpreter" | "Interpreter 2" | "Caller" | "Caller 2"
  source: "mic" | "sys"; // audio origin
  text: string;
  language: string;       // "en" | "ar"
  active: boolean;        // true while still accumulating words
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
- **Bottom toolbar**: Row 1 = Mic selector + level meter + System selector + level meter; Row 2 = Source lang + swap + Target lang + Record button
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

## What Still Could Be Improved

- Diarization mapping is heuristic (tag 1 → Interpreter). A smarter approach would track which device audio first activated which tag.
- Translation could be batched or cached to avoid repeated MyMemory calls for the same text.
- Admin panel could support bulk user import.
- No email-based password reset yet.
- Per-user custom domains not supported.
