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

/**
 * Soniox non-final contract — replace hypothesis text each frame (no reconciliation).
 * Do not inject Unicode bidi isolates into text nodes (they leak into copy/selection).
 * Rely on CSS `dir` / `unicode-bidi: plaintext` on the parent line instead.
 */
export function renderHypothesisLcp(span: HTMLElement, next: string): void {
  const tn = ensureHypothesisText(span);
  if (tn.data === next) return;
  tn.replaceData(0, tn.data.length, next);
}

/** @deprecated Prefer parent `dir` — kept for call sites that still preprocess. */
export function isolateLtrInRtl(text: string): string {
  return text;
}
