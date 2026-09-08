/**
 * Merge Soniox two-way translation finals into the active buffer.
 *
 * Translation tokens often lack timestamps (Soniox docs). Unstable per-frame ids
 * then make naive `+=` re-append the same fragment ("—he has") on every frame.
 */

/** Append incoming finals without duplicating an already-present suffix/prefix. */
export function mergeAppendedTranslationText(existing: string, incomingChunk: string): string {
  const a = existing;
  const b = incomingChunk;
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;

  const max = Math.min(a.length, b.length);
  for (let k = max; k > 0; k--) {
    if (a.slice(-k) === b.slice(0, k)) {
      return a + b.slice(k);
    }
  }
  return a + b;
}

/** Stable fingerprint when Soniox gives no durable translation token id. */
export function translationFinalFingerprint(t: {
  id?: string;
  text: string;
  language?: string;
  source_language?: string;
}): string {
  const id = typeof t.id === "string" ? t.id.trim() : "";
  // Per-frame synthetic ids (`t-<seq>-<i>`) are not durable across frames.
  if (id && !/^t-\d+-\d+$/.test(id)) return `id:${id}`;
  const lang = (t.language ?? "").trim().toLowerCase();
  const src = (t.source_language ?? "").trim().toLowerCase();
  return `tx:${lang}|${src}|${t.text}`;
}
