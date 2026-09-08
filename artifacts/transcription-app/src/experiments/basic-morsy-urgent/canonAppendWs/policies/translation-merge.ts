/**
 * Append Soniox two-way translation finals into the active buffer.
 *
 * Soniox docs: translation tokens are sequential pieces after their originals
 * (e.g. "Gu" + "ten" + " Morgen") — join in order. They have no timestamps.
 *
 * Do NOT fuzzy-overlap-merge strings. Character overlap eats letters in Arabic
 * (and other scripts), producing garbage like "المشكلاتؤقتة" / "سأطلقراحه".
 * Exact re-sends are stopped by fingerprint dedupe + endsWith/startsWith checks.
 */

/** Safe append: exact suffix skip, full-prefix revision replace, else concatenate. */
export function mergeAppendedTranslationText(existing: string, incomingChunk: string): string {
  const a = existing;
  const b = incomingChunk;
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a;
  // Same fragment re-sent as finals again (loop case).
  if (a.endsWith(b)) return a;
  // Stream replaced the whole active translation with a longer revision.
  if (b.startsWith(a)) return b;
  // Soniox contract: new tokens append. Never splice on partial character overlap.
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
