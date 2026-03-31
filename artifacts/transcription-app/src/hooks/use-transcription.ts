import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE         = 16000;
const SONIOX_WS_URL       = "wss://stt-rt.soniox.com/transcribe-websocket";
// How long the transcript text must be stable (no new tokens) before a live
// translation is dispatched. Keeps the translation column from updating on
// every single token; retranslates the full segment after each pause.
const TRANSLATION_DEBOUNCE_MS = 275;
// A new translation is accepted during live speech only if it is at least
// this much longer than the last shown translation (prevents constant rewrites).
const STABILIZE_RATIO     = 1.15;
// How long a gap in incoming tokens (ms) triggers automatic segment finalization.
// Set to 1200 ms (~1.2 s) — long enough to avoid splitting mid-word pauses
// but short enough that natural sentence-end pauses close the segment cleanly.
const SILENCE_TIMEOUT_MS  = 1200;

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

// ── SVG icon strings ──────────────────────────────────────────────────────────
const COPY_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" ` +
  `fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
  `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>` +
  `<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const CHECK_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" ` +
  `fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
  `<polyline points="20 6 9 17 4 12"/></svg>`;

// ── DOM class names ────────────────────────────────────────────────────────────
const CLS = {
  row:         "group relative grid grid-cols-2 gap-6 mb-3 rounded-lg hover:bg-muted/20 px-2 py-1.5 -mx-2 transition-colors",
  colOrig:     "min-w-0",
  colTrans:    "min-w-0",
  textRow:     "flex items-start gap-1",
  // font-size is controlled via --ts-font-size CSS variable (set by workspace)
  textLive:    "ts-text leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0",
  textFin:     "ts-text leading-relaxed text-foreground font-medium flex-1 min-w-0",
  nf:          "text-muted-foreground/45 italic",
  transText:   "ts-text leading-relaxed text-foreground/80 font-medium flex-1 min-w-0",
  transPend:   "ts-text text-muted-foreground/30 italic flex-1 min-w-0",
  copyIcon:    "shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-all cursor-pointer",
  copyIconDis: "shrink-0 mt-0.5 p-0.5 rounded text-muted-foreground/20 opacity-0 group-hover:opacity-30 cursor-not-allowed transition-opacity",
} as const;

// ── Soniox v4 types ────────────────────────────────────────────────────────────
interface SonioxToken {
  text:      string;
  is_final:  boolean;
  speaker?:  number;
  language?: string;
}

interface SonioxMessage {
  tokens?:   SonioxToken[];
  finished?: boolean;
  error?:    string;
  code?:     number;
  message?:  string;
}

// ── Speaker normalization (temporal-LRU pool) ──────────────────────────────────
const _speakerMap  = new Map<number, number>();
const _slotLastMs  = new Map<number, number>();
let   _slotCount   = 0;

function resetSpeakerMap() { _speakerMap.clear(); _slotLastMs.clear(); _slotCount = 0; }

function normalizeSpeaker(rawId: number | undefined): { label: string; slot: number } {
  if (rawId === undefined) return { label: "", slot: 0 };
  if (_speakerMap.has(rawId)) {
    const slot = _speakerMap.get(rawId)!;
    _slotLastMs.set(slot, Date.now());
    return { label: `Speaker ${slot}`, slot };
  }
  if (_slotCount < MAX_SPEAKERS) {
    _slotCount++;
    _speakerMap.set(rawId, _slotCount);
    _slotLastMs.set(_slotCount, Date.now());
    return { label: `Speaker ${_slotCount}`, slot: _slotCount };
  }
  let lruSlot = 1, lruMs = _slotLastMs.get(1) ?? 0;
  for (let s = 2; s <= _slotCount; s++) {
    const t = _slotLastMs.get(s) ?? 0;
    if (t < lruMs) { lruMs = t; lruSlot = s; }
  }
  _speakerMap.set(rawId, lruSlot);
  _slotLastMs.set(lruSlot, Date.now());
  return { label: `Speaker ${lruSlot}`, slot: lruSlot };
}

// ── Language-pair helpers ──────────────────────────────────────────────────────
// Compare two BCP-47 codes loosely (e.g. "zh-CN" matches "zh").
function matchesLang(detected: string, selected: string): boolean {
  const d = detected.toLowerCase();
  const s = selected.toLowerCase();
  return d === s || d.split("-")[0] === s.split("-")[0];
}

// Given a detected language code and the selected {a, b} pair, return the
// target language code so translation always goes to the OPPOSITE language:
//   detected = Language A  →  target = Language B
//   detected = Language B  →  target = Language A
//   detected = neither     →  target = Language B (third-language passthrough
//                              handled upstream before this is ever called)
function resolveTarget(detectedLang: string, pair: { a: string; b: string }): string {
  return matchesLang(detectedLang, pair.b) ? pair.a : pair.b;
}

// ── Duplicate-segment detection helper ─────────────────────────────────────────
// Returns true when `candidate` is a suffix of `text` (after normalizing
// whitespace and stripping punctuation). Used to discard segments that Soniox
// re-emits from the tail of the previous segment.
function isTextSuffix(text: string, candidate: string): boolean {
  if (!candidate || !text) return false;
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[.,!?;:'"()\-]/g, "").replace(/\s+/g, " ").trim();
  const normText = normalize(text);
  const normCand = normalize(candidate);
  // Only suppress if the candidate is non-trivially long and fully contained
  // as a trailing run in the previous segment.
  return normCand.length >= 4 && normText.endsWith(normCand);
}

// ── Translation fetch ──────────────────────────────────────────────────────────
// sourceLang: BCP-47 code auto-detected by Soniox (e.g. "en", "ar", "fr").
// targetLang: BCP-47 code resolved from the language pair (always the opposite).
async function fetchTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  context?: readonly string[],
): Promise<string> {
  const body: Record<string, unknown> = { text, sourceLang, targetLang };
  if (context && context.length > 0) body.context = context;
  const r = await fetch("/api/transcription/translate", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify(body),
  });
  if (!r.ok) return "";
  const d = await r.json() as { translation?: string };
  return d.translation?.trim() ?? "";
}

// ── DOM helpers ────────────────────────────────────────────────────────────────
function enableCopyBtn(btn: HTMLButtonElement, getText: () => string) {
  btn.className = CLS.copyIcon;
  btn.disabled  = false;
  btn.onclick   = () => {
    void navigator.clipboard.writeText(getText());
    btn.innerHTML       = CHECK_SVG;
    btn.style.color     = "var(--color-green-500, #22c55e)";
    setTimeout(() => { btn.innerHTML = COPY_SVG; btn.style.color = ""; }, 1500);
  };
}

function makeCopyButton(enabled: boolean, getTextFn: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.innerHTML = COPY_SVG;
  if (enabled) {
    enableCopyBtn(btn, getTextFn);
  } else {
    btn.className = CLS.copyIconDis;
    btn.disabled  = true;
  }
  return btn;
}

// Apply inline font-size/line-height that inherit the CSS variables set by workspace.
function applyTextStyle(el: HTMLElement) {
  el.style.fontSize   = "var(--ts-font-size, 14px)";
  el.style.lineHeight = "var(--ts-line-height, 1.625)";
}

// ── Per-bubble translation state ───────────────────────────────────────────────
// Each segment gets its own isolated state object. dispatchTranslation closures
// capture the state object at the time of dispatch, so in-flight requests from
// a previous segment can NEVER write into a later segment's DOM element.
interface BubbleTransState {
  transTextEl:       HTMLParagraphElement;
  copyTransBtn:      HTMLButtonElement;
  seq:               number;   // incremented on every dispatch FOR THIS bubble
  lastShownSeq:      number;   // highest seq whose result was written to DOM
  lastShownLen:      number;   // char length of last shown translation (for stabilization)
  finalizing:        boolean;  // true once softFinalize has been called — blocks in-flight polls
  translationLocked: boolean;  // true after first finalized translation — no further updates
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording,   setIsRecording]   = useState(false);
  const [micLevel,      setMicLevel]      = useState(0);
  const [error,         setError]         = useState<string | null>(null);
  const [audioInfo,     setAudioInfo]     = useState<string>("");
  const [hasTranscript, setHasTranscript] = useState(false);

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Direct-to-DOM transcript refs ─────────────────────────────────────────
  const containerRef      = useRef<HTMLDivElement | null>(null);
  const currentSpeakerRef = useRef<number | undefined>(undefined);
  const activeBubbleRef   = useRef<HTMLSpanElement | null>(null);  // final-text span
  const activeBubbleNFRef = useRef<HTMLSpanElement | null>(null);  // NF span
  const finalCountRef     = useRef(0);
  const detectedLangRef   = useRef<string>("en");
  // The user's selected language pair {a, b}. Per-segment target is computed
  // dynamically: if detected matches b → translate to a; otherwise translate to b.
  const langPairRef       = useRef<{ a: string; b: string }>({ a: "en", b: "ar" });
  const styleUpgradedRef  = useRef(false);

  // ── Per-bubble translation state ───────────────────────────────────────────
  // Each call to createBubble creates a fresh BubbleTransState. Closures in
  // dispatchTranslation capture it — so old bubbles' in-flight requests stay
  // bound to their own element and can never bleed into a new bubble.
  const activeBubbleStateRef = useRef<BubbleTransState | null>(null);

  // ── Translation debounce refs ──────────────────────────────────────────────
  // liveBufferRef: segment text seen so far (finals + NF). Updated every onmessage.
  const liveBufferRef        = useRef<string>("");
  // lastTranslatedBuffer: text last SENT to the API. Debounce skips if unchanged.
  const lastTranslatedBuffer = useRef<string>("");
  // Pending debounce timer — reset on every token arrival, fires after silence.
  const translationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Rolling context window: source texts of the last 2 finalized segments.
  // Sent with every translate request so the model maintains sentence flow.
  const recentSegmentsRef = useRef<string[]>([]);
  // Once the first language is detected for a segment, this flag locks it so
  // Soniox re-detections mid-segment cannot flip the translation decision.
  const segmentLangLockedRef = useRef<boolean>(false);
  // Full text of the last finalized segment. Used to detect duplicate segments
  // caused by Soniox re-emitting tail words of a segment as a new segment.
  const lastSegmentTextRef = useRef<string>("");

  // ── Silence / pause detection ──────────────────────────────────────────────
  // Reset every time tokens arrive. Fires softFinalize() + bubble reset after
  // SILENCE_TIMEOUT_MS of no Soniox activity so segments close at natural pauses.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── scrollPanel ────────────────────────────────────────────────────────────
  const scrollPanel = useCallback((force = false) => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (force) { el.scrollTop = el.scrollHeight; return; }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // ── dispatchTranslation ────────────────────────────────────────────────────
  // Fires a translation request for the active bubble's text.
  //
  // Isolation: captures `state` (per-bubble object) at call time — old requests
  //   always write to the correct bubble's DOM element even after speaker switch.
  //
  // Monotonic gate (per-bubble): a result is accepted only if its seq number
  //   is greater than the last seq already shown FOR THIS BUBBLE. This handles
  //   out-of-order arrivals while still showing every result in order.
  //
  // Stabilization: during live speech (isFinal=false), skip a result if the
  //   translation is not significantly longer than the previous one. This
  //   prevents the translation column from constantly rewriting small changes.
  //   When a segment finalizes (isFinal=true), always show the result.
  const dispatchTranslation = useCallback((text: string, lang: string, isFinal = false) => {
    const state = activeBubbleStateRef.current;
    if (!state || text.length < 3) return;

    // Lock guard: once a finalized translation has been written for this
    // segment, never overwrite it — not from polling, not from re-finalization.
    if (state.translationLocked) return;

    lastTranslatedBuffer.current = text;

    const { transTextEl, copyTransBtn } = state;

    // ── Language-pair enforcement ─────────────────────────────────────────────
    // Only call the translation API when the detected language is one of the two
    // selected languages. If it's a third language (e.g. Spanish when the pair
    // is English ↔ Arabic), copy the original transcript text verbatim into the
    // translation column so the interpreter can still read what was said.
    const pair = langPairRef.current;
    if (!matchesLang(lang, pair.a) && !matchesLang(lang, pair.b)) {
      // Passthrough: write source text directly — skip stabilization check on
      // the first result, apply it on subsequent live updates to avoid flicker.
      if (isFinal || state.lastShownLen === 0 || text.length >= state.lastShownLen * STABILIZE_RATIO) {
        const isAr = /[\u0600-\u06FF]/.test(text);
        transTextEl.dir             = isAr ? "rtl" : "ltr";
        transTextEl.style.textAlign = isAr ? "right" : "";
        if (isAr) {
          transTextEl.lang      = "ar";
          transTextEl.className = CLS.transText + " ts-arabic";
        } else {
          transTextEl.removeAttribute("lang");
          transTextEl.className = CLS.transText;
        }
        transTextEl.textContent = text;
        state.lastShownLen = text.length;
        if (isFinal) state.translationLocked = true;
        if (copyTransBtn.disabled) {
          enableCopyBtn(copyTransBtn, () => transTextEl.textContent?.trim() ?? "");
        }
        scrollPanel();
      }
      return;
    }

    state.seq += 1;
    const mySeq = state.seq;

    // Resolve target: always the opposite of the detected source language.
    //   detected = pair.a → target = pair.b
    //   detected = pair.b → target = pair.a
    let myTargetLang = resolveTarget(lang, pair);

    // Same-language guard: if the resolved target equals the detected source
    // (can happen when the pair is identical on both sides, or from a BCP-47
    // mismatch edge case), flip to the other pair language so we never call
    // the translation API with source === target.
    if (matchesLang(lang, myTargetLang)) {
      myTargetLang = matchesLang(lang, pair.a) ? pair.b : pair.a;
    }

    // Additional safety: if source and target are STILL identical after the
    // flip (only possible when pair.a === pair.b, which the UI should prevent),
    // bail out and show the original text as a passthrough instead of wasting
    // an API call on an identity translation.
    if (matchesLang(lang, myTargetLang)) {
      if (isFinal || state.lastShownLen === 0 || text.length >= state.lastShownLen * STABILIZE_RATIO) {
        const isAr = /[\u0600-\u06FF]/.test(text);
        transTextEl.dir             = isAr ? "rtl" : "ltr";
        transTextEl.style.textAlign = isAr ? "right" : "";
        if (isAr) { transTextEl.lang = "ar"; transTextEl.className = CLS.transText + " ts-arabic"; }
        else { transTextEl.removeAttribute("lang"); transTextEl.className = CLS.transText; }
        transTextEl.textContent = text;
        state.lastShownLen = text.length;
        if (isFinal) state.translationLocked = true;
        if (copyTransBtn.disabled) enableCopyBtn(copyTransBtn, () => transTextEl.textContent?.trim() ?? "");
        scrollPanel();
      }
      return;
    }

    void (async () => {
      try {
        const translated = await fetchTranslation(text, lang, myTargetLang, recentSegmentsRef.current);

        // Out-of-order gate: a newer result for THIS bubble already arrived.
        if (mySeq <= state.lastShownSeq) return;
        // DOM no longer connected (bubble was cleared).
        if (!translated || !transTextEl.isConnected) return;
        // Re-check lock after the async round-trip. Another in-flight request
        // may have already written + locked this segment while we were waiting.
        // This is the critical guard that prevents the overwrite race.
        if (state.translationLocked) return;
        // Block any poll (isFinal=false) request that was already in-flight when
        // softFinalize was called. The finalizing flag is set synchronously before
        // the final dispatch, so all earlier poll fetches are rejected here.
        if (!isFinal && state.finalizing) return;

        // Stabilization: only update if final, first result, or meaningfully longer.
        if (!isFinal && state.lastShownLen > 0 && translated.length < state.lastShownLen * STABILIZE_RATIO) return;

        state.lastShownSeq = mySeq;
        state.lastShownLen = translated.length;

        const isArabic = /[\u0600-\u06FF]/.test(translated);
        transTextEl.dir             = isArabic ? "rtl" : "ltr";
        transTextEl.style.textAlign = isArabic ? "right" : "";
        if (isArabic) {
          transTextEl.lang      = "ar";
          transTextEl.className = CLS.transText + " ts-arabic";
        } else {
          transTextEl.removeAttribute("lang");
          transTextEl.className = CLS.transText;
        }
        transTextEl.textContent = translated;

        // Lock: after a finalized translation is written, no further update
        // may overwrite it. The next speech creates a brand-new segment.
        if (isFinal) state.translationLocked = true;

        if (copyTransBtn.disabled) {
          enableCopyBtn(copyTransBtn, () => transTextEl.textContent?.trim() ?? "");
        }
        scrollPanel();
      } catch (e) {
        console.warn("[translate]", e instanceof Error ? e.message : e);
      }
    })();
  }, [scrollPanel]);

  // ── scheduleTranslation ───────────────────────────────────────────────────
  // Debounced translation trigger. Called every time liveBufferRef updates.
  // Resets the timer on each call so translation only fires after the transcript
  // has been stable for TRANSLATION_DEBOUNCE_MS — ensuring the full segment
  // (including the last words) is sent rather than a mid-token snapshot.
  const scheduleTranslation = useCallback(() => {
    if (translationDebounceRef.current !== null) {
      clearTimeout(translationDebounceRef.current);
    }
    translationDebounceRef.current = setTimeout(() => {
      translationDebounceRef.current = null;
      const buffer = liveBufferRef.current;
      if (buffer && buffer !== lastTranslatedBuffer.current) {
        dispatchTranslation(buffer, detectedLangRef.current, false);
      }
    }, TRANSLATION_DEBOUNCE_MS);
  }, [dispatchTranslation]);

  // ── cancelScheduledTranslation ─────────────────────────────────────────────
  // Cancels any pending debounce. Called by softFinalize before the final
  // dispatch so the debounced isFinal=false never races the final isFinal=true.
  const cancelScheduledTranslation = useCallback(() => {
    if (translationDebounceRef.current !== null) {
      clearTimeout(translationDebounceRef.current);
      translationDebounceRef.current = null;
    }
  }, []);

  // ── createBubble ──────────────────────────────────────────────────────────
  // Builds a two-column segment row with color-coded speaker tags.
  // Creates a fresh BubbleTransState for the new bubble so all translation
  // requests for previous bubbles are structurally isolated.
  const createBubble = useCallback((rawSpeaker: number | undefined): HTMLSpanElement => {
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
    p.className = CLS.textLive;
    applyTextStyle(p);
    const finalSpan = document.createElement("span");
    const nfSpan    = document.createElement("span");
    nfSpan.className = CLS.nf;
    p.appendChild(finalSpan);
    p.appendChild(nfSpan);
    origRow.appendChild(p);

    const copyOrigBtn = makeCopyButton(true, () => finalSpan.textContent?.trim() ?? "");
    origRow.appendChild(copyOrigBtn);
    colOrig.appendChild(origRow);

    const transRow = document.createElement("div");
    transRow.className = CLS.textRow;

    const transTextP = document.createElement("p");
    transTextP.className   = CLS.transPend;
    transTextP.textContent = "…";
    applyTextStyle(transTextP);
    transRow.appendChild(transTextP);

    const copyTransBtn = makeCopyButton(false, () => transTextP.textContent?.trim() ?? "");
    transRow.appendChild(copyTransBtn);
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
      transTextEl:  transTextP,
      copyTransBtn: copyTransBtn,
      seq:          0,
      lastShownSeq:      0,
      lastShownLen:      0,
      finalizing:        false,
      translationLocked: false,
    };
    styleUpgradedRef.current      = false;
    liveBufferRef.current         = "";
    lastTranslatedBuffer.current  = "";
    detectedLangRef.current       = "en";
    segmentLangLockedRef.current  = false;  // unlock for next segment's detection

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey/italic → bold) and dispatches a
  // final translation. isFinal=true bypasses the stabilization check.
  // Stops the polling interval FIRST so no in-flight poll requests can race
  // against the final fetch and overwrite the locked translation.
  const softFinalize = useCallback(() => {
    if (!activeBubbleRef.current) return;

    // Cancel any pending debounced translation AND mark as finalizing
    // synchronously before the final dispatch below. This ensures any
    // debounced isFinal=false fetch already in-flight is rejected by the
    // post-fetch `finalizing` guard when it returns.
    cancelScheduledTranslation();
    if (activeBubbleStateRef.current) {
      activeBubbleStateRef.current.finalizing = true;
    }

    // ── Preserve grey (non-final) text ────────────────────────────────────────
    // If Stop is pressed (or silence fires) while Soniox hasn't yet committed
    // NF tokens as finals, promote the NF text into the finalized span before
    // clearing it. This prevents spoken words from vanishing on Stop.
    if (activeBubbleNFRef.current && activeBubbleRef.current) {
      const nfPending = activeBubbleNFRef.current.textContent ?? "";
      if (nfPending.trim()) {
        const existing = activeBubbleRef.current.textContent ?? "";
        const spacer   = existing && !existing.endsWith(" ") ? " " : "";
        activeBubbleRef.current.textContent = existing + spacer + nfPending.trim();
      }
      activeBubbleNFRef.current.textContent = "";
    }

    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }

    const finalText = activeBubbleRef.current.textContent?.trim() ?? "";

    // Record the finalized text so onmessage can detect if Soniox re-emits it
    // as the start of the next segment (duplicate detection).
    if (finalText.length > 2) lastSegmentTextRef.current = finalText;

    if (finalText.length > 2 && finalText !== lastTranslatedBuffer.current) {
      dispatchTranslation(finalText, detectedLangRef.current, true);
    }

    // Append this segment's source text to the rolling context window (max 2).
    // The next segment's translate calls will see these as prior context so
    // the model can maintain grammatical flow and consistent terminology.
    if (finalText.length > 2) {
      recentSegmentsRef.current = [...recentSegmentsRef.current, finalText].slice(-2);
    }
  }, [dispatchTranslation, cancelScheduledTranslation]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  const finalizeLiveBubble = useCallback(() => {
    if (!activeBubbleRef.current) return;
    softFinalize();
  }, [softFinalize]);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    // Cancel any pending silence timer before we finalize below.
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    cancelScheduledTranslation();
    finalizeLiveBubble();

    currentSpeakerRef.current      = undefined;
    activeBubbleRef.current        = null;
    activeBubbleNFRef.current      = null;
    activeBubbleStateRef.current   = null;  // drop all in-flight translation closures
    finalCountRef.current          = 0;
    recentSegmentsRef.current      = [];    // clear context window for next session
    segmentLangLockedRef.current   = false; // reset lang lock for next session
    lastSegmentTextRef.current     = "";    // reset dedup anchor for next session

    workletRef.current?.disconnect();
    workletRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* eof */ }
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    setMicLevel(0);

    if (sessionIdRef.current) {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      try {
        await stopSessionMut.mutateAsync({
          data: { sessionId: sessionIdRef.current, durationSeconds: duration },
        });
      } catch (err) { console.error("Failed to stop session", err); }
      sessionIdRef.current = null;
    }
  }, [stopSessionMut, finalizeLiveBubble, cancelScheduledTranslation]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  // !! Soniox pipeline — do NOT modify the streaming / segmentation logic !!
  const buildWs = useCallback((apiKey: string): WebSocket => {
    const ws = new WebSocket(SONIOX_WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key:                        apiKey,
        model:                          "stt-rt-v4",
        audio_format:                   "pcm_s16le",
        sample_rate:                    TARGET_RATE,
        num_channels:                   1,
        language_hints:                 ["en", "ar"],
        enable_language_identification: true,
        enable_speaker_diarization:     true,
        diarization:                    { enable: true },
      }));
      console.log("[WS] stt-rt-v4 OPEN");
    };

    ws.onmessage = (evt: MessageEvent) => {
      if (!isRecRef.current) return;

      let msg: SonioxMessage;
      try { msg = JSON.parse(evt.data as string); } catch { return; }

      if (msg.error) { setError(msg.error); void stop(); return; }
      if (msg.finished) { void stop(); return; }

      const tokens = msg.tokens ?? [];
      if (tokens.length === 0) return;

      // ── Fix 1: Silence / pause-based segment finalization ─────────────────
      // Every message with tokens resets the silence timer.  After
      // SILENCE_TIMEOUT_MS of no tokens the current segment is finalized and
      // the active-bubble refs are cleared so the next token opens a new one.
      if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (!activeBubbleRef.current) return;  // nothing open — nothing to do
        softFinalize();
        // Drop active refs so the next speech token creates a fresh segment.
        currentSpeakerRef.current = undefined;
        activeBubbleRef.current   = null;
        activeBubbleNFRef.current = null;
        styleUpgradedRef.current  = false;
        // NOTE: finalCountRef stays as-is; the Soniox stream is cumulative,
        // so slicing from the current count will correctly pick up only new finals.
      }, SILENCE_TIMEOUT_MS);

      // ── FINAL tokens ─────────────────────────────────────────────────────
      const finals    = tokens.filter(t => t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      // Language detection — only accept the FIRST detection per segment.
      // Soniox may revise its language guess as more audio arrives. Locking on
      // the first detection prevents the translation decision (translate vs.
      // passthrough) from flipping mid-segment.
      const langToken = newFinals.find(t => t.language) ?? finals.find(t => t.language);
      if (langToken?.language && !segmentLangLockedRef.current) {
        detectedLangRef.current      = langToken.language;
        segmentLangLockedRef.current = true;
      }

      // Track whether a brand-new bubble row was created in this batch so the
      // duplicate-segment check below knows whether to inspect it.
      let newBubbleRow: HTMLElement | null = null;

      for (const token of newFinals) {
        if (token.speaker !== currentSpeakerRef.current || !activeBubbleRef.current) {
          finalizeLiveBubble();
          currentSpeakerRef.current = token.speaker;
          finalCountRef.current     = finals.length - newFinals.length +
            newFinals.indexOf(token);
          activeBubbleRef.current = createBubble(token.speaker);
          // Capture the row element (4 DOM levels above finalSpan) for removal
          // if this new segment turns out to be a duplicate.
          // finalSpan → p → origRow → colOrig → row
          newBubbleRow = activeBubbleRef.current
            ?.parentElement?.parentElement?.parentElement?.parentElement ?? null;
          setHasTranscript(true);
        }
        activeBubbleRef.current.textContent =
          (activeBubbleRef.current.textContent ?? "") + token.text;
      }

      // ── Duplicate-segment detection ────────────────────────────────────────
      // Soniox sometimes re-emits the tail words of the previous segment as a
      // brand-new segment (e.g. prev = "…what happened last Saturday." and new
      // = "what happened last Saturday."). Remove the new segment and restore
      // state if its entire text is a suffix of the previous segment text.
      if (newBubbleRow && activeBubbleRef.current && lastSegmentTextRef.current) {
        const newSegText = activeBubbleRef.current.textContent?.trim() ?? "";
        if (isTextSuffix(lastSegmentTextRef.current, newSegText)) {
          newBubbleRow.remove();
          // Restore refs to "no active segment" so the next real token
          // opens a fresh bubble correctly.
          activeBubbleRef.current      = null;
          activeBubbleNFRef.current    = null;
          activeBubbleStateRef.current = null;
          currentSpeakerRef.current    = undefined;
          styleUpgradedRef.current     = false;
          liveBufferRef.current        = "";
          lastTranslatedBuffer.current = "";
          segmentLangLockedRef.current = false;
        }
      }

      finalCountRef.current = finals.length;
      scrollPanel();

      // ── NF (non-final) tokens ─────────────────────────────────────────────
      const nfText    = tokens.filter(t => !t.is_final).map(t => t.text).join("");
      const nfSpeaker = tokens.find(t => !t.is_final && t.speaker !== undefined)?.speaker;

      // ── Fix 2: Immediate speaker-change on NF tokens ──────────────────────
      // When Soniox NF tokens show a new speaker while a segment is open,
      // finalize the current segment immediately and open a fresh one for the
      // new speaker.  This prevents the new speaker's text from appearing in
      // the old bubble even for a fraction of a second, eliminating the "text
      // jumps to a new segment" visual artifact.
      if (
        nfSpeaker !== undefined &&
        activeBubbleRef.current !== null &&
        nfSpeaker !== currentSpeakerRef.current
      ) {
        finalizeLiveBubble();
        currentSpeakerRef.current = nfSpeaker;
        activeBubbleRef.current   = createBubble(nfSpeaker);
        setHasTranscript(true);
      }

      if (activeBubbleNFRef.current) {
        activeBubbleNFRef.current.textContent = nfText;
      } else if (nfText && containerRef.current) {
        if (!activeBubbleRef.current) {
          const spk = nfSpeaker ?? tokens.find(t => t.speaker !== undefined)?.speaker;
          currentSpeakerRef.current = spk;
          activeBubbleRef.current   = createBubble(spk);
          setHasTranscript(true);
        }
        if (activeBubbleNFRef.current) {
          activeBubbleNFRef.current.textContent = nfText;
        }
      }

      // ── Update live translation buffer ────────────────────────────────────
      const finalText = activeBubbleRef.current?.textContent ?? "";
      liveBufferRef.current = (finalText + nfText).trim();

      // Kick off a debounced translation. Each token arrival resets the timer
      // so translation only fires after the text has been stable for
      // TRANSLATION_DEBOUNCE_MS — ensuring the full in-progress phrase is
      // sent rather than a mid-word snapshot.
      scheduleTranslation();

      // When Soniox commits all text (NF gone), immediately finalize style.
      if (nfText.length === 0 && finalText.trim().length > 2) {
        if (!styleUpgradedRef.current) {
          styleUpgradedRef.current = true;
          const p = activeBubbleRef.current?.parentElement;
          if (p) p.className = CLS.textFin;
        }
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
  }, [stop, createBubble, finalizeLiveBubble, scrollPanel, scheduleTranslation]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setAudioInfo("");
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      currentSpeakerRef.current    = undefined;
      activeBubbleRef.current      = null;
      activeBubbleNFRef.current    = null;
      activeBubbleStateRef.current = null;
      styleUpgradedRef.current     = false;
      liveBufferRef.current        = "";
      lastTranslatedBuffer.current = "";
      finalCountRef.current        = 0;
      detectedLangRef.current      = "en";
      resetSpeakerMap();

      const tokenRes   = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") await ctx.resume();

      setAudioInfo(`${ctx.sampleRate} Hz → ${TARGET_RATE} Hz`);

      await ctx.audioWorklet.addModule("/pcm-processor.js");

      const stream = await navigator.mediaDevices.getUserMedia({
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

      let chunkCount = 0;
      worklet.port.onmessage = (e) => {
        const pcm = e.data as ArrayBuffer;
        chunkCount++;
        const wsState = wsRef.current?.readyState;
        if (chunkCount % 50 === 1) {
          console.log(`[Worklet] chunk #${chunkCount} — ${pcm.byteLength}B — WS state: ${wsState}`);
        }
        if (wsState === WebSocket.OPEN) {
          wsRef.current!.send(pcm);
        }
        const samples = new Int16Array(pcm);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / (samples.length || 1)) * 500));
      };

      isRecRef.current = true;
      setIsRecording(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start transcription";
      console.error(err);
      setError(msg);
      void stop();
    }
  }, [getTokenMut, startSessionMut, buildWs, stop]);

  // ── setLangPair ────────────────────────────────────────────────────────────
  // Called by workspace whenever the user changes either language selector.
  // Per-segment target is resolved at dispatchTranslation time: if Soniox
  // detected language matches B → translate to A, otherwise → translate to B.
  const setLangPair = useCallback((a: string, b: string) => {
    langPairRef.current = { a, b };
  }, []);

  return {
    isRecording,
    audioInfo,
    micLevel,
    error,
    hasTranscript,
    containerRef,
    start,
    stop,
    setLangPair,
    clear: () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      cancelScheduledTranslation();
      activeBubbleStateRef.current = null;  // drop all in-flight closures
      currentSpeakerRef.current    = undefined;
      activeBubbleRef.current      = null;
      activeBubbleNFRef.current    = null;
      styleUpgradedRef.current     = false;
      liveBufferRef.current        = "";
      lastTranslatedBuffer.current = "";
      finalCountRef.current        = 0;
      recentSegmentsRef.current    = [];   // reset context window on clear
      segmentLangLockedRef.current = false;
      lastSegmentTextRef.current   = "";   // reset dedup anchor on clear
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
