/** Presence checks for third-party AI keys (never log values). */

import {
  getSonioxKeyEnvPresence,
  getSonioxMasterApiKey,
  getSonioxResolvedEnvKeyName,
} from "./soniox-env.js";

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
} {
  const proxy = Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim());
  return {
    soniox: isSonioxConfigured(),
    sonioxEnvKeys: getSonioxKeyEnvPresence(),
    sonioxResolvedFromKey: getSonioxResolvedEnvKeyName(),
    openai: isOpenAiConfigured(),
    openaiRoute: proxy ? "integration_proxy" : isOpenAiConfigured() ? "direct_api_key" : "none",
  };
}
