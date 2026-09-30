/**
 * Map InterpreterAI workspace picker codes onto the official Soniox live-demo language list.
 * Unknown codes return null — two-way translation is not started with invented hints.
 */
import { languages } from "./languages";

const SONIOX_CODES = new Set(languages.map((lang) => lang.code));

/** Workspace BCP-47 bases that the official demo lists under a different ISO code. */
const WORKSPACE_BASE_TO_OFFICIAL: Record<string, string> = {
  nb: "no",
  nn: "no",
};

export function workspaceLangToOfficialSonioxCode(workspaceCode: string): string | null {
  const base = (workspaceCode || "").split("-")[0]!.toLowerCase();
  if (!base) return null;
  const mapped = WORKSPACE_BASE_TO_OFFICIAL[base] ?? base;
  return SONIOX_CODES.has(mapped) ? mapped : null;
}

/**
 * Two-way LID hints. Non-English first, English last, same order for either
 * picker slot. Soniox `language_hints_strict` only keeps output inside this
 * pair — it still may write the other language in the English script when
 * English is language_a and the hint list starts with English. Official
 * samples keep `language_hints` in the same order as `language_a` / `language_b`.
 */
export function sonioxTwoWayLanguageHints(langA: string, langB: string): string[] {
  const codes = [langA, langB]
    .map((c) => workspaceLangToOfficialSonioxCode(c))
    .filter((c): c is string => Boolean(c));
  const uniq: string[] = [];
  for (const c of codes) {
    if (!uniq.includes(c)) uniq.push(c);
  }
  uniq.sort((x, y) => (x === "en" ? 1 : 0) - (y === "en" ? 1 : 0) || x.localeCompare(y));
  return uniq;
}

/** `translation.two_way` endpoints in the same order as {@link sonioxTwoWayLanguageHints}. */
export function sonioxTwoWayEndpoints(langA: string, langB: string): {
  language_a: string;
  language_b: string;
} {
  const hints = sonioxTwoWayLanguageHints(langA, langB);
  return { language_a: hints[0] ?? langA, language_b: hints[1] ?? langB };
}
