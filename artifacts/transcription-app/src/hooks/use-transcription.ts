import { useRef, useState, useCallback, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface Phrase {
  id: string;
  speakerIndex: number;   // globally unique: mic-en 0-99, mic-ar 100-199, sys-en 200-299, sys-ar 300-399
  speakerLabel: string;   // "Interpreter" | "Interpreter 2" | "Caller" | "Caller 2"
  source: "mic" | "sys"; // which audio source produced this phrase
  text: string;
  language: string;       // "en" | "ar"
  active: boolean;        // true while accumulating words
}

// ── constants ──────────────────────────────────────────────────────────────
const TARGET_RATE = 16000;

// Speaker-index offsets per channel so indices never collide across the 4 WSs:
//   mic + en_v2  →  offset   0  (speakers  0…99)
//   mic + ar_v1  →  offset 100  (speakers 100…199)
//   sys + en_v2  →  offset 200  (speakers 200…299)
//   sys + ar_v1  →  offset 300  (speakers 300…399)
const OFFSETS = {
  micEn: 0,
  micAr: 100,
  sysEn: 200,
  sysAr: 300,
} as const;

// ── helpers ────────────────────────────────────────────────────────────────

/** Linear-interpolation downsample from fromRate → toRate (noop when equal). */
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

/** Float32 PCM → 16-bit signed little-endian ArrayBuffer. */
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/** Returns true when ≥35% of letter codepoints in `text` are Arabic script. */
function isValidArabicOutput(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabic / letters >= 0.35;
}

/** Human-readable label for a speaker within a source. */
function makeSpeakerLabel(source: "mic" | "sys", localSpkIdx: number): string {
  const base = source === "mic" ? "Interpreter" : "Caller";
  return localSpkIdx > 0 ? `${base} ${localSpkIdx + 1}` : base;
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

// ── hook ──────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<string>("");

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Four WebSocket connections — mic and sys each get their own en_v2 + ar_v1 pair
  const wsMicEnRef = useRef<WebSocket | null>(null);
  const wsMicArRef = useRef<WebSocket | null>(null);
  const wsSysEnRef = useRef<WebSocket | null>(null);
  const wsSysArRef = useRef<WebSocket | null>(null);

  // Two separate audio processors — mic and sys audio NEVER mix
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sysProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const streamsRef = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();

  // ── stop ────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);

    // Seal all active phrases
    setPhrases(prev => prev.map(p => p.active ? { ...p, active: false } : p));

    // Disconnect processors
    micProcessorRef.current?.disconnect();
    micProcessorRef.current = null;
    sysProcessorRef.current?.disconnect();
    sysProcessorRef.current = null;

    // Close all four WebSockets (send empty ArrayBuffer = EOF signal to Soniox)
    for (const wsRef of [wsMicEnRef, wsMicArRef, wsSysEnRef, wsSysArRef]) {
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

    // Stop all media tracks
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

  // ── buildWs ─────────────────────────────────────────────────────────────
  // Each WS handles audio from exactly ONE source (mic OR sys).
  // spkOffset ensures speaker indices never collide across the four connections.
  const buildWs = useCallback((
    apiKey: string,
    model: string,
    langCode: "en" | "ar",
    spkOffset: number,
    source: "mic" | "sys",
    ownRef: MutableRefObject<WebSocket | null>,
    // The peer ref for the same source (e.g. wsMicArRef when building wsMicEnRef)
    // — used to detect when BOTH connections for a source die.
    sourcePeerRef: MutableRefObject<WebSocket | null>,
  ): WebSocket => {
    const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key: apiKey,
        model,
        audio_format: "pcm_s16le",
        sample_rate_hertz: TARGET_RATE,
        num_audio_channels: 1,
        include_nonfinal: false, // keep false — true causes server-side disconnect on these models
      }));
      console.log(`[WS] ${source}/${model} connected`);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          fw?: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string }[];
          error?: string;
          code?: number;
          message?: string;
        };

        // Soniox error response
        if (data.error || (typeof data.code === "number" && !data.fw)) {
          const msg = data.error ?? data.message ?? `code ${data.code}`;
          console.error(`[WS] ${source}/${model} API error: ${msg}`, data);
          setError(`Transcription error (${source}/${model}): ${msg}`);
          return;
        }

        const finalWords = data.fw ?? [];
        if (finalWords.length === 0) return;

        console.log(`[WS] ${source}/${model} fw:`, finalWords.map(w => w.t ?? w.w ?? "").join(""));
        const runs = groupBySpeaker(finalWords);

        setPhrases(prev => {
          const next = [...prev];
          for (const run of runs) {
            const trimmed = run.text.trim();
            if (!trimmed) continue;

            // Language filter: ar_v1 must produce Arabic; en_v2 must not produce Arabic
            if (langCode === "ar" && !isValidArabicOutput(trimmed)) continue;
            if (langCode === "en" && isValidArabicOutput(trimmed)) continue;

            const globalSpk = run.spk + spkOffset;
            const last = next[next.length - 1];

            if (last && last.active && last.speakerIndex === globalSpk) {
              // Same source + same speaker → extend current bubble
              next[next.length - 1] = { ...last, text: last.text + " " + trimmed };
            } else {
              // Source or speaker changed → seal previous bubble, open a new one
              if (last?.active) next[next.length - 1] = { ...last, active: false };
              next.push({
                id: nextId(),
                speakerIndex: globalSpk,
                speakerLabel: makeSpeakerLabel(source, run.spk),
                source,
                text: trimmed,
                language: langCode,
                active: true,
              });
            }
          }
          return next;
        });
      } catch (err) {
        console.error(`[WS] ${source}/${model} parse error`, err);
      }
    };

    ws.onerror = (e) => {
      console.error(`[WS] ${source}/${model} socket error`, e);
    };

    ws.onclose = (e) => {
      const logFn = (e.code === 1000 || e.code === 1001) ? console.log : console.error;
      logFn(`[WS] ${source}/${model} closed — code:${e.code} reason:"${e.reason}"`);

      if (ownRef.current === ws) ownRef.current = null;

      // Surface unexpected drops to the user
      if (isRecordingRef.current && !e.wasClean && e.code !== 1000) {
        setError(`${source === "mic" ? "Mic" : "System"} audio stream dropped (${e.code}${e.reason ? ": " + e.reason : ""})`);
      }

      // When BOTH connections for this source die:
      const bothDead = ownRef.current === null && sourcePeerRef.current === null;
      if (isRecordingRef.current && bothDead) {
        if (source === "mic") {
          // Mic is the primary source — stop the whole session
          void stop();
        } else {
          // Sys audio ended — log but keep mic running
          console.warn("[WS] System audio stream ended; microphone continues.");
        }
      }
    };

    return ws;
  }, [stop]);

  // ── start ────────────────────────────────────────────────────────────────
  const start = useCallback(async (micDeviceId: string, systemDeviceId: string) => {
    try {
      setError(null);
      setPhrases([]);
      setAudioInfo("");

      const tokenRes = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Do NOT specify sampleRate — browser may silently ignore 16 kHz and use
      // hardware rate. We capture at native rate and downsample manually below.
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      const nativeSR = ctx.sampleRate;
      setAudioInfo(`native ${nativeSR} Hz → Soniox ${TARGET_RATE} Hz`);
      console.log(`[Audio] native rate: ${nativeSR} Hz`);

      // ── Mic capture ──────────────────────────────────────────────────────
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

      // ── System audio capture (optional) ─────────────────────────────────
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
          console.warn("[Audio] Could not open system device:", e);
        }
      }

      // ── Open Soniox WebSockets ────────────────────────────────────────────
      // Mic pair: spkOffset 0 (en) and 100 (ar)
      const wsMicEn = buildWs(tokenRes.apiKey, "en_v2", "en", OFFSETS.micEn, "mic", wsMicEnRef, wsMicArRef);
      const wsMicAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", OFFSETS.micAr, "mic", wsMicArRef, wsMicEnRef);
      wsMicEnRef.current = wsMicEn;
      wsMicArRef.current = wsMicAr;

      // Sys pair: spkOffset 200 (en) and 300 (ar) — only opened if system audio exists
      let wsSysEn: WebSocket | null = null;
      let wsSysAr: WebSocket | null = null;
      if (systemStream) {
        wsSysEn = buildWs(tokenRes.apiKey, "en_v2", "en", OFFSETS.sysEn, "sys", wsSysEnRef, wsSysArRef);
        wsSysAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", OFFSETS.sysAr, "sys", wsSysArRef, wsSysEnRef);
        wsSysEnRef.current = wsSysEn;
        wsSysArRef.current = wsSysAr;
      }

      // ── Mic audio graph ───────────────────────────────────────────────────
      // micSource → micAnalyser → micProcessor → ctx.destination
      // (processor MUST be connected to destination or onaudioprocess won't fire)
      const micSource = ctx.createMediaStreamSource(micStream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);

      // 4096 samples @ native 48kHz ≈ 85 ms per chunk → 1365 samples @ 16kHz ≈ 85 ms
      const micProcessor = ctx.createScriptProcessor(4096, 1, 1);
      micProcessorRef.current = micProcessor;
      micAnalyser.connect(micProcessor);
      micProcessor.connect(ctx.destination);

      let micChunks = 0;
      micProcessor.onaudioprocess = (e) => {
        const raw = e.inputBuffer.getChannelData(0);
        const pcm = floatTo16BitPCM(downsampleLinear(raw, nativeSR, TARGET_RATE));
        if (++micChunks <= 2) console.log(`[Mic] chunk #${micChunks}: ${raw.length}@${nativeSR} → ${pcm.byteLength}B@${TARGET_RATE}`);
        if (wsMicEn.readyState === WebSocket.OPEN) wsMicEn.send(pcm);
        if (wsMicAr.readyState === WebSocket.OPEN) wsMicAr.send(pcm);

        // Update mic level meter
        const buf = new Float32Array(micAnalyser.fftSize);
        micAnalyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const a of buf) sum += a * a;
        setMicLevel(Math.min(100, Math.sqrt(sum / buf.length) * 500));
      };

      // ── System audio graph ────────────────────────────────────────────────
      // sysSource → sysAnalyser → sysProcessor → ctx.destination
      if (systemStream && wsSysEn && wsSysAr) {
        const sysSource = ctx.createMediaStreamSource(systemStream);
        const sysAnalyser = ctx.createAnalyser();
        sysAnalyser.fftSize = 256;
        sysSource.connect(sysAnalyser);

        const sysProcessor = ctx.createScriptProcessor(4096, 1, 1);
        sysProcessorRef.current = sysProcessor;
        sysAnalyser.connect(sysProcessor);
        sysProcessor.connect(ctx.destination);

        const capturedSysEn = wsSysEn;
        const capturedSysAr = wsSysAr;
        let sysChunks = 0;
        sysProcessor.onaudioprocess = (e) => {
          const raw = e.inputBuffer.getChannelData(0);
          const pcm = floatTo16BitPCM(downsampleLinear(raw, nativeSR, TARGET_RATE));
          if (++sysChunks <= 2) console.log(`[Sys] chunk #${sysChunks}: ${raw.length}@${nativeSR} → ${pcm.byteLength}B@${TARGET_RATE}`);
          if (capturedSysEn.readyState === WebSocket.OPEN) capturedSysEn.send(pcm);
          if (capturedSysAr.readyState === WebSocket.OPEN) capturedSysAr.send(pcm);

          // Update sys level meter
          const buf = new Float32Array(sysAnalyser.fftSize);
          sysAnalyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const a of buf) sum += a * a;
          setSystemLevel(Math.min(100, Math.sqrt(sum / buf.length) * 500));
        };
      }

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
    micLevel,
    systemLevel,
    error,
    start,
    stop,
    clear: () => setPhrases([]),
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
