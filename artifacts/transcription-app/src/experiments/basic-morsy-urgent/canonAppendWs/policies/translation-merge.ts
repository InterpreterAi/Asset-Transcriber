/**
 * Append Soniox two-way translation finals into the active buffer.
 *
 * Soniox docs: translation tokens are sequential pieces after their originals
 * (e.g. "Gu" + "ten" + " Morgen") — join in order. They have no timestamps.
 * Spaces for new words usually live inside the token (" Morgen"); Latin subwords
 * concatenate without spaces ("Gu"+"ten").
 *
 * Arabic MT often omits the leading space between full words. Insert a single
 * boundary space only for Arabic letter↔letter joins when the incoming piece
 * looks like a new word (length > 2). Never fuzzy-overlap-splice — that ate
 * letters (المشكلاتؤقتة / سأطلقراحه).
 */

const ARABIC_LETTER_RE = /[\u0600-\u06FF]/;

function isArabicLetterChar(ch: string | undefined): boolean {
  return !!ch && ARABIC_LETTER_RE.test(ch);
}

/** Join two sequential translation pieces (Soniox-faithful + Arabic word gap). */
export function joinTranslationPieces(a: string, b: string): string {
  if (!b) return a;
  if (!a) return b;
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  // Punctuation / dash attachments stay tight.
  if (/^[.,!?;:،؟…)"»]/.test(b)) return a + b;
  if (/[(["«]$/.test(a)) return a + b;
  const aEnd = a[a.length - 1];
  const bStart = b[0];
  if (isArabicLetterChar(aEnd) && isArabicLetterChar(bStart)) {
    // Subword / clitics: "سأطلق" + "ه" must stay glued.
    if (b.length <= 2) return a + b;
    return `${a} ${b}`;
  }
  return a + b;
}

export function joinTranslationTokenTexts(parts: readonly string[]): string {
  let out = "";
  for (const part of parts) {
    out = joinTranslationPieces(out, part);
  }
  return out;
}

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
  return joinTranslationPieces(a, b);
}

/**
 * Non-final translation hypothesis beyond already-finalized text.
 * Soniox often restates the finalized prefix inside the non-final run.
 */
export function translationPreviewBeyondFinal(finalText: string, previewRaw: string): string {
  const preview = previewRaw ?? "";
  if (!preview) return "";
  const final = finalText ?? "";
  if (!final) return preview;
  if (preview.startsWith(final)) return preview.slice(final.length);
  if (final.endsWith(preview)) return "";
  // Word-ish overlap at the boundary (same idea as NF original strip).
  const maxCheck = Math.min(final.length, preview.length);
  for (let k = maxCheck; k >= Math.min(maxCheck, 3); k--) {
    if (final.slice(-k) === preview.slice(0, k)) {
      return preview.slice(k);
    }
  }
  return preview;
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
  // Durable Soniox ids must include text so a later revision of the same index
  // (إحض → إحضار) is not frozen on the first short form.
  if (id && !/^t-\d+-\d+$/.test(id)) return `id:${id}|${t.text}`;
  const lang = (t.language ?? "").trim().toLowerCase();
  const src = (t.source_language ?? "").trim().toLowerCase();
  return `tx:${lang}|${src}|${t.text}`;
}
