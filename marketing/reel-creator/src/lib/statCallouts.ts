/** High-converting SaaS ad stat callouts (Reel Builder only). */

export type StatCallout = {
  id: string;
  /** Display text on the glass card */
  label: string;
  /** Character/word range in the segment text for timing */
  startWordIndex: number;
  endWordIndex: number;
};

const STAT_PATTERNS: RegExp[] = [
  /\$[\d,]+(?:\.\d+)?%?/gi,
  /\d[\d,]*(?:\.\d+)?%/gi,
  /\d[\d,]*(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|days?|weeks?|langs?|languages?)\b/gi,
  /\b\d{1,3}\s*(?:languages?|langs?)\b/gi,
  /\b(?:100|99|98|95)\s*%\s*(?:accuracy|accurate)?\b/gi,
  /\b(?:62|50|40|30|24|12|10|7)\s+(?:languages?|hours?|days?)\b/gi,
  /\b(?:ROI|accuracy)\b/gi,
];

/**
 * Extract number/stat phrases from script text and map to word indices.
 */
export function parseStatCallouts(text: string): StatCallout[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Build character offsets per word for span matching
  const lower = text.toLowerCase();
  const found: StatCallout[] = [];
  const seen = new Set<string>();

  for (const re of STAT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].trim();
      if (raw.length < 2) continue;
      const key = `${m.index}:${raw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const startChar = m.index;
      const endChar = m.index + m[0].length;
      let startWord = 0;
      let endWord = words.length - 1;
      let cursor = 0;
      for (let i = 0; i < words.length; i++) {
        const idx = text.indexOf(words[i]!, cursor);
        if (idx < 0) continue;
        const wEnd = idx + words[i]!.length;
        if (idx <= startChar && wEnd > startChar) startWord = i;
        if (idx < endChar) endWord = i;
        cursor = wEnd;
      }

      const label = normalizeStatLabel(raw);
      found.push({
        id: `stat-${found.length}-${startWord}`,
        label,
        startWordIndex: startWord,
        endWordIndex: Math.max(startWord, endWord),
      });
    }
  }

  // Prefer longer / more specific labels; de-dupe overlapping starts
  found.sort((a, b) => a.startWordIndex - b.startWordIndex || b.label.length - a.label.length);
  const deduped: StatCallout[] = [];
  for (const s of found) {
    const overlap = deduped.some(
      (d) => !(s.endWordIndex < d.startWordIndex || s.startWordIndex > d.endWordIndex),
    );
    if (!overlap) deduped.push(s);
  }
  void lower;
  return deduped.slice(0, 6);
}

function normalizeStatLabel(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  // Title-case language counts
  if (/^\d+\s+lang/i.test(t)) {
    return t.replace(/langs?/i, (m) => (m.toLowerCase().startsWith("langs") ? "Languages" : "Language"));
  }
  if (/^\d+\s+hours?/i.test(t)) return t.replace(/hours?/i, (m) => (m.toLowerCase().startsWith("hours") ? "Hours Saved" : "Hour Saved"));
  if (/roi/i.test(t)) return "ROI";
  return t;
}

/** Active callout for the currently spoken word index. */
export function activeStatAt(
  stats: StatCallout[],
  activeWordIndex: number | null | undefined,
): StatCallout | null {
  if (activeWordIndex == null || activeWordIndex < 0 || stats.length === 0) return null;
  return (
    stats.find(
      (s) => activeWordIndex >= s.startWordIndex && activeWordIndex <= s.endWordIndex,
    ) ?? null
  );
}
