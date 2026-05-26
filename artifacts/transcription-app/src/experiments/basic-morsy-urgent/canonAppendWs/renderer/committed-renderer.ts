/** Single committed originals node — append-only growth. */

function ensureCommittedTextHost(row: HTMLElement): Text {
  const fin = row.querySelector<HTMLElement>(`[data-caw-engine="committed"]`);
  if (!fin) throw new Error("CanonAppendWs: missing committed host");
  const first = fin.firstChild;
  if (first && fin.childNodes.length === 1 && first.nodeType === Node.TEXT_NODE) {
    return first as Text;
  }
  fin.replaceChildren();
  const t = fin.ownerDocument.createTextNode("");
  fin.appendChild(t);
  return t;
}

export type CommittedDomMirror = {
  lastUtf16Committed: number;
};

export function createCommittedMirror(): CommittedDomMirror {
  return { lastUtf16Committed: 0 };
}

export function renderCommittedAppendOnly(row: HTMLElement, fullCommittedUtf16: string, mirror: CommittedDomMirror): void {
  const tn = ensureCommittedTextHost(row);
  if (mirror.lastUtf16Committed === fullCommittedUtf16.length) return;
  if (fullCommittedUtf16.startsWith(tn.data) && fullCommittedUtf16.length >= tn.data.length) {
    const delta = fullCommittedUtf16.slice(tn.data.length);
    if (delta.length) tn.appendData(delta);
  } else if (mirror.lastUtf16Committed === 0 || tn.data.length === 0) {
    tn.replaceData(0, tn.data.length, fullCommittedUtf16);
  }
  /** Hot path forbids shortening — mismatches are instrumentation-only defects. */
  mirror.lastUtf16Committed = tn.data.length;
}
