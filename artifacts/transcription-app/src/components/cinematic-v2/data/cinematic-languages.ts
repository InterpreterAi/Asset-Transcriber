import {
  WORKSPACE_LANGUAGES,
  WORKSPACE_LANGUAGE_COUNT,
} from "@/lib/workspace-languages";

/** Short display code for cinematic ring / stream visuals. */
function cinematicDisplayCode(value: string): string {
  if (value === "zh-CN" || value === "zh-TW") return "ZH";
  return value.split("-")[0]!.toUpperCase();
}

/** Workspace language catalog for cinematic scale visuals (derived from shared catalog). */
export const CINEMATIC_LANGUAGE_CATALOG = WORKSPACE_LANGUAGES.map((l) => ({
  code: cinematicDisplayCode(l.value),
  label: l.label,
  value: l.value,
}));

export const CINEMATIC_LANGUAGE_COUNT = WORKSPACE_LANGUAGE_COUNT;
