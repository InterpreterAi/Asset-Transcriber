/**
 * Opt-in tracing for translation **direction** (src/tgt / segment locks / LIVE same-language failures).
 * Does not alter prompts, MT, debounce, retries, or streaming behavior.
 *
 * Enable:
 *   localStorage.setItem("interpreterai_live_direction_trace", "1")
 * Optional snippets (PHI risk):
 *   localStorage.setItem("interpreterai_live_direction_trace_snippets", "1")
 *
 * Export: window.__interpretLiveDirectionTrace.dumpJson()
 * Reset: session start calls liveDirectionTraceSessionReset()
 *
 * Pipeline order (canonical hook):
 *   1. Soniox WS `onmessage` → may update `detectedLangRef` (validateLangByScript on token text).
 *   2. NF/finals → DOM + `liveBufferRef` update → `tryLockSegmentDirectionFromTokens` may set segmentSource/Target.
 *   3. Word-step / endpoint paths call `dispatchTranslation(text, lang, …)` where `lang` is often `detectedLangRef` or locked segment source.
 *   4. `dispatchTranslation` resolves chosenSource / dispatchLang / myTargetLang from current text + hint (no dispatch-time permanent lock; only `tryLockSegmentDirectionFromTokens` sets `segmentSourceLang`).
 *   5. OpenAI arm-debounce may return early; timer recalls `dispatchTranslation` with `skipOpenAiLiveDebounce`.
 *   6. `translateViaPrimaryApi` POST body `{ text, srcLang: dispatchLang, tgtLang: myTargetLang, … }`.
 *   7. Response → polish/merge → `applyTranslationTypography`.
 */

export type LiveDirectionRingEntry =
  | {
      t: "direction_ws_lang";
      atMs: number;
      seq: number;
      segmentId: string | null;
      sonioxTokenLang: string;
      validatedLang: string;
      prevDetectedLangRef: string;
    }
  | {
      t: "direction_try_lock";
      atMs: number;
      seq: number;
      segmentId: string;
      evidenceWords: number;
      evidenceChars: number;
      segmentSourceLang: string;
      segmentTargetLang: string;
      firstTokenLang?: string;
    }
  | {
      t: "direction_dispatch_resolve";
      atMs: number;
      seq: number;
      phase: "openai_debounce_schedule" | "api_bound";
      correlationId: string;
      segmentId: string;
      pairA: string;
      pairB: string;
      langParam: string;
      detectedLangRef: string;
      rawCandidate: string;
      vRaw: string;
      vSon: string;
      majorityHint: string | null;
      uniqueFromValidatedSoniox: string | null;
      uniqueFromRawSoniox: string | null;
      chosenSource: string;
      segmentSourceLangBeforePersist: string | null;
      persistGatePassed: boolean;
      evidenceWordsAtPersist: number;
      evidenceCharsAtPersist: number;
      snappedPersistApplied: boolean;
      snappedPersistValue: string | null;
      dispatchLang: string;
      targetOppositeBeforeHardGuard: string;
      hardGuardTriggered: boolean;
      myTargetLang: string;
      dispatchWords: number;
      dispatchChars: number;
      liveBufferLen: number;
      translationLocked: boolean;
      segmentSourceLangAfter: string | null;
      segmentTargetLangAfter: string | null;
      isFinal: boolean;
      skipOpenAiLiveDebounce?: boolean;
    }
  | {
      t: "direction_api_request";
      atMs: number;
      correlationId: string;
      srcLang: string;
      tgtLang: string;
      streamingDelta: boolean;
      isFinal: boolean;
      apiPayloadCharLen: number;
      srcTgtMismatch: boolean;
      bodySnippet?: string;
    }
  | {
      t: "direction_fetch_result";
      atMs: number;
      correlationId: string;
      requestIsFinal: boolean;
      useStreamingDelta: boolean;
      apiTextLen: number;
      fullTextLen: number;
      translatedTrimLen: number;
      looksLikeUntranslatedEcho: boolean;
      srcTgtEqualBug: boolean;
      sameLanguageSuspect: boolean;
      sourceSnippet?: string;
      translatedSnippet?: string;
    }
  | {
      t: "direction_same_language_failure";
      atMs: number;
      correlationId: string;
      segmentId: string;
      sourceText: string;
      translatedText: string;
      srcLangSent: string;
      tgtLangSent: string;
      detectedLangRef: string;
      segmentSourceLang: string | null;
      dispatchLang: string;
      chosenSource: string;
      majorityHint: string | null;
      useStreamingDelta: boolean;
      requestIsFinal: boolean;
      paintOutcome: "painted" | "suppressed_blank" | "suppressed_dedupe_empty" | "suppressed_prefer_prev" | "guard_drop" | "unknown";
      hypothesisTags: ("flip"|"late_lock"|"early_lock"|"stale_lock"|"noisy_mixed"|"race")[];
    };

const RING_MAX = 600;
const ring: LiveDirectionRingEntry[] = [];

let seqCounter = 0;

export function liveDirectionTraceEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_live_direction_trace") === "1";
  } catch {
    return false;
  }
}

export function liveDirectionTraceSnippetsEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_live_direction_trace_snippets") === "1";
  } catch {
    return false;
  }
}

function push(e: LiveDirectionRingEntry): void {
  ring.push(e);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  // eslint-disable-next-line no-console
  console.info("[live_direction_trace]", e);
}

export function liveDirectionTraceNextSeq(): number {
  seqCounter += 1;
  return seqCounter;
}

export function liveDirectionTraceSessionReset(): void {
  seqCounter = 0;
  ring.length = 0;
  attachWindow();
}

function snippet(s: string): string | undefined {
  if (!liveDirectionTraceSnippetsEnabled()) return undefined;
  const t = s.trim();
  if (!t) return "(empty)";
  return t.length <= 120 ? t : `${t.slice(0, 120)}…`;
}

export { snippet as liveDirectionTraceSnippet };

export function liveDirectionTraceWsLang(ev: Omit<Extract<LiveDirectionRingEntry, { t: "direction_ws_lang" }>, "t" | "atMs">): void {
  if (!liveDirectionTraceEnabled()) return;
  push({ t: "direction_ws_lang", atMs: Date.now(), ...ev });
}

export function liveDirectionTraceTryLock(ev: Omit<Extract<LiveDirectionRingEntry, { t: "direction_try_lock" }>, "t" | "atMs">): void {
  if (!liveDirectionTraceEnabled()) return;
  push({ t: "direction_try_lock", atMs: Date.now(), ...ev });
}

export function liveDirectionTraceDispatchResolve(
  ev: Omit<Extract<LiveDirectionRingEntry, { t: "direction_dispatch_resolve" }>, "t" | "atMs">,
): void {
  if (!liveDirectionTraceEnabled()) return;
  push({ t: "direction_dispatch_resolve", atMs: Date.now(), ...ev });
}

export function liveDirectionTraceApiRequest(
  ev: Omit<Extract<LiveDirectionRingEntry, { t: "direction_api_request" }>, "t" | "atMs">,
): void {
  if (!liveDirectionTraceEnabled()) return;
  push({ t: "direction_api_request", atMs: Date.now(), ...ev });
}

export function liveDirectionTraceFetchResult(
  ev: Omit<Extract<LiveDirectionRingEntry, { t: "direction_fetch_result" }>, "t" | "atMs">,
): void {
  if (!liveDirectionTraceEnabled()) return;
  push({ t: "direction_fetch_result", atMs: Date.now(), ...ev });
}

export function liveDirectionTraceSameLanguageFailure(
  ev: Omit<Extract<LiveDirectionRingEntry, { t: "direction_same_language_failure" }>, "t" | "atMs">,
): void {
  if (!liveDirectionTraceEnabled()) return;
  push({ t: "direction_same_language_failure", atMs: Date.now(), ...ev });
}

function attachWindow(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    __interpretLiveDirectionTrace?: { dumpJson: () => string; clear: () => void };
  };
  w.__interpretLiveDirectionTrace = {
    dumpJson: () => JSON.stringify(ring, null, 2),
    clear: () => {
      ring.length = 0;
    },
  };
}

if (typeof window !== "undefined") attachWindow();
