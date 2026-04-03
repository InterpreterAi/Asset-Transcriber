/**
 * Safe env presence for operators (no secret values). Used by GET /debug/readiness.
 */
import { getAiEnvDiagnostics } from "./ai-env.js";
import { isPostgresEnvConfigured } from "../postgres-env.js";

function set(k: string): boolean {
  return Boolean(process.env[k]?.trim());
}

export function getPublicEnvReadiness(): {
  postgres: { configured: boolean };
  googleOAuth: {
    GOOGLE_CLIENT_ID: boolean;
    GOOGLE_CLIENT_SECRET: boolean;
    NEXTAUTH_URL: boolean;
    APP_URL: boolean;
  };
  session: { SESSION_SECRET: boolean; NEXTAUTH_SECRET: boolean };
  ai: ReturnType<typeof getAiEnvDiagnostics>;
} {
  return {
    postgres: { configured: isPostgresEnvConfigured() },
    googleOAuth: {
      GOOGLE_CLIENT_ID: set("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: set("GOOGLE_CLIENT_SECRET"),
      NEXTAUTH_URL: set("NEXTAUTH_URL"),
      APP_URL: set("APP_URL"),
    },
    session: {
      SESSION_SECRET: set("SESSION_SECRET"),
      NEXTAUTH_SECRET: set("NEXTAUTH_SECRET"),
    },
    ai: getAiEnvDiagnostics(),
  };
}
