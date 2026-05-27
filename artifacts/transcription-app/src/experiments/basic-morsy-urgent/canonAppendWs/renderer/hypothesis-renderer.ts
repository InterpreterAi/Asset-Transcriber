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
  const tn = ensureHypothesisText(span);
  if (tn.data === next) return;
  tn.replaceData(0, tn.data.length, next);
}
