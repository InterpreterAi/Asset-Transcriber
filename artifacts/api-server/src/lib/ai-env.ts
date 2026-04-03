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
  const ob = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
  const oi = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  const ok = process.env.OPENAI_API_KEY?.trim();
  if (ob && oi) {
    /* proxy path — openai-client uses both */
  } else if (ob && !oi && !ok) {
    m.push("OPENAI_API_KEY (or pair AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY)");
  } else if (!ok && !(ob && oi)) {
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

/** Must match `openai-client.ts` proxy vs direct rules. */
export function isOpenAiConfigured(): boolean {
  const ob = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
  const oi = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  const ok = process.env.OPENAI_API_KEY?.trim();
  if (ob && oi) return true;
  return Boolean(ok);
}

function openAiIntegrationProxyActive(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim(),
  );
}

/**
 * How live workspace translation is wired (OpenAI). The UI calls POST /api/transcription/translate only —
 * not POST /api/translate (Google/MyMemory).
 */
export function getTranslationConnectionDiagnostics(): {
  liveWorkspace: {
    method: string;
    httpPath: string;
    openaiModel: string;
    /** Same as top-level `openai` — when false, API returns 503 TRANSLATION_NOT_CONFIGURED. */
    openaiConfigured: boolean;
    connectedForLiveInterpretation: boolean;
    explanation: string;
  };
  alternateHttpRoute: {
    method: string;
    httpPath: string;
    note: string;
  };
} {
  const ok = isOpenAiConfigured();
  const proxy = openAiIntegrationProxyActive();
  return {
    liveWorkspace: {
      method: "POST",
      httpPath: "/api/transcription/translate",
      openaiModel: "gpt-4o-mini",
      openaiConfigured: ok,
      connectedForLiveInterpretation: ok,
      explanation: ok
        ? `OpenAI is configured (${proxy ? "Replit AI_INTEGRATIONS_* proxy" : "direct OPENAI_API_KEY"}). If the UI still shows no translation, check DevTools → Network for this path (401/403/500) or same-language segments (server echoes source when src==tgt).`
        : "Not connected: set OPENAI_API_KEY, or both AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY for the Replit proxy. Remove a stray BASE_URL alone if you use direct OpenAI only.",
    },
    alternateHttpRoute: {
      method: "POST",
      httpPath: "/api/translate",
      note: "Uses public Google/MyMemory endpoints — not used by the live workspace transcription hook.",
    },
  };
}

/** For GET /debug/ai-env — booleans only. */
export function getAiEnvDiagnostics(): {
  soniox: boolean;
  sonioxEnvKeys: ReturnType<typeof getSonioxKeyEnvPresence>;
  /** Actual `process.env` key name that supplied the Soniox key (null if none). */
  sonioxResolvedFromKey: string | null;
  openai: boolean;
  openaiRoute: "integration_proxy" | "direct_api_key" | "none";
  translation: ReturnType<typeof getTranslationConnectionDiagnostics>;
  runtimeFingerprint: ReturnType<typeof getRuntimeEnvFingerprint>;
} {
  const proxy = openAiIntegrationProxyActive();
  return {
    soniox: isSonioxConfigured(),
    sonioxEnvKeys: getSonioxKeyEnvPresence(),
    sonioxResolvedFromKey: getSonioxResolvedEnvKeyName(),
    openai: isOpenAiConfigured(),
    openaiRoute: proxy ? "integration_proxy" : isOpenAiConfigured() ? "direct_api_key" : "none",
    translation: getTranslationConnectionDiagnostics(),
    runtimeFingerprint: getRuntimeEnvFingerprint(),
  };
}
