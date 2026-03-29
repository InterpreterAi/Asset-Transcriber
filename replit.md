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

### Transcription Flow — True Bilingual Auto-detect
1. User selects any audio input device from dropdown; clicks **Start** — no language toggle needed
2. Frontend calls `POST /api/transcription/token` + `POST /api/transcription/session/start`
3. Frontend opens **2 simultaneous** Soniox WebSocket connections: `wsEn` (`en_v2_lowlatency`) + `wsAr` (`ar_v1`)
4. **Same PCM** stream sent to both WSs — each engine transcribes in its language independently
5. Language filter `isArabic()` (≥35% Arabic Unicode codepoints) routes output to correct channel:
   - `ar WS nfw/fw` that fails Arabic test → discarded (garbage English from ar engine)
   - `en WS nfw/fw` that passes Arabic test → discarded (prevents English engine from stealing Arabic words)
6. **Arabic activity guard**: `lastArActivityRef` records timestamp of last valid Arabic output; English WS live display suppressed for 1 s after Arabic activity prevents en WS garbage from overwriting the Arabic live line
7. **fw buffer (per channel)**: committed words accumulate in `enBufRef` / `arBufRef` — NO immediate phrase creation
8. **1.5 s silence timer** (per channel): resets on every nfw/fw event; when it fires the entire buffer becomes ONE phrase in history
9. **Live line**: shows `fwBuffer + current nfw partial` in one italic line — replaced in place, never auto-scrolls
10. **Auto-scroll** only fires when `phrases.length` changes (final phrase added), never on partials
11. Translation fires immediately on each sealed phrase (`POST /api/translate`)
12. Auto-reconnect on unexpected WS close (200 ms delay); `apiErrorOccurred` prevents loops
13. Stop → flush both buffers → `POST /api/transcription/session/stop` with duration

### Soniox API Notes
- **Endpoint**: `wss://api.soniox.com/transcribe-websocket`
- **VALID models ONLY**: `en_v2_lowlatency` (English) and `ar_v1` (Arabic). `multilingual`, `v4`, `auto` → `<invalid_model>` error
- **Init format**: `{ api_key, model, audio_format: "pcm_s16le", sample_rate_hertz: 16000, num_audio_channels: 1, include_nonfinal: true }`
- **No `language` field in init** — model name implies the language
- **Response format**: `{ fw: [{t, spk}], nfw: [{t, spk}] }` — `fw` = committed words, `nfw` = current partial
- **AudioWorklet**: 60ms chunks (48kHz → 16kHz downsampled), no `sampleRate` in `AudioContext` constructor

### Phrase interface
```typescript
interface Phrase {
  id: string;
  speakerLabel: string;  // "Speaker" | "Speaker 2" | ...
  text: string;          // complete sentence committed after 1.5 s silence
  language: "en" | "ar"; // set by the WS channel that produced it
}

interface LiveTranscript {
  text: string;          // fwBuffer + current nfw partial (one growing line)
  language: "en" | "ar";
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

## What Still Could Be Improved

- Diarization mapping is heuristic (tag 1 → Interpreter). A smarter approach would track which device audio first activated which tag.
- Translation could be batched or cached to avoid repeated MyMemory calls for the same text.
- Admin panel could support bulk user import.
- No email-based password reset yet.
- Per-user custom domains not supported.
