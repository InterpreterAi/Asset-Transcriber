import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Translation mode toggle ────────────────────────────────────────────────────
// "final"   → translate only when a segment is finalized (speaker changes / stop)
// "interim" → also translate during live speech with a 600 ms debounce, then
//             replace with a final translation once the segment is locked
const TRANSLATION_MODE: "final" | "interim" = "final";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE       = 16000;
const SONIOX_WS_URL     = "wss://stt-rt.soniox.com/transcribe-websocket";
const INTERIM_DEBOUNCE  = 600; // ms

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
  // Segment row — CSS `group` enables hover-reveal of copy icons
  row:        "group relative flex gap-0 mb-3 rounded-lg hover:bg-muted/20 px-2 py-1.5 -mx-2 transition-colors",
  // Left column (original), right column (translation)
  colOrig:    "flex-1 min-w-0 pr-6",
  colTrans:   "flex-1 min-w-0",
  // Inner row wrapping text + copy icon inside each column
  textRow:    "flex items-start gap-1",
  speakerTag: "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  // Live (grey/italic) vs finalized (solid) — both carry flex-1 so they fill their text-row
  textLive:   "text-[13px] leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0",
  textFin:    "text-[13px] leading-relaxed text-foreground font-medium flex-1 min-w-0",
  nf:         "text-muted-foreground/45 italic",
  // Translation paragraph (right column)
  transText:  "text-[13px] leading-relaxed text-muted-foreground/60 flex-1 min-w-0",
  transPend:  "text-[11px] text-muted-foreground/30 italic flex-1 min-w-0",
  // Copy icon button — enabled (with hover effect) vs disabled
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

// ── makeCopyButton ─────────────────────────────────────────────────────────────
// Creates a styled copy-icon button. `getTextFn` is called at click-time so it
// always reads the latest text from the DOM.
function makeCopyButton(enabled: boolean, getTextFn: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.innerHTML = COPY_SVG;
  btn.className = enabled ? CLS.copyIcon : CLS.copyIconDis;
  btn.disabled  = !enabled;
  if (enabled) {
    btn.onclick = () => {
      void navigator.clipboard.writeText(getTextFn());
      btn.innerHTML = CHECK_SVG;
      btn.style.color = "var(--color-green-500, #22c55e)";
      setTimeout(() => {
        btn.innerHTML   = COPY_SVG;
        btn.style.color = "";
      }, 1500);
    };
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

  // Audio / WebSocket infrastructure refs
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Direct-to-DOM transcript refs ─────────────────────────────────────────
  const containerRef        = useRef<HTMLDivElement | null>(null);
  const currentSpeakerRef   = useRef<number | undefined>(undefined);
  // <span> receiving confirmed final text inside the current row's <p>
  const activeBubbleRef     = useRef<HTMLSpanElement | null>(null);
  // <span> for the live non-final hypothesis
  const activeBubbleNFRef   = useRef<HTMLSpanElement | null>(null);
  // <p> inside the right (translation) column — updated by translation fetches
  const activeTransTextRef  = useRef<HTMLParagraphElement | null>(null);
  // copy-icon button inside the right column — enabled after first translation
  const activeCopyTransRef  = useRef<HTMLButtonElement | null>(null);
  // Soniox re-sends all prior finals; skip already-seen ones
  const finalCountRef       = useRef(0);
  const lastFinalTimeRef    = useRef(0);
  // Detected language for translation direction ("en", "ar", …)
  const detectedLangRef     = useRef<string>("en");
  // Interim-mode debounce timer
  const interimDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── scrollPanel ────────────────────────────────────────────────────────────
  // force=true  → always scroll (new segment)
  // force=false → smart: only if within 150 px of bottom (pauses when scrolled up)
  const scrollPanel = useCallback((force = false) => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (force) { el.scrollTop = el.scrollHeight; return; }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // ── createBubble ──────────────────────────────────────────────────────────
  // Builds one two-column segment row imperatively in the DOM.
  // Returns the final-text <span> that receives confirmed tokens.
  const createBubble = useCallback((rawSpeaker: number | undefined): HTMLSpanElement => {
    const container = containerRef.current!;
    const label     = normalizeSpeaker(rawSpeaker);

    // ── Row wrapper ──────────────────────────────────────────────────────────
    const row = document.createElement("div");
    row.className = CLS.row;

    // ── LEFT COLUMN: original ────────────────────────────────────────────────
    const colOrig = document.createElement("div");
    colOrig.className = CLS.colOrig;

    if (label) {
      const tag = document.createElement("span");
      tag.className   = CLS.speakerTag;
      tag.textContent = label;
      colOrig.appendChild(tag);
    }

    // text + copy-icon row
    const origRow   = document.createElement("div");
    origRow.className = CLS.textRow;

    const p = document.createElement("p");
    p.className = CLS.textLive;          // grey/italic while streaming
    const finalSpan = document.createElement("span");
    const nfSpan    = document.createElement("span");
    nfSpan.className = CLS.nf;
    p.appendChild(finalSpan);
    p.appendChild(nfSpan);
    origRow.appendChild(p);

    // Copy icon for original — reads finalSpan text at click-time
    const copyOrigBtn = makeCopyButton(true, () => finalSpan.textContent?.trim() ?? "");
    origRow.appendChild(copyOrigBtn);
    colOrig.appendChild(origRow);
    row.appendChild(colOrig);

    // ── RIGHT COLUMN: translation ────────────────────────────────────────────
    const colTrans  = document.createElement("div");
    colTrans.className = CLS.colTrans;

    const transRow  = document.createElement("div");
    transRow.className = CLS.textRow;

    const transTextP = document.createElement("p");
    transTextP.className   = CLS.transPend;
    transTextP.textContent = "…";
    transRow.appendChild(transTextP);

    // Copy icon for translation — disabled until translation arrives
    const copyTransBtn = makeCopyButton(false, () => transTextP.textContent?.trim() ?? "");
    transRow.appendChild(copyTransBtn);
    colTrans.appendChild(transRow);
    row.appendChild(colTrans);

    container.appendChild(row);

    // Update active refs
    activeBubbleNFRef.current  = nfSpan;
    activeTransTextRef.current = transTextP;
    activeCopyTransRef.current = copyTransBtn;

    // Force-scroll on new segment so it's always visible
    scrollPanel(true);

    return finalSpan;
  }, [scrollPanel]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  // Called when speaker changes or recording stops.
  // 1. Cancels any pending interim-debounce
  // 2. Locks style: grey/italic → solid
  // 3. Fires a final translation request and updates the right column
  const finalizeLiveBubble = useCallback(() => {
    if (!activeBubbleRef.current) return;

    // Cancel any pending interim translation
    if (interimDebounceRef.current !== null) {
      clearTimeout(interimDebounceRef.current);
      interimDebounceRef.current = null;
    }

    // Snapshot synchronously before any async gap
    const confirmedText  = activeBubbleRef.current.textContent?.trim() ?? "";
    const lang           = detectedLangRef.current;
    const transTextEl    = activeTransTextRef.current;
    const copyTransBtn   = activeCopyTransRef.current;

    // Clear NF preview
    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Upgrade <p> class: live → finalized
    const p = activeBubbleRef.current.parentElement;
    if (p) p.className = CLS.textFin;

    // Reset lang for next segment
    detectedLangRef.current = "en";

    // Fire-and-forget final translation
    if (confirmedText.length > 2 && transTextEl) {
      void (async () => {
        try {
          const translated = await fetchTranslation(confirmedText, lang);
          if (!translated || !transTextEl.isConnected) return;

          // Replace placeholder / interim text with final translation
          transTextEl.textContent = translated;
          transTextEl.className   = CLS.transText;

          // Enable copy icon for translation
          if (copyTransBtn) {
            copyTransBtn.className = CLS.copyIcon;
            copyTransBtn.disabled  = false;
            copyTransBtn.onclick   = () => {
              void navigator.clipboard.writeText(translated);
              copyTransBtn.innerHTML  = CHECK_SVG;
              copyTransBtn.style.color = "var(--color-green-500, #22c55e)";
              setTimeout(() => {
                copyTransBtn.innerHTML   = COPY_SVG;
                copyTransBtn.style.color = "";
              }, 1500);
            };
          }

          scrollPanel();
        } catch { /* silent — translation is best-effort */ }
      })();
    } else if (transTextEl) {
      // Nothing to translate — hide placeholder
      transTextEl.textContent = "";
      transTextEl.className   = CLS.transText;
    }
  }, [scrollPanel]);

  // ── scheduleInterimTranslation ────────────────────────────────────────────
  // Debounces translation of interim (NF) text. Only active in "interim" mode.
  const scheduleInterimTranslation = useCallback((nfText: string, lang: string) => {
    if (interimDebounceRef.current !== null) {
      clearTimeout(interimDebounceRef.current);
    }
    // Capture refs at scheduling time so they stay valid even if finalize runs
    // first (finalize clears the timer, so the callback won't fire in that case)
    const capturedTransText = activeTransTextRef.current;
    const capturedCopyBtn   = activeCopyTransRef.current;
    const capturedFinalText = activeBubbleRef.current?.textContent ?? "";

    interimDebounceRef.current = setTimeout(() => {
      interimDebounceRef.current = null;
      const fullText = (capturedFinalText + " " + nfText).trim();
      if (fullText.length < 2 || !capturedTransText?.isConnected) return;

      void (async () => {
        try {
          const translated = await fetchTranslation(fullText, lang);
          if (!translated || !capturedTransText.isConnected) return;
          capturedTransText.textContent = translated;
          capturedTransText.className   = CLS.transText;
          // Enable copy button with current interim translation
          if (capturedCopyBtn && capturedCopyBtn.disabled) {
            capturedCopyBtn.className = CLS.copyIcon;
            capturedCopyBtn.disabled  = false;
            capturedCopyBtn.onclick   = () => {
              void navigator.clipboard.writeText(capturedTransText.textContent?.trim() ?? "");
              capturedCopyBtn.innerHTML   = CHECK_SVG;
              capturedCopyBtn.style.color = "var(--color-green-500, #22c55e)";
              setTimeout(() => {
                capturedCopyBtn.innerHTML    = COPY_SVG;
                capturedCopyBtn.style.color  = "";
              }, 1500);
            };
          }
          scrollPanel();
        } catch { /* silent */ }
      })();
    }, INTERIM_DEBOUNCE);
  }, [scrollPanel]);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

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
  }, [stopSessionMut, finalizeLiveBubble]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  // !! Soniox pipeline — do NOT modify !!
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
      // Soniox re-sends all prior finals; only the new tail matters.
      const finals    = tokens.filter(t => t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      // Track detected language
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

      // Smart scroll — respects manual scroll-up pause
      scrollPanel();

      // ── NF (non-final) tokens ─────────────────────────────────────────────
      // Each message's NF set REPLACES the previous one — not additive.
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

      // ── Interim translation (only in "interim" mode) ──────────────────────
      if (TRANSLATION_MODE === "interim" && nfText.trim().length > 0) {
        scheduleInterimTranslation(nfText, detectedLangRef.current);
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
  }, [stop, createBubble, finalizeLiveBubble, scheduleInterimTranslation, scrollPanel]);

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
      finalCountRef.current      = 0;
      lastFinalTimeRef.current   = 0;
      detectedLangRef.current    = "en";
      if (interimDebounceRef.current !== null) {
        clearTimeout(interimDebounceRef.current);
        interimDebounceRef.current = null;
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
      if (interimDebounceRef.current !== null) {
        clearTimeout(interimDebounceRef.current);
        interimDebounceRef.current = null;
      }
      currentSpeakerRef.current  = undefined;
      activeBubbleRef.current    = null;
      activeBubbleNFRef.current  = null;
      activeTransTextRef.current = null;
      activeCopyTransRef.current = null;
      finalCountRef.current      = 0;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
