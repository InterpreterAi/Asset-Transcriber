import {
  normalizeWorkspaceLanguageCode,
  workspaceLanguagesEqual,
} from "@/lib/workspace-languages";
import type { SonioxContextTerm } from "../ws/interpreter-context";

export type ChunkV2GlossaryEnforceMode = "strict" | "hint";

/** Language-aware personal glossary row for chunk-v2 Soniox (one alias per entry). */
export type ChunkV2GlossaryEntry = {
  source: string;
  target: string;
  sourceLanguage: string;
  targetLanguage: string;
  enforceMode: ChunkV2GlossaryEnforceMode;
  priority: number;
};

export type GlossaryApiRow = {
  term?: string;
  translation?: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  enforceMode?: string;
  priority?: number;
};

export function filterGlossaryForLanguagePair(
  rows: readonly GlossaryApiRow[],
  langA: string,
  langB: string,
): ChunkV2GlossaryEntry[] {
  const a = normalizeWorkspaceLanguageCode(langA);
  const b = normalizeWorkspaceLanguageCode(langB);
  const out: ChunkV2GlossaryEntry[] = [];

  for (const row of rows) {
    const rawSrc = row.sourceLanguage?.trim() ?? "";
    const rawTgt = row.targetLanguage?.trim() ?? "";
    if (!rawSrc || !rawTgt) continue;

    const sourceLanguage = normalizeWorkspaceLanguageCode(rawSrc);
    const targetLanguage = normalizeWorkspaceLanguageCode(rawTgt);
    const belongsToPair =
      (workspaceLanguagesEqual(sourceLanguage, a) &&
        workspaceLanguagesEqual(targetLanguage, b)) ||
      (workspaceLanguagesEqual(sourceLanguage, b) &&
        workspaceLanguagesEqual(targetLanguage, a));
    if (!belongsToPair) continue;

    const target = `${row.translation ?? ""}`.trim();
    if (target.length < 1) continue;

    const enforceMode: ChunkV2GlossaryEnforceMode =
      row.enforceMode === "hint" ? "hint" : "strict";
    const priority =
      typeof row.priority === "number" && Number.isFinite(row.priority)
        ? Math.trunc(row.priority)
        : 0;

    for (const alias of `${row.term ?? ""}`
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)) {
      out.push({
        source: alias,
        target,
        sourceLanguage,
        targetLanguage,
        enforceMode,
        priority,
      });
    }
  }

  out.sort(
    (x, y) =>
      y.priority - x.priority ||
      y.source.length - x.source.length ||
      x.source.localeCompare(y.source),
  );
  return out;
}

export function chunkV2GlossaryToSonioxTerms(
  entries: readonly ChunkV2GlossaryEntry[],
): SonioxContextTerm[] {
  const seen = new Set<string>();
  const out: SonioxContextTerm[] = [];
  for (const e of entries) {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source: e.source, target: e.target });
  }
  return out;
}

/** Resolve translation direction for a finalized Original row. */
export function resolveRowTranslationDirection(
  rowSourceLanguage: string,
  langA: string,
  langB: string,
): { sourceLanguage: string; targetLanguage: string } | null {
  const src = normalizeWorkspaceLanguageCode(rowSourceLanguage);
  const a = normalizeWorkspaceLanguageCode(langA);
  const b = normalizeWorkspaceLanguageCode(langB);
  if (workspaceLanguagesEqual(src, a)) {
    return { sourceLanguage: a, targetLanguage: b };
  }
  if (workspaceLanguagesEqual(src, b)) {
    return { sourceLanguage: b, targetLanguage: a };
  }
  return null;
}

export async function fetchChunkV2GlossaryForPair(
  langA: string,
  langB: string,
): Promise<ChunkV2GlossaryEntry[]> {
  try {
    const res = await fetch("/api/glossary", { credentials: "include" });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: GlossaryApiRow[] };
    return filterGlossaryForLanguagePair(data.entries ?? [], langA, langB);
  } catch {
    return [];
  }
}
