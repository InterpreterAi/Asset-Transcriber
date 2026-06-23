// In-memory language configuration managed by admin.
// Resets to defaults on server restart — acceptable for admin tooling.
//
// Interpreter AI — language catalog is shared with workspace pickers (Phase A).

import { workspaceLanguageOptions } from "./workspace-languages.js";

export const ALL_LANGUAGES = workspaceLanguageOptions();

export interface LangConfig {
  enabledLanguages: string[];   // language value codes that are active
  defaultLangA:     string;
  defaultLangB:     string;
}

const DEFAULT_ENABLED = ALL_LANGUAGES.map(l => l.value);

export let langConfig: LangConfig = {
  enabledLanguages: DEFAULT_ENABLED,
  defaultLangA:     "en",
  defaultLangB:     "ar",
};

export function updateLangConfig(updates: Partial<LangConfig>) {
  langConfig = { ...langConfig, ...updates };
}
