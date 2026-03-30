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
  const [isRecording,    setIsRecording]    = useState(false);
  const [micLevel,       setMicLevel]       = useState(0);
  const [error,          setError]          = useState<string | null>(null);
  const [audioInfo,      setAudioInfo]      = useState<string>("");
  const [segments,       setSegments]       = useState<TranscriptSegment[]>([]);
  // Live streaming text — shown in the bottom row while the speaker is talking
  const [interimText,    setInterimText]    = useState("");
  const [interimSpeaker, setInterimSpeaker] = useState("");

  // Audio / WebSocket infrastructure refs
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Soniox re-sends ALL prior finals in every message.
  // finalCountRef tracks how many we've already processed.
  const finalCountRef     = useRef(0);

  // Buffer for confirmed final tokens, not yet locked into a segment
  const buildingTextRef    = useRef("");
  const buildingSpeakerRef = useRef<number | undefined>(undefined);
  const detectedLangRef    = useRef<string>("en");

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── flushSegment ──────────────────────────────────────────────────────────
  // Locks the current buffer into the segments list and fires translation.
  // Discards buffers shorter than 8 chars (noise / single-word artifacts).
  const flushSegment = useCallback(() => {
    const text = buildingTextRef.current.trim();
    if (text.length < 8) {
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

    // Reset buffer before async work
    buildingTextRef.current    = "";
    buildingSpeakerRef.current = undefined;
    detectedLangRef.current    = "en";

    // Fire-and-forget translation — patches translatedText on the same row by id
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

    // Flush any remaining confirmed text
    flushSegment();

    // Clear live streaming display
    setInterimText("");
    setInterimSpeaker("");

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

      const finals    = tokens.filter(t =>  t.is_final);
      const nfs       = tokens.filter(t => !t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      // ── Live streaming display (NF tokens) ───────────────────────────────
      //
      // Show confirmed buffer + current hypothesis so the user sees text
      // instantly as they speak. Clears automatically when NF tokens stop.
      //
      const nfText = nfs.map(t => t.text).join("");
      const liveText = (buildingTextRef.current + nfText).trim();
      if (liveText) {
        const liveSpeakerId = nfs[0]?.speaker ?? buildingSpeakerRef.current;
        setInterimText(liveText);
        setInterimSpeaker(normalizeSpeaker(liveSpeakerId));
      } else {
        setInterimText("");
        setInterimSpeaker("");
      }

      // ── Final tokens — accumulate into buffer ─────────────────────────
      if (newFinals.length > 0) {
        const langToken = newFinals.find(t => t.language);
        if (langToken?.language) detectedLangRef.current = langToken.language;

        for (const token of newFinals) {
          // Speaker changed — flush current buffer as a locked segment
          if (
            buildingSpeakerRef.current !== undefined &&
            token.speaker !== buildingSpeakerRef.current
          ) {
            flushSegment();
          }
          // Set speaker when buffer was just flushed (empty) or on first token
          if (buildingSpeakerRef.current === undefined) {
            buildingSpeakerRef.current = token.speaker;
          }
          buildingTextRef.current += token.text;
        }

        finalCountRef.current = finals.length;
      }

      // ── Phrase-complete signal ────────────────────────────────────────
      //
      // When Soniox sends a message that has final tokens but NO NF tokens,
      // the model has fully committed the current utterance — no more live
      // hypothesis is outstanding. This is the natural flush boundary.
      //
      if (newFinals.length > 0 && nfs.length === 0) {
        flushSegment();
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
  }, [stop, flushSegment]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setAudioInfo("");
      setInterimText("");
      setInterimSpeaker("");
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
    setInterimText("");
    setInterimSpeaker("");
    buildingTextRef.current    = "";
    buildingSpeakerRef.current = undefined;
    finalCountRef.current      = 0;
    resetSpeakerMap();
  }, []);

  // Scroll sentinel — workspace watches segments.length via this ref
  const segmentsLengthRef = useRef(0);
  useEffect(() => { segmentsLengthRef.current = segments.length; }, [segments.length]);

  return {
    segments,
    interimText,
    interimSpeaker,
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
