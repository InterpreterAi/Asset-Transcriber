import { buildSonioxInterpreterContext } from "@/lib/interpreter-stt-context";

import {
  fitSonioxContextToBudget,
  SONIOX_CONTEXT_SAFE_CHARS,
} from "./soniox-context-budget";
import {
  getInterpreterContext,
  type SonioxContext,
  type SonioxContextTerm,
} from "./interpreter-context";

/** Context sent on every isolated Soniox connect — STT always, native translation when enabled. */
export function buildIsolatedRuntimeSonioxContext(
  pair: { a: string; b: string },
  opts: {
    chunkV2NativeTranslate: boolean;
    glossaryTerms?: readonly SonioxContextTerm[];
  },
): SonioxContext & { text?: string } {
  const stt = buildSonioxInterpreterContext(pair);
  if (!opts.chunkV2NativeTranslate) {
    return {
      general: stt.general,
      terms: stt.terms,
      text: stt.text,
    };
  }

  const native = getInterpreterContext(pair.a, pair.b, [...(opts.glossaryTerms ?? [])]);
  const extra = stt.general.filter(
    (g) =>
      (g.key === "pair_language" || g.key === "spoken_as_is") &&
      !native.general.some((n) => n.key === g.key),
  );
  return fitSonioxContextToBudget(
    {
      general: [...extra, ...native.general],
      terms: native.terms,
      translation_terms: native.translation_terms,
    },
    { maxChars: SONIOX_CONTEXT_SAFE_CHARS },
  );
}
