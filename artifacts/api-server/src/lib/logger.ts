import pino from "pino";

// Railway often does not set NODE_ENV=production; pino-pretty uses worker threads
// that break in many container images. Never use pretty transport off a TTY.
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_STATIC_URL,
);
const isProduction =
  process.env.NODE_ENV === "production" || onRailway || !process.stdout.isTTY;
const wantPretty =
  process.env.USE_PINO_PRETTY === "1" ||
  (process.env.NODE_ENV === "development" && process.stdout.isTTY && !onRailway);

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction || !wantPretty
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
