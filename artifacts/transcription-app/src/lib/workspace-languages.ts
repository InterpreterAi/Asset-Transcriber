/**
 * Single source of truth for InterpreterAI workspace language pickers (Phase A).
 * Soniox STT-native codes + Somali (`so`) with existing proxy handling elsewhere.
 */

export type WorkspaceLanguageOption = {
  readonly value: string;
  readonly label: string;
};

/** Full workspace catalog — existing 36 languages (order preserved) + Soniox additions. */
export const WORKSPACE_LANGUAGES: readonly WorkspaceLanguageOption[] = [
  { value: "ar", label: "Arabic" },
  { value: "bg", label: "Bulgarian" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "hr", label: "Croatian" },
  { value: "cs", label: "Czech" },
  { value: "da", label: "Danish" },
  { value: "nl", label: "Dutch" },
  { value: "en", label: "English" },
  { value: "fa", label: "Persian (Farsi)" },
  { value: "fi", label: "Finnish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "el", label: "Greek" },
  { value: "he", label: "Hebrew" },
  { value: "hi", label: "Hindi" },
  { value: "hu", label: "Hungarian" },
  { value: "id", label: "Indonesian" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ms", label: "Malay" },
  { value: "nb", label: "Norwegian" },
  { value: "pl", label: "Polish" },
  { value: "pt", label: "Portuguese" },
  { value: "ro", label: "Romanian" },
  { value: "ru", label: "Russian" },
  { value: "sk", label: "Slovak" },
  { value: "so", label: "Somali" },
  { value: "es", label: "Spanish" },
  { value: "sv", label: "Swedish" },
  { value: "th", label: "Thai" },
  { value: "tr", label: "Turkish" },
  { value: "uk", label: "Ukrainian" },
  { value: "ur", label: "Urdu" },
  { value: "vi", label: "Vietnamese" },
  // Soniox-supported additions (Phase A)
  { value: "af", label: "Afrikaans" },
  { value: "sq", label: "Albanian" },
  { value: "az", label: "Azerbaijani" },
  { value: "eu", label: "Basque" },
  { value: "be", label: "Belarusian" },
  { value: "bn", label: "Bengali" },
  { value: "bs", label: "Bosnian" },
  { value: "ca", label: "Catalan" },
  { value: "et", label: "Estonian" },
  { value: "gl", label: "Galician" },
  { value: "gu", label: "Gujarati" },
  { value: "kn", label: "Kannada" },
  { value: "kk", label: "Kazakh" },
  { value: "lv", label: "Latvian" },
  { value: "lt", label: "Lithuanian" },
  { value: "mk", label: "Macedonian" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "pa", label: "Punjabi" },
  { value: "sr", label: "Serbian" },
  { value: "sl", label: "Slovenian" },
  { value: "sw", label: "Swahili" },
  { value: "tl", label: "Tagalog" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "cy", label: "Welsh" },
] as const;

export const WORKSPACE_LANGUAGE_COUNT = WORKSPACE_LANGUAGES.length;

/** BCP-47 codes for server glossary, MT fill scripts, and restore. */
export function workspaceLanguageCodes(): readonly string[] {
  return WORKSPACE_LANGUAGES.map((l) => l.value);
}

/** Mutable copy for React selects and admin UI. */
export function workspaceLanguageOptions(): WorkspaceLanguageOption[] {
  return WORKSPACE_LANGUAGES.map((l) => ({ value: l.value, label: l.label }));
}

/** Display label for a workspace language code; falls back to the code string. */
export function workspaceLanguageLabel(code: string): string {
  const exact = WORKSPACE_LANGUAGES.find((l) => l.value === code);
  if (exact) return exact.label;
  const base = (code || "").split("-")[0]!.toLowerCase();
  const byBase = WORKSPACE_LANGUAGES.find(
    (l) => l.value.split("-")[0]!.toLowerCase() === base,
  );
  return byBase?.label ?? code;
}

/** Record map for legacy LANG_NAMES call sites. */
export function workspaceLanguageNameMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of WORKSPACE_LANGUAGES) out[l.value] = l.label;
  return out;
}

/** `[code, label]` tuples for static HTML debug harnesses. */
export function workspaceLanguageTuples(): ReadonlyArray<readonly [string, string]> {
  return WORKSPACE_LANGUAGES.map((l) => [l.value, l.label] as const);
}

/** JSON-serializable catalog for debug-app static fetch. */
export function workspaceLanguageCatalogJson(): WorkspaceLanguageOption[] {
  return workspaceLanguageOptions();
}

/**
 * Regenerate debug-app copy after catalog edits:
 *   node --experimental-strip-types -e "import { writeFileSync } from 'node:fs'; import { workspaceLanguageCatalogJson } from './artifacts/transcription-app/src/lib/workspace-languages.ts'; writeFileSync('./artifacts/debug-app/public/workspace-languages.json', JSON.stringify(workspaceLanguageCatalogJson(), null, 2));"
 */
