import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE         = 16000;
const SONIOX_WS_URL       = "wss://stt-rt.soniox.com/transcribe-websocket";
const TRANSLATION_POLL_MS = 700;
// Minimum new characters in the source transcript before triggering a translation
// during live speech (prevents API calls for tiny 1-2 char deltas).
const MIN_NEW_CHARS       = 3;
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

// ── Translation fetch ──────────────────────────────────────────────────────────
// Sends the text and both sides of the language pair to the API.
// GPT detects which language the text is in and translates to the other one.
async function fetchTranslation(text: string, langA: string, langB: string): Promise<string> {
  const r = await fetch("/api/transcription/translate", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify({ text, langA, langB }),
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
  transTextEl:  HTMLParagraphElement;
  copyTransBtn: HTMLButtonElement;
  seq:          number;  // incremented on every dispatch FOR THIS bubble
  lastShownSeq: number;  // highest seq whose result was written to DOM
  lastOrigLen:  number;  // char length of original transcript already translated
  transAccum:   string;  // accumulated translation text (append-only)
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
  // Both sides of the user-selected language pair.
  // langARef = left / source side  (default: "en")
  // targetLangRef = right / target side (default: "ar")
  // Updated by workspace via setLangA / setTargetLang without re-renders.
  const langARef          = useRef<string>("en");
  const targetLangRef     = useRef<string>("ar");
  const styleUpgradedRef  = useRef(false);

  // ── Per-bubble translation state ───────────────────────────────────────────
  // Each call to createBubble creates a fresh BubbleTransState. Closures in
  // dispatchTranslation capture it — so old bubbles' in-flight requests stay
  // bound to their own element and can never bleed into a new bubble.
  const activeBubbleStateRef = useRef<BubbleTransState | null>(null);

  // ── Translation polling refs ───────────────────────────────────────────────
  // liveBufferRef: segment text seen so far (finals + NF). Updated every onmessage.
  const liveBufferRef        = useRef<string>("");
  // lastTranslatedBuffer: text last SENT to the API. Interval skips if unchanged.
  const lastTranslatedBuffer = useRef<string>("");
  // setInterval handle.
  const translationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  // APPEND-ONLY translation pipeline.
  //
  // Each call receives the FULL current transcript text for the active bubble.
  // Internally it extracts only the NEW suffix (characters not yet translated)
  // and sends just that suffix to the API.  The returned translation is appended
  // to the existing translation text — previously translated words are never
  // modified or retranslated.
  //
  // Isolation: `state` (per-bubble object) is captured at call time — old
  //   in-flight requests always write to the correct bubble's DOM element.
  //
  // Monotonic gate: a result is accepted only if its seq is higher than the
  //   last accepted seq for this bubble, handling out-of-order network responses.
  const dispatchTranslation = useCallback((text: string, lang: string, isFinal = false) => {
    const state = activeBubbleStateRef.current;
    if (!state) return;

    // Extract only the untranslated suffix.
    const newText = text.slice(state.lastOrigLen).trim();

    // During live speech require a minimum new-text length to avoid firing the
    // API on every tiny token.  For the final dispatch (segment complete) send
    // whatever remains, even a single word.
    if (!newText || (!isFinal && newText.length < MIN_NEW_CHARS)) return;

    lastTranslatedBuffer.current = text;
    state.seq += 1;
    const mySeq           = state.seq;
    const capturedOrigLen = text.length;   // full length at dispatch time
    // Capture both sides of the pair at dispatch time.
    // Direction detection is done server-side by GPT reading the text content.
    const myLangA         = langARef.current;
    const myLangB         = targetLangRef.current;
    const { transTextEl, copyTransBtn } = state;

    void (async () => {
      try {
        const translated = await fetchTranslation(newText, myLangA, myLangB);

        // Out-of-order gate: a newer result for THIS bubble already arrived.
        if (mySeq <= state.lastShownSeq) return;
        // DOM no longer connected (bubble was cleared or session stopped).
        if (!translated || !transTextEl.isConnected) return;

        state.lastShownSeq = mySeq;
        state.lastOrigLen  = capturedOrigLen;  // advance the translated-offset pointer

        // Append new translation — never overwrite previous words.
        const sep = state.transAccum ? " " : "";
        state.transAccum += sep + translated;

        const isArabic = /[\u0600-\u06FF]/.test(state.transAccum);
        transTextEl.dir             = isArabic ? "rtl" : "ltr";
        transTextEl.style.textAlign = isArabic ? "right" : "";
        if (isArabic) {
          transTextEl.lang      = "ar";
          transTextEl.className = CLS.transText + " ts-arabic";
        } else {
          transTextEl.removeAttribute("lang");
          transTextEl.className = CLS.transText;
        }
        transTextEl.textContent = state.transAccum;

        if (copyTransBtn.disabled) {
          enableCopyBtn(copyTransBtn, () => transTextEl.textContent?.trim() ?? "");
        }
        scrollPanel();
      } catch (e) {
        console.warn("[translate]", e instanceof Error ? e.message : e);
      }
    })();
  }, [scrollPanel]);

  // ── startTranslationInterval ───────────────────────────────────────────────
  const startTranslationInterval = useCallback(() => {
    if (translationIntervalRef.current !== null) return;
    translationIntervalRef.current = setInterval(() => {
      const buffer = liveBufferRef.current;
      if (!buffer || buffer === lastTranslatedBuffer.current) return;
      dispatchTranslation(buffer, detectedLangRef.current, false);
    }, TRANSLATION_POLL_MS);
  }, [dispatchTranslation]);

  // ── stopTranslationInterval ────────────────────────────────────────────────
  const stopTranslationInterval = useCallback(() => {
    if (translationIntervalRef.current !== null) {
      clearInterval(translationIntervalRef.current);
      translationIntervalRef.current = null;
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
      lastShownSeq: 0,
      lastOrigLen:  0,
      transAccum:   "",
    };
    styleUpgradedRef.current     = false;
    liveBufferRef.current        = "";
    lastTranslatedBuffer.current = "";
    // Do NOT reset detectedLangRef here — carry the last confirmed detected
    // language into the new bubble so early dispatches (before Soniox sends
    // language data for this segment) use the correct translation direction.

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey/italic → bold) and dispatches a
  // final translation. isFinal=true bypasses the stabilization check.
  const softFinalize = useCallback(() => {
    if (!activeBubbleRef.current) return;

    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }

    // Always attempt a final dispatch so any remaining untranslated suffix
    // gets flushed — dispatchTranslation will skip internally if nothing new.
    const finalText = activeBubbleRef.current.textContent?.trim() ?? "";
    if (finalText.length > 0) {
      dispatchTranslation(finalText, detectedLangRef.current, true);
    }
  }, [dispatchTranslation]);

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
    stopTranslationInterval();
    finalizeLiveBubble();

    currentSpeakerRef.current     = undefined;
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
  }, [stopSessionMut, finalizeLiveBubble, stopTranslationInterval]);

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
        language_hints:                 [langARef.current, targetLangRef.current],
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

      const langToken = newFinals.find(t => t.language) ?? finals.find(t => t.language);
      if (langToken?.language) detectedLangRef.current = langToken.language;

      for (const token of newFinals) {
        if (token.speaker !== currentSpeakerRef.current || !activeBubbleRef.current) {
          finalizeLiveBubble();
          currentSpeakerRef.current = token.speaker;
          finalCountRef.current     = finals.length - newFinals.length +
            newFinals.indexOf(token);
          activeBubbleRef.current = createBubble(token.speaker);
          setHasTranscript(true);
        }
        // A word is committing from live → final.
        // Clear the live (grey) span FIRST so the word leaves it immediately,
        // then append the committed text to the final (bold) span.
        // This prevents any word from appearing in both spans at the same time.
        if (activeBubbleNFRef.current) {
          activeBubbleNFRef.current.textContent = "";
        }
        activeBubbleRef.current.textContent =
          (activeBubbleRef.current.textContent ?? "") + token.text;
      }

      finalCountRef.current = finals.length;
      scrollPanel();

      // ── NF (non-final) tokens ─────────────────────────────────────────────
      //
      // Soniox NF tokens represent the CURRENT live hypothesis — they are a
      // complete replacement of the live buffer every message, not a delta.
      // The live (grey) span is always set via textContent= (REPLACE).
      // It is never appended to across messages.
      //
      const nfText    = tokens.filter(t => !t.is_final).map(t => t.text).join("");
      const nfSpeaker = tokens.find(t => !t.is_final && t.speaker !== undefined)?.speaker;

      // ── Step 1: Speaker routing — zero DOM writes ─────────────────────────
      // Resolve which bubble owns this NF text before touching the DOM.
      // Speaker changes finalize the old segment and open a new one.
      if (nfSpeaker !== undefined) {
        if (!activeBubbleRef.current) {
          currentSpeakerRef.current = nfSpeaker;
          activeBubbleRef.current   = createBubble(nfSpeaker);
          setHasTranscript(true);
        } else if (nfSpeaker !== currentSpeakerRef.current) {
          finalizeLiveBubble();
          currentSpeakerRef.current = nfSpeaker;
          activeBubbleRef.current   = createBubble(nfSpeaker);
          setHasTranscript(true);
        }
      }

      // ── Step 2: REPLACE the live span with current NF ────────────────────
      // This is always a replacement — the NF span holds only the words
      // Soniox has not yet committed.  Words that just became final were
      // already moved to the bold span above and cleared from here.
      if (nfText) {
        if (!activeBubbleRef.current && containerRef.current) {
          currentSpeakerRef.current = undefined;
          activeBubbleRef.current   = createBubble(undefined);
          setHasTranscript(true);
        }
        if (activeBubbleNFRef.current) {
          activeBubbleNFRef.current.textContent = nfText;  // REPLACE, never append
        }
      } else if (activeBubbleNFRef.current) {
        activeBubbleNFRef.current.textContent = "";
      }

      // ── Update live translation buffer ────────────────────────────────────
      const finalText = activeBubbleRef.current?.textContent ?? "";
      liveBufferRef.current = (finalText + nfText).trim();

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
  }, [stop, createBubble, finalizeLiveBubble, scrollPanel]);

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
      detectedLangRef.current      = langARef.current; // default: assume langA until Soniox detects otherwise
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

      startTranslationInterval();

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
  }, [getTokenMut, startSessionMut, buildWs, stop, startTranslationInterval]);

  // ── setLangA / setTargetLang ──────────────────────────────────────────────
  // Called by workspace whenever the user changes either language selector.
  // Updating the refs is instantaneous; values are captured at next dispatch.
  const setLangA = useCallback((lang: string) => {
    langARef.current = lang;
  }, []);

  const setTargetLang = useCallback((lang: string) => {
    targetLangRef.current = lang;
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
    setLangA,
    setTargetLang,
    clear: () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stopTranslationInterval();
      activeBubbleStateRef.current = null;  // drop all in-flight closures
      currentSpeakerRef.current    = undefined;
      activeBubbleRef.current      = null;
      activeBubbleNFRef.current    = null;
      styleUpgradedRef.current     = false;
      liveBufferRef.current        = "";
      lastTranslatedBuffer.current = "";
      finalCountRef.current        = 0;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
