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

export function workspacePlanDisplayName(planType: string | undefined | null): string {
  const p = (planType ?? "").toLowerCase();
  if (p === "trial") return "Free Trial";
  if (p === "trial-openai") return "Trial (OpenAI)";
  if (p === "trial-libre") return "Trial (Libre)";
  if (p === "basic") return "Basic";
  if (p === "professional") return "Professional";
  return "Platinum";
}
