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
