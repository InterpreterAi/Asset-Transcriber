# Production security hardening (InterpreterAI)

This repo ships a **Vite + React** SPA (`artifacts/transcription-app`) behind **one Express API** process (`artifacts/api-server`). There is **no Next.js** app — items phrased for `next.config.js` map to `vite.config.ts` below.

## 1–3. Browser bundles (source maps, console, minify)

| Goal | Implementation |
|------|----------------|
| No production source maps | `build.sourcemap: false` when `NODE_ENV=production` |
| Strip `console.*` / `debugger` | `esbuild.drop` + Terser `pure_funcs` (unless `VITE_KEEP_CONSOLE=1` on the **build** machine) |
| Aggressive minify + mangling | `build.minify: "terser"` + `compress.passes` / `mangle` |
| Non-descriptive chunk names | `chunkFileNames` / `entryFileNames` / `assetFileNames`: `assets/[hash].js` |
| Vendor split | `manualChunks` → single `node_modules` chunk (still hash-named on disk) |

**Optional:** `javascript-obfuscator` was **not** wired into CI by default — it often breaks React lazy boundaries or harms cold-start. After `pnpm --filter @workspace/transcription-app build` passes in Docker, you can experiment locally with a Rollup obfuscator plugin; keep **controlFlowFlattening off** for realtime hooks.

## 4–6. Secrets, APIs, WebSockets

- **Provider keys** (`OPENAI_*`, `SONIOX_*`, etc.) stay **server-only** (`railway.api.env.example`). Never `VITE_*` for secrets.
- The browser **must** open a **direct** Soniox WebSocket using a **temporary** key from `POST /api/transcription/token` (authenticated). Full hiding of Soniox traffic without a **server-side audio proxy** is not possible without a larger architecture change.
- **Shorter temp keys:** `SONIOX_TEMP_KEY_TTL_SECONDS` (60–600; default **120** in code). Increase if long sessions hit STT reconnect issues.

## 7. Client “anti-debug”

`src/lib/production-client-guard.ts` dulls `__REACT_DEVTOOLS_GLOBAL_HOOK__` in production **without** blocking DevTools shortcuts (avoids harming power users).

## 8. CORS

`createProductionCorsMiddleware` — production allowlist via `CORS_ALLOWED_ORIGINS` or default app origin. Pair with **Cloudflare** (or similar) for bot / edge limits.

## 9. Rate limits (API)

Existing Express limiters cover translation, AI burst, session start, etc. **`transcriptionTokenLimiter`** adds a dedicated bucket for `POST /api/transcription/token`.

## 10–11. Sensitive client state / orchestration

Audits: `pnpm run security:audit-frontend` (grep-based). Prefer keeping prompts and orchestration **server-side** (already true for `/api/transcription/translate`).

## 12. WAF / CDN

Configure in **Cloudflare** (or your edge): bot fight, rate limiting, TLS, websocket-friendly rules for your **API hostname**. Not express-code.

## 13–14. Deploy artifacts

- Docker build runs `NODE_ENV=production pnpm --filter @workspace/transcription-app run build` — no `*.map` emitted.
- Static middleware rejects suspicious paths; `blockSensitivePathMiddleware` blocks `*.map` probes.

## 15. Audit checklist

1. `pnpm run security:audit-frontend`
2. `rg 'VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN)' artifacts/transcription-app` → should be empty
3. Railway: confirm secrets only on API service, `NODE_ENV=production`
4. Verify production response headers (`securityHeadersMiddleware`)
