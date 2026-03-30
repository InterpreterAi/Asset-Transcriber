import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE          = 16000;
const SONIOX_WS_URL        = "wss://stt-rt.soniox.com/transcribe-websocket";
// Streaming translation poll interval. On every tick the full live buffer
// (finals + NF) is dispatched if it changed. Concurrent requests are allowed
// to run — a version counter ensures only the newest completed response wins.
const TRANSLATION_POLL_MS  = 700;

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

// ── DOM class names — defined here so Tailwind's scanner preserves them ───────
const CLS = {
  row:        "group relative grid grid-cols-2 gap-6 mb-3 rounded-lg hover:bg-muted/20 px-2 py-1.5 -mx-2 transition-colors",
  colOrig:    "min-w-0",
  colTrans:   "min-w-0",
  textRow:    "flex items-start gap-1",
  // Speaker tag — same style used in BOTH original and translation columns
  speakerTag: "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  textLive:   "text-[13px] leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0",
  textFin:    "text-[13px] leading-relaxed text-foreground font-medium flex-1 min-w-0",
  nf:         "text-muted-foreground/45 italic",
  // Translation — same weight/darkness as finalized original
  transText:  "text-[13px] leading-relaxed text-foreground/80 font-medium flex-1 min-w-0",
  transPend:  "text-[11px] text-muted-foreground/30 italic flex-1 min-w-0",
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
const MAX_SPEAKERS = 2;
const _speakerMap  = new Map<number, number>();
const _slotLastMs  = new Map<number, number>();
let   _slotCount   = 0;

function resetSpeakerMap() { _speakerMap.clear(); _slotLastMs.clear(); _slotCount = 0; }

function normalizeSpeaker(rawId: number | undefined): string {
  if (rawId === undefined) return "";
  if (_speakerMap.has(rawId)) {
    const slot = _speakerMap.get(rawId)!;
    _slotLastMs.set(slot, Date.now());
    return `Speaker ${slot}`;
  }
  if (_slotCount < MAX_SPEAKERS) {
    _slotCount++;
    _speakerMap.set(rawId, _slotCount);
    _slotLastMs.set(_slotCount, Date.now());
    return `Speaker ${_slotCount}`;
  }
  let lruSlot = 1, lruMs = _slotLastMs.get(1) ?? 0;
  for (let s = 2; s <= _slotCount; s++) {
    const t = _slotLastMs.get(s) ?? 0;
    if (t < lruMs) { lruMs = t; lruSlot = s; }
  }
  _speakerMap.set(rawId, lruSlot);
  _slotLastMs.set(lruSlot, Date.now());
  return `Speaker ${lruSlot}`;
}

// ── Translation fetch ──────────────────────────────────────────────────────────
async function fetchTranslation(text: string, lang: string): Promise<string> {
  const r = await fetch("/api/transcription/translate", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify({ text, sourceLang: lang }),
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
  const containerRef       = useRef<HTMLDivElement | null>(null);
  const currentSpeakerRef  = useRef<number | undefined>(undefined);
  const activeBubbleRef    = useRef<HTMLSpanElement | null>(null);   // final-text span
  const activeBubbleNFRef  = useRef<HTMLSpanElement | null>(null);   // NF span
  const activeTransTextRef = useRef<HTMLParagraphElement | null>(null);
  const activeCopyTransRef = useRef<HTMLButtonElement | null>(null);
  const finalCountRef      = useRef(0);
  const detectedLangRef    = useRef<string>("en");

  // ── Streaming translation refs ─────────────────────────────────────────────
  // liveBufferRef: full text of the active segment (finals + current NF).
  // Updated on every Soniox message; read by the translation interval.
  const liveBufferRef          = useRef<string>("");
  // lastTranslatedBuffer: text most recently sent to the translation API.
  // The interval skips fetching when the buffer hasn't changed.
  const lastTranslatedBuffer   = useRef<string>("");
  // Version counter. Incremented on every dispatch; concurrent requests
  // that complete out-of-order are discarded when their version is stale.
  // Also incremented on bubble change / stop / clear to drop all in-flight
  // requests that belong to a previous segment.
  const translationVersionRef  = useRef(0);
  // setInterval handle for the streaming translation poll.
  const translationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Whether the current bubble's <p> has been upgraded to the finalized style.
  const styleUpgradedRef       = useRef(false);

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
  // Fires a translation request for `text`. Requests run concurrently — the
  // version counter ensures only the response that corresponds to the highest
  // dispatch number (i.e. the latest text) is written to the DOM. Responses
  // for older dispatches are silently discarded. This lets every 700 ms tick
  // produce a visible update without one request blocking the next.
  const dispatchTranslation = useCallback((text: string, lang: string) => {
    const transTextEl  = activeTransTextRef.current;
    const copyTransBtn = activeCopyTransRef.current;
    if (!transTextEl || text.length < 3) return;

    lastTranslatedBuffer.current = text;
    translationVersionRef.current += 1;
    const myVersion = translationVersionRef.current;

    void (async () => {
      try {
        const translated = await fetchTranslation(text, lang);
        // Discard if a newer dispatch has already won or the DOM is gone
        if (translationVersionRef.current !== myVersion || !translated || !transTextEl.isConnected) return;

        const isArabic = /[\u0600-\u06FF]/.test(translated);
        transTextEl.dir             = isArabic ? "rtl" : "ltr";
        transTextEl.style.textAlign = isArabic ? "right" : "";
        transTextEl.textContent     = translated;
        transTextEl.className       = CLS.transText;

        if (copyTransBtn && copyTransBtn.disabled) {
          enableCopyBtn(copyTransBtn, () => transTextEl.textContent?.trim() ?? "");
        }
        scrollPanel();
      } catch (e) {
        console.warn("[translate]", e instanceof Error ? e.message : e);
      }
    })();
  }, [scrollPanel]);

  // ── startTranslationInterval ───────────────────────────────────────────────
  // Starts the 800 ms polling loop. On each tick, if the live buffer has
  // changed since the last dispatched translation, fires a new request.
  const startTranslationInterval = useCallback(() => {
    if (translationIntervalRef.current !== null) return;
    translationIntervalRef.current = setInterval(() => {
      const buffer = liveBufferRef.current;
      if (!buffer || buffer === lastTranslatedBuffer.current) return;
      dispatchTranslation(buffer, detectedLangRef.current);
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
  // Builds a two-column segment row. Both columns carry an identical speaker
  // tag so the layout stays symmetric.
  const createBubble = useCallback((rawSpeaker: number | undefined): HTMLSpanElement => {
    const container = containerRef.current!;
    const label     = normalizeSpeaker(rawSpeaker);

    const row = document.createElement("div");
    row.className = CLS.row;

    // ── LEFT COLUMN: original ────────────────────────────────────────────────
    const colOrig = document.createElement("div");
    colOrig.className = CLS.colOrig;

    // ── RIGHT COLUMN: translation ────────────────────────────────────────────
    const colTrans = document.createElement("div");
    colTrans.className = CLS.colTrans;

    if (label) {
      // Original column: visible speaker tag
      const tagOrig = document.createElement("span");
      tagOrig.className   = CLS.speakerTag;
      tagOrig.textContent = label;
      colOrig.appendChild(tagOrig);

      // Translation column: identical visible speaker tag — keeps columns symmetric
      const tagTrans = document.createElement("span");
      tagTrans.className   = CLS.speakerTag;
      tagTrans.textContent = label;
      colTrans.appendChild(tagTrans);
    }

    const origRow = document.createElement("div");
    origRow.className = CLS.textRow;

    const p = document.createElement("p");
    p.className = CLS.textLive;
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
    transRow.appendChild(transTextP);

    const copyTransBtn = makeCopyButton(false, () => transTextP.textContent?.trim() ?? "");
    transRow.appendChild(copyTransBtn);
    colTrans.appendChild(transRow);

    row.appendChild(colOrig);
    row.appendChild(colTrans);
    container.appendChild(row);

    // Update active refs for this bubble.
    // Increment the version so any in-flight requests for the previous bubble
    // are discarded when they eventually resolve.
    activeBubbleNFRef.current    = nfSpan;
    activeTransTextRef.current   = transTextP;
    activeCopyTransRef.current   = copyTransBtn;
    styleUpgradedRef.current     = false;
    liveBufferRef.current        = "";
    lastTranslatedBuffer.current = "";
    detectedLangRef.current      = "en";
    translationVersionRef.current += 1;

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey → bold) and immediately dispatches
  // a final translation for whatever text is in the live buffer.
  // Called on speaker change or recording stop.
  const softFinalize = useCallback(() => {
    if (!activeBubbleRef.current) return;

    // Clear NF span
    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Upgrade style once (grey/italic → bold)
    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }

    // Force one final translation with the committed final text
    const finalText = activeBubbleRef.current.textContent?.trim() ?? "";
    if (finalText.length > 2 && finalText !== lastTranslatedBuffer.current) {
      dispatchTranslation(finalText, detectedLangRef.current);
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

    stopTranslationInterval();
    finalizeLiveBubble();

    currentSpeakerRef.current  = undefined;
    activeBubbleRef.current    = null;
    activeBubbleNFRef.current  = null;
    activeTransTextRef.current = null;
    activeCopyTransRef.current = null;
    finalCountRef.current      = 0;

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
        activeBubbleRef.current.textContent =
          (activeBubbleRef.current.textContent ?? "") + token.text;
      }

      finalCountRef.current = finals.length;
      scrollPanel();

      // ── NF (non-final) tokens ─────────────────────────────────────────────
      const nfText = tokens.filter(t => !t.is_final).map(t => t.text).join("");
      if (activeBubbleNFRef.current) {
        activeBubbleNFRef.current.textContent = nfText;
      } else if (nfText && containerRef.current) {
        if (!activeBubbleRef.current) {
          const spk = tokens.find(t => t.speaker !== undefined)?.speaker;
          currentSpeakerRef.current = spk;
          activeBubbleRef.current   = createBubble(spk);
          setHasTranscript(true);
        }
        if (activeBubbleNFRef.current) {
          activeBubbleNFRef.current.textContent = nfText;
        }
      }

      // ── Update live translation buffer ────────────────────────────────────
      // Combine committed final text with the current NF hypothesis into the
      // live buffer. The streaming translation interval reads this on every
      // tick and fires a new request whenever it detects a change.
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
      currentSpeakerRef.current    = undefined;
      activeBubbleRef.current      = null;
      activeBubbleNFRef.current    = null;
      activeTransTextRef.current   = null;
      activeCopyTransRef.current   = null;
      styleUpgradedRef.current     = false;
      liveBufferRef.current        = "";
      lastTranslatedBuffer.current = "";
      finalCountRef.current        = 0;
      detectedLangRef.current      = "en";
      translationVersionRef.current += 1;  // drop any in-flight requests from a previous session
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

      // Start the streaming translation poll AFTER the WebSocket is created
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

  return {
    isRecording,
    audioInfo,
    micLevel,
    error,
    hasTranscript,
    containerRef,
    start,
    stop,
    clear: () => {
      stopTranslationInterval();
      translationVersionRef.current += 1;  // drop all in-flight requests
      currentSpeakerRef.current    = undefined;
      activeBubbleRef.current      = null;
      activeBubbleNFRef.current    = null;
      activeTransTextRef.current   = null;
      activeCopyTransRef.current   = null;
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
