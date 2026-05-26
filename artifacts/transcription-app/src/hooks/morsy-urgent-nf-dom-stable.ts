/**
 * **Basic · `morsy-urgent` + `canonAppendWs` only:** NF hypothesis span paints with a stable `Text`
 * node and minimal UTF-16 diffs (`appendData` / `replaceData`) where possible — reduces layout churn vs
 * `textContent` full replacement every Soniox frame.
 *
 * Does not touch committed canon spans.
 */

function longestCommonUtf16PrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) break;
  }
  return i;
}

export type ApplyNfDomStableResult =
  | { kind: "noop" }
  | { kind: "append"; appendedUtf16: number }
  | { kind: "delete_replace"; deletedUtf16: number; appendedUtf16: number }
  | { kind: "full_replace"; prevUtf16: number };

/** Ensure NF span owns exactly one `Text` node (drops stray siblings). */
export function ensureNfHypothesisStableTextNode(nfSpan: HTMLElement): Text {
  const first = nfSpan.firstChild;
  if (first && nfSpan.childNodes.length === 1 && first.nodeType === Node.TEXT_NODE) {
    return first as Text;
  }
  nfSpan.replaceChildren();
  const t = nfSpan.ownerDocument.createTextNode("");
  nfSpan.appendChild(t);
  return t;
}

/**
 * Applies `nextText` to NF span using minimal mutation.
 * Returns telemetry kind for instrumentation.
 */
export function applyNfHypothesisMinimalDiff(nfSpan: HTMLElement, nextText: string): ApplyNfDomStableResult {
  const textNode = ensureNfHypothesisStableTextNode(nfSpan);
  const prev = textNode.data;

  if (prev === nextText) {
    return { kind: "noop" };
  }

  // Monotone extension → appendData only (best for layout churn).
  if (nextText.length >= prev.length && nextText.startsWith(prev)) {
    const delta = nextText.slice(prev.length);
    if (delta.length === 0) return { kind: "noop" };
    textNode.appendData(delta);
    return { kind: "append", appendedUtf16: delta.length };
  }

  // Shrunk revision: still prefix relation (committed prefix of nf kept).
  if (prev.startsWith(nextText)) {
    textNode.deleteData(nextText.length, prev.length - nextText.length);
    return {
      kind: "delete_replace",
      deletedUtf16: prev.length - nextText.length,
      appendedUtf16: 0,
    };
  }

  // Shared prefix rewrite: splice tail from LCP.
  const lcp = longestCommonUtf16PrefixLen(prev, nextText);
  if (lcp >= 1 && lcp < prev.length) {
    const del = prev.length - lcp;
    const ins = nextText.slice(lcp);
    textNode.deleteData(lcp, del);
    if (ins.length > 0) textNode.insertData(lcp, ins);
    return {
      kind: "delete_replace",
      deletedUtf16: del,
      appendedUtf16: ins.length,
    };
  }

  // Unrelated hypothesis — unavoidable full replace via single-node rewrite.
  const pl = prev.length;
  textNode.replaceData(0, textNode.data.length, nextText);
  return { kind: "full_replace", prevUtf16: pl };
}
