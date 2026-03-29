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
const TARGET_RATE = 16000;  // Soniox requires 16 kHz mono PCM
const AR_SPK_OFFSET = 100;  // offset ar_v1 speaker indices to avoid collision with en_v2

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Downsample a Float32 buffer from `fromRate` Hz to `toRate` Hz using
 * linear interpolation. If rates match, returns the input unchanged.
 */
function downsampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outputLen = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLen);
  for (let i = 0; i < outputLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    output[i] = a + frac * (b - a);
  }
  return output;
}

/** Convert a Float32 PCM buffer to 16-bit signed little-endian. */
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

function speakerLabel(idx: number): string {
  return `Speaker ${idx + 1}`;
}

/** Returns true when ≥ 35 % of letters in `text` are Arabic script. */
function isValidArabicOutput(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabic / letters >= 0.35;
}

/** Group consecutive finalized words by speaker into runs. */
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
  const [connectedModels, setConnectedModels] = useState<string[]>([]);
  /** Actual audio context sample rate — shown in the UI for diagnostics */
  const [audioInfo, setAudioInfo] = useState<string>("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsEnRef = useRef<WebSocket | null>(null);
  const wsArRef = useRef<WebSocket | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const chunksSentRef = useRef(0);

  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();

  // ── stop ─────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    setConnectedModels([]);

    setPhrases(prev => prev.map(p => p.active ? { ...p, active: false } : p));

    processorRef.current?.disconnect();
    processorRef.current = null;

    for (const wsRef of [wsEnRef, wsArRef]) {
      if (wsRef.current) {
        try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* ignore */ }
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
    setSystemLevel(0);

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

  // ── build one Soniox WebSocket ────────────────────────────────────────────
  const buildWs = useCallback((
    apiKey: string,
    model: string,
    langCode: string,
    spkOffset: number,
    ownRef: MutableRefObject<WebSocket | null>,
  ): WebSocket => {
    const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");

    ws.onopen = () => {
      const initMsg = {
        api_key: apiKey,
        model,
        audio_format: "pcm_s16le",
        sample_rate_hertz: TARGET_RATE,
        num_audio_channels: 1,
        include_nonfinal: false,  // NOTE: true causes disconnect on en_v2/ar_v1 — keep false
      };
      ws.send(JSON.stringify(initMsg));
      console.log(`[WS] ${model} opened → init sent`, initMsg);
      setConnectedModels(prev => [...prev.filter(m => m !== model), model]);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          fw?: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string }[];
          error?: string;
          code?: number;
          message?: string;
        };

        // Soniox API error response
        if (data.error || (typeof data.code === "number" && !data.fw)) {
          const msg = data.error ?? data.message ?? `code ${data.code}`;
          console.error(`[WS] ${model} API error: ${msg}`, data);
          setError(`Transcription error (${model}): ${msg}`);
          return;
        }

        const finalWords = data.fw ?? [];
        if (finalWords.length === 0) return;

        console.log(`[WS] ${model} fw (${finalWords.length} words):`,
          finalWords.map(w => w.t ?? w.w ?? w.text).join(""));

        const runs = groupBySpeaker(finalWords);

        setPhrases(prev => {
          const next = [...prev];
          for (const run of runs) {
            const trimmed = run.text.trim();
            if (!trimmed) continue;
            if (langCode === "ar" && !isValidArabicOutput(trimmed)) continue;
            if (langCode === "en" && isValidArabicOutput(trimmed)) continue;

            const globalSpk = run.spk + spkOffset;
            const last = next[next.length - 1];

            if (last && last.active && last.speakerIndex === globalSpk) {
              next[next.length - 1] = { ...last, text: last.text + " " + trimmed };
            } else {
              if (last?.active) next[next.length - 1] = { ...last, active: false };
              next.push({
                id: nextId(),
                speakerIndex: globalSpk,
                speakerLabel: speakerLabel(langCode === "ar" ? run.spk + 2 : run.spk),
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
      console.error(`[WS] ${model} socket error`, e);
    };

    ws.onclose = (e) => {
      const logFn = (e.code === 1000 || e.code === 1001) ? console.log : console.error;
      logFn(`[WS] ${model} closed — code:${e.code} reason:"${e.reason}" wasClean:${e.wasClean}`);

      setConnectedModels(prev => prev.filter(m => m !== model));
      if (ownRef.current === ws) ownRef.current = null;

      if (isRecordingRef.current && !e.wasClean) {
        setError(`${model} disconnected unexpectedly (code ${e.code}${e.reason ? `: ${e.reason}` : ""})`);
      }

      if (isRecordingRef.current && wsEnRef.current === null && wsArRef.current === null) {
        void stop();
      }
    };

    return ws;
  }, [stop]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (micDeviceId: string, systemDeviceId: string) => {
    try {
      setError(null);
      setPhrases([]);
      setConnectedModels([]);
      setAudioInfo("");
      chunksSentRef.current = 0;

      const tokenRes = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // ── Critical: do NOT specify sampleRate here. ──────────────────────────
      // Requesting 16 kHz is frequently ignored by browsers and silently falls
      // back to the hardware rate (44.1 / 48 kHz). We capture at the native
      // rate and manually downsample to TARGET_RATE (16 kHz) below.
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      const nativeSR = ctx.sampleRate;
      const info = `native ${nativeSR} Hz → Soniox ${TARGET_RATE} Hz`;
      setAudioInfo(info);
      console.log(`[Audio] Context sample rate: ${nativeSR} Hz (${info})`);

      // Mic: no sampleRate constraint — let the browser use its native rate
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
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
              channelCount: 1,
            },
          });
          streamsRef.current.push(systemStream);
        } catch (e) {
          console.warn("Could not open system audio device:", e);
        }
      }

      // ── Audio graph ──────────────────────────────────────────────────────
      // micSource → micAnalyser ──┐
      //                           ├──→ processor (ScriptProcessorNode) → ctx.destination
      // sysSource → sysAnalyser ──┘
      //
      // ScriptProcessorNode sums all connected inputs into inputBuffer[0].
      // We then downsample from nativeSR → 16 kHz before sending to Soniox.

      const micSource = ctx.createMediaStreamSource(micStream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);

      const sysAnalyser = ctx.createAnalyser();
      sysAnalyser.fftSize = 256;

      // Use a buffer large enough to give ~100 ms at the native rate
      // Nearest power-of-2 to (nativeSR * 0.1): 48000 * 0.1 = 4800 → 4096
      const bufSize = 4096;
      const processor = ctx.createScriptProcessor(bufSize, 1, 1);
      processorRef.current = processor;

      micAnalyser.connect(processor);
      if (systemStream) {
        const sysSource = ctx.createMediaStreamSource(systemStream);
        sysSource.connect(sysAnalyser);
        sysAnalyser.connect(processor);
      }
      processor.connect(ctx.destination);   // must be connected or onaudioprocess won't fire

      // Open BOTH Soniox WebSocket connections
      const wsEn = buildWs(tokenRes.apiKey, "en_v2", "en", 0, wsEnRef);
      const wsAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", AR_SPK_OFFSET, wsArRef);
      wsEnRef.current = wsEn;
      wsArRef.current = wsAr;

      const updateLevel = (analyser: AnalyserNode, setter: (v: number) => void) => {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const a of buf) sum += a * a;
        setter(Math.min(100, Math.sqrt(sum / buf.length) * 500));
      };

      processor.onaudioprocess = (e) => {
        // Downsample from nativeSR to TARGET_RATE (16 kHz)
        const raw = e.inputBuffer.getChannelData(0);
        const downsampled = downsampleLinear(raw, nativeSR, TARGET_RATE);
        const pcm = floatTo16BitPCM(downsampled);

        const n = ++chunksSentRef.current;
        if (n <= 3) {
          // Log the first few chunks so we can verify audio is reaching Soniox
          console.log(`[Audio] chunk #${n}: ${raw.length} samples@${nativeSR}Hz → ${downsampled.length} samples@${TARGET_RATE}Hz (${pcm.byteLength} bytes PCM)`);
        }

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
    connectedModels,
    audioInfo,
    phrases,
    micLevel,
    systemLevel,
    error,
    start,
    stop,
    clear: () => setPhrases([]),
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
