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
  const shouldWrapRtl = span.getAttribute("dir") === "rtl" || span.closest('[dir="rtl"]') !== null;
  const safeNext = shouldWrapRtl ? wrapNumbersForRtl(next) : next;
  const tn = ensureHypothesisText(span);
  if (tn.data === safeNext) return;
  tn.replaceData(0, tn.data.length, safeNext);
}

// Wrap numbers, units, and codes in LTR isolates so they display correctly in RTL text.
function wrapNumbersForRtl(text: string): string {
  return text.replace(
    /(\d[\d.,/:%-]*\s*(?:mg|mL|kg|mmHg|bpm|min|g|dL|mcg|mg\/dL|mL\/min|m2|%|A1c)?)/g,
    "\u2066$1\u2069",
  );
}
