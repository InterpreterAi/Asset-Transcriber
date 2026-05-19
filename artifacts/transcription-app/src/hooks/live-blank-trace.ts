/**
 * Opt-in tracing for LIVE translation blanks / suppressed paints (rapid & noisy speech).
 * Does not change translation behavior — ring buffer + console only.
 *
 * Enable:
 *   localStorage.setItem("interpreterai_live_blank_trace", "1")
 * Optional short text prefixes (PHI risk):
 *   localStorage.setItem("interpreterai_live_blank_trace_snippets", "1")
 *
 * Export ring: window.__interpretLiveBlankTrace.dumpJson()
 *
 * How to read (maps to investigation questions):
 *
 * 1) `/translate` outcome — scan chronological `primary_api` events before each blank:
 *    - `exit: http_ok_translated_missing` → JSON ok but no `translated` field
 *    - `http_ok_translated_nullish_empty` / `http_ok_translated_whitespace_only` → empty/whitespace payload
 *    - `catch_try_fallback_network` + `fetchErrorName` → timeout (AbortError), network, or thrown JSON parse on response
 *    - `catch_abort_ok_empty` / `abort_before_attempt` / `aborted_before_retry_sleep` → AbortSignal (superseded LIVE request or teardown)
 *    - `http_4xx_silent_empty` → client maps some 4xx to `{ outcome ok, text "" }` (no UI error)
 *    - `fetch_translation_pack` immediately after: `ok_empty` vs `try_fallback_empty` aggregates outcome after primary
 *
 * 2) Dispatch context — each `dispatch_start` carries: word/char counts, `requestIsFinal`, `useStreamingDelta`,
 *    langs, segment locks, translation cell state **before** fetch, `liveBufferLenAtDispatch`, and last `wsSnapshot`.
 *
 * 3) Correlation — compare `dispatch_start.wsSnapshot` + `live_blank_cluster.summary` (delta live buffer, NF/shrink/lang flags).
 *
 * 4) Client discard — `dispatch_guard` (phase `before_fetch_loop` | `after_fetch_before_paint`) codes;
 *    `paint_suppressed` (`blank_after_fetch_no_paint`, `dedupe_live_empty`, `prefer_previous_live_kept_shorter_offered`);
 *    `looks_like_untranslated_copy`; stale seq / abort guards.
 *
 * 5) Classification hints — `live_blank_cluster.hypothesis` + `summary.clientLikelyCauseHint` are **heuristic only**;
 *    pair with `primary_api` + `fetch_attempt_result` + guards for A/B/C/D.
 *
 * Note: UI “blank” / em dash from placeholders is not fully distinguished here — correlate timestamps with `dispatch_start`.
 */

export type LiveBlankWsSnapshot = {
  atMs: number;
  multiEffSpeakerFrame: boolean;
  multiLangTagFrame: boolean;
  nfFullReplace: boolean;
  hypothesisShrink: boolean;
  langFlipThisMsg: boolean;
  liveBufferLen: number;
  joinedHypothesisLen: number;
};

export type PrimaryApiTraceExit =
  | "abort_before_attempt"
  | "http_ok"
  | "http_ok_translated_missing"
  | "http_ok_translated_nullish_empty"
  | "http_ok_translated_whitespace_only"
  | "http_ok_non_empty"
  | "http_503_fatal_try_fallback"
  | "http_503_try_fallback_last_attempt"
  | "http_403_daily_limit"
  | "http_403_translation_plan_ok_empty"
  | "http_403_try_fallback"
  | "http_401_try_fallback"
  | "http_4xx_silent_empty"
  | "http_5xx_try_fallback_last_attempt"
  | "catch_abort_ok_empty"
  | "catch_try_fallback_network"
  | "abort_before_retry_sleep"
  | "exhausted_try_fallback";

export type LiveBlankRingEntry =
  | {
      t: "primary_api";
      atMs: number;
      exit: PrimaryApiTraceExit;
      attempt: number;
      httpStatus?: number;
      /** Length of raw translated field before client trim (if parsed). */
      rawTranslatedLen?: number;
      trimmedLen?: number;
      aborted?: boolean;
      /** Soniox / parse failures surface here */
      fetchErrorName?: string;
    }
  | {
      t: "fetch_translation_pack";
      atMs: number;
      outcome: "ok_text" | "ok_empty" | "daily_limit" | "try_fallback_empty";
      trimmedResponseLen: number;
      dailyLimit?: boolean;
    }
  | {
      t: "dispatch_guard";
      atMs: number;
      traceId: string;
      phase: "before_fetch_loop" | "after_fetch_before_paint";
      code: string;
      mySeq: number;
      lastAppliedSeq: number;
      lastShownSeq: number;
      requestIsFinal: boolean;
      isFinalDispatch: boolean;
      aborted?: boolean;
      translationLocked?: boolean;
      hardFinalRequested?: boolean;
      finalizing?: boolean;
      isClosed?: boolean;
    }
  | {
      t: "dispatch_start";
      atMs: number;
      traceId: string;
      segmentId: string;
      mySeq: number;
      isFinalDispatch: boolean;
      requestIsFinal: boolean;
      useStreamingDelta: boolean;
      dispatchWords: number;
      dispatchCharsFullText: number;
      dispatchCharsApiPayload: number;
      dispatchLang: string;
      myTargetLang: string;
      segmentSourceLang: string | null;
      detectedLangRef: string;
      translationCellCharsBefore: number;
      translationCellHadNonPlaceholderContent: boolean;
      liveBufferLenAtDispatch: number;
      wsSnapshot: LiveBlankWsSnapshot;
      /** PHI — only when `interpreterai_live_blank_trace_snippets` = 1 */
      apiPayloadSnippet?: string;
      fullSourceSnippet?: string;
    }
  | {
      t: "fetch_attempt_result";
      atMs: number;
      traceId: string;
      fetchAttempt: number;
      requestIsFinal: boolean;
      trimmedLen: number;
      brokeRetryLoop: boolean;
    }
  | {
      t: "looks_like_untranslated_copy";
      atMs: number;
      traceId: string;
      retriedOpposite: boolean;
      retryTrimmedLen?: number;
    }
  | {
      t: "paint_suppressed";
      atMs: number;
      traceId: string;
      code:
        | "blank_after_fetch_no_paint"
        | "dedupe_live_empty"
        | "prefer_previous_live_kept_shorter_offered";
      requestIsFinal: boolean;
      useStreamingDelta: boolean;
      translatedTrimmedLen: number;
      chosenWouldBeLen?: number;
      prevShownLen?: number;
      preferPrev?: boolean;
    }
  | {
      t: "paint_applied_live";
      atMs: number;
      traceId: string;
      useStreamingDelta: boolean;
      mergedLen: number;
      chosenLen: number;
    }
  | {
      t: "live_blank_cluster";
      atMs: number;
      traceId: string;
      /** Answers A/B/C/D heuristic buckets — not ground truth. */
      hypothesis: ("upstream_ws"|"api_empty"|"client_guard"|"race")[];
      summary: Record<string, string | number | boolean | null>;
    };

const RING_MAX = 400;
const ring: LiveBlankRingEntry[] = [];

let lastWs: LiveBlankWsSnapshot = {
  atMs: 0,
  multiEffSpeakerFrame: false,
  multiLangTagFrame: false,
  nfFullReplace: false,
  hypothesisShrink: false,
  langFlipThisMsg: false,
  liveBufferLen: 0,
  joinedHypothesisLen: 0,
};

export function liveBlankTraceEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_live_blank_trace") === "1";
  } catch {
    return false;
  }
}

export function liveBlankTraceSnippetsEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_live_blank_trace_snippets") === "1";
  } catch {
    return false;
  }
}

function push(e: LiveBlankRingEntry): void {
  ring.push(e);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  // eslint-disable-next-line no-console
  console.info("[live_blank_trace]", e);
}

export function liveBlankTraceGetLastWsSnapshot(): LiveBlankWsSnapshot {
  return { ...lastWs };
}

/** Called from Soniox handler (via stt-pipeline-instrumentation). */
export function liveBlankTraceOnWsFrame(s: Omit<LiveBlankWsSnapshot, "atMs"> & { atMs?: number }): void {
  if (!liveBlankTraceEnabled()) return;
  lastWs = {
    atMs: s.atMs ?? Date.now(),
    multiEffSpeakerFrame: s.multiEffSpeakerFrame,
    multiLangTagFrame: s.multiLangTagFrame,
    nfFullReplace: s.nfFullReplace,
    hypothesisShrink: s.hypothesisShrink,
    langFlipThisMsg: s.langFlipThisMsg,
    liveBufferLen: s.liveBufferLen,
    joinedHypothesisLen: s.joinedHypothesisLen,
  };
}

export function liveBlankTracePrimaryApiEvent(ev: Omit<Extract<LiveBlankRingEntry, { t: "primary_api" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "primary_api", atMs: Date.now(), ...ev });
}

export function liveBlankTraceFetchPack(ev: Omit<Extract<LiveBlankRingEntry, { t: "fetch_translation_pack" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "fetch_translation_pack", atMs: Date.now(), ...ev });
}

export function liveBlankTraceDispatchStart(
  ev: Omit<Extract<LiveBlankRingEntry, { t: "dispatch_start" }>, "t" | "atMs">,
): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "dispatch_start", atMs: Date.now(), ...ev });
}

export function liveBlankTraceGuard(ev: Omit<Extract<LiveBlankRingEntry, { t: "dispatch_guard" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "dispatch_guard", atMs: Date.now(), ...ev });
}

export function liveBlankTraceFetchAttempt(ev: Omit<Extract<LiveBlankRingEntry, { t: "fetch_attempt_result" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "fetch_attempt_result", atMs: Date.now(), ...ev });
}

export function liveBlankTraceUntranslatedCopy(ev: Omit<Extract<LiveBlankRingEntry, { t: "looks_like_untranslated_copy" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "looks_like_untranslated_copy", atMs: Date.now(), ...ev });
}

export function liveBlankTracePaintSuppressed(ev: Omit<Extract<LiveBlankRingEntry, { t: "paint_suppressed" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "paint_suppressed", atMs: Date.now(), ...ev });
}

export function liveBlankTracePaintAppliedLive(ev: Omit<Extract<LiveBlankRingEntry, { t: "paint_applied_live" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "paint_applied_live", atMs: Date.now(), ...ev });
}

export function liveBlankTraceClusterBlank(ev: Omit<Extract<LiveBlankRingEntry, { t: "live_blank_cluster" }>, "t" | "atMs">): void {
  if (!liveBlankTraceEnabled()) return;
  push({ t: "live_blank_cluster", atMs: Date.now(), ...ev });
}

function attachWindow(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    __interpretLiveBlankTrace?: {
      dumpJson: () => string;
      clear: () => void;
    };
  };
  w.__interpretLiveBlankTrace = {
    dumpJson: () => JSON.stringify(ring, null, 2),
    clear: () => {
      ring.length = 0;
    },
  };
}

if (typeof window !== "undefined") {
  try {
    if (liveBlankTraceEnabled()) attachWindow();
  } catch {
    /* ignore */
  }
}

/** Call from session start when trace enabled (alongside other instrumentation resets). */
export function liveBlankTraceSessionReset(): void {
  ring.length = 0;
  lastWs = {
    atMs: 0,
    multiEffSpeakerFrame: false,
    multiLangTagFrame: false,
    nfFullReplace: false,
    hypothesisShrink: false,
    langFlipThisMsg: false,
    liveBufferLen: 0,
    joinedHypothesisLen: 0,
  };
  if (liveBlankTraceEnabled()) attachWindow();
}

export function maybeSnippet(s: string): string | undefined {
  if (!liveBlankTraceSnippetsEnabled()) return undefined;
  const t = s.trim();
  if (!t) return "(empty)";
  return t.length <= 48 ? t : `${t.slice(0, 48)}…`;
}
