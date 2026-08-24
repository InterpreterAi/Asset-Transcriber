/**
 * Re-export canonical workspace language catalog (defined in transcription-app).
 */
export {
  WORKSPACE_LANGUAGES,
  WORKSPACE_LANGUAGE_COUNT,
  workspaceLanguageCodes,
  workspaceLanguageOptions,
  workspaceLanguageLabel,
  workspaceLanguageNameMap,
  workspaceLanguageTuples,
  workspaceLanguageCatalogJson,
  normalizeWorkspaceLanguageCode,
  isWorkspaceLanguageCode,
  workspaceLanguagesEqual,
  type WorkspaceLanguageOption,
} from "../../../transcription-app/src/lib/workspace-languages.js";
