/** Presence checks for third-party AI keys (never log values). */

import {
  getSonioxKeyEnvPresence,
  getSonioxMasterApiKey,
  getSonioxResolvedEnvKeyName,
} from "./soniox-env.js";

const SECRETISH_KEY_NAME_RE =
  /SONIOX|OPENAI|DATABASE|GOOGLE|SESSION|NEXTAUTH|ANTHROPIC|AI_INTEGRATIONS|POSTGRES|PGHOST|PGUSER|PGDATABASE|SUPABASE|NEON/i;

/**
 * Names-only snapshot: which env keys in this process look like app secrets.
 * If empty while Railway dashboard lists vars, they are almost certainly on a different service or environment.
 */
export function getRuntimeEnvFingerprint(): {
  processEnvKeyCount: number;
  secretishKeyNames: string[];
  railway: {
    serviceName: string | null;
    environmentName: string | null;
    projectIdPresent: boolean;
    gitCommitSha: string | null;
    deploymentId: string | null;
  };
  note: string;
} {
  const keys = Object.keys(process.env);
  const secretishKeyNames = keys.filter((k) => SECRETISH_KEY_NAME_RE.test(k)).sort();
  const r = (k: string): string | null => {
    const v = process.env[k];
    return v === undefined || v === "" ? null : v;
  };
  let note =
    "secretishKeyNames lists variable NAMES in this Node process only (no values). Compare RAILWAY_SERVICE_NAME to the service where you set SONIOX_API_KEY in the dashboard.";
  if (secretishKeyNames.length === 0 && keys.length > 8) {
    note +=
      " No matching secret-like names found — Railway is not injecting those keys into this container (wrong service, wrong environment e.g. Preview vs Production, or variables only on Postgres plugin).";
  }
  return {
    processEnvKeyCount: keys.length,
    secretishKeyNames,
    railway: {
      serviceName: r("RAILWAY_SERVICE_NAME"),
      environmentName: r("RAILWAY_ENVIRONMENT"),
      projectIdPresent: Boolean(process.env.RAILWAY_PROJECT_ID),
      gitCommitSha: r("RAILWAY_GIT_COMMIT_SHA"),
      deploymentId: r("RAILWAY_DEPLOYMENT_ID"),
    },
    note,
  };
}

export function isSonioxConfigured(): boolean {
  return Boolean(getSonioxMasterApiKey());
}

export function isOpenAiConfigured(): boolean {
  if (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim()) {
    return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim());
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** For GET /debug/ai-env — booleans only. */
export function getAiEnvDiagnostics(): {
  soniox: boolean;
  sonioxEnvKeys: ReturnType<typeof getSonioxKeyEnvPresence>;
  /** Actual `process.env` key name that supplied the Soniox key (null if none). */
  sonioxResolvedFromKey: string | null;
  openai: boolean;
  openaiRoute: "integration_proxy" | "direct_api_key" | "none";
  runtimeFingerprint: ReturnType<typeof getRuntimeEnvFingerprint>;
} {
  const proxy = Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim());
  return {
    soniox: isSonioxConfigured(),
    sonioxEnvKeys: getSonioxKeyEnvPresence(),
    sonioxResolvedFromKey: getSonioxResolvedEnvKeyName(),
    openai: isOpenAiConfigured(),
    openaiRoute: proxy ? "integration_proxy" : isOpenAiConfigured() ? "direct_api_key" : "none",
    runtimeFingerprint: getRuntimeEnvFingerprint(),
  };
}
