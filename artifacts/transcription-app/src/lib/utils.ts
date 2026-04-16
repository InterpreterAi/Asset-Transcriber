import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Matches server `isTrialLikePlanType` (usage.ts). */
export function isTrialLikePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").toLowerCase();
  return p === "trial" || p === "trial-openai" || p === "trial-libre";
}

/**
 * Customer-facing plan label: hides engine suffix; Professional/Platinum tiers show as "Unlimited".
 */
export function workspacePlanDisplayName(planType: string | undefined | null): string {
  const p = (planType ?? "").toLowerCase();
  if (p === "trial" || p === "trial-openai" || p === "trial-libre") return "Trial";
  if (p === "basic" || p === "basic-openai" || p === "basic-libre" || p === "morsy-basic") return "Basic";
  if (p === "professional" || p === "professional-openai" || p === "professional-libre") return "Unlimited";
  return "Unlimited";
}

/** Badge / styling tier (ignores translation engine). */
export function workspacePlanTierKey(planType: string | null | undefined): "trial" | "basic" | "professional" | "platinum" {
  const p = (planType ?? "").toLowerCase();
  if (p === "trial" || p === "trial-openai" || p === "trial-libre") return "trial";
  if (p === "basic" || p === "basic-openai" || p === "morsy-basic") return "basic";
  if (p === "professional" || p === "professional-openai") return "professional";
  return "platinum";
}

/** True when the account uses the machine translation stack (`plan_type` `*-libre`), not OpenAI. */
export function planUsesLibreEngine(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return ["trial-libre", "basic-libre", "professional-libre", "platinum-libre"].includes(p);
}
