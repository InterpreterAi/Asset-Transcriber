/**
 * User-visible API errors must not leak vendors, env var names, or infra hints.
 * Full detail stays in server logs only.
 */
export function isProductionApi(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Generic copy for any upstream translation/STT vendor failure in production. */
export function clientFacingError(
  devMessage: string,
  prodMessage = "This feature is temporarily unavailable. Please try again shortly or contact support.",
): string {
  return isProductionApi() ? prodMessage : devMessage;
}

/** Map internal error codes to neutral client codes in production. */
export function clientFacingErrorCode(internalCode: string): string {
  if (!isProductionApi()) return internalCode;
  const map: Record<string, string> = {
    OPENAI_AUTH_FAILED: "TRANSLATION_SERVICE_AUTH",
    OPENAI_RATE_LIMITED: "TRANSLATION_RATE_LIMITED",
    OPENAI_BILLING: "TRANSLATION_BILLING",
    OPENAI_WRONG_LANGUAGE: "TRANSLATION_LANGUAGE",
    TRANSCRIPTION_NOT_CONFIGURED: "TRANSCRIPTION_UNAVAILABLE",
    TRANSCRIPTION_TOKEN_ERROR: "TRANSCRIPTION_UNAVAILABLE",
    HETZNER_TRIAL_ROUTING_BLOCKED: "SESSION_CAPACITY_LIMIT",
    HETZNER_MT_LANE_UNASSIGNED: "TRANSLATION_UNAVAILABLE",
    LIBRETRANSLATE_FAILED: "TRANSLATION_UNAVAILABLE",
    TRANSLATION_NOT_CONFIGURED: "TRANSLATION_UNAVAILABLE",
  };
  return map[internalCode] ?? internalCode;
}
