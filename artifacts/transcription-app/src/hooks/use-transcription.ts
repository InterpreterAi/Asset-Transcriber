import { useRef, useState, useCallback, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface Phrase {
  id: string;
  speakerIndex: number;
  speakerLabel: string;
  text: string;
  language: string;
  /** true while this phrase is still accumulating words from the same speaker */
  active: boolean;
}

// ── constants ───────────────────────────────────────────────────────────────
const SAMPLE_RATE = 16000;
// Offset ar_v1 speaker indices so they never collide with en_v2 speaker indices
const AR_SPK_OFFSET = 100;

// ── helpers ─────────────────────────────────────────────────────────────────
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

function speakerLabel(globalIdx: number): string {
  return `Speaker ${globalIdx + 1}`;
}

/** Is this Arabic text valid (≥ 35% Arabic-script letters)? Filters en_v2 garbage from ar_v1 */
function isValidArabicOutput(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabic / letters >= 0.35;
}

/** Group consecutive fw words by speaker into runs */
function groupBySpeaker(
  words: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string }[]
): { spk: number; text: string; lang: string }[] {
  const runs: { spk: number; text: string; lang: string }[] = [];
  for (const w of words) {
    const spk = w.spk ?? 0;
    const txt = w.t ?? w.w ?? w.text ?? "";
    const lang = w.lang ?? w.lg ?? "";
    const last = runs[runs.length - 1];
    if (last && last.spk === spk) {
      last.text += txt;
      if (!last.lang && lang) last.lang = lang;
    } else {
      runs.push({ spk, text: txt, lang });
    }
  }
  return runs;
}

let phraseIdCounter = 0;
function nextId() { return `p-${++phraseIdCounter}`; }

// ── hook ─────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Live interim (non-final) text per model — shown as ghost while speaking */
  const [interim, setInterim] = useState<{ en: string; ar: string }>({ en: "", ar: "" });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsEnRef = useRef<WebSocket | null>(null);   // en_v2
  const wsArRef = useRef<WebSocket | null>(null);   // ar_v1
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();

  // ── stop ───────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);

    // Seal all active phrases and clear any interim text
    setPhrases(prev => prev.map(p => p.active ? { ...p, active: false } : p));
    setInterim({ en: "", ar: "" });

    // Disconnect script processor
    processorRef.current?.disconnect();
    processorRef.current = null;

    // Close both WebSockets
    for (const wsRef of [wsEnRef, wsArRef]) {
      if (wsRef.current) {
        try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* ignore */ }
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    // Close audio context
    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    // Stop media tracks
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    setMicLevel(0);
    setSystemLevel(0);

    // Log session duration
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

  // ── build a single WS connection ──────────────────────────────────────────
  const buildWs = useCallback((
    apiKey: string,
    model: string,
    langCode: string,     // "en" or "ar"
    spkOffset: number,    // 0 for en_v2, AR_SPK_OFFSET for ar_v1
    ownRef: MutableRefObject<WebSocket | null>,
  ): WebSocket => {
    const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key: apiKey,
        model,
        audio_format: "pcm_s16le",
        sample_rate_hertz: SAMPLE_RATE,
        num_audio_channels: 1,
        include_nonfinal: true,
      }));
      console.log(`[WS] ${model} connected`);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          fw?: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string }[];
          nfw?: { t?: string; w?: string; text?: string; spk?: number }[];
        };

        // ── Handle non-final (interim) words ───────────────────────────────
        const nfwText = (data.nfw ?? [])
          .map(w => w.t ?? w.w ?? w.text ?? "")
          .join("")
          .trim();

        if (langCode === "en") {
          // Only show en interim if it doesn't look like Arabic garbage
          const showEn = !nfwText || !isValidArabicOutput(nfwText);
          setInterim(prev => ({ ...prev, en: showEn ? nfwText : prev.en }));
        } else {
          // Only show ar interim if it actually looks like Arabic
          const showAr = !nfwText || isValidArabicOutput(nfwText);
          setInterim(prev => ({ ...prev, ar: showAr ? nfwText : prev.ar }));
        }

        // ── Handle final words ─────────────────────────────────────────────
        const finalWords = data.fw ?? [];

        // When fw arrives, those interim words are now committed — clear interim
        if (finalWords.length > 0 && langCode === "en") setInterim(prev => ({ ...prev, en: "" }));
        if (finalWords.length > 0 && langCode === "ar") setInterim(prev => ({ ...prev, ar: "" }));

        if (finalWords.length === 0) return;

        const runs = groupBySpeaker(finalWords);

        setPhrases(prev => {
          const next = [...prev];

          for (const run of runs) {
            const trimmed = run.text.trim();
            if (!trimmed) continue;

            // For Arabic model: reject if output isn't actually Arabic
            if (langCode === "ar" && !isValidArabicOutput(trimmed)) continue;
            // For English model: reject if output is mostly Arabic script (cross-language garbage)
            if (langCode === "en" && isValidArabicOutput(trimmed)) continue;

            const globalSpk = run.spk + spkOffset;
            const last = next[next.length - 1];

            if (last && last.active && last.speakerIndex === globalSpk) {
              // Same speaker, same model → append to current bubble
              next[next.length - 1] = {
                ...last,
                text: last.text + " " + trimmed,
              };
            } else {
              // Speaker or language changed → seal previous, open new bubble
              if (last?.active) {
                next[next.length - 1] = { ...last, active: false };
              }
              next.push({
                id: nextId(),
                speakerIndex: globalSpk,
                speakerLabel: speakerLabel(
                  // Display label: keep it simple (0-based within model)
                  langCode === "ar" ? run.spk + 2 : run.spk
                ),
                text: trimmed,
                language: langCode,
                active: true,
              });
            }
          }

          return next;
        });
      } catch (err) {
        console.error(`[WS] ${model} parse error`, err);
      }
    };

    ws.onerror = (e) => {
      console.error(`[WS] ${model} error`, e);
    };

    ws.onclose = (e) => {
      console.log(`[WS] ${model} closed`, e.code, e.reason);
      // Null our own ref so both-gone check works
      if (ownRef.current === ws) ownRef.current = null;
      // If both connections dropped while we're still recording → stop cleanly
      if (isRecordingRef.current &&
          wsEnRef.current === null &&
          wsArRef.current === null) {
        void stop();
      }
    };

    return ws;
  }, [stop]);

  // ── start ──────────────────────────────────────────────────────────────────
  const start = useCallback(async (micDeviceId: string, systemDeviceId: string) => {
    try {
      setError(null);
      setPhrases([]);

      const tokenRes = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Use 16kHz directly — both models require it
      const ctx = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = ctx;

      // Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: SAMPLE_RATE,
        },
      });
      streamsRef.current.push(micStream);

      // System audio (optional)
      let systemStream: MediaStream | null = null;
      if (systemDeviceId && systemDeviceId !== micDeviceId) {
        try {
          systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: systemDeviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          streamsRef.current.push(systemStream);
        } catch (e) {
          console.warn("Could not open system audio device:", e);
        }
      }

      // Build mix graph
      const micSource = ctx.createMediaStreamSource(micStream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);

      const sysAnalyser = ctx.createAnalyser();
      sysAnalyser.fftSize = 256;

      const destination = ctx.createMediaStreamDestination();
      micAnalyser.connect(destination);

      if (systemStream) {
        const sysSource = ctx.createMediaStreamSource(systemStream);
        sysSource.connect(sysAnalyser);
        sysAnalyser.connect(destination);
      }

      // Open BOTH WebSocket connections before starting audio
      const wsEn = buildWs(tokenRes.apiKey, "en_v2", "en", 0, wsEnRef);
      const wsAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", AR_SPK_OFFSET, wsArRef);
      wsEnRef.current = wsEn;
      wsArRef.current = wsAr;

      // Script processor: 1024 samples @ 16kHz = ~64ms per chunk (true streaming)
      const processor = ctx.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      const mixedSource = ctx.createMediaStreamSource(destination.stream);
      mixedSource.connect(processor);
      processor.connect(ctx.destination);

      const updateLevel = (analyser: AnalyserNode, setter: (v: number) => void) => {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const a of buf) sum += a * a;
        setter(Math.min(100, Math.sqrt(sum / buf.length) * 500));
      };

      processor.onaudioprocess = (e) => {
        const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
        if (wsEn.readyState === WebSocket.OPEN) wsEn.send(pcm);
        if (wsAr.readyState === WebSocket.OPEN) wsAr.send(pcm);
        updateLevel(micAnalyser, setMicLevel);
        if (systemStream) updateLevel(sysAnalyser, setSystemLevel);
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
    phrases,
    interim,
    micLevel,
    systemLevel,
    error,
    start,
    stop,
    clear: () => { setPhrases([]); setInterim({ en: "", ar: "" }); },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
