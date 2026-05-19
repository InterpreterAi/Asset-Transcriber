import { callHetznerTranslate, type HetznerMtWireDebugMeta } from "./hetzner-translate.js";
import type { CoreLane } from "./hetzner-core-router.js";

/**
 * **Final Boss 3 · machine stack** — translation for `*-libre` plans via **Hetzner** (LibreTranslate-compatible API).
 * Host: `hetzner-translate.ts`. Stale `LIBRETRANSLATE_*` pointing at Railway is ignored server-side.
 * OpenAI (**Final Boss 3 · OpenAI**) lives in `transcription.ts` and is unchanged here.
 *
 * One HTTP call per segment (`translatePlainMachine` → `callHetznerTranslate`). No API key.
 *
 * Shipped for soak testing: treat as frozen pending ~1 week of user feedback unless explicitly asked to change.
 */

export type TranslateBasicProfessionalOpts = {
  sessionId?: number;
  planType?: string;
  userEmail?: string | null;
  /** DB-resolved worker lane for session-bound MT (`manual ?? assigned`). Omit for anonymous callers. */
  resolvedLane?: CoreLane;
  /** Optional wire trace for `HETZNER_MT_WIRE_DEBUG` — see `hetzner-translate.ts`. */
  wireDebug?: HetznerMtWireDebugMeta;
};

/**
 * Plain segment: Hetzner machine translate (Libre-compatible API).
 * @param sourceLang / targetLang — BCP-47 tags from the client (e.g. zh-CN, en).
 */
export async function translatePlainMachine(
  plain: string,
  sourceLang: string,
  targetLang: string,
  opts?: TranslateBasicProfessionalOpts,
): Promise<string> {
  const t = plain.trim();
  if (!t) return "";
  return callHetznerTranslate(t, sourceLang, targetLang, {
    sessionId: opts?.sessionId,
    planType: opts?.planType,
    userEmail: opts?.userEmail,
    resolvedLane: opts?.resolvedLane,
    wireDebug: opts?.wireDebug,
  });
}

/** Expand only NUM_n → exact transcript digits. TERM_/PROT_ stay masked for MT. */
function expandNumPlaceholdersToDigits(text: string, slotToDigits: Map<number, string>): string {
  if (slotToDigits.size === 0) return text;
  let out = text;
  const slots = [...slotToDigits.entries()].sort((a, b) => b[0] - a[0]);
  for (const [n, digits] of slots) {
    out = out.replace(new RegExp(`NUM_${n}(?!\\d)`, "g"), () => digits);
  }
  return out;
}

export async function translateBasicProfessional(
  text: string,
  sourceLang: string,
  targetLang: string,
  slotToDigits: Map<number, string>,
  _opts?: TranslateBasicProfessionalOpts,
): Promise<string> {
  const mtInput = expandNumPlaceholdersToDigits(text, slotToDigits);
  return translatePlainMachine(mtInput, sourceLang, targetLang, _opts);
}
