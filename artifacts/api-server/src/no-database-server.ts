/**
 * Minimal HTTP server when Postgres env is missing — avoids importing @workspace/db.
 * Railway stays "running" and health checks pass; user sees how to fix variables.
 */
import http from "node:http";
import { getAiEnvDiagnostics } from "./lib/ai-env.js";
import { getPublicEnvReadiness } from "./lib/readiness-env.js";
import { dbEnvDiagnostic, getDatabaseUrlRuntimeDebug } from "./postgres-env.js";

const rawPort =
  process.env["PORT"] ?? process.env["RAILWAY_PORT"] ?? process.env["HTTP_PLATFORM_PORT"] ?? "8080";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  console.error(`Invalid PORT: "${rawPort}"`);
  process.exit(1);
}

const hint = {
  ok: false,
  databaseConfigured: false,
  message:
    "PostgreSQL is not configured for this service. The full API is disabled until a connection is set (DATABASE_URL, DATABASE_PRIVATE_URL, or POSTGRES_HOST+POSTGRES_USER+POSTGRES_DB, etc.).",
  railwaySteps: [
    "Postgres may already expose DATABASE_URL on the **database** service — that does NOT inject into your **web/API** service automatically.",
    "Open the service that runs **this** Node container → Variables → New variable → Variable Reference → pick Postgres → add `DATABASE_URL` (or `DATABASE_PRIVATE_URL`).",
    "Or paste the full `postgresql://…` URL as `DATABASE_URL` on that same web/API service (Raw editor).",
    "Use the correct Railway **environment** (e.g. Production). Empty or Preview-only vars leave this process without a DB.",
    "Redeploy the web/API service after saving. GET /debug/db-env on this host lists which keys are non-empty (values never shown).",
  ],
};

const server = http.createServer((req, res) => {
  const path = req.url?.split("?")[0] ?? "/";
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body, null, 2));
  };

  if (path === "/health" || path === "/healthz") {
    json(200, {
      ok: true,
      status: "degraded",
      databaseConfigured: false,
      message: "Process is up; configure database env vars for the full API.",
    });
    return;
  }

  if (path === "/debug/db-env") {
    json(200, {
      ok: true,
      status: "degraded",
      databaseConfigured: false,
      message: "Presence only — values are never shown.",
      env: dbEnvDiagnostic(),
      runtime: getDatabaseUrlRuntimeDebug(),
    });
    return;
  }

  if (path === "/debug/ai-env") {
    json(200, {
      ok: true,
      status: "degraded",
      databaseConfigured: false,
      message:
        "Full API disabled (no database). When DB is connected, transcription needs SONIOX_API_KEY or SONIOX_STT_API_KEY; translation needs OpenAI vars.",
      ai: getAiEnvDiagnostics(),
    });
    return;
  }

  if (path === "/debug/readiness") {
    json(200, {
      ok: true,
      status: "degraded",
      databaseConfigured: false,
      whyTranscriptionAndGoogleFail:
        "This process is the minimal server: no DATABASE_URL, so no sessions DB, no /api/auth/*, no /api/transcription/token. Fix Postgres on this Railway service first, redeploy, then check this URL again (full API).",
      env: getPublicEnvReadiness(),
      nextSteps: [
        "1) Add DATABASE_URL (variable reference to Postgres) on THIS service → Redeploy.",
        "2) Then set SONIOX_API_KEY (transcription), GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + NEXTAUTH_URL (Google), SESSION_SECRET (cookies).",
        "3) Google Cloud: authorized redirect must match https://YOUR_HOST/api/auth/callback/google if you use NEXTAUTH_URL (see authEnv GOOGLE_OAUTH_REDIRECT_PATH).",
      ],
    });
    return;
  }

  if (path === "/") {
    json(200, {
      ok: true,
      status: "degraded",
      databaseConfigured: false,
      message: hint.message,
      railwaySteps: hint.railwaySteps,
    });
    return;
  }

  json(503, hint);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[api-server] No DATABASE_URL — minimal server listening on 0.0.0.0:${port}`);
});
