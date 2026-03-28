# Workspace

## Overview

AI Transcription & Translation App — a professional web application for interpreters that provides real-time transcription via Soniox API, audio device management, usage tracking, trial system, admin dashboard, and feedback collection.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (auth, transcription proxy, admin, usage, feedback)
│   └── transcription-app/  # React + Vite frontend (login, workspace, admin)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed-admin.ts   # Admin user seeder
```

## Database Schema

- `users` — user accounts with trial dates, usage stats, daily limits
- `sessions` — transcription session records
- `feedback` — star ratings and comments from users
- `user_sessions` — Express session store (auto-created by connect-pg-simple)

## Authentication

Session-based (cookie) auth via `express-session` + `connect-pg-simple`. No JWT.

## Admin Access

Default admin credentials:
- Username: `admin`
- Password: `admin123`
- **Change these immediately after first login via Admin panel**

## Key API Routes

- `POST /api/auth/login` — login
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — current user info + usage stats
- `POST /api/transcription/token` — get Soniox API key (proxied securely)
- `POST /api/transcription/session/start` — start session
- `POST /api/transcription/session/stop` — stop session + record usage
- `GET /api/usage/me` — usage stats
- `POST /api/feedback` — submit feedback
- `GET/POST /api/admin/users` — admin user management
- `PATCH/DELETE /api/admin/users/:id` — update/delete user
- `POST /api/admin/users/:id/reset-usage` — reset daily usage
- `GET /api/admin/feedback` — view all feedback

## Environment Secrets

- `SESSION_SECRET` — Express session secret (already set)
- `SONIOX_API_KEY` — Soniox API key for speech-to-text (already set)
- `DATABASE_URL` — PostgreSQL connection (auto-provisioned)

## Running Codegen

After changing `lib/api-spec/openapi.yaml`:
```bash
pnpm --filter @workspace/api-spec run codegen
```

## Features

1. **Login system** — username/password, session-based auth
2. **Trial system** — 14-day trial, 3-hour daily limit (configurable per user)
3. **Usage tracking** — minutes today, total minutes, session count
4. **Dual audio input** — mic + caller/system audio mixing via Web Audio API
5. **Audio level meters** — real-time dB visualization per input
6. **Real-time transcription** — Soniox WebSocket API via secure backend proxy
7. **Admin dashboard** — create/disable users, reset usage, view stats, read feedback
8. **Feedback system** — popup on trial expiry with 1-5 star rating + comment
9. **API key security** — Soniox key never exposed to browser, served via `/api/transcription/token`
