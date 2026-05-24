/** Client transcription + translation dispatch (single canonical hook). dailyCapRef + heartbeat cap for daily limits. */
import { useRef, useState, useCallback, useEffect, useLayoutEffect, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";
import { buildSonioxInterpreterContext } from "@/lib/interpreter-stt-context";
import {
  getTranslationTypographyMeta,
  wrapAsciiDigitRunsWithLtrSpans,
} from "@/lib/wrap-ltr-numbers";
import { readGlossaryStrictEnabled } from "@/lib/glossary-strict-storage";
import { readTerminologyMode } from "@/lib/terminology-mode-storage";
import {
  logSttPipelineReportConsole,
  recordSttSegmentClose,
  recordSttWsFrame,
  recordTranslationDispatch,
  recordTranslationFetchException,
  recordTranslationLiveDebounceSchedule,
  recordTranslationUiBlankAfterFetch,
  resetSttPipelineInstrumentationSession,
} from "@/hooks/stt-pipeline-instrumentation";
import type { PrimaryApiTraceExit } from "@/hooks/live-blank-trace";
import {
  liveBlankTraceClusterBlank,
  liveBlankTraceDispatchStart,
  liveBlankTraceEnabled,
  liveBlankTraceFetchAttempt,
  liveBlankTraceFetchPack,
  liveBlankTraceGetLastWsSnapshot,
  liveBlankTraceGuard,
  liveBlankTracePaintAppliedLive,
  liveBlankTracePaintSuppressed,
  liveBlankTracePrimaryApiEvent,
  liveBlankTraceSessionReset,
  liveBlankTraceUntranslatedCopy,
  maybeSnippet,
} from "@/hooks/live-blank-trace";
import {
  liveDirectionTraceApiRequest,
  liveDirectionTraceDispatchResolve,
  liveDirectionTraceEnabled,
  liveDirectionTraceFetchResult,
  liveDirectionTraceNextSeq,
  liveDirectionTraceSameLanguageFailure,
  liveDirectionTraceSessionReset,
  liveDirectionTraceSnippet,
  liveDirectionTraceTryLock,
  liveDirectionTraceWsLang,
} from "@/hooks/live-direction-trace";

/** Matches `ApiError` from api-client-react without importing (project ref .d.ts can lag). */
function getTranscriptionTokenFailureCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { name?: string; data?: { code?: string } | null };
  if (e.name !== "ApiError") return undefined;
  const c = e.data?.code;
  return typeof c === "string" ? c : undefined;
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { name?: string; data?: { error?: string } | null };
  if (e.name !== "ApiError") return undefined;
  const msg = e.data?.error;
  return typeof msg === "string" ? msg : undefined;
}

/** Matches api-server `UNLIMITED_DAILY_CAP_MINUTES` — skip client preemption when plan is “unlimited”. */
const UNLIMITED_DAILY_CAP_MINUTES = 9000;

/** Shown when the server ends the session for daily cap (heartbeat, translate, or client PCM preemption). */
const DAILY_LIMIT_STOP_MESSAGE =
  "You have used all of your allowed minutes for today. This session has been stopped.";

/**
 * Soniox often sends a non-final hypothesis that repeats the tail already committed
 * as finals (e.g. after a question). Concatenating final + NF verbatim duplicates
 * that phrase in `liveBufferRef` and then bakes it into the transcript when NF clears.
 */
function mergeFinalWithNonFinalHypothesis(finalPart: string, nf: string): string {
  const n = nf.trim();
  if (!n) return finalPart;
  const fTrim = finalPart.trimEnd();
  if (!fTrim) return n;
  if (fTrim.endsWith(n)) return fTrim;
  const fLow = fTrim.toLowerCase();
  const nLow = n.toLowerCase();
  if (fLow.endsWith(nLow)) return fTrim;
  // NF is a case-insensitive extension of everything already in finals — use the longer hypothesis.
  if (n.startsWith(fTrim) || nLow.startsWith(fLow)) return n;
  const maxLen = Math.min(fTrim.length, n.length);
  for (let k = maxLen; k >= 1; k--) {
    if (fTrim.slice(-k) === n.slice(0, k)) return fTrim + n.slice(k);
  }
  return fTrim + n;
}

/**
 * Live (non-final) translation: if the source is still growing or stable, do not replace a longer
 * on-screen translation with a shorter API response — MT sometimes returns a partial. When the source
 * shrinks (speaker correction), allow the shorter target. Final passes always replace the cell.
 */
function shouldPreferPreviousLiveTranslation(
  prevShown: string,
  next: string,
  sourceNowCollapsed: string,
  sourceCommittedCollapsed: string,
): boolean {
  const p = prevShown.trim();
  const n = next.trim();
  if (!p || p === "…") return false;
  if (!n) return true;
  if (n.length >= p.length) return false;
  const sn = sourceNowCollapsed.trim();
  const sc = sourceCommittedCollapsed.trim();
  return sn.length >= sc.length - 2;
}

/**
 * Opt-in STT diagnostics (browser console only; may contain PHI — dev machines only).
 * `localStorage.setItem("interpreterai_stt_diag", "1")` then reload.
 * Logs: raw Soniox JSON for messages whose tokens contain a digit, plus UI snapshot after handling.
 */
function sttClientDiagEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_stt_diag") === "1";
  } catch {
    return false;
  }
}

const STT_DIAG_RAW_MAX = 65536;

function logSttDiagWsRaw(evtData: unknown, tokens: SonioxToken[]): void {
  if (!sttClientDiagEnabled()) return;
  const rawAll = tokens.filter(t => !isSonioxEndpointToken(t)).map(t => t.text).join("");
  if (!/\d/.test(rawAll)) return;
  const s = typeof evtData === "string" ? evtData : String(evtData);
  console.info(
    "[stt_diag_ws_raw]",
    s.length > STT_DIAG_RAW_MAX ? `${s.slice(0, STT_DIAG_RAW_MAX)}…[truncated ${s.length} chars]` : s,
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE         = 16000;
const SONIOX_WS_URL       = "wss://stt-rt.soniox.com/transcribe-websocket";
const FINAL_TEXT_RENDER_BUFFER_MS = 80;
/** Morsy Urgent Intercall experiment: coarser burst coalescing for OpenAI live translate (aligns with WS micro-batches). */
const INTERCALL_LIVE_TRANSLATION_DEBOUNCE_MS = 400;
/** Morsy Urgent Intercall experiment: OpenAI-path scheduling debounce alongside {@link INTERCALL_LIVE_TRANSLATION_DEBOUNCE_MS}. */
const INTERCALL_OPENAI_LIVE_DEBOUNCE_MS = 420;
/** After Soniox &lt;end&gt;, let final-token render queue settle before binding the translate request. */
const INTERCALL_ENDPOINT_FINALIZE_GRACE_MS = 140;
const SAME_SPEAKER_PAUSE_SPLIT_MS = 4000;
/** Legacy diagnostic slack label — not used for sticky-tail snap decisions anymore. */
const TRANSCRIPT_SCROLL_BOTTOM_SLACK_PX = 72;
/**
 * Threshold for BOTH: (a) “glued to tail” *before* transcript/translation DOM height grows, and (b) fallback
 * epsilon after growth when no pre-snapshot ran. Auto-follow depends on (a): after new text, scrollHeight grows
 * while scrollTop is unchanged, so post-only distance checks look like “not at bottom” until snap fails.
 */
const TRANSCRIPT_TAIL_STICK_EPS_PX = 12;

function transcriptScrollDistanceFromBottom(scrollEl: HTMLElement): number {
  return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
}

/** True iff the viewport is within {@link TRANSCRIPT_TAIL_STICK_EPS_PX}px of scroll bottom immediately before transcript content grows (Chat tail-follow latch). */
function transcriptScrollerGluedBeforeGrowth(scrollParent: HTMLElement | null | undefined): boolean {
  if (!scrollParent) return false;
  return transcriptScrollDistanceFromBottom(scrollParent) <= TRANSCRIPT_TAIL_STICK_EPS_PX;
}

/** RAF tail-follow coalesce: explicit `false` (reading away) dominates; otherwise OR sticky-before-growth. */
function mergeDeferTailSticky(prev: boolean | undefined, next: boolean | undefined): boolean | undefined {
  if (next === false || prev === false) return false;
  if (next === true || prev === true) return true;
  return undefined;
}

/**
 * Browser console-only hard verification: logs every programmatic `scrollTop` write stack, pinned ref transitions,
 * viewport geometry on streaming + scroll/wheel/mutations, disables automatic slack / proximity re-pin.
 *
 * ```
 * localStorage.setItem("interpreterai_transcript_scroll_verify", "1")
 * reload
 * ```
 */
function transcriptScrollVerifyEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_transcript_scroll_verify") === "1";
  } catch {
    return false;
  }
}

function transcriptScrollVerifyCaptureStack(skipLines = 2, maxLines = 22): string {
  try {
    const raw = new Error().stack ?? "";
    const lines = raw.split("\n");
    return lines.slice(skipLines, skipLines + maxLines).join("\n");
  } catch {
    return "";
  }
}

function transcriptScrollVerifyReadViewport(scrollEl: HTMLElement) {
  const st = scrollEl.scrollTop;
  const sh = scrollEl.scrollHeight;
  const ch = scrollEl.clientHeight;
  let overflowAnchor = "";
  try {
    overflowAnchor = (window.getComputedStyle(scrollEl).overflowAnchor as string | undefined) ?? "";
  } catch {
    overflowAnchor = "getComputedStyle_error";
  }
  return {
    scrollTop: st,
    scrollHeight: sh,
    clientHeight: ch,
    distanceFromBottom: sh - ch - st,
    overflowAnchor,
  };
}

/** Called when scroll verify is OFF too for zero overhead — guarded inside. */
function transcriptScrollVerifyLogViewport(
  scrollEl: HTMLElement | null | undefined,
  tag: string,
  extra?: { prevScrollTop?: number },
): void {
  if (!transcriptScrollVerifyEnabled() || !scrollEl) return;
  const v = transcriptScrollVerifyReadViewport(scrollEl);
  console.warn("[scroll_verify] viewport_snapshot", {
    iso: new Date().toISOString(),
    perfMs: performance.now(),
    tag,
    ...v,
    previousScrollTop: extra?.prevScrollTop,
    scrollAnchoringHypothesisNote:
      "If distanceFromBottom changes while NO [scroll_verify] scrollTop WRITE line appears → browser/layout (scroll anchoring, flex sizing, subtree height mutations) suspect.",
  });
}

function assignTranscriptScrollerScrollTop(el: HTMLElement, value: number, label: string): void {
  const prev = el.scrollTop;
  if (transcriptScrollVerifyEnabled()) {
    console.warn("[scroll_verify] scrollTop WRITE", {
      label,
      iso: new Date().toISOString(),
      perfMs: performance.now(),
      from: prev,
      to: value,
      delta: value - prev,
      stackNote:
        "Intended single choke-point for programmatic scrollTop — if viewport moves without this, suspect anchoring/layout.",
      stackFrames: transcriptScrollVerifyCaptureStack(2, 24),
    });
    transcriptScrollVerifyLogViewport(el, `${label}:before_write`, { prevScrollTop: prev });
  }
  el.scrollTop = value;
  if (transcriptScrollVerifyEnabled()) {
    transcriptScrollVerifyLogViewport(el, `${label}:after_write`, { prevScrollTop: prev });
  }
}

/** Opt-in scroll latch diagnostics. `localStorage.setItem("interpreterai_transcript_scroll_diag","1")` then reload — console only. Reproduce: speak continuously, wheel/drag upward while pinned; inspect `[transcript_scroll_diag] heartbeat` and run `window.transcriptScrollDiagDump()`. */
function transcriptScrollDiagEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_transcript_scroll_diag") === "1";
  } catch {
    return false;
  }
}

/** Ring buffer correlating scroll applies vs latch (recent history only). */
const TRANSCRIPT_SCROLL_DIAG_SCROLL_LOG_MAX = 48;

interface TranscriptScrollDiagSample {
  t: number;
  kind: string;
  d?: number;
  pinnedBefore?: boolean;
  pinnedAfter?: boolean;
  src?: string;
}

let transcriptScrollDiagScrollLog: TranscriptScrollDiagSample[] = [];

let transcriptScrollDiagAttachOk = false;

/** Counters incremented only when {@link transcriptScrollDiagEnabled}; safe to inspect in DevTools during a session. */
let transcriptScrollDiagCounts = {
  scrollEvents: 0,
  scrollPanelsTotal: 0,
  scrollPanelsApplied: 0,
  scrollPanelsSkippedPinnedFalse: 0,
  appliedByWs: 0,
  appliedByBubble: 0,
  appliedByTranslation: 0,
  appliedByForce: 0,
};

function transcriptScrollDiagReset(): void {
  transcriptScrollDiagScrollLog = [];
  // Keep transcriptScrollDiagAttachOk: scroll listener survives doClear/start DOM churn; resetting it would false-positive H3.
  transcriptScrollDiagCounts = {
    scrollEvents: 0,
    scrollPanelsTotal: 0,
    scrollPanelsApplied: 0,
    scrollPanelsSkippedPinnedFalse: 0,
    appliedByWs: 0,
    appliedByBubble: 0,
    appliedByTranslation: 0,
    appliedByForce: 0,
  };
}

function transcriptScrollDiagPush(sample: TranscriptScrollDiagSample): void {
  if (!transcriptScrollDiagEnabled()) return;
  transcriptScrollDiagScrollLog.push(sample);
  if (transcriptScrollDiagScrollLog.length > TRANSCRIPT_SCROLL_DIAG_SCROLL_LOG_MAX) {
    transcriptScrollDiagScrollLog.splice(0, transcriptScrollDiagScrollLog.length - TRANSCRIPT_SCROLL_DIAG_SCROLL_LOG_MAX);
  }
}

function transcriptScrollDiagApplyBurstHint(): Record<string, number | string> {
  const applies = transcriptScrollDiagScrollLog.filter(r => r.kind === "scroll_panel_apply");
  if (applies.length < 2) {
    return { note: "need 2+ scroll_panel_apply rows in tail (speak continuously + pinned scroll)" };
  }
  let minDt = Infinity;
  let sumDt = 0;
  let n = 0;
  for (let i = 1; i < applies.length; i++) {
    const dt = applies[i]!.t - applies[i - 1]!.t;
    if (dt >= 0) {
      sumDt += dt;
      n += 1;
      minDt = Math.min(minDt, dt);
    }
  }
  return {
    applySamples: applies.length,
    avgMsBetweenApplies: n > 0 ? Math.round(sumDt / n) : -1,
    minMsBetweenApplies: Number.isFinite(minDt) ? Math.round(minDt) : -1,
  };
}

function transcriptScrollDiagInstallGlobalDumpHook(): void {
  if (!transcriptScrollDiagEnabled()) return;
  if (typeof window === "undefined") return;
  const w = window as unknown as { transcriptScrollDiagDump?: () => void };
  w.transcriptScrollDiagDump = () => {
    console.info("[transcript_scroll_diag] dump", {
      attachOk: transcriptScrollDiagAttachOk,
      counters: transcriptScrollDiagCounts,
      applyBurstsApprox: transcriptScrollDiagApplyBurstHint(),
      fullTailLog: [...transcriptScrollDiagScrollLog],
    });
  };
}

/** Optional: throttle summary console noise (still records ring buffer always). */
let transcriptScrollDiagLastSummaryTs = 0;

function transcriptScrollDiagMaybePeriodicSummary(nowMs = performance.now()): void {
  if (!transcriptScrollDiagEnabled()) return;
  if (nowMs - transcriptScrollDiagLastSummaryTs < 4000) return;
  transcriptScrollDiagLastSummaryTs = nowMs;
  console.info("[transcript_scroll_diag] heartbeat", {
    attachOk: transcriptScrollDiagAttachOk,
    counters: transcriptScrollDiagCounts,
    latchHint_hypothesisCompare: {
      slackPx: TRANSCRIPT_SCROLL_BOTTOM_SLACK_PX,
      H1_follow_policy:
        transcriptScrollVerifyEnabled()
          ? `[verify logs on] sticky tail only if distance≤${TRANSCRIPT_TAIL_STICK_EPS_PX}px OR Jump (same as prod)`
          : `Sticky tail only if distance-from-bottom≤${TRANSCRIPT_TAIL_STICK_EPS_PX}px — ref latch removed; scroll up ⇒ no programmatic scroll.`,
      H2_burstVsManual:
        transcriptScrollDiagCounts.scrollPanelsApplied > 0 &&
        transcriptScrollDiagCounts.scrollPanelsApplied >= transcriptScrollDiagCounts.scrollEvents
          ? "High apply rate vs listener events — check tail timestamps for programmatic scroll beating user flick (should be mitigated once follow is off)."
          : "Not dominant this interval.",
      H3_noListenerNeverTrue: transcriptScrollDiagAttachOk
        ? "Scroll listener attached (wheel no longer gates — geometry-only sticky)."
        : "BUG: scroll listener never attached — Jump + sticky snap cannot align.",
    },
    ...transcriptScrollDiagApplyBurstHint(),
    recentTail: transcriptScrollDiagScrollLog.slice(-16),
    dumpCmd: "window.transcriptScrollDiagDump()",
  });
}

type TranscriptScrollPanelSource =
  | "ws"
  | "bubble"
  | "translation"
  | "force"
  | "queued_final_chars"
  | "flush_queue_empty_snap_if_sticky";

function transcriptScrollDiagCountApply(src: TranscriptScrollPanelSource): void {
  transcriptScrollDiagCounts.scrollPanelsApplied++;
  switch (src) {
    case "ws":
    case "queued_final_chars":
    case "flush_queue_empty_snap_if_sticky":
      transcriptScrollDiagCounts.appliedByWs++;
      break;
    case "bubble":
      transcriptScrollDiagCounts.appliedByBubble++;
      break;
    case "translation":
      transcriptScrollDiagCounts.appliedByTranslation++;
      break;
    case "force":
      transcriptScrollDiagCounts.appliedByForce++;
      break;
    default: {
      const _exhaustive: never = src;
      void _exhaustive;
    }
  }
}

const FAST_SWITCH_MIN_STREAK = 2;
const FAST_SWITCH_MIN_AGE_MS = 300;
const EST_TOKENS_PER_CHAR = 0.25;
/** Mirrors server: gpt-4o-mini list $/token × (verified Apr 3–18 dailies sum / $50). Env extra not applied in browser. */
const OPENAI_VERIFIED_TRANSLATION_COST_TABLE_RATIO = 51.54 / 50;
const OPENAI_INPUT_COST_PER_TOKEN = 0.00000015 * OPENAI_VERIFIED_TRANSLATION_COST_TABLE_RATIO;
const OPENAI_OUTPUT_COST_PER_TOKEN = 0.00000060 * OPENAI_VERIFIED_TRANSLATION_COST_TABLE_RATIO;
// Segments close on stabilized speaker_id change (see effectiveSpeakersForTokenBoundaries + ws.onmessage).
// ── Speaker color palette ──────────────────────────────────────────────────────
// Slot numbers start at 1. Index = slot - 1.
const MAX_SPEAKERS = 3;
const SPEAKER_COLORS = [
  // slot 1 — Blue
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  // slot 2 — Green
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100 mb-1",
  // slot 3 — Orange
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-100 mb-1",
] as const;

// ── DOM class names ────────────────────────────────────────────────────────────
const CLS = {
  row:         "group relative grid grid-cols-2 gap-6 mb-3 rounded-lg hover:bg-muted/20 px-2 py-1.5 -mx-2 transition-colors",
  colOrig:     "min-w-0",
  colTrans:    "min-w-0",
  textRow:     "flex items-start gap-1",
  // font-size is controlled via --ts-font-size CSS variable (set by workspace)
  textLive:    "ts-text leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0",
  textFin:     "ts-text leading-relaxed text-foreground font-medium flex-1 min-w-0",
  /** Non-final / live hypothesis tail — render with normal style (no grey preview). */
  nf:          "",
  transText:   "ts-text leading-relaxed text-foreground/80 font-medium flex-1 min-w-0",
  transPend:   "ts-text leading-relaxed text-foreground/80 font-medium flex-1 min-w-0",
  transDisabled: "ts-text text-muted-foreground/55 italic flex-1 min-w-0 text-[0.92em] leading-snug",
} as const;

const TRANSLATION_PLATINUM_PLACEHOLDER =
  "InterpreterAI Translation is available on the Platinum plan.";

// ── Soniox v4 types ────────────────────────────────────────────────────────────
interface SonioxToken {
  text:      string;
  is_final:  boolean;
  speaker?:  number | string;
  language?: string;
}

/** Soniox semantic endpoint token (requires `enable_endpoint_detection` in start config). */
function isSonioxEndpointToken(t: SonioxToken): boolean {
  return t.text.trim().toLowerCase() === "<end>";
}

interface SonioxMessage {
  tokens?:        SonioxToken[];
  finished?:      boolean;
  /** Legacy / alternate error shapes from Soniox */
  error?:         string;
  error_message?: string;
  error_code?:    number;
  code?:          number;
  message?:       string;
}

// ── Speaker normalization (temporal-LRU pool) ──────────────────────────────────
// Soniox v4 returns `speaker` as a string (e.g. "1"); older responses used numbers.
const _speakerMap  = new Map<string, number>();
const _slotLastMs  = new Map<number, number>();
let   _slotCount   = 0;

function resetSpeakerMap() { _speakerMap.clear(); _slotLastMs.clear(); _slotCount = 0; }

function speakerKey(rawId: number | string | undefined): string | undefined {
  if (rawId === undefined || rawId === null) return undefined;
  return String(rawId);
}

function normalizeSpeaker(rawId: number | string | undefined): { label: string; slot: number } {
  const key = speakerKey(rawId);
  if (key === undefined) return { label: "", slot: 0 };
  if (_speakerMap.has(key)) {
    const slot = _speakerMap.get(key)!;
    _slotLastMs.set(slot, Date.now());
    return { label: `Speaker ${slot}`, slot };
  }
  if (_slotCount < MAX_SPEAKERS) {
    _slotCount++;
    _speakerMap.set(key, _slotCount);
    _slotLastMs.set(_slotCount, Date.now());
    return { label: `Speaker ${_slotCount}`, slot: _slotCount };
  }
  let lruSlot = 1, lruMs = _slotLastMs.get(1) ?? 0;
  for (let s = 2; s <= _slotCount; s++) {
    const t = _slotLastMs.get(s) ?? 0;
    if (t < lruMs) { lruMs = t; lruSlot = s; }
  }
  _speakerMap.set(key, lruSlot);
  _slotLastMs.set(lruSlot, Date.now());
  return { label: `Speaker ${lruSlot}`, slot: lruSlot };
}

function sameSpeaker(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  return String(a) === String(b);
}

/** One contiguous span of forward-filled speaker id. */
type _SpeakerRun = { start: number; end: number; sp: string };

function _coalesceAdjacentSpeakerRuns(runs: _SpeakerRun[]): _SpeakerRun[] {
  const out: _SpeakerRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.sp === r.sp) last.end = r.end;
    else out.push({ start: r.start, end: r.end, sp: r.sp });
  }
  return out;
}

function _runsFromForwardSpeakers(forward: (string | undefined)[]): _SpeakerRun[] {
  const runs: _SpeakerRun[] = [];
  let i = 0;
  const n = forward.length;
  while (i < n) {
    while (i < n && forward[i] === undefined) i++;
    if (i >= n) break;
    const sp = forward[i]!;
    const start = i;
    while (i < n && forward[i] === sp) i++;
    runs.push({ start, end: i, sp });
  }
  return runs;
}

/**
 * Soniox diarization often assigns a different speaker_id for a handful of tokens during fast
 * code-switching or overlap noise. That used to open a new segment per flicker. Collapse *short*
 * runs sandwiched between the same speaker (A→B→A), tiny leading runs, and tiny trailing runs so
 * boundaries match stable speaker changes only — same rule as “real” speaker, fewer spurious rows.
 */
function effectiveSpeakersForTokenBoundaries(tokens: SonioxToken[]): (string | undefined)[] {
  const n = tokens.length;
  if (n === 0) return [];
  const forward: (string | undefined)[] = new Array(n).fill(undefined);
  let carry: string | undefined;
  for (let i = 0; i < n; i++) {
    const sp = tokens[i]!.speaker;
    if (sp !== undefined && sp !== null) carry = String(sp);
    forward[i] = carry;
  }
  let runs = _runsFromForwardSpeakers(forward);
  const runChars = (r: _SpeakerRun): number => {
    let c = 0;
    for (let i = r.start; i < r.end; i++) c += (tokens[i]!.text ?? "").length;
    return c;
  };
  const isEphemeralRun = (r: _SpeakerRun): boolean => {
    const tokLen = r.end - r.start;
    const chars = runChars(r);
    return tokLen < 3 && chars < 28;
  };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k]!;
      if (!isEphemeralRun(r)) continue;
      if (k > 0 && k < runs.length - 1) {
        const prev = runs[k - 1]!;
        const next = runs[k + 1]!;
        if (prev.sp === next.sp && r.sp !== prev.sp) {
          r.sp = prev.sp;
          changed = true;
        }
      } else if (k === 0 && runs.length > 1) {
        const next = runs[1]!;
        if (r.sp !== next.sp) {
          r.sp = next.sp;
          changed = true;
        }
      } else if (k === runs.length - 1 && k > 0) {
        const prev = runs[k - 1]!;
        if (r.sp !== prev.sp) {
          r.sp = prev.sp;
          changed = true;
        }
      }
    }
    runs = _coalesceAdjacentSpeakerRuns(runs);
    if (!changed) break;
  }
  const out: (string | undefined)[] = new Array(n).fill(undefined);
  for (const r of runs) {
    for (let i = r.start; i < r.end; i++) out[i] = r.sp;
  }
  return out;
}

// ── Language-pair helpers ──────────────────────────────────────────────────────
// Compare two BCP-47 codes loosely (e.g. "zh-CN" matches "zh").
function matchesLang(detected: string, selected: string): boolean {
  const d = detected.toLowerCase();
  const s = selected.toLowerCase();
  return d === s || d.split("-")[0] === s.split("-")[0];
}

// ── Multi-script Unicode validation ───────────────────────────────────────────
// Soniox occasionally misidentifies spoken language — especially for short or
// accented segments. We cross-validate its language tag against the dominant
// Unicode script of the actual transcribed text, then override only when the
// evidence is strong (≥ 60 % of meaningful script characters) and the correct
// language is present in the user's selected pair.
//
// Works for every language pair, not just Arabic ↔ English.
//
// Applied at TWO points in the pipeline:
//   1. When Soniox reports a language tag on any token  (detection-time fix)
//   2. Inside dispatchTranslation before the API call   (dispatch-time guard)

// Each entry groups one or more Unicode ranges under a canonical script name
// and lists the BCP-47 base codes that primarily use that script.
const UNICODE_SCRIPTS: {
  name:   string;
  ranges: [number, number][];
  langs:  string[];
}[] = [
  // Latin — basic block + full extended Latin block
  {
    name:   "Latin",
    ranges: [[0x0041, 0x007A], [0x00C0, 0x024F]],
    langs:  ["en","fr","de","es","pt","it","nl","pl","cs","ro","tr",
             "vi","id","ms","hu","sv","da","nb","fi","hr","sk","sl",
             "et","lv","lt","ga","cy","eu","ca","gl","af","sw","tl"],
  },
  // Arabic / Persian / Urdu — all use the Arabic script block
  {
    name:   "Arabic",
    ranges: [[0x0600, 0x06FF]],
    langs:  ["ar","fa","ur"],
  },
  // Hebrew
  {
    name:   "Hebrew",
    ranges: [[0x0590, 0x05FF]],
    langs:  ["he"],
  },
  // Greek
  {
    name:   "Greek",
    ranges: [[0x0370, 0x03FF]],
    langs:  ["el"],
  },
  // Cyrillic — Russian, Ukrainian, Bulgarian, Serbian, Macedonian
  {
    name:   "Cyrillic",
    ranges: [[0x0400, 0x04FF]],
    langs:  ["ru","uk","bg","sr","mk","be","kk","ky","mn"],
  },
  // Devanagari — Hindi, Marathi, Nepali
  {
    name:   "Devanagari",
    ranges: [[0x0900, 0x097F]],
    langs:  ["hi","mr","ne"],
  },
  // Thai
  {
    name:   "Thai",
    ranges: [[0x0E00, 0x0E7F]],
    langs:  ["th"],
  },
  // Georgian
  {
    name:   "Georgian",
    ranges: [[0x10A0, 0x10FF]],
    langs:  ["ka"],
  },
  // Armenian
  {
    name:   "Armenian",
    ranges: [[0x0530, 0x058F]],
    langs:  ["hy"],
  },
  // Hangul (Korean syllables + jamo)
  {
    name:   "Hangul",
    ranges: [[0x1100, 0x11FF], [0xAC00, 0xD7AF]],
    langs:  ["ko"],
  },
  // CJK Unified Ideographs — shared by Chinese and Japanese
  {
    name:   "CJK",
    ranges: [[0x4E00, 0x9FFF], [0x3400, 0x4DBF], [0xF900, 0xFAFF]],
    langs:  ["zh","ja"],
  },
  // Hiragana — uniquely Japanese
  {
    name:   "Hiragana",
    ranges: [[0x3040, 0x309F]],
    langs:  ["ja"],
  },
  // Katakana — uniquely Japanese
  {
    name:   "Katakana",
    ranges: [[0x30A0, 0x30FF]],
    langs:  ["ja"],
  },
  // Gujarati
  {
    name:   "Gujarati",
    ranges: [[0x0A80, 0x0AFF]],
    langs:  ["gu"],
  },
  // Bengali
  {
    name:   "Bengali",
    ranges: [[0x0980, 0x09FF]],
    langs:  ["bn"],
  },
  // Tamil
  {
    name:   "Tamil",
    ranges: [[0x0B80, 0x0BFF]],
    langs:  ["ta"],
  },
  // Telugu
  {
    name:   "Telugu",
    ranges: [[0x0C00, 0x0C7F]],
    langs:  ["te"],
  },
  // Kannada
  {
    name:   "Kannada",
    ranges: [[0x0C80, 0x0CFF]],
    langs:  ["kn"],
  },
  // Malayalam
  {
    name:   "Malayalam",
    ranges: [[0x0D00, 0x0D7F]],
    langs:  ["ml"],
  },
];

function scriptEntryLangs(scriptName: string): string[] {
  return UNICODE_SCRIPTS.find((s) => s.name === scriptName)?.langs ?? [];
}

/** BCP-47 bases using Latin script — shared polish with English/Portuguese/Spanish (any en↔X pair). */
const LATIN_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Latin"));
/** ar, fa, ur */
const ARABIC_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Arabic"));
const CYRILLIC_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Cyrillic"));
const HEBREW_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Hebrew"));
const GREEK_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Greek"));
const HANGUL_TARGET_LANG_BASES = new Set(scriptEntryLangs("Hangul"));
/** zh + ja (ideographic/kana output). */
const CJK_TARGET_LANG_BASES = new Set<string>([
  ...scriptEntryLangs("CJK"),
  ...scriptEntryLangs("Hiragana"),
  ...scriptEntryLangs("Katakana"),
]);

/**
 * THE FINAL BOSS — the one canonical InterpreterAI release (no other “final boss”; earlier baseline is `legacy-final-boss`).
 * Rollback: `git checkout final-boss`. Older pipeline snapshot: `git checkout legacy-final-boss` (superseded; had transcript phrase rewrites).
 * Original column: exact ASR mirror — no client-side rephrasing or “similar meaning” fixes.
 * Translation: live debounce + per-bubble abort; speaker-change full final;
 * finals: adjacent *paraphrase* merge only (verbatim repeats preserved) + script-family polish (all targets).
 * Segments: stabilized Soniox speaker ids (fewer spurious rows on fast bilingual turns).
 * Direction: snapSourceLanguageToPair + targetOppositeInPair (target is always the other selected language).
 */

// Returns true when `lang` (BCP-47, e.g. "zh-CN") is listed in `langs`.
// Matching is base-code prefix: "zh-CN" matches "zh".
function scriptSupportsLang(langs: string[], lang: string): boolean {
  const base = lang.split("-")[0]!.toLowerCase();
  return langs.some(l => l === base || base.startsWith(l) || l.startsWith(base));
}

// Detects the dominant Unicode script in `text`.
// Returns { name, langs } for the script if it is dominant (≥ 60 % of all
// meaningful script characters), or null if the text is too short / too mixed
// to draw a confident conclusion.
function detectDominantScript(
  text: string,
): { name: string; langs: string[] } | null {
  // Strip whitespace, digits, and common punctuation — count only script chars.
  const stripped = text.replace(/[\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\u200B-\u200F\u2000-\u206F]/g, "");
  if (stripped.length < 4) return null;

  // Accumulate character counts per script (by name, merging multi-range scripts).
  const counts = new Map<string, { count: number; langs: string[] }>();
  for (let i = 0; i < stripped.length; ) {
    const cp = stripped.codePointAt(i)!;
    // Advance past surrogate pairs for supplementary chars.
    i += cp > 0xFFFF ? 2 : 1;

    for (const script of UNICODE_SCRIPTS) {
      let matched = false;
      for (const [lo, hi] of script.ranges) {
        if (cp >= lo && cp <= hi) { matched = true; break; }
      }
      if (matched) {
        const cur = counts.get(script.name);
        if (cur) {
          cur.count += 1;
        } else {
          counts.set(script.name, { count: 1, langs: script.langs });
        }
        break; // each code point belongs to at most one script
      }
    }
  }

  if (counts.size === 0) return null;

  // Find the script with the highest count and compute total.
  let dominant: { name: string; count: number; langs: string[] } | null = null;
  let total = 0;
  for (const [name, { count, langs }] of counts) {
    total += count;
    if (!dominant || count > dominant.count) {
      dominant = { name, count, langs };
    }
  }

  // Require ≥ 60 % dominance — below that the text is too mixed to be certain.
  if (!dominant || dominant.count / total < 0.60) return null;

  return { name: dominant.name, langs: dominant.langs };
}

// Cross-validates Soniox's language tag against the dominant Unicode script of
// the token text.  Only overrides when:
//   1. The dominant script is detected with ≥ 60 % confidence.
//   2. Soniox's tag does NOT use that script.
//   3. Exactly one side of the user's selected pair uses that script.
// Returns the corrected BCP-47 code, or sonioxLang unchanged if no override.
function validateLangByScript(
  sonioxLang: string,
  tokenText:  string,
  pair:       { a: string; b: string },
): string {
  const dominant = detectDominantScript(tokenText);
  if (!dominant) return sonioxLang; // too short / too mixed — trust Soniox

  // If Soniox already agrees with the dominant script, nothing to fix.
  if (scriptSupportsLang(dominant.langs, sonioxLang)) return sonioxLang;

  // Soniox disagrees with the dominant script.
  // Find which side of the pair uses the detected script.
  const aFits = scriptSupportsLang(dominant.langs, pair.a);
  const bFits = scriptSupportsLang(dominant.langs, pair.b);

  // Override only when exactly one side of the pair matches — unambiguous.
  if (aFits && !bFits) return pair.a;
  if (bFits && !aFits) return pair.b;

  // Both or neither pair language uses this script — cannot safely override.
  return sonioxLang;
}

/** If `code` matches exactly one side of the pair, return that member's tag; otherwise null. */
function uniquePairMemberForLang(code: string, pair: { a: string; b: string }): string | null {
  const ma = matchesLang(code, pair.a);
  const mb = matchesLang(code, pair.b);
  if (ma && !mb) return pair.a;
  if (mb && !ma) return pair.b;
  return null;
}

/**
 * Map any detected/locked tag onto exactly one of the user's two languages so src/tgt are never wrong-way.
 * Fixes Latin/Latin pairs (e.g. en↔es) when Soniox tags the wrong language but later tokens are correct.
 */
function snapSourceLanguageToPair(
  candidate: string,
  sonioxHint: string,
  text: string,
  pair: { a: string; b: string },
): string {
  // Prefer live Soniox (validated) over segment lock so a wrong first-token lock does not force tgt = same language.
  const vSon = validateLangByScript(sonioxHint, text, pair);
  const uSon = uniquePairMemberForLang(vSon, pair);
  if (uSon !== null) return uSon;
  const vCand = validateLangByScript(candidate, text, pair);
  const uCand = uniquePairMemberForLang(vCand, pair);
  if (uCand !== null) return uCand;
  const uRaw = uniquePairMemberForLang(sonioxHint, pair);
  if (uRaw !== null) return uRaw;
  const ba = pair.a.split("-")[0]!.toLowerCase();
  const bb = pair.b.split("-")[0]!.toLowerCase();
  const bs = sonioxHint.split("-")[0]!.toLowerCase();
  if (bs === ba && bs !== bb) return pair.a;
  if (bs === bb && bs !== ba) return pair.b;
  return pair.a;
}

/** Always the other pair member — translation column must never stay in the spoken language. */
function targetOppositeInPair(sourceMember: string, pair: { a: string; b: string }): string {
  if (matchesLang(sourceMember, pair.a) && !matchesLang(sourceMember, pair.b)) return pair.b;
  if (matchesLang(sourceMember, pair.b) && !matchesLang(sourceMember, pair.a)) return pair.a;
  return matchesLang(sourceMember, pair.a) ? pair.b : pair.a;
}

/**
 * First-words majority hint:
 * inspect the first 3 words and use a 2-of-3 majority to choose source language.
 * Returns null when no clear majority is available.
 */
function majoritySourceFromFirstWords(
  text: string,
  sonioxHint: string,
  pair: { a: string; b: string },
): string | null {
  const words = text
    .trim()
    .split(/\s+/)
    .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean)
    .slice(0, 3);
  if (words.length < 3) return null;

  let aVotes = 0;
  let bVotes = 0;
  for (const w of words) {
    const vw = validateLangByScript(sonioxHint, w, pair);
    const u = uniquePairMemberForLang(vw, pair) ?? uniquePairMemberForLang(sonioxHint, pair);
    if (!u) continue;
    if (matchesLang(u, pair.a) && !matchesLang(u, pair.b)) aVotes += 1;
    else if (matchesLang(u, pair.b) && !matchesLang(u, pair.a)) bVotes += 1;
  }
  if (aVotes >= 2 && aVotes > bVotes) return pair.a;
  if (bVotes >= 2 && bVotes > aVotes) return pair.b;
  return null;
}

// ── Translation fetch ──────────────────────────────────────────────────────────
// sourceLang: BCP-47 code auto-detected by Soniox (e.g. "en", "ar", "fr").
// targetLang: BCP-47 code resolved from the language pair (always the opposite).
//
// Primary: POST /api/transcription/translate (OpenAI or LibreTranslate on API server per plan).
// On primary API failure we now skip that update (no public fallback) to avoid
// mixed-language corruption during live interpreter use.
//
// Retry policy (primary only):
//   • Network errors / timeouts  → retry up to MAX_ATTEMPTS with back-off
//   • HTTP 5xx / 429             → retry up to MAX_ATTEMPTS with back-off
//   • HTTP 401 / 403             → try public fallback before surfacing error (except daily limit → hard stop)
//   • Other 4xx                  → no retry (bad request)
//   • Fatal 503 codes            → try public fallback before surfacing error
type TranslationEngineHint = "libre" | "openai" | "passthrough";

type PrimaryTranslationResult =
  | { outcome: "ok"; text: string; appliedGlossaryTerms?: string[]; translationEngine?: TranslationEngineHint }
  | { outcome: "daily_limit"; message: string }
  | { outcome: "try_fallback"; userMessage?: string };

type TranslateApiOptions = {
  streamingDelta?: boolean;
  /** Server adds final-segment correction instructions (full utterance after finalize). */
  isFinal?: boolean;
  /** Abort stops this request (superseded live translate or segment teardown). */
  signal?: AbortSignal;
  /** Open recording session id — required server-side for Hetzner routing (must match admin manual core pin). */
  sessionId?: number;
  /** Client correlation for duplicate-account / segment-boundary diagnostics (OpenAI-path guards); server ignores if unused. */
  segmentId?: string;
  clientSeq?: number;
  /** Correlate direction traces across dispatch → fetch → paint */
  directionTraceId?: string;
  /**
   * When API has BASIC_MORSY_OPENAI_EXPERIMENT=1, forces OpenAI /translate path (skips Libre/Hetzner).
   * Sent only when the workspace loads Morsy Urgent (`planType` morsy-urgent) and the Intercall lab toggle is on.
   */
  experimentalBasicMorsyOpenAiOnly?: boolean;
  /**
   * Basic · Morsy Urgent + Intercall lab: asks API to inject LIVE-only embedded-English tightening (prompt-only).
   * Ignored unless effective plan is morsy-urgent (server validates).
   */
  experimentalMorsyIntercallEmbeddedEnglishPrompt?: boolean;
};

async function translateViaPrimaryApi(
  text: string,
  sourceLang: string,
  targetLang: string,
  options?: TranslateApiOptions,
): Promise<PrimaryTranslationResult> {
  const isFinal = Boolean(options?.isFinal);
  // Live: one retry on transient errors; timeouts scale with length so long turns are not cut off mid-stream.
  const MAX_ATTEMPTS = isFinal ? 2 : 2;
  // Long cumulative live strings — allow full 30s per attempt (product: coverage over cost).
  const REQUEST_TIMEOUT_MS = 30_000;
  const fatal503Codes = new Set([
    "TRANSLATION_NOT_CONFIGURED",
    "LIBRETRANSLATE_FAILED",
    "OPENAI_AUTH_FAILED",
    "OPENAI_RATE_LIMITED",
    "OPENAI_BILLING",
    "OPENAI_WRONG_LANGUAGE",
  ]);

  const externalSignal = options?.signal;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (externalSignal?.aborted) {
      liveBlankTracePrimaryApiEvent({
        exit: "abort_before_attempt",
        attempt,
        aborted: true,
      });
      return { outcome: "ok", text: "" };
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    if (externalSignal) {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const terminologyMode = readTerminologyMode() === "hybrid" ? "hybrid" : "full";
      const bodyObj = {
        text,
        srcLang:              sourceLang,
        tgtLang:              targetLang,
        streamingDelta:       Boolean(options?.streamingDelta),
        isFinal:              Boolean(options?.isFinal),
        glossaryStrictMode:   readGlossaryStrictEnabled(),
        terminologyMode,
        ...(options?.sessionId != null && options.sessionId > 0 ? { sessionId: options.sessionId } : {}),
        ...(options?.segmentId ? { segmentId: options.segmentId } : {}),
        ...(options?.clientSeq != null ? { clientSeq: options.clientSeq } : {}),
        ...(options?.experimentalBasicMorsyOpenAiOnly === true
          ? { experimentalBasicMorsyOpenAiOnly: true as const }
          : {}),
        ...(options?.experimentalMorsyIntercallEmbeddedEnglishPrompt === true
          ? { experimentalMorsyIntercallEmbeddedEnglishPrompt: true as const }
          : {}),
      };
      const bodyJson = JSON.stringify(bodyObj);
      const dirTraceId = options?.directionTraceId;
      if (dirTraceId) {
        liveDirectionTraceApiRequest({
          correlationId:     dirTraceId,
          srcLang:           sourceLang,
          tgtLang:           targetLang,
          streamingDelta:    Boolean(options?.streamingDelta),
          isFinal:           Boolean(options?.isFinal),
          apiPayloadCharLen: bodyJson.length,
          srcTgtMismatch:    matchesLang(sourceLang, targetLang),
          bodySnippet:       liveDirectionTraceSnippet(text),
        });
      }
      const r = await fetch("/api/transcription/translate", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        signal:      controller.signal,
        body:        bodyJson,
      });
      clearTimeout(timeoutId);
      if (r.ok) {
        const d = await r.json() as {
          translated?: string;
          appliedGlossaryTerms?: string[];
          translationEngine?: TranslationEngineHint;
        };
        const rf = d.translated;
        let exit: PrimaryApiTraceExit = "http_ok_non_empty";
        let rawTranslatedLen: number | undefined;
        let trimmedLen = 0;
        if (rf === undefined) {
          exit = "http_ok_translated_missing";
        } else if (rf === null) {
          exit = "http_ok_translated_nullish_empty";
          rawTranslatedLen = 0;
        } else {
          const rs = String(rf);
          rawTranslatedLen = rs.length;
          trimmedLen = rs.trim().length;
          if (trimmedLen === 0) {
            exit = rs.length === 0 ? "http_ok_translated_nullish_empty" : "http_ok_translated_whitespace_only";
          }
        }
        liveBlankTracePrimaryApiEvent({
          exit,
          attempt,
          httpStatus: r.status,
          rawTranslatedLen,
          trimmedLen,
        });
        return {
          outcome: "ok",
          text: d.translated?.trim() ?? "",
          appliedGlossaryTerms: Array.isArray(d.appliedGlossaryTerms) ? d.appliedGlossaryTerms : undefined,
          translationEngine: d.translationEngine,
        };
      }

      if (r.status === 503) {
        const raw = await r.text();
        let j: { code?: string; error?: string } | null = null;
        try {
          j = JSON.parse(raw) as { code?: string; error?: string };
        } catch {
          /* ignore */
        }
        if (j?.code && fatal503Codes.has(j.code)) {
          liveBlankTracePrimaryApiEvent({
            exit: "http_503_fatal_try_fallback",
            attempt,
            httpStatus: 503,
          });
          return {
            outcome:     "try_fallback",
            userMessage: j.error ??
              (j.code === "TRANSLATION_NOT_CONFIGURED"
                ? "Translation is unavailable: configure OpenAI on the API server."
                : "Translation is temporarily unavailable."),
          };
        }
        // Never treat 503 as success with empty text.
        if (attempt === MAX_ATTEMPTS) {
          liveBlankTracePrimaryApiEvent({
            exit: "http_503_try_fallback_last_attempt",
            attempt,
            httpStatus: 503,
          });
          return {
            outcome:     "try_fallback",
            userMessage:
              j?.error ??
              "Translation is temporarily unavailable. Basic/Professional use LibreTranslate — check network or LIBRETRANSLATE_URL on the API server.",
          };
        }
        await new Promise<void>(res => setTimeout(res, 700 * attempt));
        continue;
      }

      if (r.status === 403) {
        const raw403 = await r.text();
        try {
          const j403 = JSON.parse(raw403) as { code?: string; error?: string };
          if (j403.code === "DAILY_LIMIT_REACHED") {
            const m = typeof j403.error === "string" && j403.error.trim() ? j403.error.trim() : DAILY_LIMIT_STOP_MESSAGE;
            liveBlankTracePrimaryApiEvent({
              exit: "http_403_daily_limit",
              attempt,
              httpStatus: 403,
            });
            return { outcome: "daily_limit", message: m };
          }
          if (j403.code === "TRANSLATION_PLAN_REQUIRED") {
            liveBlankTracePrimaryApiEvent({
              exit: "http_403_translation_plan_ok_empty",
              attempt,
              httpStatus: 403,
            });
            return { outcome: "ok", text: "" };
          }
        } catch {
          /* fall through */
        }
        liveBlankTracePrimaryApiEvent({
          exit: "http_403_try_fallback",
          attempt,
          httpStatus: 403,
        });
        return {
          outcome:     "try_fallback",
          userMessage: "Session expired or access denied — refresh the page and sign in again.",
        };
      }

      if (r.status === 401) {
        liveBlankTracePrimaryApiEvent({
          exit: "http_401_try_fallback",
          attempt,
          httpStatus: 401,
        });
        return {
          outcome:     "try_fallback",
          userMessage: "Session expired or access denied — refresh the page and sign in again.",
        };
      }

      if (r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 503) {
        liveBlankTracePrimaryApiEvent({
          exit: "http_4xx_silent_empty",
          attempt,
          httpStatus: r.status,
        });
        return { outcome: "ok", text: "" };
      }

      if (attempt === MAX_ATTEMPTS) {
        liveBlankTracePrimaryApiEvent({
          exit: "http_5xx_try_fallback_last_attempt",
          attempt,
          httpStatus: r.status,
        });
        return {
          outcome:     "try_fallback",
          userMessage:
            "Translation service returned an error — try again. If it persists, check API logs and OpenAI key/billing.",
        };
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const fetchErrorName =
        e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name ?? "unknown") : "unknown";
      if (externalSignal?.aborted) {
        liveBlankTracePrimaryApiEvent({
          exit: "catch_abort_ok_empty",
          attempt,
          aborted: true,
          fetchErrorName,
        });
        return { outcome: "ok", text: "" };
      }
      if (attempt === MAX_ATTEMPTS) {
        liveBlankTracePrimaryApiEvent({
          exit: "catch_try_fallback_network",
          attempt,
          fetchErrorName,
        });
        return {
          outcome:     "try_fallback",
          userMessage:
            "Cannot reach the translation service (timeout or network error). If transcription still works, the API may be paused or OpenAI may be misconfigured on the server.",
        };
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      if (externalSignal?.aborted) {
        liveBlankTracePrimaryApiEvent({
          exit: "abort_before_retry_sleep",
          attempt,
          aborted: true,
        });
        return { outcome: "ok", text: "" };
      }
      await new Promise<void>(res => setTimeout(res, 700 * attempt));
    }
  }
  liveBlankTracePrimaryApiEvent({
    exit: "exhausted_try_fallback",
    attempt: MAX_ATTEMPTS,
  });
  return {
    outcome:     "try_fallback",
    userMessage: "Translation service unavailable.",
  };
}

type FetchTranslationOptions = TranslateApiOptions & {
  /** Full segment source when `text` is a delta — used if public fallback runs (needs whole sentence). */
  fullSegmentForFallback?: string;
  /** Fired when the server applied strict glossary replacements (non-empty list). */
  onGlossaryApplied?: (terms: string[]) => void;
};

type FetchTranslationResult = {
  text: string;
  /** Public fallback translated the full segment while we were in delta mode — replace the cell, do not append. */
  replaceStreamColumn: boolean;
  dailyLimitReached?: boolean;
  dailyLimitMessage?: string;
  /** From API: Libre MT output must not go through aggressive client polish (drops clauses). */
  translationEngine?: TranslationEngineHint;
};

function traceDispatchGuard(
  traceId: string,
  phase: "before_fetch_loop" | "after_fetch_before_paint",
  code: string,
  snapshot: {
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
  },
): void {
  if (!liveBlankTraceEnabled() || !traceId) return;
  liveBlankTraceGuard({
    traceId,
    phase,
    code,
    ...snapshot,
  });
}

async function fetchTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  onTranslationIssue?: (message: string) => void,
  options?: FetchTranslationOptions,
): Promise<FetchTranslationResult> {
  const dirTraceId = options?.directionTraceId;
  const primary = await translateViaPrimaryApi(text, sourceLang, targetLang, options);
  if (liveDirectionTraceEnabled() && dirTraceId) {
    const compareSource = options?.fullSegmentForFallback ?? text;
    const fullLen = options?.fullSegmentForFallback?.length ?? text.length;
    const pt = primary.outcome === "ok" ? primary.text : "";
    const trimmed = pt.trim();
    const looksEcho = primary.outcome === "ok" && looksLikeUntranslatedCopy(compareSource, pt);
    const srcTgtEqualBug = matchesLang(sourceLang, targetLang);
    const sameLanguageSuspect = looksEcho || (trimmed.length > 0 && srcTgtEqualBug);
    const srcSnip = liveDirectionTraceSnippet(compareSource);
    const trSnip = liveDirectionTraceSnippet(pt);
    liveDirectionTraceFetchResult({
      correlationId:             dirTraceId,
      requestIsFinal:            Boolean(options?.isFinal),
      useStreamingDelta:         Boolean(options?.streamingDelta),
      apiTextLen:                text.length,
      fullTextLen:               fullLen,
      translatedTrimLen:         trimmed.length,
      looksLikeUntranslatedEcho: looksEcho,
      srcTgtEqualBug,
      sameLanguageSuspect,
      ...(srcSnip !== undefined ? { sourceSnippet: srcSnip } : {}),
      ...(trSnip !== undefined ? { translatedSnippet: trSnip } : {}),
    });
  }
  if (liveBlankTraceEnabled()) {
    let outcome: "ok_text" | "ok_empty" | "daily_limit" | "try_fallback_empty";
    if (primary.outcome === "ok") {
      outcome = primary.text.trim().length > 0 ? "ok_text" : "ok_empty";
    } else if (primary.outcome === "daily_limit") {
      outcome = "daily_limit";
    } else {
      outcome = "try_fallback_empty";
    }
    liveBlankTraceFetchPack({
      outcome,
      trimmedResponseLen: primary.outcome === "ok" ? primary.text.trim().length : 0,
      dailyLimit: primary.outcome === "daily_limit",
    });
  }
  if (primary.outcome === "ok") {
    const applied = primary.appliedGlossaryTerms ?? [];
    if (applied.length) options?.onGlossaryApplied?.(applied);
    return {
      text: primary.text,
      replaceStreamColumn: false,
      translationEngine: primary.translationEngine,
    };
  }
  if (primary.outcome === "daily_limit") {
    return {
      text:                "",
      replaceStreamColumn: false,
      dailyLimitReached:   true,
      dailyLimitMessage:   primary.message,
    };
  }

  // Public fallback can introduce mixed-language or delayed rewrites.
  // Keep interpreter output stable: if primary fails, skip this update.
  if (primary.userMessage) onTranslationIssue?.(primary.userMessage);
  return { text: "", replaceStreamColumn: false };
}

// ── Admin click-to-copy ────────────────────────────────────────────────────────
// For admin users only: clicking any transcription/translation text paragraph
// copies its content to the clipboard and flashes a brief green highlight.
function wireClickToCopy(el: HTMLElement): void {
  el.style.cursor = "pointer";
  el.title        = "Click to copy";
  el.addEventListener("click", () => {
    const text = el.textContent?.trim() ?? "";
    if (!text || text === "…") return;
    void navigator.clipboard.writeText(text).then(() => {
      const prev = el.style.backgroundColor;
      el.style.transition      = "background-color 0.15s";
      el.style.backgroundColor = "rgba(34,197,94,0.15)";
      setTimeout(() => { el.style.backgroundColor = prev; }, 700);
    });
  });
}

// ── Copy button (all users) ────────────────────────────────────────────────────
// Renders a small clipboard icon that appears on row hover. Clicking it copies
// the text returned by getTextFn() and briefly shows a checkmark confirmation.
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function makeCopyBtn(getTextFn: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.title     = "Copy";
  btn.className = "opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start mt-0.5 p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 focus:outline-none";
  btn.innerHTML = COPY_ICON;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = getTextFn().trim();
    if (!text || text === "…") return;
    void navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.classList.add("text-green-500");
      setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove("text-green-500");
      }, 1200);
    });
  });
  return btn;
}

// Apply inline font-size/line-height that inherit the CSS variables set by workspace.
function applyTextStyle(el: HTMLElement) {
  el.style.fontSize   = "var(--ts-font-size, 14px)";
  el.style.lineHeight = "var(--ts-line-height, 1.625)";
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Cumulative LIVE-buffer evidence gates for {@link tryLockSegmentDirectionFromTokens} (same spirit as majoritySourceFromFirstWords). */
const DIRECTION_LOCK_MIN_WORDS = 3;
const DIRECTION_LOCK_MIN_CHARS = 10;

/** True when the translation cell already shows text we should treat as a real translation (not blank / placeholder-only). */
function translationCellLooksFilled(el: HTMLParagraphElement): boolean {
  const t = (el.textContent ?? "").trim();
  if (!t) return false;
  if (t === "…") return false;
  return true;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithPhraseBoundary(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return /[.!?؟،。！？:;]\s*$/u.test(t);
}

/** Whitespace normalize only — do NOT drop consecutive identical tokens (faithful interpreting when the speaker repeats words). */
function dedupeConsecutiveTranslationTokens(raw: string): string {
  return collapseWs(raw);
}

function tokenOverlapRatio(a: string, b: string): number {
  const ta = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return 0;
  const setA = new Set(ta);
  let hit = 0;
  for (const w of tb) if (setA.has(w)) hit++;
  return hit / Math.max(ta.length, tb.length);
}

function looksLikeUntranslatedCopy(source: string, candidate: string): boolean {
  const s = collapseWs(source);
  const c = collapseWs(candidate);
  if (!s || !c) return false;
  if (s.length < 12 || c.length < 12) return false;
  if (s === c) return true;
  if (s.includes(c) || c.includes(s)) return true;
  const r = Math.max(tokenOverlapRatio(s, c), tokenOverlapRatio(c, s));
  return r >= 0.88;
}

function buildDirectionHypothesisTags(p: {
  hardGuardTriggered: boolean;
  snappedPersistApplied: boolean;
  persistGatePassed: boolean;
  majorityHint: string | null;
  segmentSourceLangBeforePersist: string | null;
  langParam: string;
  dispatchLang: string;
  fetchAborted: boolean;
}): ("flip" | "late_lock" | "early_lock" | "stale_lock" | "noisy_mixed" | "race")[] {
  const t: ("flip" | "late_lock" | "early_lock" | "stale_lock" | "noisy_mixed" | "race")[] = [];
  if (p.hardGuardTriggered) t.push("flip");
  if (!p.snappedPersistApplied && !p.persistGatePassed && p.majorityHint === null) t.push("late_lock");
  if (p.snappedPersistApplied) t.push("early_lock");
  if (
    p.segmentSourceLangBeforePersist &&
    !matchesLang(p.segmentSourceLangBeforePersist, p.langParam)
  ) {
    t.push("stale_lock");
  }
  if (p.majorityHint && !matchesLang(p.majorityHint, p.dispatchLang)) t.push("noisy_mixed");
  if (p.fetchAborted) t.push("race");
  return t;
}

/** Emit once per LIVE dispatch when API text still looks like source (direction or MT echo). */
function emitLiveDirectionSameLanguageFailure(args: {
  correlationId: string;
  segmentId: string;
  isFinalDispatch: boolean;
  sourceFullText: string;
  translatedAfterRetries: string;
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
  hypothesisTags: ("flip" | "late_lock" | "early_lock" | "stale_lock" | "noisy_mixed" | "race")[];
}): void {
  if (!liveDirectionTraceEnabled() || !args.correlationId) return;
  if (args.isFinalDispatch) return;
  const tr = args.translatedAfterRetries.trim();
  if (!tr || !looksLikeUntranslatedCopy(args.sourceFullText, tr)) return;
  liveDirectionTraceSameLanguageFailure({
    correlationId: args.correlationId,
    segmentId: args.segmentId,
    sourceText: args.sourceFullText,
    translatedText: tr,
    srcLangSent: args.srcLangSent,
    tgtLangSent: args.tgtLangSent,
    detectedLangRef: args.detectedLangRef,
    segmentSourceLang: args.segmentSourceLang,
    dispatchLang: args.dispatchLang,
    chosenSource: args.chosenSource,
    majorityHint: args.majorityHint,
    useStreamingDelta: args.useStreamingDelta,
    requestIsFinal: args.requestIsFinal,
    paintOutcome: args.paintOutcome,
    hypothesisTags: args.hypothesisTags,
  });
}

/** Split on closing sentence punctuation (Latin, Arabic, CJK full-width) for paraphrase dedupe. */
const INTERPRETER_SENTENCE_SPLIT_RE = /(?<=[.!?؟。！？])\s+/u;

/**
 * Final translation only (via {@link maybePolishTranslationForTarget}): drop adjacent sentences that
 * paraphrase the same clause (common after rapid NF revisions). Not applied on live streaming merges.
 */
function dedupeAdjacentParaphraseSentences(raw: string): string {
  let t = collapseWs(raw);
  for (let pass = 0; pass < 4; pass++) {
    const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
    if (sents.length < 2) return t;
    const out: string[] = [sents[0]!];
    for (let i = 1; i < sents.length; i++) {
      const cur = sents[i]!;
      const prev = out[out.length - 1]!;
      if (prev.length < 18 || cur.length < 18) {
        out.push(cur);
        continue;
      }
      const r = Math.max(tokenOverlapRatio(prev, cur), tokenOverlapRatio(cur, prev));
      if (r >= 0.52) {
        // Identical / verbatim repeated sentence — keep both (speaker emphasis, stuttering, or deliberate repeat).
        if (collapseWs(prev) === collapseWs(cur)) {
          out.push(cur);
          continue;
        }
        if (cur.length >= prev.length) {
          out[out.length - 1] = cur;
        }
        continue;
      }
      out.push(cur);
    }
    const joined = collapseWs(out.join(" "));
    if (joined === t) break;
    t = joined;
  }
  return t;
}

/**
 * Dedupe consecutive identical tokens, trim junk leading punctuation, collapse
 * doubled marks, fix split "? … لليوم؟" from incremental errors.
 */
function polishArabicInterpreterTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/^[.؟!،。'"“”\s\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.؟!?])\1+/g, "$1");
  t = t.replace(/([^؟?\n]+)[؟?]\s*لليوم[؟?]\s*$/u, "$1 اليوم؟");
  // Live + final often append two paraphrases of the same closing (e.g. "…وأشعر…" + "كانت هذه واحدة أخرى…").
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    // High threshold only: low values dropped whole closing sentences on valid multi-sentence medical turns.
    if (
      last.length >= 12 &&
      prev.length >= 12 &&
      tokenOverlapRatio(prev, last) >= 0.82 &&
      collapseWs(prev) !== collapseWs(last)
    ) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/** Hebrew translation column: same token hygiene + ?-tail dedupe as Latin/Cyrillic. */
function polishHebrewInterpreterTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/^[.?!،。'"“”\s\u0590-\u05FF\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.?!?])\1+/g, "$1");
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (
      last.length >= 14 &&
      prev.length >= 14 &&
      tokenOverlapRatio(prev, last) >= 0.82 &&
      collapseWs(prev) !== collapseWs(last)
    ) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/**
 * Latin-script targets (en, fr, de, es, pt, it, nl, …): English-only phrase cleanup +
 * duplicate question/sentence tails (same family of fixes as en↔ar live output).
 */
function polishLatinScriptInterpreterTranslation(raw: string, targetBase: string): string {
  let t = collapseWs(raw);
  if (targetBase === "en") {
    t = t.replace(/\?\s*Complete confidentiality, right\?$/i, "?");
    t = t.replace(/,\s*okay\?\s+Complete confidentiality, right\?$/i, ", okay?");
    t = t.replace(/\bokay\?\s+Complete confidentiality, right\?$/i, "okay?");
  }
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14) {
      const r = tokenOverlapRatio(prev, last);
      if (r >= 0.82 && collapseWs(prev) !== collapseWs(last)) {
        return collapseWs(sents.slice(0, -1).join(" "));
      }
    }
  }
  return collapseWs(t);
}

/** Cyrillic, Greek, and similar: ?/. ! tail echoes without English-specific regexes. */
function polishQuestionMarkFamilyTargetTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (
      last.length >= 14 &&
      prev.length >= 14 &&
      tokenOverlapRatio(prev, last) >= 0.82 &&
      collapseWs(prev) !== collapseWs(last)
    ) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

function polishCjkTargetTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/([。！？?!])\1+/gu, "$1");
  return collapseWs(t);
}

/** Remaining scripts (th, hi, …): token dedupe + generic doubled sentence punctuation. */
function polishGenericTargetTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/([.!?。！？؟])\1+/gu, "$1");
  return collapseWs(t);
}

/** Drop a trailing clause that repeats the previous question segment (live PT/ES often echoes the closing). */
function trimOverlappingDuplicateQuestionTail(raw: string): string {
  let t = collapseWs(raw);
  for (let pass = 0; pass < 2; pass++) {
    const positions: number[] = [];
    for (let i = 0; i < t.length; i++) if (t[i] === "?") positions.push(i);
    if (positions.length < 2) break;
    const i2 = positions[positions.length - 1];
    const i1 = positions[positions.length - 2];
    const between = t.slice(i1 + 1, i2).trim();
    const after = t.slice(i2 + 1).trim().replace(/\?+$/u, "").trim();
    if (between.length >= 4 && after.length >= 8) {
      const r = tokenOverlapRatio(between, after);
      const bl = between.toLowerCase();
      const al = after.toLowerCase();
      if (r >= 0.38 || al.includes(bl) || bl.includes(al)) {
        t = collapseWs(t.slice(0, i2 + 1));
        continue;
      }
    }
    if (after.length <= 1 && between.length >= 3 && positions.length >= 3) {
      const i0 = positions[positions.length - 3];
      const earlier = t.slice(i0 + 1, i1).trim();
      if (tokenOverlapRatio(earlier, between) >= 0.45) {
        t = collapseWs(t.slice(0, i1 + 1));
        continue;
      }
    }
    break;
  }
  return t;
}

/**
 * THE FINAL BOSS (canonical) · final-column polish: whitespace + adjacent paraphrase merge (verbatim repeats kept), then script-family
 * fixes (same baseline for every target language).
 */
function maybePolishTranslationForTarget(text: string, targetLang: string): string {
  const base = targetLang.split("-")[0]?.toLowerCase() ?? "";
  if (!base) return text;
  const prepped = dedupeAdjacentParaphraseSentences(dedupeConsecutiveTranslationTokens(text));
  if (ARABIC_SCRIPT_TARGET_LANGS.has(base)) return polishArabicInterpreterTranslation(prepped);
  if (HEBREW_SCRIPT_TARGET_LANGS.has(base)) return polishHebrewInterpreterTranslation(prepped);
  if (LATIN_SCRIPT_TARGET_LANGS.has(base)) return polishLatinScriptInterpreterTranslation(prepped, base);
  if (CYRILLIC_SCRIPT_TARGET_LANGS.has(base) || GREEK_SCRIPT_TARGET_LANGS.has(base)) {
    return polishQuestionMarkFamilyTargetTranslation(prepped);
  }
  if (CJK_TARGET_LANG_BASES.has(base)) return polishCjkTargetTranslation(prepped);
  if (HANGUL_TARGET_LANG_BASES.has(base)) return polishQuestionMarkFamilyTargetTranslation(prepped);
  return polishGenericTargetTranslation(prepped);
}

function hasVisibleText(text: string | null | undefined): boolean {
  return Boolean(text && text.trim().length > 0);
}

/** Sets direction / lang on container and typography + HTML on body (same element for prod; split spans for Intercall experiment). */
function applyTranslationTypographyCore(rootDirEl: HTMLElement, bodyEl: HTMLElement, newTranslation: string): void {
  const { rtl, arabicScript } = getTranslationTypographyMeta(newTranslation);
  rootDirEl.dir             = rtl ? "rtl" : "ltr";
  rootDirEl.style.textAlign = rtl ? "right" : "";
  const html = wrapAsciiDigitRunsWithLtrSpans(newTranslation);
  if (rtl) {
    if (arabicScript) {
      rootDirEl.lang = "ar";
      bodyEl.className = CLS.transText + " ts-arabic";
    } else {
      rootDirEl.lang = "he";
      bodyEl.className = CLS.transText;
    }
    bodyEl.innerHTML = html;
  } else {
    rootDirEl.removeAttribute("lang");
    bodyEl.className = CLS.transText;
    bodyEl.innerHTML = html;
  }
}

/** Live + final: replace the translation cell (innerHTML on a single element — see {@link applyTranslationForBubbleState}). */
function applyTranslationTypography(el: HTMLParagraphElement, newTranslation: string): void {
  applyTranslationTypographyCore(el, el, newTranslation);
}

// ── Per-bubble translation state ───────────────────────────────────────────────
// Each segment gets its own isolated state object. dispatchTranslation closures
// capture the state object at the time of dispatch, so in-flight requests from
// a previous segment can NEVER write into a later segment's DOM element.
interface BubbleTransState {
  segmentId:          string;
  /** True after segment boundary close — blocks late live flush/translate for this segment (final responses still allowed). */
  isClosed:           boolean;
  /** Highest translation dispatch seq successfully applied to DOM (OpenAI-path stale-response guard). */
  lastAppliedSeq:     number;
  transTextEl:       HTMLParagraphElement;
  /**
   * Morsy Intercall orchestration: stable (finalized-only paint target) + volatile live tail.
   * When null, translations use {@link BubbleTransState.transTextEl} alone (production).
   */
  transStableEl:     HTMLSpanElement | null;
  transLiveEl:       HTMLSpanElement | null;
  seq:               number;   // incremented on every dispatch FOR THIS bubble
  lastShownSeq:      number;   // highest seq whose result was written to DOM
  lastShownLen:      number;   // char length of last shown translation (for stabilization)
  finalizing:        boolean;  // true once softFinalize has been called — blocks in-flight polls
  translationLocked: boolean;  // true after first finalized translation — no further updates
  /** Source prefix already reflected in the translation column (streaming); final pass replaces all. */
  streamCommittedSource: string;
  /** Abort current live translate when superseded (debounced dispatch / final / close). */
  liveTranslationAbort: AbortController | null;
  /** Last normalized live source seen (final + NF). */
  lastLiveSource:        string;
  /** Timestamp when lastLiveSource changed. */
  lastLiveSourceTs:      number;
  /** One-time early non-final translation hint for this segment. */
  earlyHintSent:         boolean;
  /** Word count at the last non-final preview dispatch (LIVE_PREVIEW_WORD_STEP gating). */
  lastPreviewWordsSent:  number;
  /** Count of finalized tokens committed in this segment. */
  finalTokensSeen:       number;
  /** Last observed raw NF text used for append-only NF rendering. */
  lastNfRawText:         string;
  /** Latest normalized, confirmed (final-only) source text for this segment. */
  lastConfirmedSource:   string;
  /** Last confirmed source already dispatched for live translation. */
  lastConfirmedSourceTranslated: string;
  /** Last live source sent to translator (prevents tight same-text loops). */
  lastRequestedLiveSource: string;
  /** When last live source request was sent. */
  lastRequestedLiveAtMs: number;
  /** Throttle WS hint retries when source matches bookkeeping but translation cell is still empty. */
  lastEmptyCellHintDispatchAtMs: number;
  /** Throttle hint retries when translation may be truncated vs source (same source string). */
  lastTruncationRetryHintAtMs: number;
  /** Latest computed live translation candidate not yet committed to visible UI. */
  pendingDisplayTranslation: string;
  /** Once true, ignore any late interim responses for this segment. */
  hardFinalRequested: boolean;
  /** Locked source language for this segment (set once from first visible token with a language tag). */
  segmentSourceLang:     string | null;
  /** Locked target language (opposite side of selected pair). */
  segmentTargetLang:     string | null;
}

/** Intercall experiment (Morsy Urgent): live paints volatile span; final promotes to stable span and clears tail. */
function applyTranslationForBubbleState(
  state: BubbleTransState,
  newTranslation: string,
  kind: "live" | "final",
): void {
  const root = state.transTextEl;
  const stable = state.transStableEl;
  const live = state.transLiveEl;
  if (!stable || !live) {
    applyTranslationTypography(root, newTranslation);
    return;
  }
  if (kind === "live") {
    stable.textContent = "";
    stable.removeAttribute("lang");
    stable.className = `${CLS.transText} min-w-0`;
    applyTranslationTypographyCore(root, live, newTranslation);
  } else {
    live.textContent = "";
    live.removeAttribute("lang");
    live.className = `${CLS.transText} min-w-0 opacity-90`;
    applyTranslationTypographyCore(root, stable, newTranslation);
  }
}

type TranslationTriggerReason = "segment_finalize" | "early_hint" | "language_passthrough";

type TranslationDiag = {
  callCount: number;
  estimatedTokensTotal: number;
  perSegmentCalls: Map<string, number>;
  callTimestampsMs: number[];
  lastInputMeta: { segmentId: string; chars: number; words: number } | null;
  redundantCalls: number;
};

export type UseTranscriptionOptions = {
  /** Fired when finalized transcript/translation lines are appended for admin live view (debounce in parent). */
  onAdminSnapshotBuffersUpdated?: () => void;
  /** When false, skips OpenAI translation calls and shows a Platinum upgrade hint in the translation column. */
  translationEnabled?: boolean;
  /** Controls how the translation column looks when translation is disabled. */
  translationUiMode?: "upsell" | "hidden";
  /**
   * Segment / speaker-boundary profile. Interpreter workspace uses `"morsy-urgent-cbf"` for every tier (name is legacy).
   * `"default"` is only for embeddings or callers that deliberately want looser speaker gating.
   */
  segmentBehaviorMode?: "default" | "morsy-urgent-cbf";
  /**
   * Parent keeps this ref in sync with server `minutesUsedToday` / `dailyLimitMinutes` so the worklet can
   * stop as soon as in-flight PCM reaches the daily cap (ahead of the 30s heartbeat).
   */
  dailyCapRef?: MutableRefObject<{ minutesUsedToday: number; dailyLimitMinutes: number } | null>;
  /** Called after `stop()` finishes (any reason — manual stop, inactivity, daily cap, errors). */
  onRecordingStopped?: () => void;
  /**
   * When true (workspace default for signed-in users), tightens **translation** guards: skip live updates
   * into `finalizing`/closed segments (`dispatchTranslation`, debounced paths, clientSeq).
   *
   * For the **original-column** transcript, segment-id keyed final-queue behavior (see
   * {@link morsyUrgentTranscriptSegmentGuards}) is gated on `segmentBoundaryGuards || morsyUrgentTranscriptSegmentGuards`:
   * guests / `?diag_segment_guards=0` fall back to the historical looser finals path unless the Morsy experiment is on.
   */
  segmentBoundaryGuards?: boolean;
  /**
   * Basic · Morsy Urgent only (workspace): enables strengthened **original-column** bookkeeping so late finals
   * target the correct segment (`segmentStateByIdRef`, queued `segmentId`, frozen-row drops in {@link flushFinalTextRenderQueue})
   * even under boundary races — without changing translation routing beyond what {@link segmentBoundaryGuards} already does.
   */
  morsyUrgentTranscriptSegmentGuards?: boolean;
  /**
   * Basic · Morsy Urgent only: Intercall-style orchestration (cadence tuning, grace window); optional UX lab.
   * OpenAI routing hint flag is governed by {@link morsyUrgentTranslateAttachOpenAiExperiment}.
   */
  experimentMorsyUrgentIntercallOrchestration?: boolean;
  /**
   * When true, POST /translate includes `experimentalBasicMorsyOpenAiOnly` (with `BASIC_MORSY_OPENAI_EXPERIMENT=1`),
   * for operational correlation. Translation access no longer depends on this.
   */
  morsyUrgentTranslateAttachOpenAiExperiment?: boolean;
};

// ── Hook ───────────────────────────────────────────────────────────────────────
/**
 * One browser tab/mount = one hook instance: refs and DOM rows are not shared across users or sessions.
 * Translation engine (OpenAI vs machine) is chosen server-side per authenticated user on each request.
 */
export function useTranscription(isAdmin = false, options?: UseTranscriptionOptions) {
  /** Live preview: first dispatch after enough finals + words, then every N words (not every Soniox frame). Tuned for earlier first paint without extra final polish passes. */
  const EARLY_HINT_MIN_WORDS = 8;
  const LIVE_PREVIEW_WORD_STEP = 6;
  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  const onAdminSnapshotBuffersUpdatedRef = useRef<(() => void) | undefined>(undefined);
  onAdminSnapshotBuffersUpdatedRef.current = options?.onAdminSnapshotBuffersUpdated;

  const translationEnabledRef = useRef(options?.translationEnabled ?? true);
  useEffect(() => {
    translationEnabledRef.current = options?.translationEnabled ?? true;
  }, [options?.translationEnabled]);
  const translationUiModeRef = useRef<"upsell" | "hidden">(options?.translationUiMode ?? "upsell");
  useEffect(() => {
    translationUiModeRef.current = options?.translationUiMode ?? "upsell";
  }, [options?.translationUiMode]);
  const segmentBehaviorModeRef = useRef<"default" | "morsy-urgent-cbf">(
    options?.segmentBehaviorMode ?? "morsy-urgent-cbf",
  );
  useEffect(() => {
    segmentBehaviorModeRef.current = options?.segmentBehaviorMode ?? "morsy-urgent-cbf";
  }, [options?.segmentBehaviorMode]);
  const segmentBoundaryGuardsRef = useRef(options?.segmentBoundaryGuards ?? false);
  useEffect(() => {
    segmentBoundaryGuardsRef.current = options?.segmentBoundaryGuards ?? false;
  }, [options?.segmentBoundaryGuards]);
  const morsyUrgentTranscriptSegmentGuardsRef = useRef(options?.morsyUrgentTranscriptSegmentGuards ?? false);
  useEffect(() => {
    morsyUrgentTranscriptSegmentGuardsRef.current = options?.morsyUrgentTranscriptSegmentGuards ?? false;
  }, [options?.morsyUrgentTranscriptSegmentGuards]);

  const experimentMorsyUrgentIntercallRef = useRef(options?.experimentMorsyUrgentIntercallOrchestration ?? false);
  useEffect(() => {
    experimentMorsyUrgentIntercallRef.current = options?.experimentMorsyUrgentIntercallOrchestration ?? false;
  }, [options?.experimentMorsyUrgentIntercallOrchestration]);

  const morsyUrgentAttachOpenAiExperimentRef = useRef(
    options?.morsyUrgentTranslateAttachOpenAiExperiment ?? false,
  );
  useEffect(() => {
    morsyUrgentAttachOpenAiExperimentRef.current = options?.morsyUrgentTranslateAttachOpenAiExperiment ?? false;
  }, [options?.morsyUrgentTranslateAttachOpenAiExperiment]);

  const dailyCapRef = options?.dailyCapRef;
  const onRecordingStoppedRef = useRef<(() => void) | undefined>(undefined);
  onRecordingStoppedRef.current = options?.onRecordingStopped;

  const [isRecording,   setIsRecording]   = useState(false);
  const [micLevel,      setMicLevel]      = useState(0);
  const [error,         setError]         = useState<string | null>(null);
  const [translationServiceError, setTranslationServiceError] = useState<string | null>(null);
  const [audioInfo,     setAudioInfo]     = useState<string>("");
  const [hasTranscript, setHasTranscript] = useState(false);
  const [sessionId,     setSessionId]     = useState<number | null>(null);
  /** True for the full `start()` path (not just token/session HTTP) so the UI cannot re-enable Start mid-setup. */
  const [startBusy, setStartBusy] = useState(false);
  const [glossaryAppliedFlash, setGlossaryAppliedFlash] = useState<{
    count: number;
    sampleTerms: string[];
  } | null>(null);
  const glossaryFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glossaryNotifyRef = useRef<(terms: string[]) => void>(() => {});
  const bumpGlossaryApplied = useCallback((terms: string[]) => {
    if (!terms.length) return;
    if (glossaryFlashTimerRef.current) {
      clearTimeout(glossaryFlashTimerRef.current);
      glossaryFlashTimerRef.current = null;
    }
    setGlossaryAppliedFlash({
      count: terms.length,
      sampleTerms: terms.slice(0, 5),
    });
    glossaryFlashTimerRef.current = setTimeout(() => {
      setGlossaryAppliedFlash(null);
      glossaryFlashTimerRef.current = null;
    }, 4500);
  }, []);
  glossaryNotifyRef.current = bumpGlossaryApplied;

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const startInFlightRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  /** PCM sample-seconds sent toward Soniox (mono @ TARGET_RATE) — used for daily limits, not wall clock. */
  const audioPcmSecondsRef = useRef(0);

  // ── Direct-to-DOM transcript refs ─────────────────────────────────────────
  const containerRef       = useRef<HTMLDivElement | null>(null);
  /** Filled each render — lets early declarations (flush queue) call the latest sticky-tail snap safely. */
  const scrollPanelFnRef   = useRef<
    (
      force?: boolean,
      src?: Exclude<TranscriptScrollPanelSource, "force">,
      followPreGrowth?: boolean | undefined,
    ) => void
  >(null);
  /** Coalesce streaming `scrollPanel(false, …)` into one geometry read per animation frame after layout settles. */
  const scrollFollowRafRef = useRef<number>(0);
  const scrollFollowDeferredSrcRef = useRef<Exclude<TranscriptScrollPanelSource, "force">>("bubble");
  /** Merged RAF payload: sticky-before-growth intent (Chat-style latch); omitted ⇒ post-layout epsilon only in core. */
  const scrollFollowDeferredStickyRef = useRef<boolean | undefined>(undefined);
  /**
   * While handling one synchronous Soniox `onmessage` turn: glued-to-tail before any of this tick’s transcript DOM churn
   * (bubble close + NF + queued finals). `null` = not in WS paint. Cleared in `finally` so async timeouts remeasure glue.
   */
  const transcriptWsTailHintRef = useRef<boolean | null>(null);
  /** True when viewport sits within TRANSCRIPT_TAIL_STICK_EPS_PX of scroll bottom (“following live”). */
  const [tailFollowPinnedUi, setTailFollowPinnedUi] = useState(true);

  const syncTailFollowUiFromScroller = useCallback((scrollEl?: HTMLElement | null) => {
    const el = scrollEl ?? containerRef.current?.parentElement ?? null;
    if (!el) return;
    setTailFollowPinnedUi(transcriptScrollDistanceFromBottom(el) <= TRANSCRIPT_TAIL_STICK_EPS_PX);
  }, []);
  const currentSpeakerRef = useRef<string | undefined>(undefined);
  const lastSpeakerSpeechTokenAtMsRef = useRef<number>(0);
  const pendingSpeakerSwitchRef = useRef<{
    sid: string;
    messageStreak: number;
    firstMs: number;
    bufferedFinalText: string;
  } | null>(null);
  /** PCM chunks while WebSocket is still CONNECTING — avoids dropped audio and Soniox timeouts. */
  const pcmBacklogRef     = useRef<ArrayBuffer[]>([]);
  const activeBubbleRef   = useRef<HTMLSpanElement | null>(null);  // final-text span
  const activeBubbleNFRef = useRef<HTMLSpanElement | null>(null);  // NF span
  const finalCountRef     = useRef(0);
  const detectedLangRef      = useRef<string>("en");
  // The user's selected language pair {a, b}. Per-segment target is computed
  // dynamically: if detected matches b → translate to a; otherwise translate to b.
  const langPairRef       = useRef<{ a: string; b: string }>({ a: "en", b: "ar" });
  const styleUpgradedRef  = useRef(false);

  // ── Per-bubble translation state ───────────────────────────────────────────
  // Each call to createBubble creates a fresh BubbleTransState. Closures in
  // dispatchTranslation capture it — so old bubbles' in-flight requests stay
  // bound to their own element and can never bleed into a new bubble.
  const activeBubbleStateRef = useRef<BubbleTransState | null>(null);

  // ── Translation polling refs ───────────────────────────────────────────────
  // liveBufferRef: segment text seen so far (finals + NF). Updated every onmessage.
  const liveBufferRef        = useRef<string>("");
  /** OpenAI-path schedule debounce; Intercall experiment uses {@link INTERCALL_OPENAI_LIVE_DEBOUNCE_MS}. */
  const OPENAI_LIVE_DEBOUNCE_MS = 300;
  const openaiLiveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openaiLiveDebouncePayloadRef = useRef<{ text: string; lang: string; segmentId: string } | null>(
    null,
  );
  const dispatchTranslationRef = useRef<
    (
      text: string,
      lang: string,
      isFinal?: boolean,
      options?: {
        lockOnFinal?: boolean;
        skipOpenAiLiveDebounce?: boolean;
        suppressEarlyHardFinal?: boolean;
      },
      segmentIdLock?: string,
    ) => void
  >(() => {});
  // setInterval handle.
  const finalRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRenderQueueRef = useRef<Array<{ target: HTMLSpanElement; text: string; segmentId?: string }>>([]);
  /** Resolve BubbleTransState by segment id for flush-queue guards (OpenAI path only). */
  const segmentStateByIdRef = useRef<Map<string, BubbleTransState>>(new Map());
  const segmentSeqRef = useRef(0);
  const translationDiagRef = useRef<TranslationDiag>({
    callCount: 0,
    estimatedTokensTotal: 0,
    perSegmentCalls: new Map(),
    callTimestampsMs: [],
    lastInputMeta: null,
    redundantCalls: 0,
  });

  /** Trailing debounce for live translate API (coalesces WS bursts). MT path uses a short window; Morsy Intercall uses {@link INTERCALL_LIVE_TRANSLATION_DEBOUNCE_MS}. */
  const LIVE_TRANSLATION_DEBOUNCE_MS = 52;
  const liveTranslationDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTranslationDebouncePayloadRef = useRef<{
    text: string;
    lang: string;
    segmentId: string;
  } | null>(null);

  /** Intercall: closed segment ids (ordering) for debugging / future row-level policy; not used in prod path. */
  const intercallFinalizedSegmentIdsRef = useRef<string[]>([]);
  const intercallEndpointGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelOpenAiLiveDebounce = useCallback(() => {
    if (openaiLiveDebounceTimerRef.current !== null) {
      clearTimeout(openaiLiveDebounceTimerRef.current);
      openaiLiveDebounceTimerRef.current = null;
    }
    openaiLiveDebouncePayloadRef.current = null;
    if (liveTranslationDebounceTimerRef.current !== null) {
      clearTimeout(liveTranslationDebounceTimerRef.current);
      liveTranslationDebounceTimerRef.current = null;
    }
    liveTranslationDebouncePayloadRef.current = null;
    if (intercallEndpointGraceTimerRef.current !== null) {
      clearTimeout(intercallEndpointGraceTimerRef.current);
      intercallEndpointGraceTimerRef.current = null;
    }
  }, []);

  const scheduleDebouncedLiveTranslation = useCallback((text: string, lang: string, segmentId: string) => {
    liveTranslationDebouncePayloadRef.current = { text, lang, segmentId };
    if (liveTranslationDebounceTimerRef.current !== null) {
      clearTimeout(liveTranslationDebounceTimerRef.current);
    }
    liveTranslationDebounceTimerRef.current = setTimeout(() => {
      liveTranslationDebounceTimerRef.current = null;
      const p = liveTranslationDebouncePayloadRef.current;
      if (!p) return;
      if (!isRecRef.current) return;
      const st = activeBubbleStateRef.current;
      if (
        !st ||
        st.segmentId !== p.segmentId ||
        st.translationLocked ||
        st.finalizing ||
        (segmentBoundaryGuardsRef.current && st.isClosed)
      ) {
        return;
      }
      const freshText = liveBufferRef.current.trim();
      if (freshText.length < 3) return;
      const langNow = st.segmentSourceLang ?? detectedLangRef.current;
      dispatchTranslationRef.current(
        freshText,
        langNow,
        false,
        { skipOpenAiLiveDebounce: true },
        p.segmentId,
      );
    }, experimentMorsyUrgentIntercallRef.current ? INTERCALL_LIVE_TRANSLATION_DEBOUNCE_MS : LIVE_TRANSLATION_DEBOUNCE_MS);
  }, []);

  const flushFinalTextRenderQueue = useCallback((stickyBeforeThisFlush?: boolean) => {
    if (finalRenderTimerRef.current !== null) {
      clearTimeout(finalRenderTimerRef.current);
      finalRenderTimerRef.current = null;
    }
    const scrollParent = containerRef.current?.parentElement ?? null;
    let preGlue: boolean;
    if (stickyBeforeThisFlush !== undefined) preGlue = stickyBeforeThisFlush;
    else if (transcriptWsTailHintRef.current !== null) preGlue = transcriptWsTailHintRef.current;
    else preGlue = transcriptScrollerGluedBeforeGrowth(scrollParent);

    const q = finalRenderQueueRef.current;
    if (q.length === 0) {
      scrollPanelFnRef.current?.(false, "flush_queue_empty_snap_if_sticky", preGlue);
      return;
    }
    finalRenderQueueRef.current = [];
    for (const item of q) {
      const { target, text, segmentId } = item;
      if (!target.isConnected) continue;
      const transcriptSegIsolation =
        segmentBoundaryGuardsRef.current || morsyUrgentTranscriptSegmentGuardsRef.current;
      // Original-column: keyed finals + frozen rows only when signed-in guards or Basic · Morsy Urgent experiment.
      if (transcriptSegIsolation && segmentId) {
        const st = segmentStateByIdRef.current.get(segmentId);
        if (!st || st.isClosed || st.segmentId !== segmentId) continue;
      }
      target.textContent = (target.textContent ?? "") + text;
    }
    scrollPanelFnRef.current?.(false, "queued_final_chars", preGlue);
  }, []);

  const scheduleFinalTextRenderFlush = useCallback(() => {
    if (finalRenderTimerRef.current !== null) return;
    finalRenderTimerRef.current = setTimeout(() => {
      finalRenderTimerRef.current = null;
      flushFinalTextRenderQueue();
    }, FINAL_TEXT_RENDER_BUFFER_MS);
  }, [flushFinalTextRenderQueue]);

  const getBufferedFinalTextForActiveBubble = useCallback((): string => {
    const active = activeBubbleRef.current;
    if (!active) return "";
    const activeSegId = activeBubbleStateRef.current?.segmentId;
    const transcriptSegIsolation =
      segmentBoundaryGuardsRef.current || morsyUrgentTranscriptSegmentGuardsRef.current;
    let pending = "";
    for (const item of finalRenderQueueRef.current) {
      if (
        transcriptSegIsolation &&
        activeSegId &&
        item.segmentId &&
        item.segmentId !== activeSegId
      ) {
        continue;
      }
      if (item.target === active) pending += item.text;
    }
    return pending;
  }, []);

  // ── Snapshot accumulators for admin "View Session" ────────────────────────
  // Finalized transcript/translation lines are appended here on each segment.
  // getSnapshot() returns parallel arrays + joined strings (admin aligns rows without splitting on embedded newlines). Cleared when recording stops.
  const transcriptBufRef  = useRef<string[]>([]);
  const translationBufRef = useRef<string[]>([]);
  /** Maps segmentId → row index in transcriptBuf/translationBuf so Soniox endpoint finals and softFinalize share one admin row per segment. */
  const adminSegmentRowIndexRef = useRef<Map<string, number>>(new Map());
  // ── Session safety timers ──────────────────────────────────────────────────
  // inactivityTimerRef: fires stop() after 5 min of no speech tokens.
  // maxSessionTimerRef: fires stop() after 3 hours unconditionally.
  // resetInactivityRef: shared function set by start(), called by buildWs onmessage.
  // heartbeatIntervalRef: pings /session/heartbeat so the server can enforce daily caps and
  // avoid treating the session as stale after navigation (see STALE_SESSION_MS on API).
  const inactivityTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxSessionTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetInactivityRef   = useRef<(() => void) | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Prevents double stop() when both worklet and heartbeat see the daily cap. */
  const dailyLimitAutoStopRef = useRef(false);
  /** Set from `stop` once defined — used from `dispatchTranslation` for translate 403 daily cap. */
  const dailyLimitShutdownRef = useRef<(msg: string) => void>(() => { /* assigned in useEffect */ });

  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes
  const MAX_SESSION_MS        = 3 * 60 * 60 * 1000; // 3 hours

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  const translationConfigReporterRef = useRef<(msg: string) => void>(() => {});
  translationConfigReporterRef.current = (msg: string) => {
    setTranslationServiceError((prev) => prev ?? msg);
  };

  /**
   * Tail-follow (Chat-style): snap to `scrollHeight` only if the user was already following the live tail *before*
   * new transcript/translation DOM grew (`followPreGrowth === true`), or if no snapshot was passed and the
   * post-layout viewport still sits within TRANSCRIPT_TAIL_STICK_EPS_PX of the bottom (`followPreGrowth` omitted).
   * `followPreGrowth === false` skips snap (user had scrolled away before the growth — do not drag them down).
   */
  const runScrollPanelCore = useCallback(
    (
      force: boolean,
      source: Exclude<TranscriptScrollPanelSource, "force">,
      followPreGrowth?: boolean,
    ) => {
      const diag = transcriptScrollDiagEnabled();
      const verify = transcriptScrollVerifyEnabled();
      const el = containerRef.current?.parentElement;
      if (!el) return;

      transcriptScrollVerifyLogViewport(el, `streaming_append(scrollPanel:${force ? "force" : "follow_rAF"}:${source}:pre=${String(followPreGrowth)})`);

      const t = performance.now();
      const slackDiag = TRANSCRIPT_SCROLL_BOTTOM_SLACK_PX;
      let dGeom = transcriptScrollDistanceFromBottom(el);
      const epsilonNearBottom = dGeom <= TRANSCRIPT_TAIL_STICK_EPS_PX;
      let dBefore: number | undefined;
      if (diag || verify) {
        dBefore = dGeom;
      }

      if (force) {
        assignTranscriptScrollerScrollTop(el, el.scrollHeight, `scroll_panel:force_scrollTop(${source})`);
        syncTailFollowUiFromScroller(el);
        if (diag) {
          transcriptScrollDiagCountApply("force");
          const pinnedAfter = transcriptScrollDistanceFromBottom(el) <= slackDiag;
          transcriptScrollDiagPush({
            t,
            kind: "scroll_panel_apply",
            d: dBefore,
            pinnedBefore: epsilonNearBottom,
            pinnedAfter,
            src: "force",
          });
        }
        return;
      }

      let shouldSnapTail: boolean;
      if (followPreGrowth === false) shouldSnapTail = false;
      else if (followPreGrowth === true) shouldSnapTail = true;
      else shouldSnapTail = epsilonNearBottom;

      const diagStickyIntent =
        followPreGrowth === true ? true : followPreGrowth === false ? false : epsilonNearBottom;

      if (!shouldSnapTail) {
        if (diag) {
          transcriptScrollDiagCounts.scrollPanelsSkippedPinnedFalse++;
          transcriptScrollDiagPush({
            t,
            kind: "scroll_panel_skip_pinned_false",
            d: dBefore,
            pinnedBefore: diagStickyIntent,
            pinnedAfter: diagStickyIntent,
            src: source,
          });
        }
        syncTailFollowUiFromScroller(el);
        return;
      }

      assignTranscriptScrollerScrollTop(el, el.scrollHeight, `scroll_panel:tail_follow_scrollTop(${source})`);
      syncTailFollowUiFromScroller(el);
      if (diag) {
        dGeom = transcriptScrollDistanceFromBottom(el);
        transcriptScrollDiagCountApply(source);
        transcriptScrollDiagPush({
          t,
          kind: "scroll_panel_apply",
          d: dBefore,
          pinnedBefore: diagStickyIntent,
          pinnedAfter: dGeom <= slackDiag,
          src: source,
        });
      }
    },
    [syncTailFollowUiFromScroller],
  );

  const scrollPanel = useCallback(
    (
      force = false,
      source: Exclude<TranscriptScrollPanelSource, "force"> = "bubble",
      followPreGrowth?: boolean,
    ) => {
      const diag = transcriptScrollDiagEnabled();
      if (force) {
        if (scrollFollowRafRef.current !== 0) {
          cancelAnimationFrame(scrollFollowRafRef.current);
          scrollFollowRafRef.current = 0;
        }
        scrollFollowDeferredStickyRef.current = undefined;
        if (diag) {
          transcriptScrollDiagCounts.scrollPanelsTotal++;
          transcriptScrollDiagMaybePeriodicSummary();
        }
        runScrollPanelCore(true, source);
        return;
      }

      scrollFollowDeferredSrcRef.current = source;
      scrollFollowDeferredStickyRef.current = mergeDeferTailSticky(
        scrollFollowDeferredStickyRef.current,
        followPreGrowth,
      );

      if (diag) {
        transcriptScrollDiagCounts.scrollPanelsTotal++;
        transcriptScrollDiagMaybePeriodicSummary();
      }

      if (scrollFollowRafRef.current !== 0) return;

      scrollFollowRafRef.current = requestAnimationFrame(() => {
        scrollFollowRafRef.current = 0;
        const mergedPre = scrollFollowDeferredStickyRef.current;
        scrollFollowDeferredStickyRef.current = undefined;
        runScrollPanelCore(false, scrollFollowDeferredSrcRef.current, mergedPre);
      });
    },
    [runScrollPanelCore],
  );
  scrollPanelFnRef.current = scrollPanel;

  const jumpTailFollow = useCallback(() => {
    scrollPanel(true);
  }, [scrollPanel]);

  useEffect(() => {
    transcriptScrollDiagInstallGlobalDumpHook();
  }, []);

  /** Avoid rAF snapping after transcript mount teardown (recording stop / workspace unmount). */
  useEffect(() => {
    return () => {
      if (scrollFollowRafRef.current !== 0) {
        cancelAnimationFrame(scrollFollowRafRef.current);
        scrollFollowRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!transcriptScrollVerifyEnabled()) return;
    const w = window as unknown as {
      __interpreterAiTranscriptJumpTail?: () => void;
      __interpreterAiTranscriptSnapViewport?: (tag?: string) => void;
      __interpreterAiTranscriptFollowPinnedSnapshot?: () => boolean;
    };
    w.__interpreterAiTranscriptJumpTail = () => jumpTailFollow();
    w.__interpreterAiTranscriptSnapViewport = (tag = "manual_console") =>
      transcriptScrollVerifyLogViewport(containerRef.current?.parentElement ?? undefined, tag);
    w.__interpreterAiTranscriptFollowPinnedSnapshot = () => {
      const el = containerRef.current?.parentElement;
      if (!el) return true;
      return transcriptScrollDistanceFromBottom(el) <= TRANSCRIPT_TAIL_STICK_EPS_PX;
    };
    return () => {
      delete w.__interpreterAiTranscriptJumpTail;
      delete w.__interpreterAiTranscriptSnapViewport;
      delete w.__interpreterAiTranscriptFollowPinnedSnapshot;
    };
  }, [jumpTailFollow]);

  useEffect(() => {
    if (!transcriptScrollVerifyEnabled()) return;
    let cancelled = false;
    let rafGeo = 0;
    let bootAttempts = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(rafGeo);
      rafGeo = requestAnimationFrame(() => {
        if (cancelled) return;
        const scrollEl = containerRef.current?.parentElement;
        transcriptScrollVerifyLogViewport(scrollEl, "mutation_observer_post_layout(children_changed)");
      });
    });

    let roOuter: ResizeObserver | null = null;
    let roInner: ResizeObserver | null = null;
    const triedBoot = (): void => {
      if (cancelled || bootAttempts > 480) return;
      bootAttempts++;
      const inner = containerRef.current;
      const scrollEl = inner?.parentElement;
      if (!inner || !scrollEl) {
        requestAnimationFrame(triedBoot);
        return;
      }
      mo.observe(inner, { subtree: true, childList: true, characterData: true });
      transcriptScrollVerifyLogViewport(scrollEl, "verify_observers_online");

      const bumpRo = (): void => {
        cancelAnimationFrame(rafGeo);
        rafGeo = requestAnimationFrame(() => {
          if (cancelled) return;
          transcriptScrollVerifyLogViewport(containerRef.current?.parentElement ?? undefined, "resize_observer(scroll_or_content_box)");
        });
      };
      roOuter = new ResizeObserver(bumpRo);
      roInner = new ResizeObserver(bumpRo);
      try {
        roOuter.observe(scrollEl);
        roInner.observe(inner);
      } catch {
        /* ignore ResizeObserver quirks in older browsers */
      }
    };
    triedBoot();

    return () => {
      cancelled = true;
      mo.disconnect();
      roOuter?.disconnect();
      roInner?.disconnect();
      cancelAnimationFrame(rafGeo);
    };
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    let attachedEl: HTMLElement | null = null;
    let onScroll: (() => void) | undefined;
    let raf2 = 0;

    const tryAttach = (): boolean => {
      const inner = containerRef.current;
      const scrollParent = inner?.parentElement ?? null;
      if (!scrollParent || cancelled) return false;
      attachedEl = scrollParent as HTMLElement;

      onScroll = () => {
        const el = attachedEl!;
        transcriptScrollVerifyLogViewport(el, "scroll_listener");
        const dNow = transcriptScrollDistanceFromBottom(el);
        syncTailFollowUiFromScroller(el);
        if (transcriptScrollDiagEnabled()) {
          const pinnedNowGeom = dNow <= TRANSCRIPT_TAIL_STICK_EPS_PX;
          transcriptScrollDiagCounts.scrollEvents++;
          transcriptScrollDiagPush({
            t: performance.now(),
            kind: "scroll_listener",
            d: dNow,
            pinnedBefore: pinnedNowGeom,
            pinnedAfter: pinnedNowGeom,
          });
          transcriptScrollDiagMaybePeriodicSummary();
        }
      };

      attachedEl.addEventListener("scroll", onScroll, { passive: true });
      if (transcriptScrollDiagEnabled()) {
        transcriptScrollDiagAttachOk = true;
      }
      onScroll();
      return true;
    };

    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      if (!tryAttach()) {
        raf2 = requestAnimationFrame(() => {
          if (!cancelled) {
            tryAttach();
            if (transcriptScrollDiagEnabled() && !transcriptScrollDiagAttachOk) {
              console.warn(
                "[transcript_scroll_diag] scroll listener failed to attach after 2 animation frames — transcript scroller gestures not observed.",
              );
            }
          }
        });
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (attachedEl && onScroll) attachedEl.removeEventListener("scroll", onScroll);
      if (transcriptScrollDiagEnabled()) {
        transcriptScrollDiagAttachOk = false;
      }
    };
  }, [syncTailFollowUiFromScroller]);

  // ── THE FINAL BOSS (canonical) · dispatchTranslation ─────────────────────────
  // Live: debounced previews + per-bubble abort. Every finalized segment sends the FULL source sentence
  // to translate (no tail-only payloads, no streamingDelta merge) — one replace of the translation cell,
  // then optional lock — avoids mixed-language locked rows from incremental MT tails.
  const dispatchTranslation = useCallback((
    text: string,
    lang: string,
    isFinal = false,
    options?: {
      lockOnFinal?: boolean;
      skipOpenAiLiveDebounce?: boolean;
      suppressEarlyHardFinal?: boolean;
      /** Row index in transcriptBuf/translationBuf for this finalized segment (admin snapshot); avoids writing into the wrong line when the next segment finalizes before this translate returns. */
      adminSnapshotLineIndex?: number;
    },
    segmentIdLock?: string,
  ) => {
    const state = activeBubbleStateRef.current;
    if (!state || text.trim().length < 3) return;
    const requestSegmentId = segmentIdLock ?? state.segmentId;
    if (requestSegmentId !== state.segmentId) return;

    if (!translationEnabledRef.current) return;

    if (state.translationLocked) return;
    if (segmentBoundaryGuardsRef.current && !isFinal && (state.finalizing || state.isClosed)) return;
    const lockOnFinal = options?.lockOnFinal ?? true;
    if (isFinal && lockOnFinal && !options?.suppressEarlyHardFinal) {
      state.hardFinalRequested = true;
    }
    const words = countWords(text);
    const chars = text.length;

    const pair = langPairRef.current;
    const sonioxHint = lang;
    const rawCandidate =
      state.segmentSourceLang !== null
        ? state.segmentSourceLang
        : validateLangByScript(sonioxHint, text, pair);
    const vRaw = validateLangByScript(rawCandidate, text, pair);
    const vSon = validateLangByScript(sonioxHint, text, pair);
    const majorityHint = majoritySourceFromFirstWords(text, sonioxHint, pair);
    const validatedSonioxForUnique = validateLangByScript(sonioxHint, text, pair);
    const uniqueFromValidatedSoniox = uniquePairMemberForLang(validatedSonioxForUnique, pair);
    const uniqueFromRawSoniox = uniquePairMemberForLang(sonioxHint, pair);
    const chosenSource =
      majorityHint ??
      uniqueFromValidatedSoniox ??
      uniqueFromRawSoniox ??
      pair.a;
    let dispatchLang = state.segmentSourceLang ?? chosenSource;

    const segmentSourceLangBeforePersist = state.segmentSourceLang;
    const evidenceTextForPersist = collapseWs(liveBufferRef.current);
    const evidenceWordsAtPersist = countWords(evidenceTextForPersist);
    const evidenceCharsAtPersist = evidenceTextForPersist.length;
    const persistGatePassed =
      !state.translationLocked &&
      state.segmentSourceLang === null &&
      evidenceWordsAtPersist >= DIRECTION_LOCK_MIN_WORDS &&
      evidenceCharsAtPersist >= DIRECTION_LOCK_MIN_CHARS;
    const snappedPersistApplied = false;
    const snappedPersistValue: string | null = null;

    const targetOppositeBeforeHardGuard = targetOppositeInPair(dispatchLang, pair);
    let myTargetLang = targetOppositeBeforeHardGuard;
    if (!state.translationLocked) {
      state.segmentTargetLang = myTargetLang;
    }

    const hardGuardTriggered = matchesLang(dispatchLang, myTargetLang);
    if (hardGuardTriggered) {
      // Hard guard: translation target must always be the opposite side.
      myTargetLang = matchesLang(dispatchLang, pair.a) ? pair.b : pair.a;
      if (!state.translationLocked) {
        state.segmentTargetLang = myTargetLang;
      }
    }

    const directionCorrelationId = liveDirectionTraceEnabled()
      ? `dir-${requestSegmentId}-${liveDirectionTraceNextSeq()}`
      : "";

    const emitDirectionResolve = (phase: "openai_debounce_schedule" | "api_bound") => {
      if (!directionCorrelationId) return;
      liveDirectionTraceDispatchResolve({
        seq: liveDirectionTraceNextSeq(),
        phase,
        correlationId: directionCorrelationId,
        segmentId: requestSegmentId,
        pairA: pair.a,
        pairB: pair.b,
        langParam: sonioxHint,
        detectedLangRef: detectedLangRef.current,
        rawCandidate,
        vRaw,
        vSon,
        majorityHint,
        uniqueFromValidatedSoniox,
        uniqueFromRawSoniox,
        chosenSource,
        segmentSourceLangBeforePersist,
        persistGatePassed,
        evidenceWordsAtPersist,
        evidenceCharsAtPersist,
        snappedPersistApplied,
        snappedPersistValue,
        dispatchLang,
        targetOppositeBeforeHardGuard,
        hardGuardTriggered,
        myTargetLang,
        dispatchWords: words,
        dispatchChars: chars,
        liveBufferLen: liveBufferRef.current.length,
        translationLocked: state.translationLocked,
        segmentSourceLangAfter: state.segmentSourceLang,
        segmentTargetLangAfter: state.segmentTargetLang,
        isFinal,
        skipOpenAiLiveDebounce: options?.skipOpenAiLiveDebounce,
      });
    };

    const baseDirectionHypothesisTags = buildDirectionHypothesisTags({
      hardGuardTriggered,
      snappedPersistApplied,
      persistGatePassed,
      majorityHint,
      segmentSourceLangBeforePersist,
      langParam: sonioxHint,
      dispatchLang,
      fetchAborted: false,
    });

    const dirFailureTags = (abortedInFlight: boolean) =>
      abortedInFlight && !baseDirectionHypothesisTags.includes("race")
        ? [...baseDirectionHypothesisTags, "race" as const]
        : baseDirectionHypothesisTags;

    const { transTextEl } = state;

    const reason: TranslationTriggerReason = isFinal ? "segment_finalize" : "early_hint";
    const estimatedTokens = Math.max(1, Math.round(chars * EST_TOKENS_PER_CHAR));
    const nowMs = Date.now();
    const diag = translationDiagRef.current;
    diag.callCount += 1;
    diag.estimatedTokensTotal += estimatedTokens;
    diag.callTimestampsMs.push(nowMs);
    diag.perSegmentCalls.set(
      state.segmentId,
      (diag.perSegmentCalls.get(state.segmentId) ?? 0) + 1,
    );
    if (diag.lastInputMeta?.segmentId === state.segmentId) {
      const cDiff = Math.abs(diag.lastInputMeta.chars - chars);
      const wDiff = Math.abs(diag.lastInputMeta.words - words);
      if (cDiff <= 8 && wDiff <= 2) {
        diag.redundantCalls += 1;
        console.info(
          "[translation_redundant]",
          `time=${new Date(nowMs).toISOString()}`,
          `segment_id=${state.segmentId}`,
          `chars_prev=${diag.lastInputMeta.chars}`,
          `chars_now=${chars}`,
          `words_prev=${diag.lastInputMeta.words}`,
          `words_now=${words}`,
        );
      }
    }
    diag.lastInputMeta = { segmentId: state.segmentId, chars, words };
    console.info(
      "[translation_call]",
      `time=${new Date(nowMs).toISOString()}`,
      `segment_id=${state.segmentId}`,
      `reason=${reason}`,
      `is_final=${isFinal ? "true" : "false"}`,
      `buffer_words=${words}`,
      `buffer_chars=${chars}`,
      `estimated_tokens=${estimatedTokens}`,
    );

    if (
      !isFinal &&
      !options?.skipOpenAiLiveDebounce
    ) {
      recordTranslationLiveDebounceSchedule(text);
      openaiLiveDebouncePayloadRef.current = { text, lang, segmentId: requestSegmentId };
      if (openaiLiveDebounceTimerRef.current !== null) {
        clearTimeout(openaiLiveDebounceTimerRef.current);
      }
      openaiLiveDebounceTimerRef.current = setTimeout(() => {
        openaiLiveDebounceTimerRef.current = null;
        const p = openaiLiveDebouncePayloadRef.current;
        openaiLiveDebouncePayloadRef.current = null;
        if (!p) return;
        if (!isRecRef.current) return;
        const stNow = activeBubbleStateRef.current;
        if (!stNow || stNow.segmentId !== p.segmentId) return;
        if (stNow.translationLocked || stNow.finalizing) return;
        if (segmentBoundaryGuardsRef.current && stNow.isClosed) return;
        const freshText = liveBufferRef.current.trim();
        if (freshText.length < 3) return;
        const langNow = stNow.segmentSourceLang ?? detectedLangRef.current;
        dispatchTranslationRef.current(
          freshText,
          langNow,
          false,
          { skipOpenAiLiveDebounce: true },
          p.segmentId,
        );
      }, experimentMorsyUrgentIntercallRef.current ? INTERCALL_OPENAI_LIVE_DEBOUNCE_MS : OPENAI_LIVE_DEBOUNCE_MS);
      emitDirectionResolve("openai_debounce_schedule");
      return;
    }

    recordTranslationDispatch({
      sourceText: text,
      isFinal,
    });

    // Full source on every final (and on every live dispatch); never tail-only or streamingDelta —
    // avoids Frankenstein merges and mixed-language rows before lock.
    const requestIsFinal = isFinal;
    const apiText = text;
    const useStreamingDelta = false;

    let liveAbortForThisRequest: AbortController | undefined;
    if (isFinal) {
      state.liveTranslationAbort?.abort();
      state.liveTranslationAbort = null;
    } else {
      state.liveTranslationAbort?.abort();
      state.liveTranslationAbort = new AbortController();
      liveAbortForThisRequest = state.liveTranslationAbort;
    }

    state.seq += 1;
    const mySeq = state.seq;

    const traceId = liveBlankTraceEnabled()
      ? `${requestSegmentId}:seq${mySeq}:${Date.now()}`
      : "";
    const liveBufAtDispatchStart = liveBufferRef.current.length;
    const cellBeforeSnapshot = (state.transTextEl.textContent ?? "").trim();
    const cellHadSnapshot = translationCellLooksFilled(state.transTextEl);
    const wsSnapDispatch = liveBlankTraceGetLastWsSnapshot();

    if (traceId) {
      const snApi = maybeSnippet(apiText);
      const snFull = maybeSnippet(text);
      liveBlankTraceDispatchStart({
        traceId,
        segmentId: requestSegmentId,
        mySeq,
        isFinalDispatch: isFinal,
        requestIsFinal,
        useStreamingDelta,
        dispatchWords: words,
        dispatchCharsFullText: text.length,
        dispatchCharsApiPayload: apiText.length,
        dispatchLang,
        myTargetLang,
        segmentSourceLang: state.segmentSourceLang,
        detectedLangRef: detectedLangRef.current,
        translationCellCharsBefore: cellBeforeSnapshot.length,
        translationCellHadNonPlaceholderContent: cellHadSnapshot,
        liveBufferLenAtDispatch: liveBufAtDispatchStart,
        wsSnapshot: wsSnapDispatch,
        ...(snApi !== undefined ? { apiPayloadSnippet: snApi } : {}),
        ...(snFull !== undefined ? { fullSourceSnippet: snFull } : {}),
      });
    }

    emitDirectionResolve("api_bound");

    void (async () => {
      try {
        const recordingSessionId = sessionIdRef.current;
        const basicMorsyOpenAiExperimentOpts =
          experimentMorsyUrgentIntercallRef.current || morsyUrgentAttachOpenAiExperimentRef.current
            ? ({ experimentalBasicMorsyOpenAiOnly: true } as const)
            : {};
        const morsyIntercallEmbeddedEnglishPromptOpts = experimentMorsyUrgentIntercallRef.current
          ? ({ experimentalMorsyIntercallEmbeddedEnglishPrompt: true } as const)
          : {};
        const guardSnap = () => ({
          mySeq,
          lastAppliedSeq: state.lastAppliedSeq,
          lastShownSeq: state.lastShownSeq,
          requestIsFinal,
          isFinalDispatch: isFinal,
          aborted: liveAbortForThisRequest?.signal.aborted ?? false,
          translationLocked: state.translationLocked,
          hardFinalRequested: state.hardFinalRequested,
          finalizing: state.finalizing,
          isClosed: state.isClosed,
        });
        const maxFetchAttempts = requestIsFinal ? 3 : 1;
        let translated = "";
        let translationEngineHint: TranslationEngineHint | undefined;
        const emitSuspectGuardDrop = () => {
          const tr = translated.trim();
          if (!tr || !looksLikeUntranslatedCopy(text, tr)) return;
          emitLiveDirectionSameLanguageFailure({
            correlationId:       directionCorrelationId,
            segmentId:           requestSegmentId,
            isFinalDispatch:     isFinal,
            sourceFullText:      text,
            translatedAfterRetries: tr,
            srcLangSent:         dispatchLang,
            tgtLangSent:         myTargetLang,
            detectedLangRef:     detectedLangRef.current,
            segmentSourceLang:   state.segmentSourceLang,
            dispatchLang,
            chosenSource,
            majorityHint,
            useStreamingDelta,
            requestIsFinal,
            paintOutcome:        "guard_drop",
            hypothesisTags:      dirFailureTags(liveAbortForThisRequest?.signal.aborted ?? false),
          });
        };
        for (let fetchAttempt = 0; fetchAttempt < maxFetchAttempts; fetchAttempt++) {
          if (fetchAttempt > 0) {
            await new Promise<void>(res => setTimeout(res, 400 * fetchAttempt));
          }
          if (requestSegmentId !== state.segmentId) {
            traceDispatchGuard(traceId, "before_fetch_loop", "segment_mismatch", guardSnap());
            return;
          }
          if (!transTextEl.isConnected) {
            traceDispatchGuard(traceId, "before_fetch_loop", "dom_detached", guardSnap());
            return;
          }
          if (state.translationLocked) {
            traceDispatchGuard(traceId, "before_fetch_loop", "translation_locked", guardSnap());
            return;
          }
          if (!requestIsFinal && state.hardFinalRequested) {
            traceDispatchGuard(traceId, "before_fetch_loop", "hard_final_supersedes_live", guardSnap());
            return;
          }
          if (!isFinal && state.finalizing) {
            traceDispatchGuard(traceId, "before_fetch_loop", "finalizing_blocks_live", guardSnap());
            return;
          }
          if (liveAbortForThisRequest?.signal.aborted) {
            traceDispatchGuard(traceId, "before_fetch_loop", "aborted_before_fetch", guardSnap());
            return;
          }
          if (segmentBoundaryGuardsRef.current) {
            if (state.isClosed && !requestIsFinal) {
              traceDispatchGuard(traceId, "before_fetch_loop", "segment_closed_live_blocked", guardSnap());
              return;
            }
            if (!requestIsFinal && mySeq < state.lastAppliedSeq) {
              traceDispatchGuard(traceId, "before_fetch_loop", "stale_seq_live_superseded", guardSnap());
              return;
            }
          }

          const tr = await fetchTranslation(
            apiText,
            dispatchLang,
            myTargetLang,
            (m) => translationConfigReporterRef.current(m),
            {
              streamingDelta:         useStreamingDelta && !requestIsFinal,
              fullSegmentForFallback: useStreamingDelta && !requestIsFinal ? text : undefined,
              isFinal: requestIsFinal,
              signal:   liveAbortForThisRequest?.signal,
              onGlossaryApplied: t => glossaryNotifyRef.current(t),
              ...(directionCorrelationId ? { directionTraceId: directionCorrelationId } : {}),
              ...(segmentBoundaryGuardsRef.current
                ? { segmentId: state.segmentId, clientSeq: mySeq }
                : {}),
              ...(recordingSessionId != null && recordingSessionId > 0 ? { sessionId: recordingSessionId } : {}),
              ...basicMorsyOpenAiExperimentOpts,
              ...morsyIntercallEmbeddedEnglishPromptOpts,
            },
          );
          if (tr.dailyLimitReached) {
            traceDispatchGuard(traceId, "before_fetch_loop", "daily_limit_from_primary_response", guardSnap());
            dailyLimitShutdownRef.current(tr.dailyLimitMessage ?? DAILY_LIMIT_STOP_MESSAGE);
            return;
          }
          translated = tr.text;
          translationEngineHint = tr.translationEngine ?? translationEngineHint;
          if (traceId) {
            liveBlankTraceFetchAttempt({
              traceId,
              fetchAttempt,
              requestIsFinal,
              trimmedLen: tr.text.trim().length,
              brokeRetryLoop: Boolean(tr.text.trim()),
            });
          }
          if (translated?.trim()) break;
        }
        if (!translated?.trim() && isFinal && text.trim().length >= 3) {
          await new Promise<void>(res => setTimeout(res, 450));
          if (requestSegmentId !== state.segmentId) {
            traceDispatchGuard(traceId, "after_fetch_before_paint", "segment_mismatch_before_final_retry", guardSnap());
            return;
          }
          if (!transTextEl.isConnected) {
            traceDispatchGuard(traceId, "after_fetch_before_paint", "dom_detached_before_final_retry", guardSnap());
            return;
          }
          if (state.translationLocked) {
            traceDispatchGuard(traceId, "after_fetch_before_paint", "translation_locked_before_final_retry", guardSnap());
            return;
          }
          const trRetry = await fetchTranslation(
            text,
            dispatchLang,
            myTargetLang,
            (m) => translationConfigReporterRef.current(m),
            {
              streamingDelta: false,
              isFinal: true,
              onGlossaryApplied: t => glossaryNotifyRef.current(t),
              ...(directionCorrelationId ? { directionTraceId: directionCorrelationId } : {}),
              ...(segmentBoundaryGuardsRef.current
                ? { segmentId: state.segmentId, clientSeq: mySeq }
                : {}),
              ...(recordingSessionId != null && recordingSessionId > 0 ? { sessionId: recordingSessionId } : {}),
              ...basicMorsyOpenAiExperimentOpts,
              ...morsyIntercallEmbeddedEnglishPromptOpts,
            },
          );
          if (trRetry.dailyLimitReached) {
            traceDispatchGuard(traceId, "after_fetch_before_paint", "daily_limit_final_retry_response", guardSnap());
            dailyLimitShutdownRef.current(trRetry.dailyLimitMessage ?? DAILY_LIMIT_STOP_MESSAGE);
            return;
          }
          translated = trRetry.text;
          translationEngineHint = trRetry.translationEngine ?? translationEngineHint;
        }
        if (translated?.trim() && looksLikeUntranslatedCopy(text, translated)) {
          if (traceId) {
            liveBlankTraceUntranslatedCopy({ traceId, retriedOpposite: false });
          }
          const trOppRetry = await fetchTranslation(
            text,
            dispatchLang,
            myTargetLang,
            (m) => translationConfigReporterRef.current(m),
            {
              streamingDelta: false,
              isFinal: requestIsFinal,
              signal: liveAbortForThisRequest?.signal,
              onGlossaryApplied: t => glossaryNotifyRef.current(t),
              ...(directionCorrelationId ? { directionTraceId: directionCorrelationId } : {}),
              ...(segmentBoundaryGuardsRef.current
                ? { segmentId: state.segmentId, clientSeq: mySeq }
                : {}),
              ...(recordingSessionId != null && recordingSessionId > 0 ? { sessionId: recordingSessionId } : {}),
              ...basicMorsyOpenAiExperimentOpts,
              ...morsyIntercallEmbeddedEnglishPromptOpts,
            },
          );
          if (trOppRetry.dailyLimitReached) {
            traceDispatchGuard(traceId, "after_fetch_before_paint", "daily_limit_opposite_retry", guardSnap());
            dailyLimitShutdownRef.current(trOppRetry.dailyLimitMessage ?? DAILY_LIMIT_STOP_MESSAGE);
            return;
          }
          if (trOppRetry.text?.trim() && !looksLikeUntranslatedCopy(text, trOppRetry.text)) {
            translated = trOppRetry.text;
            translationEngineHint = trOppRetry.translationEngine ?? translationEngineHint;
            if (traceId) {
              liveBlankTraceUntranslatedCopy({
                traceId,
                retriedOpposite: true,
                retryTrimmedLen: trOppRetry.text.trim().length,
              });
            }
          }
        }
        if (requestSegmentId !== state.segmentId) {
          emitSuspectGuardDrop();
          traceDispatchGuard(traceId, "after_fetch_before_paint", "segment_mismatch_post_processing", guardSnap());
          return;
        }

        if (state.translationLocked) {
          emitSuspectGuardDrop();
          traceDispatchGuard(traceId, "after_fetch_before_paint", "translation_locked_post_processing", guardSnap());
          return;
        }
        if (!requestIsFinal && state.hardFinalRequested) {
          emitSuspectGuardDrop();
          traceDispatchGuard(traceId, "after_fetch_before_paint", "hard_final_race_post_processing", guardSnap());
          return;
        }
        if (!isFinal && state.finalizing) {
          emitSuspectGuardDrop();
          traceDispatchGuard(traceId, "after_fetch_before_paint", "finalizing_race_post_processing", guardSnap());
          return;
        }
        if (segmentBoundaryGuardsRef.current) {
          if (state.isClosed && !requestIsFinal) {
            emitSuspectGuardDrop();
            traceDispatchGuard(traceId, "after_fetch_before_paint", "segment_closed_post_processing", guardSnap());
            return;
          }
          if (mySeq < state.lastAppliedSeq) {
            emitSuspectGuardDrop();
            traceDispatchGuard(traceId, "after_fetch_before_paint", "stale_seq_post_processing", guardSnap());
            return;
          }
        }

        if (!translated?.trim()) {
          recordTranslationUiBlankAfterFetch({
            lane: requestIsFinal ? "final" : "live",
            sourceChars: text.length,
          });
          if (traceId) {
            liveBlankTracePaintSuppressed({
              traceId,
              code: "blank_after_fetch_no_paint",
              requestIsFinal,
              useStreamingDelta,
              translatedTrimmedLen: 0,
            });
          }
          if (traceId && !requestIsFinal) {
            const ws = liveBlankTraceGetLastWsSnapshot();
            const hyp: ("upstream_ws"|"api_empty"|"client_guard"|"race")[] = [];
            if (
              ws.multiEffSpeakerFrame ||
              ws.multiLangTagFrame ||
              ws.nfFullReplace ||
              ws.hypothesisShrink ||
              ws.langFlipThisMsg
            ) {
              hyp.push("upstream_ws");
            }
            hyp.push("api_empty");
            if (liveAbortForThisRequest?.signal.aborted) hyp.push("race");
            liveBlankTraceClusterBlank({
              traceId,
              hypothesis: hyp,
              summary: {
                requestIsFinal,
                isFinalDispatch: isFinal,
                useStreamingDelta,
                streamingDeltaRequest: useStreamingDelta && !requestIsFinal,
                dispatchWords: words,
                apiPayloadChars: apiText.length,
                fullSourceChars: text.length,
                cellHadContentAtDispatch: cellHadSnapshot,
                cellCharsAtDispatch: cellBeforeSnapshot.length,
                abortedInFlight: liveAbortForThisRequest?.signal.aborted ?? false,
                liveBufferDeltaSinceDispatch: liveBufferRef.current.length - liveBufAtDispatchStart,
                wsLagMs: ws.atMs ? Date.now() - ws.atMs : null,
                multiEffLastWs: ws.multiEffSpeakerFrame,
                multiLangLastWs: ws.multiLangTagFrame,
                nfReplaceLastWs: ws.nfFullReplace,
                shrinkLastWs: ws.hypothesisShrink,
                langFlipLastWs: ws.langFlipThisMsg,
                mySeq,
                lastAppliedSeq: state.lastAppliedSeq,
                clusterLiveBlankAfterCellHadContent: cellHadSnapshot && !requestIsFinal,
                clientLikelyCauseHint:
                  liveAbortForThisRequest?.signal.aborted
                    ? "D_race_abort"
                    : "B_api_empty_or_try_fallback_chain_see_primary_api_ring",
              },
            });
          }
          return;
        }

        const transcriptScrollParent = containerRef.current?.parentElement ?? null;
        const stickyBeforeTranslatePaint = transcriptScrollerGluedBeforeGrowth(transcriptScrollParent);

        if (requestIsFinal) {
          const rawFinal = translated.trim();
          // Libre / passthrough: server already finalized; aggressive interpreter polish drops clauses and
          // confuses MT phrasing — keep whitespace hygiene only (matches dedupeConsecutiveTranslationTokens).
          const useLightweightFinalPolish =
            translationEngineHint === "libre" || translationEngineHint === "passthrough";
          let out: string;
          if (useLightweightFinalPolish) {
            out = dedupeConsecutiveTranslationTokens(rawFinal);
          } else {
            out = maybePolishTranslationForTarget(rawFinal, myTargetLang);
            if (rawFinal.length > 80 && out.length < Math.floor(rawFinal.length * 0.88)) {
              out = dedupeAdjacentParaphraseSentences(dedupeConsecutiveTranslationTokens(rawFinal));
            }
          }
          const outTrim = out.trim();
          const explicitIdx = options?.adminSnapshotLineIndex;
          const mappedIdx =
            typeof explicitIdx === "number" &&
            explicitIdx >= 0 &&
            explicitIdx < translationBufRef.current.length
              ? explicitIdx
              : adminSegmentRowIndexRef.current.get(requestSegmentId);
          const resolvedAdminIdx =
            typeof mappedIdx === "number" &&
            mappedIdx >= 0 &&
            mappedIdx < translationBufRef.current.length
              ? mappedIdx
              : null;
          // Pin admin dashboard row to this finalized segment (never overwrite the previous row when
          // Soniox endpoint finalizes without softFinalize having pushed a line yet).
          if (resolvedAdminIdx !== null) {
            translationBufRef.current[resolvedAdminIdx] = outTrim;
            onAdminSnapshotBuffersUpdatedRef.current?.();
          } else if (text.trim().length > 0) {
            const line = text.trim();
            transcriptBufRef.current.push(line);
            translationBufRef.current.push(outTrim);
            adminSegmentRowIndexRef.current.set(requestSegmentId, transcriptBufRef.current.length - 1);
            onAdminSnapshotBuffersUpdatedRef.current?.();
          }

          if (mySeq <= state.lastShownSeq) {
            emitSuspectGuardDrop();
            traceDispatchGuard(traceId, "after_fetch_before_paint", "superseded_seq_final_paint", guardSnap());
            return;
          }
          if (!transTextEl.isConnected) {
            emitSuspectGuardDrop();
            traceDispatchGuard(traceId, "after_fetch_before_paint", "dom_detached_final_paint", guardSnap());
            return;
          }

          state.lastShownSeq = mySeq;
          state.lastShownLen = out.length;
          if (segmentBoundaryGuardsRef.current) state.lastAppliedSeq = mySeq;
          applyTranslationForBubbleState(state, out, "final");
          state.pendingDisplayTranslation = "";
          state.streamCommittedSource = text;
          if (!lockOnFinal) {
            state.lastConfirmedSourceTranslated = text;
          }
          if (lockOnFinal) {
            state.hardFinalRequested = true;
            state.translationLocked = true;
          }
        } else {
          if (mySeq <= state.lastShownSeq) {
            emitSuspectGuardDrop();
            traceDispatchGuard(traceId, "after_fetch_before_paint", "superseded_seq_live_paint", guardSnap());
            return;
          }
          if (!transTextEl.isConnected) {
            emitSuspectGuardDrop();
            traceDispatchGuard(traceId, "after_fetch_before_paint", "dom_detached_live_paint", guardSnap());
            return;
          }
          const out = dedupeConsecutiveTranslationTokens(translated.trim());
          if (!out.trim()) {
            if (
              translated.trim().length > 0 &&
              looksLikeUntranslatedCopy(text, translated.trim())
            ) {
              emitLiveDirectionSameLanguageFailure({
                correlationId:       directionCorrelationId,
                segmentId:           requestSegmentId,
                isFinalDispatch:     isFinal,
                sourceFullText:      text,
                translatedAfterRetries: translated.trim(),
                srcLangSent:         dispatchLang,
                tgtLangSent:         myTargetLang,
                detectedLangRef:     detectedLangRef.current,
                segmentSourceLang:   state.segmentSourceLang,
                dispatchLang,
                chosenSource,
                majorityHint,
                useStreamingDelta,
                requestIsFinal,
                paintOutcome:        "suppressed_dedupe_empty",
                hypothesisTags:      dirFailureTags(liveAbortForThisRequest?.signal.aborted ?? false),
              });
            }
            if (traceId) {
              liveBlankTracePaintSuppressed({
                traceId,
                code: "dedupe_live_empty",
                requestIsFinal,
                useStreamingDelta,
                translatedTrimmedLen: translated.trim().length,
              });
            }
            return;
          }
          const prevShown = (transTextEl.textContent ?? "").trim();
          const srcNow = collapseWs(text);
          const srcCommitted = collapseWs(state.streamCommittedSource);
          const preferPrev = shouldPreferPreviousLiveTranslation(prevShown, out, srcNow, srcCommitted);
          const chosen = preferPrev ? prevShown : out;
          if (looksLikeUntranslatedCopy(text, out)) {
            emitLiveDirectionSameLanguageFailure({
              correlationId:       directionCorrelationId,
              segmentId:           requestSegmentId,
              isFinalDispatch:     isFinal,
              sourceFullText:      text,
              translatedAfterRetries: out,
              srcLangSent:         dispatchLang,
              tgtLangSent:         myTargetLang,
              detectedLangRef:     detectedLangRef.current,
              segmentSourceLang:   state.segmentSourceLang,
              dispatchLang,
              chosenSource,
              majorityHint,
              useStreamingDelta,
              requestIsFinal,
              paintOutcome:        preferPrev ? "suppressed_prefer_prev" : "painted",
              hypothesisTags:      dirFailureTags(liveAbortForThisRequest?.signal.aborted ?? false),
            });
          }
          if (traceId && preferPrev && prevShown.length > 0 && out.trim().length > 0) {
            liveBlankTracePaintSuppressed({
              traceId,
              code: "prefer_previous_live_kept_shorter_offered",
              requestIsFinal,
              useStreamingDelta,
              translatedTrimmedLen: translated.trim().length,
              chosenWouldBeLen: out.trim().length,
              prevShownLen: prevShown.length,
              preferPrev: true,
            });
          }
          state.lastShownSeq = mySeq;
          state.lastShownLen = chosen.length;
          if (segmentBoundaryGuardsRef.current) state.lastAppliedSeq = mySeq;
          applyTranslationForBubbleState(state, chosen, "live");
          if (traceId) {
            liveBlankTracePaintAppliedLive({
              traceId,
              useStreamingDelta: false,
              mergedLen: chosen.length,
              chosenLen: chosen.length,
            });
          }
          state.pendingDisplayTranslation = "";
          state.streamCommittedSource = text;
          state.lastConfirmedSourceTranslated = text;
        }

        scrollPanel(false, "translation", stickyBeforeTranslatePaint);
      } catch {
        recordTranslationFetchException();
        /* HIPAA — never log speech context */
      } finally {
        if (
          !isFinal &&
          liveAbortForThisRequest &&
          state.liveTranslationAbort === liveAbortForThisRequest
        ) {
          state.liveTranslationAbort = null;
        }
      }
    })();
  }, [scrollPanel]);

  useEffect(() => {
    dispatchTranslationRef.current = dispatchTranslation;
  }, [dispatchTranslation]);

  // ── stopTranslationInterval ────────────────────────────────────────────────
  const stopTranslationInterval = useCallback(() => {
  }, []);

  // ── createBubble ──────────────────────────────────────────────────────────
  // Builds a two-column segment row with color-coded speaker tags.
  // Creates a fresh BubbleTransState for the new bubble so all translation
  // requests for previous bubbles are structurally isolated.
  const createBubble = useCallback((rawSpeaker: number | string | undefined): HTMLSpanElement => {
    const container = containerRef.current!;
    const { label, slot } = normalizeSpeaker(rawSpeaker);
    const tagCls = slot > 0
      ? SPEAKER_COLORS[Math.min(slot - 1, SPEAKER_COLORS.length - 1)]
      : undefined;

    const row = document.createElement("div");
    row.className = CLS.row;

    // ── LEFT COLUMN: original ────────────────────────────────────────────────
    const colOrig = document.createElement("div");
    colOrig.className = CLS.colOrig;

    // ── RIGHT COLUMN: translation ────────────────────────────────────────────
    const colTrans = document.createElement("div");
    colTrans.className = CLS.colTrans;

    if (label && tagCls) {
      const tagOrig = document.createElement("span");
      tagOrig.className   = tagCls;
      tagOrig.textContent = label;
      colOrig.appendChild(tagOrig);

      const tagTrans = document.createElement("span");
      tagTrans.className   = tagCls;
      tagTrans.textContent = label;
      colTrans.appendChild(tagTrans);
    }

    const origRow = document.createElement("div");
    origRow.className = CLS.textRow;

    const p = document.createElement("p");
    p.className = CLS.textFin;
    applyTextStyle(p);
    const finalSpan = document.createElement("span");
    const nfSpan    = document.createElement("span");
    nfSpan.className = CLS.nf;
    p.appendChild(finalSpan);
    p.appendChild(nfSpan);
    origRow.appendChild(p);
    origRow.appendChild(makeCopyBtn(() => p.textContent ?? ""));
    colOrig.appendChild(origRow);

    const transRow = document.createElement("div");
    transRow.className = CLS.textRow;

    const transTextP = document.createElement("p");
    const translationOn = translationEnabledRef.current;
    transTextP.className   = translationOn ? CLS.transPend : CLS.transDisabled;

    let transStable: HTMLSpanElement | null = null;
    let transLive: HTMLSpanElement | null = null;

    if (translationOn && experimentMorsyUrgentIntercallRef.current) {
      transTextP.textContent = "";
      transStable = document.createElement("span");
      transLive = document.createElement("span");
      transStable.className = `${CLS.transText} min-w-0`;
      transLive.className = `${CLS.transText} min-w-0 opacity-90`;
      transTextP.appendChild(transStable);
      transTextP.appendChild(transLive);
    } else {
      transTextP.textContent = translationOn
        ? ""
        : (translationUiModeRef.current === "hidden" ? "" : TRANSLATION_PLATINUM_PLACEHOLDER);
    }
    applyTextStyle(transTextP);
    transRow.appendChild(transTextP);
    transRow.appendChild(makeCopyBtn(() => transTextP.textContent ?? ""));

    colTrans.appendChild(transRow);

    row.appendChild(colOrig);
    row.appendChild(colTrans);
    container.appendChild(row);

    // Fresh per-bubble translation state — replaces the previous bubble's state.
    // Old in-flight requests captured the OLD state object in their closure, so
    // they will always write to the old bubble's elements (or discard if already
    // shown a newer result).
    activeBubbleNFRef.current      = nfSpan;
    activeBubbleStateRef.current   = {
      segmentId: `seg-${++segmentSeqRef.current}`,
      isClosed: false,
      lastAppliedSeq: 0,
      transTextEl:  transTextP,
      transStableEl: transStable,
      transLiveEl: transLive,
      seq:          0,
      lastShownSeq:      0,
      lastShownLen:      0,
      finalizing:        false,
      translationLocked: false,
      streamCommittedSource: "",
      liveTranslationAbort:  null,
      lastLiveSource:        "",
      lastLiveSourceTs:      Date.now(),
      earlyHintSent:         false,
      lastPreviewWordsSent:  0,
      finalTokensSeen:       0,
      lastNfRawText:         "",
      lastConfirmedSource:   "",
      lastConfirmedSourceTranslated: "",
      lastRequestedLiveSource: "",
      lastRequestedLiveAtMs: 0,
      lastEmptyCellHintDispatchAtMs: 0,
      lastTruncationRetryHintAtMs: 0,
      pendingDisplayTranslation: "",
      hardFinalRequested: false,
      segmentSourceLang:     null,
      segmentTargetLang:     null,
    };
    const transcriptSegIsolation =
      segmentBoundaryGuardsRef.current || morsyUrgentTranscriptSegmentGuardsRef.current;
    if (activeBubbleStateRef.current && transcriptSegIsolation) {
      segmentStateByIdRef.current.set(activeBubbleStateRef.current.segmentId, activeBubbleStateRef.current);
    }
    styleUpgradedRef.current       = false;
    liveBufferRef.current          = "";

    return finalSpan;
  }, []);

  /** session_end = user pressed Stop (not silence timers — those are removed). */
  type SegmentCloseKind = "session_end" | "speaker_change";

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey/italic → bold) and dispatches a
  // final translation. isFinal=true bypasses the stabilization check.
  // Stops the polling interval FIRST so no in-flight poll requests can race
  // against the final fetch and overwrite the locked translation.
  const softFinalize = useCallback((closeKind: SegmentCloseKind = "session_end") => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    if (!activeBubbleRef.current) return;

    // Stop polling AND mark as finalizing synchronously, before the async
    // dispatch below. This ensures any poll fetch already in-flight will be
    // rejected by the post-fetch `finalizing` guard when it returns.
    stopTranslationInterval();
    // Speaker change: keep finalizing false so in-flight live responses can still paint this row
    // before the closing final request returns (hardFinalRequested stays off until final succeeds).
    if (activeBubbleStateRef.current && closeKind !== "speaker_change") {
      activeBubbleStateRef.current.finalizing = true;
    }

    let finalText: string;
    // Final transcript + final translate source: committed finals only (`activeBubbleRef` is the
    // final span; NF is a sibling — not read or merged here; avoids NF/revision shrink on boundary).
    finalText = (activeBubbleRef.current?.textContent ?? "").trim();

    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Original column: exact ASR mirror only — no phrase rewrites or “corrections” to similar wording.

    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }
    if (finalText.trim().length > 0) {
      liveBufferRef.current = finalText;
      const segId = activeBubbleStateRef.current?.segmentId;
      const map = adminSegmentRowIndexRef.current;
      let adminSnapshotLineIndex: number;
      if (segId && map.has(segId)) {
        adminSnapshotLineIndex = map.get(segId)!;
        transcriptBufRef.current[adminSnapshotLineIndex] = finalText;
        while (translationBufRef.current.length <= adminSnapshotLineIndex) {
          translationBufRef.current.push("");
        }
      } else {
        transcriptBufRef.current.push(finalText);
        translationBufRef.current.push("");
        adminSnapshotLineIndex = transcriptBufRef.current.length - 1;
        if (segId) map.set(segId, adminSnapshotLineIndex);
      }
      onAdminSnapshotBuffersUpdatedRef.current?.();
      // Final pass: on speaker_change, defer hardFinal until response so live in-flight is not dropped.
      dispatchTranslation(
        finalText,
        detectedLangRef.current,
        true,
        {
          lockOnFinal: true,
          suppressEarlyHardFinal: closeKind === "speaker_change",
          skipOpenAiLiveDebounce: true,
          adminSnapshotLineIndex,
        },
        segId,
      );
    }
  }, [dispatchTranslation, stopTranslationInterval, flushFinalTextRenderQueue, cancelOpenAiLiveDebounce]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  const finalizeLiveBubble = useCallback((closeKind: SegmentCloseKind = "session_end") => {
    if (!activeBubbleRef.current) return;
    softFinalize(closeKind);
  }, [softFinalize]);

  // Finalize and hard-close the active segment boundary so no later partial text
  // can continue writing into that finalized segment.
  const closeActiveSegmentBoundary = useCallback((closeKind: SegmentCloseKind = "session_end") => {
    flushFinalTextRenderQueue();
    if (!activeBubbleRef.current) return;
    recordSttSegmentClose(closeKind);
    finalizeLiveBubble(closeKind);
    activeBubbleStateRef.current?.liveTranslationAbort?.abort();
    const transcriptSegIsolationBoundary =
      segmentBoundaryGuardsRef.current || morsyUrgentTranscriptSegmentGuardsRef.current;
    if (activeBubbleStateRef.current && transcriptSegIsolationBoundary) {
      activeBubbleStateRef.current.isClosed = true;
    }
    if (experimentMorsyUrgentIntercallRef.current && activeBubbleStateRef.current?.segmentId) {
      intercallFinalizedSegmentIdsRef.current.push(activeBubbleStateRef.current.segmentId);
    }
    currentSpeakerRef.current = undefined;
    lastSpeakerSpeechTokenAtMsRef.current = 0;
    pendingSpeakerSwitchRef.current = null;
    activeBubbleRef.current   = null;
    activeBubbleNFRef.current = null;
    activeBubbleStateRef.current = null;
    styleUpgradedRef.current  = false;
  }, [finalizeLiveBubble, flushFinalTextRenderQueue]);

  // ── doClear ────────────────────────────────────────────────────────────────
  // Wipes all transcript/translation DOM content and resets every per-bubble
  // ref. Used by the exported `clear` (manual Clear button) and by the
  // inactivity / max-session auto-stop for non-admin users.
  const doClear = useCallback(() => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    stopTranslationInterval();
    if (transcriptScrollDiagEnabled()) {
      transcriptScrollDiagReset();
      transcriptScrollDiagInstallGlobalDumpHook();
    }
    activeBubbleStateRef.current?.liveTranslationAbort?.abort();
    segmentStateByIdRef.current.clear();
    activeBubbleStateRef.current   = null;
    currentSpeakerRef.current      = undefined;
    lastSpeakerSpeechTokenAtMsRef.current = 0;
    pendingSpeakerSwitchRef.current = null;
    activeBubbleRef.current        = null;
    activeBubbleNFRef.current      = null;
    styleUpgradedRef.current       = false;
    liveBufferRef.current          = "";
    finalCountRef.current          = 0;
    transcriptBufRef.current       = [];
    translationBufRef.current      = [];
    adminSegmentRowIndexRef.current.clear();
    intercallFinalizedSegmentIdsRef.current = [];
    translationDiagRef.current = {
      callCount: 0,
      estimatedTokensTotal: 0,
      perSegmentCalls: new Map(),
      callTimestampsMs: [],
      lastInputMeta: null,
      redundantCalls: 0,
    };
    if (containerRef.current) containerRef.current.innerHTML = "";
    setTailFollowPinnedUi(true);
    setHasTranscript(false);
    setTranslationServiceError(null);
    if (glossaryFlashTimerRef.current) {
      clearTimeout(glossaryFlashTimerRef.current);
      glossaryFlashTimerRef.current = null;
    }
    setGlossaryAppliedFlash(null);
    resetSpeakerMap();
  }, [stopTranslationInterval, flushFinalTextRenderQueue, cancelOpenAiLiveDebounce]);

  const stop = useCallback(async () => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    // Cancel all pending timers before finalizing.
    if (inactivityTimerRef.current !== null) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (maxSessionTimerRef.current !== null) {
      clearTimeout(maxSessionTimerRef.current);
      maxSessionTimerRef.current = null;
    }
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    stopTranslationInterval();
    finalizeLiveBubble();

    activeBubbleStateRef.current?.liveTranslationAbort?.abort();
    const transcriptSegIsolationStop =
      segmentBoundaryGuardsRef.current || morsyUrgentTranscriptSegmentGuardsRef.current;
    if (activeBubbleStateRef.current && transcriptSegIsolationStop) {
      activeBubbleStateRef.current.isClosed = true;
    }
    currentSpeakerRef.current     = undefined;
    lastSpeakerSpeechTokenAtMsRef.current = 0;
    pendingSpeakerSwitchRef.current = null;
    activeBubbleRef.current       = null;
    activeBubbleNFRef.current     = null;
    activeBubbleStateRef.current  = null;  // drop all in-flight translation closures
    finalCountRef.current         = 0;

    workletRef.current?.disconnect();
    workletRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* eof */ }
      wsRef.current.close();
      wsRef.current = null;
    }
    pcmBacklogRef.current = [];

    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    setMicLevel(0);

    if (sessionIdRef.current) {
      const wallSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const pcmSec = Math.floor(audioPcmSecondsRef.current);
      const durationSeconds = Math.max(0, Math.min(pcmSec, wallSec));
      try {
        await stopSessionMut.mutateAsync({
          data: {
            sessionId: sessionIdRef.current,
            durationSeconds,
          },
        });
      } catch { /* session stop error — silenced (HIPAA) */ }
      sessionIdRef.current = null;
      setSessionId(null);
    }

    const diag = translationDiagRef.current;
    const nowMs = Date.now();
    const sessionMinutes = Math.max(1 / 60, (nowMs - startTimeRef.current) / 60_000);
    const callsPerMinute = diag.callCount / sessionMinutes;
    const avgTokensPerRequest =
      diag.callCount > 0 ? diag.estimatedTokensTotal / diag.callCount : 0;
    const tokensPerMinute = diag.estimatedTokensTotal / sessionMinutes;
    const estimatedHourlyCost =
      (diag.estimatedTokensTotal * (OPENAI_INPUT_COST_PER_TOKEN + OPENAI_OUTPUT_COST_PER_TOKEN)) *
      (60 / sessionMinutes);
    const perSegment = [...diag.perSegmentCalls.entries()]
      .map(([segmentId, calls]) => `${segmentId}:${calls}`)
      .join(",");
    console.info(
      "[translation_diagnostic_summary]",
      `calls_total=${diag.callCount}`,
      `calls_per_min=${callsPerMinute.toFixed(2)}`,
      `avg_tokens_per_request=${avgTokensPerRequest.toFixed(1)}`,
      `tokens_per_min=${tokensPerMinute.toFixed(1)}`,
      `estimated_tokens_total=${diag.estimatedTokensTotal}`,
      `redundant_calls=${diag.redundantCalls}`,
      `estimated_cost_per_hour_usd=${estimatedHourlyCost.toFixed(4)}`,
      `calls_per_segment=${perSegment || "none"}`,
    );
    logSttPipelineReportConsole();
    translationDiagRef.current = {
      callCount: 0,
      estimatedTokensTotal: 0,
      perSegmentCalls: new Map(),
      callTimestampsMs: [],
      lastInputMeta: null,
      redundantCalls: 0,
    };
    // Clear snapshot accumulators — session is over.
    transcriptBufRef.current  = [];
    translationBufRef.current = [];
    adminSegmentRowIndexRef.current.clear();

    // Clear columns for regular users when they manually stop a session.
    if (!isAdminRef.current) doClear();
    setTranslationServiceError(null);
    onRecordingStoppedRef.current?.();
  }, [
    stopSessionMut,
    finalizeLiveBubble,
    stopTranslationInterval,
    doClear,
    flushFinalTextRenderQueue,
    cancelOpenAiLiveDebounce,
  ]);

  useEffect(() => {
    dailyLimitShutdownRef.current = (msg: string) => {
      if (dailyLimitAutoStopRef.current) return;
      dailyLimitAutoStopRef.current = true;
      setError(msg);
      void stop();
    };
  }, [stop]);

  /**
   * Lock segment translation direction once cumulative transcript evidence is stable enough.
   * Uses full {@link liveBufferRef} (final + NF, same as LIVE translate hint) — not only the
   * current WS frame — so EN↔Latin pairs do not freeze on a tiny early hypothesis.
   * Matches the spirit of {@link majoritySourceFromFirstWords}: wait until ~3 real words exist.
   */
  const tryLockSegmentDirectionFromTokens = useCallback((tokens: SonioxToken[]) => {
    const st = activeBubbleStateRef.current;
    if (!st || st.segmentSourceLang !== null) return;

    const evidenceText = collapseWs(liveBufferRef.current);
    if (countWords(evidenceText) < DIRECTION_LOCK_MIN_WORDS) return;
    if (evidenceText.length < DIRECTION_LOCK_MIN_CHARS) return;

    const first = tokens.find(
      t =>
        hasVisibleText(t.text) &&
        !isSonioxEndpointToken(t) &&
        t.language !== undefined &&
        t.language !== null &&
        String(t.language).trim() !== "",
    );
    if (!first?.language) return;
    const pair = langPairRef.current;
    const validated = validateLangByScript(first.language, evidenceText, pair);
    const snapped = snapSourceLanguageToPair(validated, first.language, evidenceText, pair);
    st.segmentSourceLang = snapped;
    st.segmentTargetLang = targetOppositeInPair(snapped, pair);
    if (liveDirectionTraceEnabled()) {
      liveDirectionTraceTryLock({
        seq: liveDirectionTraceNextSeq(),
        segmentId: st.segmentId,
        evidenceWords: countWords(evidenceText),
        evidenceChars: evidenceText.length,
        segmentSourceLang: snapped,
        segmentTargetLang: st.segmentTargetLang,
        firstTokenLang: String(first.language),
      });
    }
  }, []);

  // ── buildWs ───────────────────────────────────────────────────────────────
  // Soniox streaming: speaker boundaries use effectiveSpeakersForTokenBoundaries() to ignore
  // diarization flicker during fast bilingual turns (short A→B→A runs stay one segment).
  const buildWs = useCallback((apiKey: string): WebSocket => {
    const ws = new WebSocket(SONIOX_WS_URL);

    ws.onopen = () => {
      const pair = langPairRef.current;
      const base = (c: string) => (c || "en").split("-")[0]!.toLowerCase();
      const language_hints = [...new Set([base(pair.a), base(pair.b), "en"])].filter(Boolean);
      const interpreterCtx = buildSonioxInterpreterContext(pair);
      ws.send(JSON.stringify({
        api_key:                        apiKey,
        model:                          "stt-rt-v4",
        audio_format:                   "pcm_s16le",
        sample_rate:                    TARGET_RATE,
        num_channels:                   1,
        language_hints,
        context:                        interpreterCtx,
        enable_language_identification: true,
        enable_speaker_diarization:     true,
        enable_endpoint_detection:      true,
        max_endpoint_delay_ms:          800,
      }));
      const w = wsRef.current;
      if (w && w.readyState === WebSocket.OPEN) {
        for (const buf of pcmBacklogRef.current) w.send(buf);
        pcmBacklogRef.current = [];
      }
    };

    ws.onmessage = (evt: MessageEvent) => {
      if (!isRecRef.current) return;

      let msg: SonioxMessage;
      try { msg = JSON.parse(evt.data as string); } catch { return; }

      const errText =
        typeof msg.error_message === "string" && msg.error_message.trim()
          ? msg.error_message.trim()
          : typeof msg.error === "string" && msg.error.trim()
            ? msg.error.trim()
            : typeof msg.message === "string" && msg.message.trim()
              ? msg.message.trim()
              : null;
      const errCode = msg.error_code ?? msg.code;
      if (errText) {
        setError(errCode ? `${errText} (${errCode})` : errText);
        void stop();
        return;
      }
      if (msg.finished) { void stop(); return; }

      const tokens = msg.tokens ?? [];
      if (tokens.length === 0) return;

      transcriptWsTailHintRef.current = transcriptScrollerGluedBeforeGrowth(
        containerRef.current?.parentElement ?? null,
      );
      try {
      logSttDiagWsRaw(evt.data, tokens);

      const effSpk = effectiveSpeakersForTokenBoundaries(tokens);

      const sawSonioxEndpoint = tokens.some(t => t.is_final && isSonioxEndpointToken(t));

      // Intercall: cancel pending semantic-endpoint final if new audio/context arrived (still growing).
      if (
        experimentMorsyUrgentIntercallRef.current &&
        intercallEndpointGraceTimerRef.current !== null &&
        !sawSonioxEndpoint
      ) {
        clearTimeout(intercallEndpointGraceTimerRef.current);
        intercallEndpointGraceTimerRef.current = null;
      }

      resetInactivityRef.current?.();

      // ── FINAL tokens (exclude Soniox &lt;end&gt; marker from transcript + counts) ──
      const finals    = tokens.filter(t => t.is_final && !isSonioxEndpointToken(t));
      const newFinals = finals.slice(finalCountRef.current);
      const newFinalSet = new Set(newFinals);
      const useMorsyUrgentSpeakerGate = segmentBehaviorModeRef.current === "morsy-urgent-cbf";
      const nowMs = Date.now();
      const pendingSidAtStart = pendingSpeakerSwitchRef.current?.sid;
      let pendingSidSeenInMessage = false;
      let pendingSidCountedInMessage = false;
      let currentSpeakerSeenInMessage = false;
      const transcriptSegIsolationWs =
        segmentBoundaryGuardsRef.current || morsyUrgentTranscriptSegmentGuardsRef.current;

      // Per-token forward pivot using stabilized speaker ids (avoids spurious rows on fast code-switch).
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti]!;
        const sid = effSpk[ti];
        const tokenSuitable = !isSonioxEndpointToken(t) && hasVisibleText(t.text);
        let handledByPendingSwitchLogic = false;
        if (sid !== undefined) {
          if (
            activeBubbleRef.current &&
            tokenSuitable &&
            sameSpeaker(sid, currentSpeakerRef.current)
          ) {
            const lastTokenAt = lastSpeakerSpeechTokenAtMsRef.current;
            if (lastTokenAt > 0 && nowMs - lastTokenAt >= SAME_SPEAKER_PAUSE_SPLIT_MS) {
              // Same speaker resumed after a long silence: start a fresh segment.
              closeActiveSegmentBoundary("speaker_change");
              currentSpeakerRef.current = sid;
              activeBubbleRef.current = createBubble(sid);
              setHasTranscript(true);
            }
            lastSpeakerSpeechTokenAtMsRef.current = nowMs;
          }
          if (
            useMorsyUrgentSpeakerGate &&
            currentSpeakerRef.current !== undefined &&
            sameSpeaker(sid, currentSpeakerRef.current) &&
            tokenSuitable
          ) {
            currentSpeakerSeenInMessage = true;
          }
          if (!activeBubbleRef.current) {
            if (!useMorsyUrgentSpeakerGate || tokenSuitable) {
              currentSpeakerRef.current = sid;
              if (tokenSuitable) lastSpeakerSpeechTokenAtMsRef.current = nowMs;
              pendingSpeakerSwitchRef.current = null;
              activeBubbleRef.current = createBubble(sid);
              setHasTranscript(true);
            }
          } else if (!sameSpeaker(sid, currentSpeakerRef.current)) {
            if (useMorsyUrgentSpeakerGate) {
              if (tokenSuitable) {
                handledByPendingSwitchLogic = true;
                const pending = pendingSpeakerSwitchRef.current;
                if (!pending || pending.sid !== sid) {
                  pendingSpeakerSwitchRef.current = {
                    sid,
                    messageStreak: 1,
                    firstMs: nowMs,
                    bufferedFinalText: "",
                  };
                  pendingSidCountedInMessage = true;
                } else if (!pendingSidCountedInMessage) {
                  pending.messageStreak += 1;
                  pendingSidCountedInMessage = true;
                }
                if (pendingSpeakerSwitchRef.current?.sid === sid) {
                  pendingSidSeenInMessage = true;
                }
                if (t.is_final && newFinalSet.has(t)) {
                  const ps = pendingSpeakerSwitchRef.current;
                  if (ps && ps.sid === sid) ps.bufferedFinalText += t.text;
                }
                const confirm = pendingSpeakerSwitchRef.current;
                const speakerConfirmed =
                  !!confirm &&
                  confirm.sid === sid &&
                  (
                    confirm.messageStreak >= FAST_SWITCH_MIN_STREAK ||
                    (nowMs - confirm.firstMs >= FAST_SWITCH_MIN_AGE_MS && confirm.messageStreak >= 1)
                  );
                if (speakerConfirmed && tokenSuitable) {
                  closeActiveSegmentBoundary("speaker_change");
                  currentSpeakerRef.current = sid;
                  lastSpeakerSpeechTokenAtMsRef.current = nowMs;
                  activeBubbleRef.current = createBubble(sid);
                  setHasTranscript(true);
                  if (activeBubbleRef.current && confirm.bufferedFinalText) {
                    finalRenderQueueRef.current.push({
                      target: activeBubbleRef.current,
                      text: confirm.bufferedFinalText,
                      ...(transcriptSegIsolationWs && activeBubbleStateRef.current
                        ? { segmentId: activeBubbleStateRef.current.segmentId }
                        : {}),
                    });
                  }
                  pendingSpeakerSwitchRef.current = null;
                }
              }
            } else {
              closeActiveSegmentBoundary("speaker_change");
              currentSpeakerRef.current = sid;
              if (tokenSuitable) lastSpeakerSpeechTokenAtMsRef.current = nowMs;
              activeBubbleRef.current = createBubble(sid);
              setHasTranscript(true);
            }
          } else if (useMorsyUrgentSpeakerGate) {
            pendingSpeakerSwitchRef.current = null;
          }
        }
        if (!activeBubbleRef.current) continue;
        if (handledByPendingSwitchLogic) continue;
        if (isSonioxEndpointToken(t)) continue;
        if (t.is_final && newFinalSet.has(t)) {
          finalRenderQueueRef.current.push({
            target: activeBubbleRef.current,
            text: t.text,
            ...(transcriptSegIsolationWs && activeBubbleStateRef.current
              ? { segmentId: activeBubbleStateRef.current.segmentId }
              : {}),
          });
          if (activeBubbleStateRef.current) {
            activeBubbleStateRef.current.finalTokensSeen += 1;
          }
        }
      }
      if (useMorsyUrgentSpeakerGate) {
        if (pendingSidAtStart && !pendingSidSeenInMessage) {
          pendingSpeakerSwitchRef.current = null;
        }
        const pendingAfter = pendingSpeakerSwitchRef.current;
        if (
          pendingAfter &&
          pendingAfter.messageStreak < 3 &&
          currentSpeakerSeenInMessage &&
          activeBubbleRef.current
        ) {
          if (pendingAfter.bufferedFinalText) {
            finalRenderQueueRef.current.push({
              target: activeBubbleRef.current,
              text: pendingAfter.bufferedFinalText,
              ...(transcriptSegIsolationWs && activeBubbleStateRef.current
                ? { segmentId: activeBubbleStateRef.current.segmentId }
                : {}),
            });
          }
          pendingSpeakerSwitchRef.current = null;
        }
      }

      // Detect language from ANY token in this message — final OR non-final.
      // Checking NF tokens too is critical: Soniox often reports language on the
      // first NF chunk, well before any final tokens arrive. Using only finals
      // meant we started translation before the language was known.
      const langToken = tokens.find(t => t.language && !isSonioxEndpointToken(t));
      if (langToken?.language) {
        const allTokenText  = tokens.filter(t => !isSonioxEndpointToken(t)).map(t => t.text).join("");
        const validatedLang = validateLangByScript(
          langToken.language,
          allTokenText,
          langPairRef.current,
        );
        const prevDetected = detectedLangRef.current;
        detectedLangRef.current = validatedLang;
        if (liveDirectionTraceEnabled() && prevDetected !== validatedLang) {
          liveDirectionTraceWsLang({
            seq: liveDirectionTraceNextSeq(),
            segmentId: activeBubbleStateRef.current?.segmentId ?? null,
            sonioxTokenLang: String(langToken.language),
            validatedLang,
            prevDetectedLangRef: prevDetected,
          });
        }
      }

      scheduleFinalTextRenderFlush();

      finalCountRef.current = finals.length;

      // ── NF (non-final) — tail hypothesis for stabilized tail speaker only (matches pivot ids)
      let tailSpk: string | undefined;
      for (let i = effSpk.length - 1; i >= 0; i--) {
        if (effSpk[i]) {
          tailSpk = effSpk[i];
          break;
        }
      }
      let nfText = "";
      if (tailSpk !== undefined) {
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i]!;
          if (t.is_final || isSonioxEndpointToken(t)) continue;
          if (effSpk[i] !== tailSpk) continue;
          nfText += t.text;
        }
      } else {
        nfText = tokens.filter(t => !t.is_final && !isSonioxEndpointToken(t)).map(t => t.text).join("");
      }
      const nfEl = activeBubbleNFRef.current;
      let nfFullReplaceThisMsg = false;
      if (nfText) {
        const stNf = activeBubbleStateRef.current;
        if (nfEl && stNf) {
          const prev = stNf.lastNfRawText;
          if (nfText.startsWith(prev)) {
            const suffix = nfText.slice(prev.length);
            if (suffix) {
              nfEl.textContent = (nfEl.textContent ?? "") + suffix;
            }
            stNf.lastNfRawText = nfText;
          } else {
            // Revised hypothesis (not a strict extension of the last NF string).
            nfFullReplaceThisMsg = true;
            nfEl.textContent = nfText;
            stNf.lastNfRawText = nfText;
          }
        }
      } else if (nfEl) {
        const stNf = activeBubbleStateRef.current;
        nfEl.textContent = "";
        if (stNf) stNf.lastNfRawText = "";
      }

      // ── Update live translation buffer ────────────────────────────────────
      const finalText = (activeBubbleRef.current?.textContent ?? "") + getBufferedFinalTextForActiveBubble();
      const rawLive   = mergeFinalWithNonFinalHypothesis(finalText, nfText).trim();
      liveBufferRef.current = rawLive;
      const confirmedSource = finalText.trim();
      if (activeBubbleStateRef.current) {
        activeBubbleStateRef.current.lastConfirmedSource = confirmedSource;
      }
      if (activeBubbleStateRef.current) {
        if (liveBufferRef.current !== activeBubbleStateRef.current.lastLiveSource) {
          activeBubbleStateRef.current.lastLiveSource = liveBufferRef.current;
          activeBubbleStateRef.current.lastLiveSourceTs = Date.now();
        }
      }

      const joinedHypothesisFromTokens = tokens
        .filter(t => !isSonioxEndpointToken(t))
        .map(t => t.text)
        .join("");
      recordSttWsFrame({
        tokens,
        effSpk,
        joinedHypothesisFromTokens,
        detectedLangNow: detectedLangRef.current,
        liveBufferLen: liveBufferRef.current.length,
        nfFullReplace: nfFullReplaceThisMsg,
      });

      tryLockSegmentDirectionFromTokens(tokens);

      flushFinalTextRenderQueue();

      // Word-step live preview (not every Soniox frame): steadier than full mirror.
      const st = activeBubbleStateRef.current;
      const hintSource = liveBufferRef.current.trim();
      const wordsNow = countWords(hintSource);
      if (
        st &&
        !st.translationLocked &&
        !st.finalizing &&
        !(segmentBoundaryGuardsRef.current && st.isClosed) &&
        st.finalTokensSeen >= 2 &&
        hintSource.length >= 20 &&
        wordsNow >= EARLY_HINT_MIN_WORDS &&
        (!st.earlyHintSent || wordsNow - st.lastPreviewWordsSent >= LIVE_PREVIEW_WORD_STEP)
      ) {
        const lang = st.segmentSourceLang ?? detectedLangRef.current;
        scheduleDebouncedLiveTranslation(hintSource, lang, st.segmentId);
        st.earlyHintSent = true;
        st.lastPreviewWordsSent = wordsNow;
      }

      // Soniox semantic endpoint: &lt;end&gt; triggers a full final translate pass (same bubble; speaker_id unchanged).
      if (sawSonioxEndpoint) {
        const semanticEndpointFinalizeForSegment = (stEnd: BubbleTransState, srcEnd: string): void => {
          if (!srcEnd || stEnd.translationLocked) return;
          const map = adminSegmentRowIndexRef.current;
          const seg = stEnd.segmentId;
          let adminSnapshotLineIndex: number | undefined;
          if (map.has(seg)) {
            const idx = map.get(seg)!;
            if (idx >= 0 && idx < transcriptBufRef.current.length) {
              transcriptBufRef.current[idx] = srcEnd;
              adminSnapshotLineIndex = idx;
            } else {
              map.delete(seg);
            }
          }
          if (adminSnapshotLineIndex === undefined) {
            transcriptBufRef.current.push(srcEnd);
            translationBufRef.current.push("");
            adminSnapshotLineIndex = transcriptBufRef.current.length - 1;
            map.set(seg, adminSnapshotLineIndex);
            onAdminSnapshotBuffersUpdatedRef.current?.();
          }
          dispatchTranslation(
            srcEnd,
            detectedLangRef.current,
            true,
            {
              lockOnFinal: false,
              suppressEarlyHardFinal: true,
              skipOpenAiLiveDebounce: true,
              adminSnapshotLineIndex,
            },
            stEnd.segmentId,
          );
        };

        const runSemanticEndpointFinalize = (): void => {
          const stEnd = activeBubbleStateRef.current;
          const srcEnd = liveBufferRef.current.trim();
          if (!stEnd || !srcEnd || stEnd.translationLocked) return;
          semanticEndpointFinalizeForSegment(stEnd, srcEnd);
        };

        if (experimentMorsyUrgentIntercallRef.current) {
          const stCap = activeBubbleStateRef.current;
          const segForGrace = stCap?.segmentId;
          const srcSnap = liveBufferRef.current.trim();
          if (segForGrace && stCap && srcSnap && !stCap.translationLocked) {
            if (intercallEndpointGraceTimerRef.current !== null) {
              clearTimeout(intercallEndpointGraceTimerRef.current);
            }
            intercallEndpointGraceTimerRef.current = setTimeout(() => {
              intercallEndpointGraceTimerRef.current = null;
              flushFinalTextRenderQueue();
              const stNow = activeBubbleStateRef.current;
              if (!stNow || stNow.segmentId !== segForGrace || stNow.translationLocked) return;
              const srcEnd = liveBufferRef.current.trim();
              if (!srcEnd) return;
              semanticEndpointFinalizeForSegment(stNow, srcEnd);
            }, INTERCALL_ENDPOINT_FINALIZE_GRACE_MS);
          }
        } else {
          runSemanticEndpointFinalize();
        }
      }

      if (sttClientDiagEnabled()) {
        const joined = tokens.filter(t => !isSonioxEndpointToken(t)).map(t => t.text).join("");
        if (/\d/.test(joined)) {
          const fin = activeBubbleRef.current;
          const st = activeBubbleStateRef.current;
          console.info("[stt_diag_ui_after]", {
            joinedTokensFromMsg: joined,
            finalsInMsg: tokens.filter(t => t.is_final && !isSonioxEndpointToken(t)).map(t => t.text).join(""),
            nfInMsg: tokens.filter(t => !t.is_final && !isSonioxEndpointToken(t)).map(t => t.text).join(""),
            dom_orig_paragraph: fin?.parentElement?.textContent?.trim() ?? "",
            dom_finalSpan: fin?.textContent?.trim() ?? "",
            dom_nfSpan: activeBubbleNFRef.current?.textContent?.trim() ?? "",
            liveBufferRef: liveBufferRef.current,
            renderQueueLength: finalRenderQueueRef.current.length,
            finalCountRef: finalCountRef.current,
            translationCell: st?.transTextEl?.textContent?.trim() ?? "",
          });
        }
      }
      } finally {
        transcriptWsTailHintRef.current = null;
      }
    };

    ws.onerror = () => { setError("WebSocket error"); void stop(); };

    ws.onclose = (e) => {
      if (isRecRef.current && e.code !== 1000) {
        setError(`Connection closed (${e.code})`);
        void stop();
      }
    };

    return ws;
  }, [
    stop,
    closeActiveSegmentBoundary,
    createBubble,
    scrollPanel,
    scheduleFinalTextRenderFlush,
    getBufferedFinalTextForActiveBubble,
    flushFinalTextRenderQueue,
    tryLockSegmentDirectionFromTokens,
    scheduleDebouncedLiveTranslation,
  ]);

  // ── start ─────────────────────────────────────────────────────────────────
  // Pass providedStream to skip getUserMedia (e.g. for tab audio captured via
  // getDisplayMedia in the UI layer). All audio processing is identical.
  const start = useCallback(async (deviceId: string, providedStream?: MediaStream) => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setStartBusy(true);
    dailyLimitAutoStopRef.current = false;
    let sessionStartPromise: ReturnType<typeof startSessionMut.mutateAsync> | undefined;
    try {
      setError(null);
      setTranslationServiceError(null);
      setAudioInfo("");
      currentSpeakerRef.current      = undefined;
      pendingSpeakerSwitchRef.current = null;
      activeBubbleRef.current        = null;
      activeBubbleNFRef.current      = null;
      activeBubbleStateRef.current   = null;
      styleUpgradedRef.current       = false;
      liveBufferRef.current          = "";
      finalCountRef.current          = 0;
      detectedLangRef.current        = "en";
      resetSpeakerMap();
      pcmBacklogRef.current          = [];
      intercallFinalizedSegmentIdsRef.current = [];

      resetSttPipelineInstrumentationSession();
      liveBlankTraceSessionReset();
      liveDirectionTraceSessionReset();

      if (transcriptScrollDiagEnabled()) {
        transcriptScrollDiagReset();
        transcriptScrollDiagInstallGlobalDumpHook();
      }

      // Run in parallel for lower latency; if one fails, still await the session
      // promise in `catch` so we can close a DB row that may have been created first.
      sessionStartPromise = startSessionMut.mutateAsync({
        data: {
          srcLang: langPairRef.current.a,
          tgtLang: langPairRef.current.b,
        },
      });
      const [tokenRes, sessionRes] = await Promise.all([
        getTokenMut.mutateAsync(undefined as any),
        sessionStartPromise,
      ]);
      sessionIdRef.current = sessionRes.sessionId;
      setSessionId(sessionRes.sessionId);
      transcriptBufRef.current  = [];
      translationBufRef.current = [];
      adminSegmentRowIndexRef.current.clear();
      startTimeRef.current = Date.now();
      audioPcmSecondsRef.current = 0;

      // ── Session heartbeat ─────────────────────────────────────────────────
      // Ping every 30 s so the server knows the session is still alive.
      // Without this, a page refresh leaves the session open and the next
      // Start press gets a false 409 until the 60 s stale window expires.
      const sendHeartbeat = () => {
        const sid = sessionIdRef.current;
        if (!sid) return;
        void fetch("/api/transcription/session/heartbeat", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body:        JSON.stringify({
            sessionId: sid,
            audioSecondsProcessed: Math.floor(audioPcmSecondsRef.current),
          }),
        })
          .then(async (res) => {
            if (!res.ok) return;
            let payload: unknown;
            try {
              payload = await res.json();
            } catch {
              return;
            }
            if (!payload || typeof payload !== "object") return;
            const o = payload as { dailyLimitReached?: unknown; sessionEnded?: unknown };
            if (o.dailyLimitReached === true && o.sessionEnded === true) {
              dailyLimitShutdownRef.current(DAILY_LIMIT_STOP_MESSAGE);
            }
          })
          .catch(() => { /* best-effort — ignore network errors */ });
      };
      const HEARTBEAT_MS = 10_000;
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
      sendHeartbeat();

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") await ctx.resume();

      setAudioInfo(`${ctx.sampleRate} Hz → ${TARGET_RATE} Hz`);

      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-processor.js`);

      // ── Audio source isolation ────────────────────────────────────────────
      // Tab Audio mode: providedStream is the tab-only MediaStream captured by
      //   getDisplayMedia() in the workspace UI. getUserMedia (microphone) is
      //   never called — the short-circuit `??` ensures that.
      // Mic mode: providedStream is undefined, so getUserMedia is called with
      //   the selected device ID and mic-optimised constraints.
      // These two paths are mutually exclusive by design.
      const stream = providedStream !== null && providedStream !== undefined
        ? providedStream
        : await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              echoCancellation:  false,
              noiseSuppression:  false,
              autoGainControl:   false,
              channelCount:      1,
            },
          });
      streamsRef.current.push(stream);

      const ws = buildWs(tokenRes.apiKey);
      wsRef.current = ws;

      const audioSource = ctx.createMediaStreamSource(stream);
      const analyser    = ctx.createAnalyser();
      analyser.fftSize  = 256;
      audioSource.connect(analyser);

      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { targetRate: TARGET_RATE },
      });
      workletRef.current = worklet;
      analyser.connect(worklet);
      worklet.connect(ctx.destination);

      worklet.port.onmessage = (e) => {
        const raw = e.data as ArrayBuffer;
        const w = wsRef.current;
        if (w?.readyState === WebSocket.OPEN) {
          w.send(raw);
        } else {
          pcmBacklogRef.current.push(raw.slice(0));
          if (pcmBacklogRef.current.length > 200) {
            pcmBacklogRef.current.splice(0, pcmBacklogRef.current.length - 200);
          }
        }
        const samples = new Int16Array(raw);
        audioPcmSecondsRef.current += samples.length / TARGET_RATE;
        const capRow = dailyCapRef?.current;
        if (
          capRow &&
          Number.isFinite(capRow.dailyLimitMinutes) &&
          capRow.dailyLimitMinutes > 0 &&
          capRow.dailyLimitMinutes < UNLIMITED_DAILY_CAP_MINUTES &&
          !dailyLimitAutoStopRef.current
        ) {
          const used = Number(capRow.minutesUsedToday);
          const pcmMin = audioPcmSecondsRef.current / 60;
          if (used + pcmMin + 1e-6 >= capRow.dailyLimitMinutes) {
            queueMicrotask(() => {
              dailyLimitShutdownRef.current(DAILY_LIMIT_STOP_MESSAGE);
            });
          }
        }
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / (samples.length || 1)) * 500));
      };

      setTailFollowPinnedUi(true);
      isRecRef.current = true;
      setIsRecording(true);

      // ── 5-minute inactivity auto-stop ────────────────────────────────────
      // Reset every time a speech token arrives (see buildWs onmessage handler).
      const scheduleInactivity = () => {
        if (inactivityTimerRef.current !== null) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
          inactivityTimerRef.current = null;
          setError("Session stopped due to inactivity.");
          void stop();
          // Clear columns for regular users only on inactivity auto-stop.
          // Admin keeps their transcript until they manually press Clear.
          if (!isAdminRef.current) doClear();
        }, INACTIVITY_TIMEOUT_MS);
      };
      resetInactivityRef.current = scheduleInactivity;
      scheduleInactivity();

      // ── 3-hour max session auto-stop ─────────────────────────────────────
      maxSessionTimerRef.current = setTimeout(() => {
        maxSessionTimerRef.current = null;
        setError("Session time limit reached (3 hours). Please start a new session.");
        void stop();
        if (!isAdminRef.current) doClear();
      }, MAX_SESSION_MS);

    } catch (err: unknown) {
      let orphanSessionId: number | null = null;
      if (sessionStartPromise) {
        try {
          const sr = await sessionStartPromise;
          orphanSessionId = sr.sessionId;
        } catch {
          /* session start failed */
        }
      }

      const errCode = getTranscriptionTokenFailureCode(err);
      let msg =
        getApiErrorMessage(err) ??
        (err instanceof Error ? err.message : "Failed to start transcription");
      if (errCode === "TRANSCRIPTION_NOT_CONFIGURED") {
        msg =
          "Live transcription is off: the server is missing SONIOX_API_KEY. Add it in Railway (or .env for local API), then redeploy.";
      } else if (errCode === "FEEDBACK_REQUIRED") {
        msg = "Daily feedback is required before you can start another session.";
      } else if (errCode === "DAILY_LIMIT_REACHED") {
        msg =
          getApiErrorMessage(err) ??
          "You have used all of your allowed minutes for today. Please try again tomorrow.";
      }
      // Error object intentionally not logged to console (HIPAA)
      setError(msg);
      // If the session was created in the DB before the failure, close it
      // explicitly. stop() returns early when isRecRef is false, so this
      // ghost-session cleanup must happen here to prevent the next start()
      // from getting a stale open session. `orphanSessionId` covers parallel
      // token+session where the session won the race before the other failed.
      const ghostId = sessionIdRef.current ?? orphanSessionId;
      if (ghostId != null) {
        const wallSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const pcmSec = Math.floor(audioPcmSecondsRef.current);
        const durationSeconds = Math.max(0, Math.min(pcmSec, wallSec));
        try {
          await stopSessionMut.mutateAsync({
            data: { sessionId: ghostId, durationSeconds },
          });
        } catch { /* ignore — server will auto-close on next start */ }
        sessionIdRef.current = null;
        setSessionId(null);
      }
      void stop();
    } finally {
      startInFlightRef.current = false;
      setStartBusy(false);
    }
  }, [getTokenMut, startSessionMut, stopSessionMut, buildWs, stop]);

  // ── setLangPair ────────────────────────────────────────────────────────────
  // Called by workspace whenever the user changes either language selector.
  // Per-segment target is resolved at dispatchTranslation time: if Soniox
  // detected language matches B → translate to A, otherwise → translate to B.
  const setLangPair = useCallback((a: string, b: string) => {
    langPairRef.current = { a, b };
  }, []);

  // ── getSnapshot ────────────────────────────────────────────────────────────
  // Returns accumulated finalized transcript/translation for admin snapshots.
  // Parallel arrays are padded to equal length so each segment stays paired.
  const getSnapshot = useCallback((): {
    transcript: string;
    translation: string;
    transcriptLines: string[];
    translationLines: string[];
  } => {
    const src = [...transcriptBufRef.current];
    const tgt = [...translationBufRef.current];
    const n = Math.max(src.length, tgt.length);
    while (src.length < n) src.push("");
    while (tgt.length < n) tgt.push("");
    return {
      transcript: src.join("\n"),
      translation: tgt.join("\n"),
      transcriptLines: src,
      translationLines: tgt,
    };
  }, []);

  /** Billable audio minutes in the current open session (PCM sent ÷ 60). Server `minutesUsedToday` excludes until stop. */
  const getApproxBillableMinutesThisSession = useCallback(
    () => audioPcmSecondsRef.current / 60,
    [],
  );

  return {
    isRecording,
    audioInfo,
    micLevel,
    error,
    translationServiceError,
    hasTranscript,
    sessionId,
    containerRef,
    tailFollowPinned: tailFollowPinnedUi,
    jumpTailFollow,
    start,
    stop,
    setLangPair,
    getSnapshot,
    getApproxBillableMinutesThisSession,
    clear: doClear,
    isStarting:
      startBusy || getTokenMut.isPending || startSessionMut.isPending,
    glossaryAppliedFlash,
  };
}
