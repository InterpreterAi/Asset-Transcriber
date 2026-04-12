import { and, eq, inArray, sql } from "drizzle-orm";
import { db, globalInterpreterTermMemoryTable } from "@workspace/db";
import { logger } from "./logger.js";

/** Stopwords: common English glue words — not clinical leaks when left alone; avoid learning/MT noise. */
const LATIN_LEAK_STOPWORDS = new Set([
  "that", "this", "with", "from", "what", "when", "your", "have", "been", "will", "would", "could",
  "should", "their", "there", "these", "those", "about", "after", "before", "which", "where", "while",
  "being", "going", "really", "please", "thank", "thanks", "hello", "yes", "okay", "name", "number",
  "through", "wanted", "going", "office", "told", "need", "they", "them", "then", "than", "also",
  "into", "just", "only", "very", "some", "such", "call", "called", "interpreter", "arabic", "english",
]);

function hasArabicScript(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

/** English tokens in source phrase (for glossary hint lookup). */
export function extractEnglishWordsForMemory(plain: string, minLen: number): string[] {
  const m = plain.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const s = new Set<string>();
  for (const w of m) {
    const low = w.toLowerCase();
    if (low.length >= minLen && !LATIN_LEAK_STOPWORDS.has(low)) s.add(low);
  }
  return [...s];
}

/** Latin tokens still present in model output (longest first for safe replacement). */
export function latinTokensLeftInTranslatedText(text: string, minLen: number): string[] {
  const m = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const s = new Set<string>();
  for (const w of m) {
    const low = w.toLowerCase();
    if (low.length >= minLen && !LATIN_LEAK_STOPWORDS.has(low)) s.add(low);
  }
  return [...s].sort((a, b) => b.length - a.length);
}

export async function fetchGlobalTermMemoryHints(
  phraseNormalized: string,
  sourceBase: string,
  targetBase: string,
): Promise<string[]> {
  if (sourceBase !== "en") return [];
  const candidates = extractEnglishWordsForMemory(phraseNormalized, 4);
  if (candidates.length === 0) return [];
  const chunk = candidates.slice(0, 64);
  try {
    const rows = await db
      .select({
        sourceTermNorm: globalInterpreterTermMemoryTable.sourceTermNorm,
        targetTranslation: globalInterpreterTermMemoryTable.targetTranslation,
      })
      .from(globalInterpreterTermMemoryTable)
      .where(
        and(
          eq(globalInterpreterTermMemoryTable.sourceBase, sourceBase),
          eq(globalInterpreterTermMemoryTable.targetBase, targetBase),
          inArray(globalInterpreterTermMemoryTable.sourceTermNorm, chunk),
        ),
      );
    return rows.map((r) => `"${r.sourceTermNorm}" → "${r.targetTranslation}"`);
  } catch (err) {
    logger.warn({ err }, "global_interpreter_term_memory select failed (run db push?)");
    return [];
  }
}

export async function fetchTranslationsForLatinTokens(
  tokens: string[],
  sourceBase: string,
  targetBase: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tokens.length === 0) return map;
  const chunk = [...new Set(tokens.map((t) => t.toLowerCase()))].slice(0, 32);
  try {
    const rows = await db
      .select({
        sourceTermNorm: globalInterpreterTermMemoryTable.sourceTermNorm,
        targetTranslation: globalInterpreterTermMemoryTable.targetTranslation,
      })
      .from(globalInterpreterTermMemoryTable)
      .where(
        and(
          eq(globalInterpreterTermMemoryTable.sourceBase, sourceBase),
          eq(globalInterpreterTermMemoryTable.targetBase, targetBase),
          inArray(globalInterpreterTermMemoryTable.sourceTermNorm, chunk),
        ),
      );
    for (const r of rows) {
      map.set(r.sourceTermNorm, r.targetTranslation);
    }
  } catch (err) {
    logger.warn({ err }, "global_interpreter_term_memory batch fetch failed");
  }
  return map;
}

export function rememberGlobalTermPair(
  sourceBase: string,
  targetBase: string,
  sourceTermNorm: string,
  targetTranslation: string,
): void {
  if (!sourceTermNorm || !targetTranslation) return;
  const norm = sourceTermNorm.toLowerCase().trim();
  const trans = targetTranslation.trim();
  if (norm.length < 3 || trans.length < 1) return;
  if (norm === trans.toLowerCase()) return;
  if (targetBase === "ar" && !hasArabicScript(trans) && /[a-z]/i.test(trans)) return;

  void db
    .insert(globalInterpreterTermMemoryTable)
    .values({
      sourceBase,
      targetBase,
      sourceTermNorm: norm,
      targetTranslation: trans,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        globalInterpreterTermMemoryTable.sourceBase,
        globalInterpreterTermMemoryTable.targetBase,
        globalInterpreterTermMemoryTable.sourceTermNorm,
      ],
      set: {
        targetTranslation: trans,
        hitCount: sql`${globalInterpreterTermMemoryTable.hitCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .catch((err) => {
      logger.warn({ err, norm, targetBase }, "global_interpreter_term_memory upsert failed");
    });
}
