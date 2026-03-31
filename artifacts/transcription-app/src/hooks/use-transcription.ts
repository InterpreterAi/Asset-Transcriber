import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE         = 16000;
const SONIOX_WS_URL       = "wss://stt-rt.soniox.com/transcribe-websocket";
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
// target language code: if detected is B → translate to A, otherwise → B.
// This makes the translation always go to the OPPOSITE of what was spoken.
function resolveTarget(detectedLang: string, pair: { a: string; b: string }): string {
  return matchesLang(detectedLang, pair.b) ? pair.a : pair.b;
}

// ── Translation fetch ──────────────────────────────────────────────────────────
// sourceLang: BCP-47 code auto-detected by Soniox (e.g. "en", "ar", "fr").
// targetLang: BCP-47 code resolved from the language pair (always the opposite).
async function fetchTranslation(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const r = await fetch("/api/transcription/translate", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify({ text, sourceLang, targetLang }),
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
// Each segment gets its own isolated state object. Chunk closures capture it at
// creation time, so in-flight requests from a previous segment can NEVER write
// into a later segment's DOM element — isolation is structural, not flag-based.
interface BubbleTransState {
  transTextEl:  HTMLParagraphElement;
  copyTransBtn: HTMLButtonElement;
  chunkIds:     number[];  // ordered IDs of translation chunks belonging to this bubble
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
  // True only after Soniox has explicitly reported a language code for this session.
  // The interval guard uses this to prevent polling before language is known, which
  // was the cause of source-language appearing in the translation column.
  const langDetectedRef   = useRef<boolean>(false);
  // The user's selected language pair {a, b}. Per-segment target is computed
  // dynamically: if detected matches b → translate to a; otherwise translate to b.
  const langPairRef       = useRef<{ a: string; b: string }>({ a: "en", b: "ar" });
  const styleUpgradedRef  = useRef(false);

  // ── Per-bubble translation state ───────────────────────────────────────────
  // Each call to createBubble creates a fresh BubbleTransState. Chunk closures
  // capture it — so old bubbles' in-flight requests always write to their own
  // element and can never bleed into a new bubble.
  const activeBubbleStateRef = useRef<BubbleTransState | null>(null);

  // ── Chunk translation store ────────────────────────────────────────────────
  // Each batch of new final tokens produces one TransChunk. The store persists
  // for the session lifetime so translations are never lost when segments split.
  const chunkStoreRef  = useRef<Map<number, { text: string; translation: string | null }>>(new Map());
  const chunkIdCounter = useRef(0);

  // ── Chunk flush buffer ────────────────────────────────────────────────────
  // New final tokens accumulate here between flush events.  Flushed immediately
  // on punctuation / length cap; falls back to an 800ms silence window; always
  // flushed synchronously on speaker change / stop so no text is lost.
  const pendingChunkRef       = useRef<{ text: string; state: BubbleTransState } | null>(null);
  const chunkDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── renderBubbleTranslation ────────────────────────────────────────────────
  // Re-renders the translation column for a bubble by concatenating the
  // resolved translations of all its chunks. Pending chunks show "…".
  // Called every time any chunk belonging to the bubble resolves.
  const renderBubbleTranslation = useCallback((state: BubbleTransState) => {
    const store = chunkStoreRef.current;
    if (!state.transTextEl.isConnected || state.chunkIds.length === 0) return;

    const parts   = state.chunkIds.map(id => store.get(id)?.translation ?? null);
    const display = parts.map(p => p ?? "…").join(" ").trim();
    if (!display) return;

    const isArabic = /[\u0600-\u06FF]/.test(display);
    state.transTextEl.dir             = isArabic ? "rtl" : "ltr";
    state.transTextEl.style.textAlign = isArabic ? "right" : "";
    if (isArabic) {
      state.transTextEl.lang      = "ar";
      state.transTextEl.className = CLS.transText + " ts-arabic";
    } else {
      state.transTextEl.removeAttribute("lang");
      state.transTextEl.className = CLS.transText;
    }
    state.transTextEl.textContent = display;

    // Enable the copy button once at least one chunk has resolved.
    if (state.copyTransBtn.disabled && parts.some(p => p !== null)) {
      enableCopyBtn(state.copyTransBtn, () => state.transTextEl.textContent?.trim() ?? "");
    }
    scrollPanel();
  }, [scrollPanel]);

  // ── addChunk ───────────────────────────────────────────────────────────────
  // Creates a translation chunk for `text`, registers it in the store, appends
  // its ID to `state.chunkIds`, and fires an async translation request.
  //
  // Isolation: `state` is captured at call time — the async result always
  //   writes to the bubble that was active when the chunk was created, even
  //   if a speaker change opens a new bubble before the request returns.
  //
  // Pair guard: if the detected language is outside the selected pair, the
  //   source text is stored as-is (no translation API call made).
  const addChunk = useCallback((text: string, lang: string, state: BubbleTransState) => {
    if (text.length < 2) return;

    const pair     = langPairRef.current;
    const inPair   = matchesLang(lang, pair.a) || matchesLang(lang, pair.b);
    const chunkId  = chunkIdCounter.current++;
    chunkStoreRef.current.set(chunkId, { text, translation: null });
    state.chunkIds.push(chunkId);

    if (!inPair) {
      // Language outside the selected pair — show source text, no API call.
      chunkStoreRef.current.get(chunkId)!.translation = text;
      renderBubbleTranslation(state);
      return;
    }

    const targetLang = resolveTarget(lang, pair);
    void (async () => {
      try {
        const translated = await fetchTranslation(text, lang, targetLang);
        const entry = chunkStoreRef.current.get(chunkId);
        if (!entry || !state.transTextEl.isConnected) return;
        entry.translation = translated || text;  // fallback to source on empty response
        renderBubbleTranslation(state);
      } catch (e) {
        console.warn("[chunk-translate]", e instanceof Error ? e.message : e);
      }
    })();
  }, [renderBubbleTranslation]);

  // ── flushPendingChunk / accumulateChunk ────────────────────────────────────
  // flushPendingChunk: immediate drain — used on speaker change / stop / silence.
  //   Always translates pending text regardless of length so nothing is lost.
  // accumulateChunk: smart trigger — fires immediately on punctuation or when the
  //   buffer hits 60 chars; falls back to an 800ms silence timer otherwise.
  const flushPendingChunk = useCallback(() => {
    if (chunkDebounceTimerRef.current !== null) {
      clearTimeout(chunkDebounceTimerRef.current);
      chunkDebounceTimerRef.current = null;
    }
    const pending = pendingChunkRef.current;
    pendingChunkRef.current = null;
    if (pending?.text.trim() && pending.state) {
      addChunk(pending.text.trim(), detectedLangRef.current, pending.state);
    }
  }, [addChunk]);

  // Smart flush: fires immediately on punctuation or length cap; waits up to
  // CHUNK_SILENCE_MS for more text otherwise (gives a natural batching window).
  // Translation is only triggered when accumulated text is >= CHUNK_TRANSLATE_MIN
  // to avoid wasting API calls on single words.
  const CHUNK_MAX_CHARS      = 60;   // flush when buffer gets this long
  const CHUNK_MIN_CHARS      = 8;    // punctuation flush only above this size
  const CHUNK_TRANSLATE_MIN  = 10;   // minimum chars to fire a translation
  const CHUNK_SILENCE_MS     = 800;  // fallback silence window
  const PUNCT_RE             = /[.?!]\s*$/;

  const accumulateChunk = useCallback((text: string, state: BubbleTransState) => {
    if (!pendingChunkRef.current) {
      pendingChunkRef.current = { text, state };
    } else {
      pendingChunkRef.current.text += text;
    }

    const buf = pendingChunkRef.current.text;
    const shouldFlushNow =
      buf.length >= CHUNK_MAX_CHARS ||
      (buf.length >= CHUNK_MIN_CHARS && PUNCT_RE.test(buf));

    if (shouldFlushNow) {
      if (chunkDebounceTimerRef.current !== null) {
        clearTimeout(chunkDebounceTimerRef.current);
        chunkDebounceTimerRef.current = null;
      }
      const pending = pendingChunkRef.current;
      pendingChunkRef.current = null;
      if (pending.text.trim().length >= CHUNK_TRANSLATE_MIN) {
        addChunk(pending.text.trim(), detectedLangRef.current, pending.state);
      }
      return;
    }

    // Reset the silence fallback timer.
    if (chunkDebounceTimerRef.current !== null) clearTimeout(chunkDebounceTimerRef.current);
    chunkDebounceTimerRef.current = setTimeout(() => {
      chunkDebounceTimerRef.current = null;
      const pending = pendingChunkRef.current;
      pendingChunkRef.current = null;
      if (pending?.text.trim() && pending.text.trim().length >= CHUNK_TRANSLATE_MIN) {
        addChunk(pending.text.trim(), detectedLangRef.current, pending.state);
      }
    }, CHUNK_SILENCE_MS);
  }, [addChunk]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Fresh per-bubble translation state. Each bubble owns its chunkIds array.
    // Old in-flight chunk requests captured the OLD state in their closure,
    // so they always write to the old bubble's elements — never to this one.
    activeBubbleNFRef.current    = nfSpan;
    activeBubbleStateRef.current = {
      transTextEl:  transTextP,
      copyTransBtn: copyTransBtn,
      chunkIds:     [],
    };
    styleUpgradedRef.current = false;
    detectedLangRef.current  = "en";

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey/italic → bold) and dispatches a
  // ONE-TIME final translation for the completed segment.
  // Translation only fires here — never during live speech — so language
  // detection is complete and all final tokens are committed before we translate.
  const softFinalize = useCallback(() => {
    if (!activeBubbleRef.current) return;

    const state = activeBubbleStateRef.current;

    // Promote any remaining NF (grey/partial) text into the final span so it
    // is never lost when the user presses STOP mid-sentence.
    if (activeBubbleNFRef.current) {
      const nfText = activeBubbleNFRef.current.textContent ?? "";
      if (nfText.trim().length > 0) {
        activeBubbleRef.current.textContent =
          ((activeBubbleRef.current.textContent ?? "") + nfText).trimStart();
        // Create a chunk for the promoted NF text so it gets translated.
        // Speaker guard: only if diarization has confirmed a speaker.
        if (state && langDetectedRef.current && currentSpeakerRef.current !== undefined) {
          addChunk(nfText.trim(), detectedLangRef.current, state);
        }
      }
      activeBubbleNFRef.current.textContent = "";
    }

    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }
  }, [addChunk]);

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
    flushPendingChunk();   // commit any debounced text before finalizing
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
  }, [stopSessionMut, finalizeLiveBubble, flushPendingChunk]);

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
        flushPendingChunk();   // commit any debounced text before finalizing
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
      if (langToken?.language) {
        detectedLangRef.current = langToken.language;
        langDetectedRef.current = true;  // Soniox confirmed the language — unlock interval
      }

      // Process final tokens, grouping by speaker into per-bubble chunks.
      // Each time the speaker changes we finalize the old bubble, start a new
      // one, and dispatch a chunk for the text accumulated since the last group.
      let chunkText = "";
      for (const token of newFinals) {
        if (token.speaker !== currentSpeakerRef.current || !activeBubbleRef.current) {
          // Speaker boundary: flush any pending debounced text for the OLD bubble
          // BEFORE switching, so it is translated against the correct segment.
          if (chunkText.trim()) {
            // Append the in-loop text gathered so far to the pending buffer
            // then flush immediately (bypasses the 200ms wait).
            if (langDetectedRef.current && activeBubbleStateRef.current) {
              if (pendingChunkRef.current) {
                pendingChunkRef.current.text += chunkText;
              } else {
                pendingChunkRef.current = { text: chunkText, state: activeBubbleStateRef.current };
              }
            }
            chunkText = "";
          }
          flushPendingChunk();

          finalizeLiveBubble();
          currentSpeakerRef.current = token.speaker;
          finalCountRef.current     = finals.length - newFinals.length +
            newFinals.indexOf(token);
          activeBubbleRef.current = createBubble(token.speaker);
          setHasTranscript(true);
        }
        activeBubbleRef.current.textContent =
          (activeBubbleRef.current.textContent ?? "") + token.text;
        chunkText += token.text;
      }

      // Accumulate this message's final text into the debounce buffer.
      if (chunkText.trim() && activeBubbleStateRef.current && langDetectedRef.current) {
        accumulateChunk(chunkText.trim(), activeBubbleStateRef.current);
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

      // When Soniox commits all text (NF gone), immediately finalize style.
      const finalText = activeBubbleRef.current?.textContent ?? "";
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
  }, [stop, createBubble, finalizeLiveBubble, flushPendingChunk, accumulateChunk, scrollPanel]);

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
      finalCountRef.current        = 0;
      detectedLangRef.current      = "en";
      langDetectedRef.current      = false;
      chunkStoreRef.current.clear();
      chunkIdCounter.current       = 0;
      pendingChunkRef.current      = null;
      if (chunkDebounceTimerRef.current !== null) {
        clearTimeout(chunkDebounceTimerRef.current);
        chunkDebounceTimerRef.current = null;
      }
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
  // Per-chunk target is resolved at addChunk time: if Soniox detected language
  // matches B → translate to A, otherwise → translate to B.
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
      activeBubbleStateRef.current = null;
      currentSpeakerRef.current    = undefined;
      activeBubbleRef.current      = null;
      activeBubbleNFRef.current    = null;
      styleUpgradedRef.current     = false;
      finalCountRef.current        = 0;
      chunkStoreRef.current.clear();
      chunkIdCounter.current = 0;
      pendingChunkRef.current = null;
      if (chunkDebounceTimerRef.current !== null) {
        clearTimeout(chunkDebounceTimerRef.current);
        chunkDebounceTimerRef.current = null;
      }
      langDetectedRef.current = false;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
