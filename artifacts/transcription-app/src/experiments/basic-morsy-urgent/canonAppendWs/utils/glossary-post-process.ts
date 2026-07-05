import type { SonioxContextTerm } from "../ws/interpreter-context";
export function applyGlossaryPostProcess(
  text: string,
  terms: readonly SonioxContextTerm[],
): string {
  if (!terms.length || !text.trim()) return text;
  let result = text;
  for (const { source, target } of terms) {
    if (!source || !target) continue;
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?<![\\w\\u00C0-\\u024F])${escaped}(?![\\w\\u00C0-\\u024F])`,
      "gi",
    );
    result = result.replace(re, (match) => {
      if (match.toUpperCase() === match && match.toLowerCase() !== match) {
        return target.toUpperCase();
      }
      if (
        match[0] === match[0]?.toUpperCase() &&
        match[0] !== match[0]?.toLowerCase()
      ) {
        return target.charAt(0).toUpperCase() + target.slice(1);
      }
      return target;
    });
  }
  return result;
}
