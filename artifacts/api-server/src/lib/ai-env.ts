/** Presence checks for third-party AI keys (never log values). */

export function isSonioxConfigured(): boolean {
  return Boolean(process.env.SONIOX_API_KEY?.trim());
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
  openai: boolean;
  openaiRoute: "integration_proxy" | "direct_api_key" | "none";
} {
  const proxy = Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim());
  return {
    soniox: isSonioxConfigured(),
    openai: isOpenAiConfigured(),
    openaiRoute: proxy ? "integration_proxy" : isOpenAiConfigured() ? "direct_api_key" : "none",
  };
}
