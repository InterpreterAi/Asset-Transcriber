import { useRef, useState, useCallback, useEffect } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Public types ───────────────────────────────────────────────────────────────

export type LangMode = "en" | "ar";

/** A completed, permanent transcript entry. All entries in `phrases` are final. */
export interface Phrase {
  id: string;
  speakerLabel: string;
  text: string;
  language: LangMode;
}

/** The sentence currently being spoken — replaced in-place on every partial update.
 *  Null when no speech is in progress. */
export interface LiveTranscript {
  text: string;
  language: LangMode;
  speakerLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE = 16000;
const STORAGE_KEY = "interpretai_phrases";

/** Select the Soniox model appropriate for the active language. */
function modelFor(lang: LangMode): string {
  return lang === "en" ? "en_v2_lowlatency" : "ar_v1";
}

/** Human-readable label for a Soniox speaker index. */
function makeSpeakerLabel(localSpkIdx: number): string {
  return localSpkIdx > 0 ? `Speaker ${localSpkIdx + 1}` : "Speaker";
}

/** Stable unique ID — timestamp + random suffix avoids collisions with localStorage IDs. */
function nextId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Load phrases from localStorage. Returns [] on any error. */
function loadPhrases(): Phrase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Phrase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);

  /**
   * Permanent history — finalized sentences only.
   * Initialised from localStorage so transcripts survive page refreshes.
   */
  const [phrases, setPhrases] = useState<Phrase[]>(loadPhrases);

  /** The sentence currently in progress. Replaced on every nfw. Null when silent. */
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscript | null>(null);

  const [micLevel, setMicLevel]   = useState(0);
  const [error, setError]         = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<string>("");

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const apiKeyRef      = useRef<string>("");
  const wsRef          = useRef<WebSocket | null>(null);   // single WS now
  const workletRef     = useRef<AudioWorkletNode | null>(null);
  const streamsRef     = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef   = useRef<number | null>(null);
  const startTimeRef   = useRef<number>(0);
  const langModeRef    = useRef<LangMode>("en");

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── Persist history to localStorage whenever it changes ───────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
    } catch { /* storage full — ignore */ }
  }, [phrases]);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setLiveTranscript(null);

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
      } catch (err) {
        console.error("Failed to stop session", err);
      }
      sessionIdRef.current = null;
    }
  }, [stopSessionMut]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  //
  // Single WebSocket per session. Language is fixed at session start.
  //
  // nfw → replace liveTranscript in-place (no new bubble, no translation)
  // fw  → commit phrase to history, clear liveTranscript, fire translation
  //
  const buildWs = useCallback((apiKey: string, langMode: LangMode): WebSocket => {
    const model = modelFor(langMode);
    const ws    = new WebSocket("wss://api.soniox.com/transcribe-websocket");
    let apiErrorOccurred = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key: apiKey,
        model,
        audio_format: "pcm_s16le",
        sample_rate_hertz: TARGET_RATE,
        num_audio_channels: 1,
        include_nonfinal: true,
      }));
      console.log(`[WS] ${model} connected`);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          fw?:  { t?: string; w?: string; text?: string; spk?: number }[];
          nfw?: { t?: string; w?: string; text?: string; spk?: number }[];
          error?: string; code?: number; message?: string;
        };

        // API-level error → surface once, stop reconnecting
        if (data.error || (typeof data.code === "number" && !data.fw && !data.nfw)) {
          const msg = data.error ?? data.message ?? `code ${data.code}`;
          console.error(`[WS] ${model} API error:`, msg);
          setError(`Transcription error: ${msg}`);
          apiErrorOccurred = true;
          return;
        }

        // ── Non-final words → replace liveTranscript in place ───────────────
        // "is_final: false" path — no new bubble, no translation.
        const nfWords = data.nfw ?? [];
        if (nfWords.length > 0) {
          const text = nfWords.map(w => w.t ?? w.w ?? w.text ?? "").join("").trim();
          if (text) {
            setLiveTranscript({
              text,
              language: langMode,
              speakerLabel: makeSpeakerLabel(nfWords[0]?.spk ?? 0),
            });
          }
        }

        // ── Final words → commit to history, clear live ──────────────────────
        // "is_final: true" path — one entry per fw batch → translate immediately.
        const finalWords = data.fw ?? [];
        if (finalWords.length > 0) {
          // Group by speaker
          const runs: { spk: number; text: string }[] = [];
          for (const w of finalWords) {
            const spk = w.spk ?? 0;
            const txt = w.t ?? w.w ?? w.text ?? "";
            const last = runs[runs.length - 1];
            if (last && last.spk === spk) last.text += txt;
            else runs.push({ spk, text: txt });
          }

          const newPhrases: Phrase[] = [];
          for (const run of runs) {
            const trimmed = run.text.trim();
            if (!trimmed) continue;
            newPhrases.push({
              id: nextId(),
              speakerLabel: makeSpeakerLabel(run.spk),
              text: trimmed,
              language: langMode,
            });
          }

          if (newPhrases.length > 0) {
            setPhrases(prev => [...prev, ...newPhrases]);
            setLiveTranscript(null); // clear the live line — this sentence is committed
          }
        }
      } catch (err) {
        console.error(`[WS] ${model} parse error`, err);
      }
    };

    ws.onerror = (e) => console.error(`[WS] ${model} socket error`, e);

    ws.onclose = (e) => {
      const logFn = (e.code === 1000 || e.code === 1001) ? console.log : console.warn;
      logFn(`[WS] ${model} closed — code:${e.code} reason:"${e.reason}"`);

      if (wsRef.current === ws) wsRef.current = null;
      setLiveTranscript(null);

      // Auto-reconnect if still recording and no API error
      if (!isRecordingRef.current || apiErrorOccurred) return;
      console.log(`[WS] ${model} — reconnecting in 200 ms`);
      setTimeout(() => {
        if (!isRecordingRef.current || !apiKeyRef.current) return;
        console.log(`[WS] ${model} reconnecting…`);
        const newWs = buildWs(apiKeyRef.current, langModeRef.current);
        wsRef.current = newWs;
      }, 200);
    };

    return ws;
  }, [stop]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string, langMode: LangMode) => {
    try {
      setError(null);
      setLiveTranscript(null);
      setAudioInfo("");
      langModeRef.current = langMode;

      const tokenRes   = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();
      apiKeyRef.current    = tokenRes.apiKey;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      setAudioInfo(`${ctx.sampleRate} Hz → ${TARGET_RATE} Hz`);

      await ctx.audioWorklet.addModule("/pcm-processor.js");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      streamsRef.current.push(stream);

      const ws = buildWs(tokenRes.apiKey, langMode);
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
        const pcm = e.data as ArrayBuffer;
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(pcm);

        // RMS level for VU meter
        const samples = new Int16Array(pcm);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / samples.length) * 500));
      };

      isRecordingRef.current = true;
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
    phrases,
    liveTranscript,
    micLevel,
    error,
    start,
    stop,
    clear: () => {
      setPhrases([]);
      setLiveTranscript(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
