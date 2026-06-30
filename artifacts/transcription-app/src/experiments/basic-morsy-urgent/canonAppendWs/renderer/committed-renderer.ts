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

function wrapNumbersForRtl(text: string): string {
  return text.replace(
    /(\d[\d.,/:%-]*\s*(?:mg|mL|kg|mmHg|bpm|min|g|dL|mcg|mg\/dL|mL\/min|m2|%|A1c)?)/g,
    "\u2066$1\u2069",
  );
}

export function renderCommittedAppendOnly(row: HTMLElement, fullCommittedUtf16: string, mirror: CommittedDomMirror): void {
  const shouldWrapRtl = row.getAttribute("dir") === "rtl" || row.closest('[dir="rtl"]') !== null;
  const nextCommitted = shouldWrapRtl ? wrapNumbersForRtl(fullCommittedUtf16) : fullCommittedUtf16;
  const tn = ensureCommittedTextHost(row);
  if (mirror.lastUtf16Committed === nextCommitted.length) return;
  if (nextCommitted.startsWith(tn.data) && nextCommitted.length >= tn.data.length) {
    const delta = nextCommitted.slice(tn.data.length);
    if (delta.length) tn.appendData(delta);
  } else {
    // Allow full replace so punctuation corrections can overwrite already-painted text
    tn.replaceData(0, tn.data.length, nextCommitted);
  }
  mirror.lastUtf16Committed = tn.data.length;
}
