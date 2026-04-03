/**
 * Minimal HTTP server when Postgres env is missing — avoids importing @workspace/db.
 * Railway stays "running" and health checks pass; user sees how to fix variables.
 */
import http from "node:http";

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
    "PostgreSQL is not configured for this service. The full API is disabled until DATABASE_URL is set.",
  railwaySteps: [
    "Railway dashboard → your project → add (or open) a PostgreSQL database service.",
    "Open THIS web/API service → Variables → New variable.",
    'Choose "Variable Reference" → select the Postgres service → add DATABASE_URL.',
    "Redeploy this service. Optional: DATABASE_PRIVATE_URL or DATABASE_PUBLIC_URL also work.",
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
      message: "Process is up; configure DATABASE_URL for the full API.",
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
