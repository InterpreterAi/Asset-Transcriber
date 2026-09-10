import { isolateLtrRunsInRtl } from "@/lib/wrap-ltr-numbers";

function ensureHypothesisText(span: HTMLElement): Text {
  const first = span.firstChild;
  if (first && span.childNodes.length === 1 && first.nodeType === Node.TEXT_NODE) {
    return first as Text;
  }
  span.replaceChildren();
  const t = span.ownerDocument.createTextNode("");
  span.appendChild(t);
  return t;
}

/** Soniox non-final contract — replace hypothesis text each frame (no reconciliation). */
export function renderHypothesisLcp(span: HTMLElement, next: string): void {
  if (!("_rtlChecked" in (span as any))) {
    (span as any)._rtlChecked = true;
    (span as any)._isRtl =
      span.getAttribute("dir") === "rtl" ||
      span.closest('[dir="rtl"]') !== null;
  }
  const shouldWrapRtl = (span as any)._isRtl as boolean;
  const safeNext = shouldWrapRtl ? isolateLtrRunsInRtl(next) : next;
  const tn = ensureHypothesisText(span);
  if (tn.data === safeNext) return;
  tn.replaceData(0, tn.data.length, safeNext);
}

/** @deprecated Prefer isolateLtrRunsInRtl — kept for existing imports. */
export function isolateLtrInRtl(text: string): string {
  return isolateLtrRunsInRtl(text);
}
