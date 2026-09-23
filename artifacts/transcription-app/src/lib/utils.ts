import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Same threshold as workspace UI / server: caps at or above this are treated as unlimited. */
export const UNLIMITED_DAILY_CAP_MINUTES = 9000;

/**
 * Format billable minutes for UI. Rounds to the nearest whole minute and omits
 * a trailing `0m` so a finished 2h/5h day reads `2h` / `5h`, not `2h 0m`.
 */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m === 0) return `${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Minutes to show as "used today". When less than 1 minute remains (same rule as
 * the server new-session gate), snap to the daily cap so the badge never reads
 * `1h 59m / 2h` or `4h 59m / 5h` after the day is spent.
 */
export function displayMinutesUsedToday(
  usedMinutes: number,
  dailyLimitMinutes: number,
  minutesRemainingToday?: number,
): number {
  const used = Math.max(0, Number(usedMinutes) || 0);
  const cap = Number(dailyLimitMinutes);
  if (!Number.isFinite(cap) || cap <= 0 || cap >= UNLIMITED_DAILY_CAP_MINUTES) {
    return used;
  }
  const remaining =
    minutesRemainingToday !== undefined && Number.isFinite(Number(minutesRemainingToday))
      ? Math.max(0, Number(minutesRemainingToday))
      : Math.max(0, cap - used);
  if (used > 0 && remaining < 1 - 1e-6) return cap;
  if (used >= cap - 1e-6) return cap;
  return used;
}

/** Matches server `isTrialLikePlanType` (usage.ts). */
export function isTrialLikePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").toLowerCase();
  return (
    p === "trial"
    || p === "trial-openai"
    || p === "trial-libre"
    || p === "trial-hetzner"
    || p === "trial-soniox-x"
    || p === "morsy-urgent"
  );
}

/**
 * Customer-facing plan label: hides engine suffix; Professional/Platinum tiers show as "Unlimited".
 */
export function workspacePlanDisplayName(planType: string | undefined | null): string {
  const p = (planType ?? "").toLowerCase();
  if (p === "morsy-urgent") return "Trial";
  if (
    p === "trial" ||
    p === "trial-openai" ||
    p === "trial-libre" ||
    p === "trial-hetzner" ||
    p === "trial-soniox-x"
  ) return "Trial";
  if (
    p === "basic" ||
    p === "basic-openai" ||
    p === "basic-libre" ||
    p === "basic-hetzner" ||
    p === "basic-soniox-x" ||
    p === "morsy-basic" ||
    p === "morsy-urgent" ||
    p === "legacy2"
  ) return "Basic";
  if (
    p === "professional" ||
    p === "professional-openai" ||
    p === "professional-libre" ||
    p === "professional-soniox-x"
  ) return "Unlimited";
  return "Unlimited";
}

/** Admin picker / user-table name (engine visible). Customers never see this. */
export function adminPlanDisplayName(planType: string | null | undefined): string {
  const p = (planType ?? "").trim().toLowerCase();
  if (p === "trial-openai") return "Trial Soniox";
  if (p === "basic-hetzner") return "Basic Soniox";
  if (p === "professional-libre") return "Professional Soniox";
  if (p === "trial-soniox-x" || p === "trial-hetzner") return "Trial Soniox X";
  if (p === "basic-soniox-x") return "Basic Soniox X";
  if (p === "professional-soniox-x") return "Professional Soniox X";
  const tier = workspacePlanTierKey(p);
  if (tier === "trial") return "Trial";
  if (tier === "basic") return "Basic";
  if (tier === "professional") return "Professional";
  return "Platinum";
}

/** Badge / styling tier (ignores translation engine). */
export function workspacePlanTierKey(planType: string | null | undefined): "trial" | "basic" | "professional" | "platinum" {
  const p = (planType ?? "").toLowerCase();
  if (p === "morsy-urgent") return "trial";
  if (
    p === "trial" ||
    p === "trial-openai" ||
    p === "trial-libre" ||
    p === "trial-hetzner" ||
    p === "trial-soniox-x"
  ) return "trial";
  if (
    p === "basic" ||
    p === "basic-openai" ||
    p === "basic-libre" ||
    p === "basic-hetzner" ||
    p === "basic-soniox-x" ||
    p === "morsy-basic" ||
    p === "legacy2"
  ) return "basic";
  if (
    p === "professional" ||
    p === "professional-openai" ||
    p === "professional-libre" ||
    p === "professional-soniox-x"
  ) return "professional";
  return "platinum";
}

/**
 * Workspace usage pill / sidebar: Professional and Platinum tiers show "/ unlimited".
 * Public Professional (`professional-libre`) also stores the 9000-minute unlimited cap on the server.
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
  if (!p || p === "trial-hetzner" || p === "trial-soniox-x" || p === "basic-soniox-x" || p === "professional-soniox-x") return false;
  if (
    p === "trial-libre" ||
    p === "basic-libre" ||
    p === "basic-hetzner" ||
    p === "professional-libre" ||
    p === "platinum-libre"
  ) {
    return false;
  }
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
 * **trial-hetzner + basic/professional default PayPal (+ legacy basic-libre)** —
 * shared canon-append STT + translation path:
 * immediate committed append, serial frozen-row queue, blank-bubble backfill, first-stable translate.
 */
export function planUsesHetznerCanonStreamingStt(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "trial-hetzner" || p === "basic-hetzner" || p === "professional-libre" || p === "basic-libre";
}

/** @deprecated Prefer {@link planUsesHetznerCanonStreamingStt}. */
export function planUsesTrialHetznerCleanTranslation(planType: string | null | undefined): boolean {
  return planUsesHetznerCanonStreamingStt(planType);
}

/**
 * True when the account uses the machine translation stack — mirrors server `planUsesMachineTranslationStack`
 * (Final Boss 3: Libre for Basic/Professional *-libre and `trial-hetzner`; OpenAI for `trial-libre`, legacy OpenAI trials, Platinum, Unlimited).
 */
/** Trial / Basic / Professional plans that use Soniox STT + Soniox two-way translation. */
export function planUsesSonioxNativeTranslation(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (
    p === "trial-openai" ||
    p === "basic-hetzner" ||
    p === "professional-libre" ||
    p === "trial-soniox-x" ||
    p === "trial-hetzner" ||
    p === "basic-soniox-x" ||
    p === "professional-soniox-x"
  );
}

/** Admin cost / engine map — must match server `stackKeyFromPlanType`. */
export function adminTranslationStack(planType: string | null | undefined): "soniox" | "hetzner" | "openai" {
  const p = (planType ?? "").trim().toLowerCase();
  if (
    p === "trial-openai" ||
    p === "basic-hetzner" ||
    p === "professional-libre" ||
    p === "trial-soniox-x" ||
    p === "trial-hetzner" ||
    p === "basic-soniox-x" ||
    p === "professional-soniox-x"
  ) return "soniox";
  if (p === "basic-libre" || p === "basic" || p === "professional") return "hetzner";
  return "openai";
}

export function planUsesLibreEngine(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  if (
    p === "trial" ||
    p === "trial-openai" ||
    p === "trial-libre" ||
    p === "trial-hetzner" ||
    p === "trial-soniox-x" ||
    p === "basic-soniox-x" ||
    p === "professional-soniox-x" ||
    p === "legacy2" ||
    p === "platinum" ||
    p === "platinum-libre" ||
    p === "unlimited"
  ) {
    return false;
  }
  return true;
}
