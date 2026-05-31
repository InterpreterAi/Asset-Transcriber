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
  return (
    p === "trial"
    || p === "trial-openai"
    || p === "trial-libre"
    || p === "trial-hetzner"
    || p === "morsy-urgent"
  );
}

/**
 * Customer-facing plan label: hides engine suffix; Professional/Platinum tiers show as "Unlimited".
 */
export function workspacePlanDisplayName(planType: string | undefined | null): string {
  const p = (planType ?? "").toLowerCase();
  if (p === "morsy-urgent") return "Trial";
  if (p === "trial" || p === "trial-openai" || p === "trial-libre" || p === "trial-hetzner") return "Trial";
  if (p === "basic" || p === "basic-openai" || p === "basic-libre" || p === "morsy-basic" || p === "morsy-urgent" || p === "legacy2") return "Basic";
  if (p === "professional" || p === "professional-openai" || p === "professional-libre") return "Unlimited";
  return "Unlimited";
}

/** Badge / styling tier (ignores translation engine). */
export function workspacePlanTierKey(planType: string | null | undefined): "trial" | "basic" | "professional" | "platinum" {
  const p = (planType ?? "").toLowerCase();
  if (p === "morsy-urgent") return "trial";
  if (p === "trial" || p === "trial-openai" || p === "trial-libre" || p === "trial-hetzner") return "trial";
  if (p === "basic" || p === "basic-openai" || p === "basic-libre" || p === "morsy-basic" || p === "legacy2") return "basic";
  if (p === "professional" || p === "professional-openai" || p === "professional-libre") return "professional";
  return "platinum";
}

/**
 * Workspace usage pill / sidebar: Professional and Platinum tiers show "/ unlimited" while the server still enforces
 * a finite daily cap (payPal plan config). Same for OpenAI and Libre/Hetzner plan_type variants.
 */
export function workspaceUsageShowsSlashUnlimited(planType: string | null | undefined): boolean {
  const t = workspacePlanTierKey(planType);
  return t === "professional" || t === "platinum";
}

/**
 * OpenAI tiers using **Basic · Legacy 2 Morsy** clean translation (minimal OpenAI, no live re-append).
 * Includes `legacy2`, `morsy-urgent`, trial/*-openai/platinum/unlimited; excludes Libre/Hetzner.
 */
export function planUsesOpenAiLegacy2CleanTranslation(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  if (!p || p === "trial-hetzner") return false;
  if (p === "trial-libre" || p === "basic-libre" || p === "professional-libre" || p === "platinum-libre") return false;
  if (p.includes("-openai")) return true;
  if (p === "legacy2" || p === "trial" || p === "trial-openai" || p === "morsy-urgent") return true;
  if (p === "platinum" || p === "unlimited") return true;
  if (p === "basic" || p === "professional") return false;
  return false;
}

/** @deprecated Use {@link planUsesOpenAiLegacy2CleanTranslation}. Kept for grep compatibility — always mirrors legacy2 stack. */
export function planUsesOpenAiMorsyCanonTranslation(planType: string | null | undefined): boolean {
  return planUsesOpenAiLegacy2CleanTranslation(planType);
}

/**
 * True when the account uses the machine translation stack — mirrors server `planUsesMachineTranslationStack`
 * (Final Boss 3: Libre for Basic/Professional *-libre and `trial-hetzner`; OpenAI for `trial-libre`, legacy OpenAI trials, Platinum, Unlimited).
 */
export function planUsesLibreEngine(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  if (
    p === "trial" ||
    p === "trial-openai" ||
    p === "trial-libre" ||
    p === "legacy2" ||
    p === "platinum" ||
    p === "platinum-libre" ||
    p === "unlimited"
  ) {
    return false;
  }
  return true;
}
