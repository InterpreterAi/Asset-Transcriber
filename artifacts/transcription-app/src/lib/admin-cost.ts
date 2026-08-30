import { adminTranslationStack, planUsesSonioxNativeTranslation } from "@/lib/utils";

/** Soniox real-time STT — stored on sessions as soniox_cost. */
export const SONIOX_STT_COST_PER_MIN = 0.0025;
/** Soniox native translation add-on (~$0.06/hr published output-token estimate). */
export const SONIOX_NATIVE_TRANSLATION_COST_PER_MIN = 0.001;

export function adminSessionCostPerMin(planType: string | null | undefined): number {
  if (adminTranslationStack(planType) === "soniox") {
    return SONIOX_STT_COST_PER_MIN + SONIOX_NATIVE_TRANSLATION_COST_PER_MIN;
  }
  return SONIOX_STT_COST_PER_MIN;
}

export function adminEstimateSessionCostUsd(
  minutes: number,
  planType: string | null | undefined,
): number {
  return minutes * adminSessionCostPerMin(planType);
}

/** Prefer stored STT / leftover OpenAI MT; always add Soniox native translation estimate. */
export function adminSessionApiCostUsd(opts: {
  minutes: number;
  planType: string | null | undefined;
  storedSttUsd?: number | null;
  storedTranslationUsd?: number | null;
}): number {
  const minutes = Math.max(0, Number(opts.minutes) || 0);
  const storedStt = Number(opts.storedSttUsd ?? 0);
  const stt = storedStt > 0 ? storedStt : minutes * SONIOX_STT_COST_PER_MIN;
  if (planUsesSonioxNativeTranslation(opts.planType)) {
    return +(stt + minutes * SONIOX_NATIVE_TRANSLATION_COST_PER_MIN).toFixed(6);
  }
  return +(stt + Number(opts.storedTranslationUsd ?? 0)).toFixed(6);
}
