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
  const safeNext = shouldWrapRtl ? isolateLtrInRtl(next) : next;
  const tn = ensureHypothesisText(span);
  if (tn.data === safeNext) return;
  tn.replaceData(0, tn.data.length, safeNext);
}

export function isolateLtrInRtl(text: string): string {
  return text.replace(
    /([A-Za-z][A-Za-z0-9._@+\-/]*(?:\s[A-Za-z][A-Za-z0-9._@+\-/]*)*|\d[\d.,/:%-]*(?:\s*(?:mg|mL|kg|mmHg|bpm|%|dL|mcg|m2|USD|\$))?)/g,
    "\u2066$1\u2069",
  );
}
