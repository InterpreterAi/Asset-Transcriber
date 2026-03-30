import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE   = 16000;
const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

// ── DOM class names — defined here so Tailwind's scanner preserves them ───────
const CLS = {
  // Segment row — CSS `group` enables hover-based copy-button reveal
  row:         "group relative flex gap-0 mb-3 rounded-lg hover:bg-muted/20 px-2 py-1.5 -mx-2 transition-colors",
  // Left column (original)
  colOrig:     "flex-1 min-w-0 pr-6",
  // Right column (translation)
  colTrans:    "flex-1 min-w-0",
  speakerTag:  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  // Live segment: grey/italic while speech is still streaming
  textLive:    "text-[13px] leading-relaxed text-muted-foreground/70 italic",
  // Finalized segment: solid, normal weight once the speaker changes
  textFin:     "text-[13px] leading-relaxed text-foreground font-medium",
  nf:          "text-muted-foreground/45 italic",
  // Translation text in the right column
  transText:   "text-[13px] leading-relaxed text-muted-foreground/60",
  // Pending placeholder while translation is in flight
  transPend:   "text-[11px] text-muted-foreground/30 italic",
  // Copy-button container — hidden until row is hovered
  copyBtns:    "absolute -top-0.5 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto",
  copyBtn:     "text-[10px] font-medium px-2 py-0.5 rounded bg-white hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/60 shadow-sm",
  copyBtnDis:  "text-[10px] font-medium px-2 py-0.5 rounded bg-white text-muted-foreground/30 border border-border/30 cursor-not-allowed",
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
  const containerRef       = useRef<HTMLDivElement | null>(null);
  const currentSpeakerRef  = useRef<number | undefined>(undefined);
  // activeBubbleRef  — the <span> receiving final text inside the current row
  const activeBubbleRef    = useRef<HTMLSpanElement | null>(null);
  // activeBubbleNFRef — the NF (non-final hypothesis) <span>
  const activeBubbleNFRef  = useRef<HTMLSpanElement | null>(null);
  // activeTransColRef  — the right-column <div> for the translation
  const activeTransColRef  = useRef<HTMLDivElement | null>(null);
  // activeCopyTransRef — "Copy Translation" button for the active row
  const activeCopyTransRef = useRef<HTMLButtonElement | null>(null);
  // finalCountRef — Soniox re-sends all prior finals; skip already-seen ones
  const finalCountRef      = useRef(0);
  // lastFinalTimeRef — Date.now() of last processed final token
  const lastFinalTimeRef   = useRef(0);
  // detectedLangRef — BCP-47 code of the current live segment
  const detectedLangRef    = useRef<string>("en");

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── scrollPanel ────────────────────────────────────────────────────────────
  // force=true  → always scroll (new segment boundary)
  // force=false → smart scroll: only if user is within 150 px of the bottom
  //               (pauses auto-scroll when the user has scrolled up manually)
  const scrollPanel = useCallback((force = false) => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (force) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // ── createBubble ──────────────────────────────────────────────────────────
  // Imperatively builds one two-column segment row in the DOM.
  // Returns the <span> that receives confirmed final text (= activeBubbleRef).
  const createBubble = useCallback((rawSpeaker: number | undefined): HTMLSpanElement => {
    const container = containerRef.current!;
    const label     = normalizeSpeaker(rawSpeaker);

    // ── Row wrapper — group enables hover-based copy-button reveal ──────────
    const row = document.createElement("div");
    row.className = CLS.row;

    // ── LEFT COLUMN: original transcript ────────────────────────────────────
    const colOrig = document.createElement("div");
    colOrig.className = CLS.colOrig;

    if (label) {
      const tag = document.createElement("span");
      tag.className   = CLS.speakerTag;
      tag.textContent = label;
      colOrig.appendChild(tag);
    }

    const p = document.createElement("p");
    p.className = CLS.textLive;          // grey/italic while streaming

    const finalSpan = document.createElement("span");
    const nfSpan    = document.createElement("span");
    nfSpan.className = CLS.nf;
    p.appendChild(finalSpan);
    p.appendChild(nfSpan);
    colOrig.appendChild(p);
    row.appendChild(colOrig);

    // ── RIGHT COLUMN: translation ────────────────────────────────────────────
    const colTrans = document.createElement("div");
    colTrans.className = CLS.colTrans;
    const transPend = document.createElement("p");
    transPend.className   = CLS.transPend;
    transPend.textContent = "…";
    colTrans.appendChild(transPend);
    row.appendChild(colTrans);

    // ── COPY BUTTONS (appear only on row hover) ─────────────────────────────
    const copyBtns = document.createElement("div");
    copyBtns.className = CLS.copyBtns;

    const copyOrigBtn = document.createElement("button");
    copyOrigBtn.className   = CLS.copyBtn;
    copyOrigBtn.textContent = "Copy Original";
    copyOrigBtn.type        = "button";
    copyOrigBtn.onclick = () => {
      void navigator.clipboard.writeText(finalSpan.textContent?.trim() ?? "");
      copyOrigBtn.textContent = "Copied!";
      setTimeout(() => { copyOrigBtn.textContent = "Copy Original"; }, 1500);
    };

    const copyTransBtn = document.createElement("button");
    copyTransBtn.className   = CLS.copyBtnDis;
    copyTransBtn.textContent = "Copy Translation";
    copyTransBtn.type        = "button";
    copyTransBtn.disabled    = true;

    copyBtns.appendChild(copyOrigBtn);
    copyBtns.appendChild(copyTransBtn);
    row.appendChild(copyBtns);

    container.appendChild(row);

    activeBubbleNFRef.current  = nfSpan;
    activeTransColRef.current  = colTrans;
    activeCopyTransRef.current = copyTransBtn;

    // Force-scroll on new segment so it's always visible
    scrollPanel(true);

    return finalSpan;
  }, [scrollPanel]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  // Called when the active speaker changes or recording ends.
  // 1. Locks the segment style: grey/italic → solid/normal
  // 2. Fires an async translation request and fills the right column.
  const finalizeLiveBubble = useCallback(() => {
    if (!activeBubbleRef.current) return;

    // Snapshot everything SYNCHRONOUSLY before the async translation gap
    const confirmedText  = activeBubbleRef.current.textContent?.trim() ?? "";
    const lang           = detectedLangRef.current;
    const colTrans       = activeTransColRef.current;
    const copyTransBtn   = activeCopyTransRef.current;

    // Clear NF preview — only confirmed words survive finalization
    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Upgrade the <p> from live → finalized style
    const p = activeBubbleRef.current.parentElement;
    if (p) p.className = CLS.textFin;

    // Reset lang tracker for the next live segment
    detectedLangRef.current = "en";

    // Fire-and-forget translation — fills the right column asynchronously
    if (confirmedText.length > 2 && colTrans) {
      void (async () => {
        try {
          const r = await fetch("/api/transcription/translate", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({ text: confirmedText, sourceLang: lang }),
          });
          if (!r.ok) return;
          const data = await r.json() as { translation?: string };
          if (!data.translation || !colTrans.isConnected) return;

          // Replace the pending "…" with the translated text
          colTrans.innerHTML = "";
          const tp = document.createElement("p");
          tp.className   = CLS.transText;
          tp.textContent = data.translation;
          colTrans.appendChild(tp);

          // Enable "Copy Translation" button now that text is available
          if (copyTransBtn) {
            copyTransBtn.className = CLS.copyBtn;
            copyTransBtn.disabled  = false;
            const translatedText   = data.translation;
            copyTransBtn.onclick   = () => {
              void navigator.clipboard.writeText(translatedText);
              copyTransBtn.textContent = "Copied!";
              setTimeout(() => { copyTransBtn.textContent = "Copy Translation"; }, 1500);
            };
          }

          scrollPanel();
        } catch { /* silent — translation is best-effort */ }
      })();
    } else if (colTrans) {
      // No text to translate — clear the placeholder
      colTrans.innerHTML = "";
    }
  }, [scrollPanel]);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    // Promote the last live segment to finalized styling before teardown
    finalizeLiveBubble();

    currentSpeakerRef.current  = undefined;
    activeBubbleRef.current    = null;
    activeBubbleNFRef.current  = null;
    activeTransColRef.current  = null;
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

      // ── FINAL tokens ────────────────────────────────────────────────────
      //
      // Soniox re-sends ALL prior finals as a prefix in every message.
      // Slice off what we've already written — only the new tail matters.
      //
      const finals    = tokens.filter(t => t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      // Track detected language from final tokens — used for translation
      const langToken = newFinals.find(t => t.language) ?? finals.find(t => t.language);
      if (langToken?.language) detectedLangRef.current = langToken.language;

      for (const token of newFinals) {
        // Speaker changed (or first token ever) → finalize the current live
        // segment, then open a new one. Text grows in place within a segment.
        if (token.speaker !== currentSpeakerRef.current || !activeBubbleRef.current) {
          finalizeLiveBubble();
          currentSpeakerRef.current = token.speaker;
          finalCountRef.current     = finals.length - newFinals.length +
            newFinals.indexOf(token);
          activeBubbleRef.current = createBubble(token.speaker);
          setHasTranscript(true);
        }

        // Append confirmed text to the live span
        activeBubbleRef.current.textContent =
          (activeBubbleRef.current.textContent ?? "") + token.text;
      }

      // Update final count to include everything processed this message
      finalCountRef.current = finals.length;

      // Smart scroll — respects manual scroll-up pause
      scrollPanel();

      // ── NF (non-final) tokens ─────────────────────────────────────────
      //
      // Each message's NF set REPLACES the previous one (not additive).
      // Write the full suffix directly to the NF span.
      //
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
      currentSpeakerRef.current  = undefined;
      activeBubbleRef.current    = null;
      activeBubbleNFRef.current  = null;
      activeTransColRef.current  = null;
      activeCopyTransRef.current = null;
      finalCountRef.current      = 0;
      lastFinalTimeRef.current   = 0;
      detectedLangRef.current    = "en";
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
      currentSpeakerRef.current  = undefined;
      activeBubbleRef.current    = null;
      activeBubbleNFRef.current  = null;
      activeTransColRef.current  = null;
      activeCopyTransRef.current = null;
      finalCountRef.current      = 0;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
