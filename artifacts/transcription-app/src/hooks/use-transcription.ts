import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE        = 16000;
const SONIOX_WS_URL      = "wss://stt-rt.soniox.com/transcribe-websocket";
// Local speech-end detector: fire translation 800 ms after the last new
// committed word — much shorter than Soniox's own 7-second silence window.
const SPEECH_END_MS      = 800;

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
  speakerTag: "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  // Invisible spacer — same size as speakerTag so translation column aligns
  speakerSpacer: "invisible inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold mb-1",
  textLive:   "text-[13px] leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0",
  textFin:    "text-[13px] leading-relaxed text-foreground font-medium flex-1 min-w-0",
  nf:         "text-muted-foreground/45 italic",
  // Translation text — same weight/darkness as finalized original
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

// ── Translation helper ─────────────────────────────────────────────────────────
async function fetchTranslation(text: string, lang: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch("/api/transcription/translate", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body:        JSON.stringify({ text, sourceLang: lang }),
  });
  if (!r.ok) return "";
  const d = await r.json() as { translation?: string };
  return d.translation?.trim() ?? "";
}

// ── enableCopyBtn ──────────────────────────────────────────────────────────────
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
  const activeBubbleRef    = useRef<HTMLSpanElement | null>(null);
  const activeBubbleNFRef  = useRef<HTMLSpanElement | null>(null);
  const activeTransTextRef = useRef<HTMLParagraphElement | null>(null);
  const activeCopyTransRef = useRef<HTMLButtonElement | null>(null);

  // Set true after first style-upgrade (grey→bold) for the active bubble.
  // Prevents repeated DOM class changes, but translation may still re-fire
  // if new text has arrived since the last translation.
  const styleUpgradedRef   = useRef(false);

  // Last text that was actually sent to the translation API for this bubble.
  // Used to skip identical re-requests when the same text is committed multiple times.
  const lastTranslatedText = useRef<string>("");

  // AbortController for the in-flight translation request.
  // Cancelled and replaced each time new text triggers a fresh translation.
  const translationAbort   = useRef<AbortController | null>(null);

  // Local speech-end timer (SPEECH_END_MS after the last committed word).
  const speechEndTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalCountRef      = useRef(0);
  const lastFinalTimeRef   = useRef(0);
  const detectedLangRef    = useRef<string>("en");

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

  // ── clearSpeechEndTimer ───────────────────────────────────────────────────
  const clearSpeechEndTimer = useCallback(() => {
    if (speechEndTimer.current !== null) {
      clearTimeout(speechEndTimer.current);
      speechEndTimer.current = null;
    }
  }, []);

  // ── createBubble ──────────────────────────────────────────────────────────
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
      // Visible speaker tag in original column
      const tag = document.createElement("span");
      tag.className   = CLS.speakerTag;
      tag.textContent = label;
      colOrig.appendChild(tag);

      // Invisible spacer in translation column — same height so text rows align
      const spacer = document.createElement("span");
      spacer.className   = CLS.speakerSpacer;
      spacer.textContent = label;        // same text keeps identical dimensions
      spacer.setAttribute("aria-hidden", "true");
      colTrans.appendChild(spacer);
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

    activeBubbleNFRef.current  = nfSpan;
    activeTransTextRef.current = transTextP;
    activeCopyTransRef.current = copyTransBtn;
    styleUpgradedRef.current   = false;
    lastTranslatedText.current = "";
    detectedLangRef.current    = "en";

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  // ── triggerTranslation ────────────────────────────────────────────────────
  // Fetches translation for the current finalized text.
  // - Deduplicates: skips fetch if text hasn't changed since last request.
  // - Aborts any in-flight request before starting a new one.
  // - Does NOT touch the style (grey→bold); that is handled by softFinalize.
  const triggerTranslation = useCallback(() => {
    const confirmedText = activeBubbleRef.current?.textContent?.trim() ?? "";
    if (confirmedText.length < 3) return;
    if (confirmedText === lastTranslatedText.current) return; // nothing new

    const lang        = detectedLangRef.current;
    const transTextEl = activeTransTextRef.current;
    const copyTransBtn = activeCopyTransRef.current;
    if (!transTextEl) return;

    lastTranslatedText.current = confirmedText;

    // Abort any in-flight translation for stale text
    translationAbort.current?.abort();
    const ctrl = new AbortController();
    translationAbort.current = ctrl;

    void (async () => {
      try {
        const translated = await fetchTranslation(confirmedText, lang, ctrl.signal);
        if (ctrl.signal.aborted || !translated || !transTextEl.isConnected) return;

        const isArabic = /[\u0600-\u06FF]/.test(translated);
        transTextEl.dir             = isArabic ? "rtl" : "ltr";
        transTextEl.style.textAlign = isArabic ? "right" : "";
        transTextEl.textContent     = translated;
        transTextEl.className       = CLS.transText;

        if (copyTransBtn) {
          enableCopyBtn(copyTransBtn, () => transTextEl.textContent?.trim() ?? "");
        }
        scrollPanel();
      } catch (e) {
        // AbortError is expected when a newer request supersedes this one
        if (e instanceof Error && e.name !== "AbortError") {
          console.warn("[translate]", e.message);
        }
      }
    })();
  }, [scrollPanel]);

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey→bold) on the FIRST call.
  // Always calls triggerTranslation so the translation stays up-to-date
  // if the speaker continued after the previous translation fired.
  const softFinalize = useCallback(() => {
    if (!activeBubbleRef.current) return;

    clearSpeechEndTimer();

    // Clear NF preview
    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Upgrade style once (grey/italic → bold/solid)
    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }

    triggerTranslation();
  }, [clearSpeechEndTimer, triggerTranslation]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  // Called on speaker change or recording stop.
  const finalizeLiveBubble = useCallback(() => {
    if (!activeBubbleRef.current) return;
    softFinalize();
  }, [softFinalize]);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    clearSpeechEndTimer();
    finalizeLiveBubble();

    currentSpeakerRef.current  = undefined;
    activeBubbleRef.current    = null;
    activeBubbleNFRef.current  = null;
    activeTransTextRef.current = null;
    activeCopyTransRef.current = null;
    finalCountRef.current      = 0;
    lastFinalTimeRef.current   = 0;

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
  }, [stopSessionMut, finalizeLiveBubble, clearSpeechEndTimer]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  // !! Soniox pipeline — do NOT modify streaming / segmentation logic !!
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

      // ── Local speech-end detector ─────────────────────────────────────────
      // Reset the timer each time new committed words arrive.
      // When SPEECH_END_MS elapses with no new words, treat the segment as done
      // and fire softFinalize immediately — without waiting for Soniox's own
      // (much longer) silence detection to send NF=[].
      if (newFinals.length > 0 && activeBubbleRef.current) {
        clearSpeechEndTimer();
        speechEndTimer.current = setTimeout(() => {
          speechEndTimer.current = null;
          const text = activeBubbleRef.current?.textContent?.trim() ?? "";
          if (text.length > 2) softFinalize();
        }, SPEECH_END_MS);
      }

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

      // When Soniox commits all pending speech (NF gone), finalize immediately.
      // softFinalize is idempotent — safe to call even if the 800 ms timer
      // already ran.
      if (
        nfText.length === 0 &&
        activeBubbleRef.current &&
        (activeBubbleRef.current.textContent?.trim().length ?? 0) > 2
      ) {
        softFinalize();
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
  }, [stop, createBubble, finalizeLiveBubble, softFinalize, clearSpeechEndTimer, scrollPanel]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setAudioInfo("");
      currentSpeakerRef.current  = undefined;
      activeBubbleRef.current    = null;
      activeBubbleNFRef.current  = null;
      activeTransTextRef.current = null;
      activeCopyTransRef.current = null;
      styleUpgradedRef.current   = false;
      lastTranslatedText.current = "";
      finalCountRef.current      = 0;
      lastFinalTimeRef.current   = 0;
      detectedLangRef.current    = "en";
      clearSpeechEndTimer();
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
  }, [getTokenMut, startSessionMut, buildWs, stop, clearSpeechEndTimer]);

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
      clearSpeechEndTimer();
      translationAbort.current?.abort();
      translationAbort.current = null;
      currentSpeakerRef.current  = undefined;
      activeBubbleRef.current    = null;
      activeBubbleNFRef.current  = null;
      activeTransTextRef.current = null;
      activeCopyTransRef.current = null;
      styleUpgradedRef.current   = false;
      lastTranslatedText.current = "";
      finalCountRef.current      = 0;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
