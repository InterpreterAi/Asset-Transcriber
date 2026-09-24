/**
 * Minimal path shim for kuromoji's DictionaryLoader in the browser.
 * Vite externalizes Node's `path` to an empty stub, which makes path.join
 * crash and leaves Japanese Romaji stuck blank / on "…".
 */
export function join(...parts: string[]): string {
  if (parts.length === 0) return ".";
  const abs = parts[0]?.startsWith("/") ?? false;
  const cleaned = parts
    .flatMap((part) => String(part ?? "").split("/"))
    .filter((seg, i) => seg.length > 0 || (i === 0 && abs));
  const out = cleaned.join("/");
  if (abs && !out.startsWith("/")) return `/${out}`;
  return out || ".";
}

const pathShim = { join };
export default pathShim;
