import { useRef, useState, useCallback, useEffect, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Public types ───────────────────────────────────────────────────────────────

export type LangCode = "en" | "ar";

/** A completed, permanent transcript entry. All entries in `phrases` are final. */
export interface Phrase {
  id: string;
  speakerLabel: string;
  text: string;
  language: LangCode;
}

/** The sentence currently being spoken.
 *  Shows committed (fw) + current partial (nfw) in one live line. Null when silent. */
export interface LiveTranscript {
  text: string;
  language: LangCode;
  speakerLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE  = 16000;
const STORAGE_KEY  = "interpretai_phrases";
const COMMIT_DELAY = 1500; // ms of silence before sealing a sentence into history

function modelFor(lang: LangCode): string {
  return lang === "en" ? "en_v2_lowlatency" : "ar_v1";
}

function makeSpeakerLabel(spk: number): string {
  return spk > 0 ? `Speaker ${spk + 1}` : "Speaker";
}

function nextId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function loadPhrases(): Phrase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Phrase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** True when ≥35% of letter codepoints in `text` are Arabic script. */
function isArabic(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const arChars = (
    text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []
  ).length;
  return arChars / letters >= 0.35;
}

function joinWords(
  words: { t?: string; w?: string; text?: string }[]
): string {
  return words.map(w => w.t ?? w.w ?? w.text ?? "").join("").trim();
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording]         = useState(false);
  const [phrases, setPhrases]                 = useState<Phrase[]>(loadPhrases);
  const [liveTranscript, setLiveTranscript]   = useState<LiveTranscript | null>(null);
  const [micLevel, setMicLevel]               = useState(0);
  const [error, setError]                     = useState<string | null>(null);
  const [audioInfo, setAudioInfo]             = useState<string>("");

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const apiKeyRef    = useRef<string>("");
  const wsEnRef      = useRef<WebSocket | null>(null);
  const wsArRef      = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Per-channel fw buffers ─────────────────────────────────────────────────
  // Each language channel accumulates committed words independently.
  // A per-channel commit timer seals the buffer into one phrase after COMMIT_DELAY.
  const enBufRef   = useRef<string>("");
  const arBufRef   = useRef<string>("");
  const enSpkRef   = useRef<number>(0);
  const arSpkRef   = useRef<number>(0);
  const enTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Arabic activity guard ──────────────────────────────────────────────────
  // When Arabic nfw/fw arrives we record the timestamp.
  // The English channel suppresses its live display for 1 second after that,
  // preventing en WS garbage from overwriting the Arabic live line.
  const lastArActivityRef = useRef<number>(0);

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── Persist phrases to localStorage ───────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases)); }
    catch { /* storage full */ }
  }, [phrases]);

  // ── flush: commit one channel's buffer to history ─────────────────────────
  const flush = useCallback((lang: LangCode) => {
    const bufRef = lang === "en" ? enBufRef : arBufRef;
    const spkRef = lang === "en" ? enSpkRef : arSpkRef;
    const text   = bufRef.current.trim();
    if (!text) return;
    const spk = spkRef.current;
    bufRef.current = "";
    setPhrases(prev => [
      ...prev,
      { id: nextId(), speakerLabel: makeSpeakerLabel(spk), text, language: lang },
    ]);
    setLiveTranscript(null);
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    // Commit any buffered text before tearing down
    if (enTimerRef.current) clearTimeout(enTimerRef.current);
    if (arTimerRef.current) clearTimeout(arTimerRef.current);
    flush("en");
    flush("ar");

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
      } catch (err) { console.error("Failed to stop session", err); }
      sessionIdRef.current = null;
    }
  }, [stopSessionMut, flush]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  //
  // Two simultaneous WebSockets — en_v2_lowlatency and ar_v1 — receive identical
  // PCM audio. Language detection via isArabic() decides which channel's output
  // is valid and visible.
  //
  // nfw (partial):
  //   Each channel shows its own buffer + current partial in the live line.
  //   Arabic activity suppresses the English live display for 1 s to prevent
  //   garbage en WS output from overwriting the Arabic live line.
  //
  // fw (committed):
  //   Filtered by isArabic() — only the correct channel accumulates each word.
  //   After COMMIT_DELAY ms of silence, the channel's buffer becomes ONE phrase
  //   in history. Translation fires immediately for that phrase.
  //
  const buildWs = useCallback((
    apiKey: string,
    langCode: LangCode,
    ownRef: MutableRefObject<WebSocket | null>,
  ): WebSocket => {
    const model   = modelFor(langCode);
    const ws      = new WebSocket("wss://api.soniox.com/transcribe-websocket");
    const bufRef  = langCode === "en" ? enBufRef : arBufRef;
    const spkRef  = langCode === "en" ? enSpkRef : arSpkRef;
    const timRef  = langCode === "en" ? enTimerRef : arTimerRef;
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

        if (data.error || (typeof data.code === "number" && !data.fw && !data.nfw)) {
          const msg = data.error ?? data.message ?? `code ${data.code}`;
          console.error(`[WS] ${model} API error:`, msg);
          setError(`Transcription error: ${msg}`);
          apiErrorOccurred = true;
          return;
        }

        // ── Non-final words ──────────────────────────────────────────────────
        const nfWords = data.nfw ?? [];
        if (nfWords.length > 0) {
          const partial = joinWords(nfWords);
          if (!partial) return;

          const partialIsAr = isArabic(partial);

          // Language filter: each channel only displays its own language
          if (langCode === "ar" && !partialIsAr) return;
          if (langCode === "en" && partialIsAr)  return;

          if (langCode === "ar") {
            lastArActivityRef.current = Date.now();
          }

          // Suppress English live display when Arabic was active within last 1 s
          if (langCode === "en" && Date.now() - lastArActivityRef.current < 1000) return;

          // Show: committed buffer + current partial (so the full sentence is visible)
          const display = bufRef.current
            ? `${bufRef.current} ${partial}`.trim()
            : partial;

          setLiveTranscript({
            text: display,
            language: langCode,
            speakerLabel: makeSpeakerLabel(nfWords[0]?.spk ?? 0),
          });
        }

        // ── Final words ──────────────────────────────────────────────────────
        const finalWords = data.fw ?? [];
        if (finalWords.length > 0) {
          const committed = joinWords(finalWords);
          if (!committed) return;

          const committedIsAr = isArabic(committed);

          // Language filter: reject cross-language output
          if (langCode === "ar" && !committedIsAr) return;
          if (langCode === "en" && committedIsAr)  return;

          if (langCode === "ar") lastArActivityRef.current = Date.now();

          // Accumulate into this channel's buffer
          bufRef.current  = bufRef.current ? `${bufRef.current} ${committed}` : committed;
          spkRef.current  = finalWords[0]?.spk ?? 0;

          // Update the live line to show the growing committed text
          setLiveTranscript({
            text: bufRef.current,
            language: langCode,
            speakerLabel: makeSpeakerLabel(spkRef.current),
          });

          // Reset the silence countdown — fires when speech pauses for COMMIT_DELAY
          if (timRef.current) clearTimeout(timRef.current);
          timRef.current = setTimeout(() => flush(langCode), COMMIT_DELAY);
        }
      } catch (err) {
        console.error(`[WS] ${model} parse error`, err);
      }
    };

    ws.onerror = (e) => console.error(`[WS] ${model} socket error`, e);

    ws.onclose = (ev) => {
      const logFn = (ev.code === 1000 || ev.code === 1001) ? console.log : console.warn;
      logFn(`[WS] ${model} closed — code:${ev.code} reason:"${ev.reason}"`);
      if (ownRef.current === ws) ownRef.current = null;

      // Auto-reconnect — does NOT clear history or liveTranscript
      if (!isRecRef.current || apiErrorOccurred) return;
      console.log(`[WS] ${model} reconnecting in 200 ms…`);
      setTimeout(() => {
        if (!isRecRef.current || !apiKeyRef.current) return;
        const newWs = buildWs(apiKeyRef.current, langCode, ownRef);
        ownRef.current = newWs;
      }, 200);
    };

    return ws;
  }, [stop, flush]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setLiveTranscript(null);
      setAudioInfo("");
      enBufRef.current = "";
      arBufRef.current = "";
      lastArActivityRef.current = 0;

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

      // Open BOTH language WebSockets simultaneously
      const wsEn = buildWs(tokenRes.apiKey, "en", wsEnRef);
      const wsAr = buildWs(tokenRes.apiKey, "ar", wsArRef);
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
        // Feed identical audio to both language channels
        if (wsEnRef.current?.readyState === WebSocket.OPEN) wsEnRef.current.send(pcm);
        if (wsArRef.current?.readyState === WebSocket.OPEN) wsArRef.current.send(pcm);

        const samples = new Int16Array(pcm);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / samples.length) * 500));
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
    phrases,
    liveTranscript,
    micLevel,
    error,
    start,
    stop,
    clear: () => {
      setPhrases([]);
      setLiveTranscript(null);
      enBufRef.current = "";
      arBufRef.current = "";
      if (enTimerRef.current) clearTimeout(enTimerRef.current);
      if (arTimerRef.current) clearTimeout(arTimerRef.current);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
