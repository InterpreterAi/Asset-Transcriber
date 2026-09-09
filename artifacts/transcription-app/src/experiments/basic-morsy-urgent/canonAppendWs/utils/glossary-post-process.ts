/**
 * Restored chunk-v2 path: client-side glossary force / MSA rewrite / phrase repair
 * are disabled. Saved glossary entries still flow upstream into Soniox
 * `translation_terms` via {@link getInterpreterContext}.
 *
 * Signature stays compatible with use-transcription callers.
 */
export function applyGlossaryPostProcess(
  text: string,
  _terms?: unknown,
  _opts?: unknown,
): string {
  return text;
}
