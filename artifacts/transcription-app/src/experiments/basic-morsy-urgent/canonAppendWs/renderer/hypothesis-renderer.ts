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

function lcpUtf16(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) break;
  }
  return i;
}

/** Hypothesis span — mutate shared prefix in place; append suffix. */
export function renderHypothesisLcp(span: HTMLElement, next: string): void {
  const tn = ensureHypothesisText(span);
  const prev = tn.data;
  if (prev === next) return;
  if (next.startsWith(prev)) {
    const d = next.slice(prev.length);
    if (d) tn.appendData(d);
    return;
  }
  const lcp = lcpUtf16(prev, next);
  if (lcp < prev.length) {
    tn.deleteData(lcp, prev.length - lcp);
  }
  const ins = next.slice(lcp);
  if (ins.length) tn.insertData(lcp, ins);
}
