/** Presence checks for third-party AI keys (never log values). */

import {
  getSonioxKeyEnvPresence,
  getSonioxMasterApiKey,
  getSonioxResolvedEnvKeyName,
} from "./soniox-env.js";

const SECRETISH_KEY_NAME_RE =
  /SONIOX|OPENAI|DATABASE|GOOGLE|SESSION|NEXTAUTH|ANTHROPIC|AI_INTEGRATIONS|POSTGRES|PGHOST|PGUSER|PGDATABASE|SUPABASE|NEON/i;

function missingServiceVariablesForInterpreterAi(): string[] {
  const m: string[] = [];
  if (!getSonioxMasterApiKey()) {
    m.push("SONIOX_API_KEY (or SONIOX_STT_API_KEY, SONIOX_KEY, SONIOX_API_TOKEN)");
  }
  if (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim()) {
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim()) {
      m.push("AI_INTEGRATIONS_OPENAI_API_KEY");
    }
  } else if (!process.env.OPENAI_API_KEY?.trim()) {
    m.push("OPENAI_API_KEY");
  }
  if (!process.env.GOOGLE_CLIENT_ID?.trim()) m.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET?.trim()) m.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.SESSION_SECRET?.trim() && !process.env.NEXTAUTH_SECRET?.trim()) {
    m.push("SESSION_SECRET or NEXTAUTH_SECRET");
  }
  return m;
}

/**
 * Names-only snapshot: which env keys in this process look like app secrets.
 * If empty while Railway dashboard lists vars, they are almost certainly on a different service or environment.
 */
export function getRuntimeEnvFingerprint(): {
  processEnvKeyCount: number;
  secretishKeyNames: string[];
  /** Variables this app needs but are missing or empty in `process.env` (action list for Railway → this service → Variables). */
  missingInProcessEnv: string[];
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
  const missingInProcessEnv = missingServiceVariablesForInterpreterAi();
  const r = (k: string): string | null => {
    const v = process.env[k];
    return v === undefined || v === "" ? null : v;
  };
  const svc = r("RAILWAY_SERVICE_NAME");
  let note =
    "secretishKeyNames = names present in this Node process (no values). If SONIOX/OPENAI are absent here but you set them in Railway, they were added on a different service or environment — add them on THIS service (see railway.serviceName).";
  if (secretishKeyNames.length === 0 && keys.length > 8) {
    note +=
      " No secret-like names matched — Railway is not injecting those keys into this container.";
  }
  if (missingInProcessEnv.length > 0) {
    note += ` missingInProcessEnv: add these on Railway → ${svc ?? "this API service"} → Variables (environment ${r("RAILWAY_ENVIRONMENT") ?? "?"}) → Redeploy.`;
  }
  return {
    processEnvKeyCount: keys.length,
    secretishKeyNames,
    missingInProcessEnv,
    railway: {
      serviceName: svc,
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
