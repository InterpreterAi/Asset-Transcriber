import { useRef, useState, useCallback, useEffect } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE   = 16000;
const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

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

// ── Transcript segment ─────────────────────────────────────────────────────────
export interface TranscriptSegment {
  id:             string;
  speaker:        number | undefined;
  speakerLabel:   string;
  originalText:   string;
  translatedText: string | null;
  timestamp:      number;
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
  const [isRecording, setIsRecording] = useState(false);
  const [micLevel,    setMicLevel]    = useState(0);
  const [error,       setError]       = useState<string | null>(null);
  const [audioInfo,   setAudioInfo]   = useState<string>("");
  const [segments,    setSegments]    = useState<TranscriptSegment[]>([]);

  // Audio / WebSocket infrastructure refs
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Final-token deduplication counter
  // Soniox re-sends ALL prior finals each message. This tracks how many we've
  // already processed so we only act on the new tail.
  const finalCountRef     = useRef(0);

  // Buffer for accumulating final tokens before they become a locked segment
  const buildingTextRef   = useRef("");
  const buildingSpeakerRef = useRef<number | undefined>(undefined);
  // Detected language from Soniox token metadata
  const detectedLangRef   = useRef<string>("en");

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── flushSegment ──────────────────────────────────────────────────────────
  // Moves the accumulated buffer into the locked segment list, then fires
  // an async translation call that updates the same row when it returns.
  // Minimum 10 characters required; shorter buffers are silently discarded.
  const flushSegment = useCallback(() => {
    const text = buildingTextRef.current.trim();
    if (text.length < 10) {
      // Too short to be meaningful — reset buffer without creating a segment
      buildingTextRef.current    = "";
      buildingSpeakerRef.current = undefined;
      detectedLangRef.current    = "en";
      return;
    }

    const speaker      = buildingSpeakerRef.current;
    const speakerLabel = normalizeSpeaker(speaker);
    const lang         = detectedLangRef.current;
    const id           = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const seg: TranscriptSegment = {
      id,
      speaker,
      speakerLabel,
      originalText:   text,
      translatedText: null,
      timestamp:      Date.now(),
    };

    setSegments(prev => [...prev, seg]);

    // Reset buffer immediately — must happen before the async translation
    buildingTextRef.current    = "";
    buildingSpeakerRef.current = undefined;
    detectedLangRef.current    = "en";

    // Fire-and-forget translation — updates the row once the API responds
    void (async () => {
      try {
        const r = await fetch("/api/transcription/translate", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body:        JSON.stringify({ text, sourceLang: lang }),
        });
        if (!r.ok) return;
        const data = await r.json() as { translation?: string };
        if (data.translation) {
          setSegments(prev =>
            prev.map(s => s.id === id
              ? { ...s, translatedText: data.translation! }
              : s
            )
          );
        }
      } catch { /* translation is best-effort */ }
    })();
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    // Flush any remaining buffered text before tearing down
    flushSegment();

    finalCountRef.current      = 0;
    buildingTextRef.current    = "";
    buildingSpeakerRef.current = undefined;

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
  }, [stopSessionMut, flushSegment]);

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

      if (msg.error)    { setError(msg.error); void stop(); return; }
      if (msg.finished) { void stop(); return; }

      const tokens = msg.tokens ?? [];
      if (tokens.length === 0) return;

      // ── FINAL tokens only ───────────────────────────────────────────────
      //
      // Soniox re-sends ALL prior finals as a prefix every message.
      // Slice off what we've already processed — only the new tail matters.
      // NF (non-final) tokens are intentionally ignored: no grey preview text.
      //
      const finals    = tokens.filter(t => t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      if (newFinals.length > 0) {
        // Update detected language from first token that carries it
        const langToken = newFinals.find(t => t.language);
        if (langToken?.language) detectedLangRef.current = langToken.language;

        for (const token of newFinals) {
          const accumulated = buildingTextRef.current.trim();

          // Speaker changed — only flush if the buffer is substantial (≥ 15 chars).
          // Short fragments stay buffered to avoid single-word segments.
          if (
            buildingSpeakerRef.current !== undefined &&
            token.speaker !== buildingSpeakerRef.current &&
            accumulated.length >= 15
          ) {
            flushSegment();
          }

          // Set speaker on first token or after a flush emptied the buffer
          if (buildingSpeakerRef.current === undefined) {
            buildingSpeakerRef.current = token.speaker;
          }
          buildingTextRef.current += token.text;

          const buf = buildingTextRef.current.trim();

          // Rule 1: Force-flush at 120 chars regardless of punctuation
          if (buf.length >= 120) {
            flushSegment();
          }
          // Rule 2: Flush on sentence-ending punctuation — only when ≥ 15 chars
          else if (buf.length >= 15 && /[.!?]$/.test(buf)) {
            flushSegment();
          }
        }

        finalCountRef.current = finals.length;
      }
      // NF tokens are completely ignored — no interim preview displayed
    };

    ws.onerror = () => { setError("WebSocket error"); void stop(); };

    ws.onclose = (e) => {
      if (isRecRef.current && e.code !== 1000) {
        setError(`Connection closed (${e.code})`);
        void stop();
      }
    };

    return ws;
  }, [stop, flushSegment]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setAudioInfo("");
      finalCountRef.current      = 0;
      buildingTextRef.current    = "";
      buildingSpeakerRef.current = undefined;
      detectedLangRef.current    = "en";
      resetSpeakerMap();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenRes   = await (getTokenMut.mutateAsync as any)();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionRes = await (startSessionMut.mutateAsync as any)();
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
          deviceId:          deviceId ? { exact: deviceId } : undefined,
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
          console.log(`[Worklet] chunk #${chunkCount} — ${pcm.byteLength}B — WS: ${wsState}`);
        }
        if (wsState === WebSocket.OPEN) wsRef.current!.send(pcm);
        // VU meter
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

  // ── clear ─────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    setSegments([]);
    buildingTextRef.current    = "";
    buildingSpeakerRef.current = undefined;
    finalCountRef.current      = 0;
    resetSpeakerMap();
  }, []);

  // Expose a stable ref so workspace can scroll to bottom on new segments
  const segmentsLengthRef = useRef(0);
  useEffect(() => { segmentsLengthRef.current = segments.length; }, [segments.length]);

  return {
    segments,
    isRecording,
    audioInfo,
    micLevel,
    error,
    start,
    stop,
    clear,
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
