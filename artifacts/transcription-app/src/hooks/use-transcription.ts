import { useRef, useState, useCallback, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Public types ───────────────────────────────────────────────────────────────

/** A completed, permanent transcript entry. All entries in `phrases` are final. */
export interface Phrase {
  id: string;
  speakerIndex: number;
  speakerLabel: string;
  source: "mic";
  text: string;
  language: "en" | "ar";
}

/** The sentence currently being spoken — replaced in-place on every partial update.
 *  Null when no speech is in progress. */
export interface LiveTranscript {
  text: string;
  language: "en" | "ar";
  speakerLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE = 16000;
const OFFSETS = { en: 0, ar: 100 } as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function isValidArabicOutput(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabic / letters >= 0.35;
}

function makeSpeakerLabel(localSpkIdx: number): string {
  return localSpkIdx > 0 ? `Speaker ${localSpkIdx + 1}` : "Speaker";
}

function groupBySpeaker(
  words: { t?: string; w?: string; text?: string; spk?: number }[]
): { spk: number; text: string }[] {
  const runs: { spk: number; text: string }[] = [];
  for (const w of words) {
    const spk = w.spk ?? 0;
    const txt = w.t ?? w.w ?? w.text ?? "";
    const last = runs[runs.length - 1];
    if (last && last.spk === spk) last.text += txt;
    else runs.push({ spk, text: txt });
  }
  return runs;
}

let phraseIdCounter = 0;
function nextId() { return `p-${++phraseIdCounter}`; }

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);

  /** Permanent history — finalized sentences only. Never contains partials. */
  const [phrases, setPhrases] = useState<Phrase[]>([]);

  /** The sentence currently in progress. Replaced on every nfw. Null when silent. */
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscript | null>(null);

  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<string>("");

  const audioCtxRef   = useRef<AudioContext | null>(null);
  const apiKeyRef     = useRef<string>("");
  const wsEnRef       = useRef<WebSocket | null>(null);
  const wsArRef       = useRef<WebSocket | null>(null);
  const workletRef    = useRef<AudioWorkletNode | null>(null);
  const streamsRef    = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef  = useRef<number | null>(null);
  const startTimeRef  = useRef<number>(0);

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setLiveTranscript(null); // discard any in-progress partial on stop

    workletRef.current?.disconnect();
    workletRef.current = null;

    for (const wsRef of [wsEnRef, wsArRef]) {
      if (wsRef.current) {
        try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* eof */ }
        wsRef.current.close();
        wsRef.current = null;
      }
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
  // nfw (non-final words) — "is_final: false" in the user's model
  //   → Replace liveTranscript in-place. No new bubble, no translation.
  //
  // fw (final words) — "is_final: true" in the user's model
  //   → Commit to phrases history + clear liveTranscript + translation fires
  //     via the useEffect in workspace that watches phrases.length.
  //
  const buildWs = useCallback((
    apiKey: string,
    model: string,
    langCode: "en" | "ar",
    spkOffset: number,
    ownRef: MutableRefObject<WebSocket | null>,
    peerRef: MutableRefObject<WebSocket | null>,
  ): WebSocket => {
    const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");
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
          setError(`Transcription error (${model}): ${msg}`);
          apiErrorOccurred = true;
          return;
        }

        // ── Non-final words: update liveTranscript in-place ─────────────────
        // This is the "is_final: false" branch from the user's pseudocode.
        // We REPLACE the live text every time — no new bubble, no translation.
        const nfWords = data.nfw ?? [];
        if (nfWords.length > 0) {
          const text = nfWords.map(w => w.t ?? w.w ?? w.text ?? "").join("").trim();
          if (text) {
            const isAr = isValidArabicOutput(text);
            const isCorrectLang = langCode === "ar" ? isAr : !isAr;
            if (isCorrectLang) {
              setLiveTranscript({
                text,
                language: langCode,
                speakerLabel: makeSpeakerLabel(nfWords[0]?.spk ?? 0),
              });
            }
          }
        }

        // ── Final words: commit to history, clear live, fire translation ─────
        // This is the "is_final: true" branch from the user's pseudocode.
        const finalWords = data.fw ?? [];
        if (finalWords.length > 0) {
          const runs = groupBySpeaker(finalWords);
          const newPhrases: Phrase[] = [];

          for (const run of runs) {
            const trimmed = run.text.trim();
            if (!trimmed) continue;

            // Language filter — reject cross-language output from the wrong WS
            if (langCode === "ar" && !isValidArabicOutput(trimmed)) continue;
            if (langCode === "en" && isValidArabicOutput(trimmed)) continue;

            newPhrases.push({
              id: nextId(),
              speakerIndex: run.spk + spkOffset,
              speakerLabel: makeSpeakerLabel(run.spk),
              source: "mic",
              text: trimmed,
              language: langCode,
            });
          }

          if (newPhrases.length > 0) {
            // Add all new final phrases to history
            setPhrases(prev => [...prev, ...newPhrases]);
            // Clear the live transcript — this sentence is now committed
            setLiveTranscript(null);
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

      if (ownRef.current === ws) ownRef.current = null;

      // Clear live transcript if it belongs to this language channel
      setLiveTranscript(prev => (prev?.language === langCode ? null : prev));

      // Auto-reconnect if still recording and no API error
      if (!isRecordingRef.current || apiErrorOccurred) return;
      console.log(`[WS] ${model} — reconnecting in 200 ms`);
      setTimeout(() => {
        if (!isRecordingRef.current || !apiKeyRef.current) return;
        console.log(`[WS] ${model} reconnecting…`);
        const newWs = buildWs(apiKeyRef.current, model, langCode, spkOffset, ownRef, peerRef);
        ownRef.current = newWs;
      }, 200);
    };

    return ws;
  }, [stop]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setPhrases([]);
      setLiveTranscript(null);
      setAudioInfo("");

      const tokenRes   = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current  = sessionRes.sessionId;
      startTimeRef.current  = Date.now();
      apiKeyRef.current     = tokenRes.apiKey;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      setAudioInfo(`${ctx.sampleRate} Hz → ${TARGET_RATE} Hz (AudioWorklet)`);

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

      const wsEn = buildWs(tokenRes.apiKey, "en_v2_lowlatency", "en", OFFSETS.en, wsEnRef, wsArRef);
      const wsAr = buildWs(tokenRes.apiKey, "ar_v1",            "ar", OFFSETS.ar, wsArRef, wsEnRef);
      wsEnRef.current = wsEn;
      wsArRef.current = wsAr;

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

        if (wsEnRef.current?.readyState === WebSocket.OPEN) wsEnRef.current.send(pcm);
        if (wsArRef.current?.readyState === WebSocket.OPEN) wsArRef.current.send(pcm);

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
    phrases,        // history: final entries only
    liveTranscript, // current partial (null when silent)
    micLevel,
    error,
    start,
    stop,
    clear: () => { setPhrases([]); setLiveTranscript(null); },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
