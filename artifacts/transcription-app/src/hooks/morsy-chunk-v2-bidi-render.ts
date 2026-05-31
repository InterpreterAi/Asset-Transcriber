/**
 * Basic · Morsy Urgent Chunk V2 — RTL/LTR paint using server-preserved literals.
 */

import { escapeHtml, isRtlTranslationText } from "@/lib/wrap-ltr-numbers";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap known preserved literals in `<bdi dir="ltr">`; escape all other text. */
export function renderMorsyChunkV2BidiHtml(text: string, preservedLiterals: string[]): string {
  if (!text) return "";
  const literals = [...new Set(preservedLiterals.map((l) => l.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!literals.length) return escapeHtml(text);

  type Span = { start: number; end: number; literal: string };
  const spans: Span[] = [];
  for (const lit of literals) {
    let idx = 0;
    while (idx < text.length) {
      const found = text.indexOf(lit, idx);
      if (found < 0) break;
      const start = found;
      const end = found + lit.length;
      if (!spans.some((s) => start < s.end && end > s.start)) {
        spans.push({ start, end, literal: lit });
      }
      idx = found + 1;
    }
  }

  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += escapeHtml(text.slice(cursor, span.start));
    out += `<bdi dir="ltr">${escapeHtml(span.literal)}</bdi>`;
    cursor = span.end;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}

export function shouldMorsyChunkV2BidiPaint(text: string): boolean {
  return isRtlTranslationText(text);
}
