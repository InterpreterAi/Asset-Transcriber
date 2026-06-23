/**
 * Trial-hetzner ONLY — presentation experiment: single merged original column stream.
 *
 * Internal committed + NF spans are still updated (state unchanged); user sees one node:
 *   visibleText = committedText + nfText
 *
 * Enable before Start (full reload):
 *   localStorage.setItem("interpreterai_trial_hetzner_merged_original", "1")
 *
 * Does not alter Soniox, speaker logic, buffering, row creation, translation, or segmentation.
 */

import { markWorkspaceSelectableText } from "@/lib/workspace-text-selection";

const LS_KEY = "interpreterai_trial_hetzner_merged_original";
const MERGED_ATTR = "data-trial-hetzner-merged-orig";
const API_KEY = "__trialHetznerMergedOriginal";

let planGate: () => boolean = () => false;

function nfSpanForCommitted(committedSpan: HTMLSpanElement): HTMLSpanElement | null {
  const next = committedSpan.nextElementSibling;
  if (
    next instanceof HTMLSpanElement &&
    !next.hasAttribute(MERGED_ATTR)
  ) {
    return next;
  }
  return null;
}

function mergedSpanForCommitted(committedSpan: HTMLSpanElement): HTMLSpanElement | null {
  const p = committedSpan.parentElement;
  if (!p) return null;
  return p.querySelector<HTMLSpanElement>(`span[${MERGED_ATTR}]`);
}

export function registerTrialHetznerMergedOriginalPlanGate(gate: () => boolean): void {
  planGate = gate;
  attachApi();
}

export function trialHetznerMergedOriginalRenderEnabled(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(LS_KEY) === "1" &&
      planGate()
    );
  } catch {
    return false;
  }
}

/** Create merged visible node; hide internal committed + NF writers. */
export function setupTrialHetznerMergedOriginalDom(args: {
  paragraph: HTMLParagraphElement;
  committedSpan: HTMLSpanElement;
  nfSpan: HTMLSpanElement;
}): HTMLSpanElement {
  const merged = document.createElement("span");
  merged.setAttribute(MERGED_ATTR, "1");
  merged.className = args.committedSpan.className || "";
  args.committedSpan.style.display = "none";
  args.nfSpan.style.display = "none";
  args.paragraph.appendChild(merged);
  markWorkspaceSelectableText(merged);
  merged.textContent = "";
  return merged;
}

/** Sync merged visible node from internal committed + NF span textContent. */
export function syncTrialHetznerMergedOriginalFromSpans(
  committedSpan: HTMLSpanElement | null | undefined,
  nfSpan?: HTMLSpanElement | null | undefined,
): void {
  if (!trialHetznerMergedOriginalRenderEnabled() || !committedSpan) return;
  const merged = mergedSpanForCommitted(committedSpan);
  if (!merged) return;
  const nf = nfSpan ?? nfSpanForCommitted(committedSpan);
  merged.textContent = (committedSpan.textContent ?? "") + (nf?.textContent ?? "");
}

export function syncTrialHetznerMergedOriginalFromCommittedSpan(
  committedSpan: HTMLSpanElement | null | undefined,
): void {
  syncTrialHetznerMergedOriginalFromSpans(committedSpan);
}

function attachApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w[API_KEY] = {
    enabled: () => trialHetznerMergedOriginalRenderEnabled(),
    flag: LS_KEY,
  };
}
