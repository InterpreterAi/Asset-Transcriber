/**
 * Workspace language codes used for glossary `translations` and restore.
 * Authoring convention: `translations.en` is the canonical English gloss (full
 * phrase when the JSON key is an acronym). Missing keys in JSON are filled at
 * load with that English string so every target resolves; prefer adding real
 * target-language strings in data files for production quality.
 */
import { workspaceLanguageCodes } from "./workspace-languages.js";

/** All workspace languages — missing JSON cells fall back to English at load. */
export const INTERPRETER_GLOSSARY_LANG_CODES = workspaceLanguageCodes();

export type InterpreterGlossaryLangCode = string;
