import { useRef, useState, useCallback, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface Phrase {
  id: string;
  speakerIndex: number;   // globally unique offset — see OFFSETS constant
  speakerLabel: string;   // "Interpreter" | "Interpreter 2" | "Caller" | "Caller 2"
  source: "mic" | "sys"; // which audio source produced this phrase
  text: string;           // finalized words
  pendingText?: string;   // non-final (partial) words currently being spoken
  language: string;       // "en" | "ar"
  active: boolean;        // true while this phrase is still accumulating words
}

// ── constants ─────────────────────────────────────────────────────────────
const TARGET_RATE = 16000; // Soniox requires 16 kHz mono PCM

// Speaker-index offsets per channel — must not collide across the 4 WebSockets:
//   mic + en_v2_lowlatency → offset   0  (speakers   0…99)
//   mic + ar_v1            → offset 100  (speakers 100…199)
//   sys + en_v2_lowlatency → offset 200  (speakers 200…299)
//   sys + ar_v1            → offset 300  (speakers 300…399)
const OFFSETS = { micEn: 0, micAr: 100, sysEn: 200, sysAr: 300 } as const;

// ── helpers ───────────────────────────────────────────────────────────────

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
  words: { t?: string; w?: string; text?: string; spk?: number }[]
): { spk: number; text: string }[] {
  const runs: { spk: number; text: string }[] = [];
  for (const w of words) {
    const spk = w.spk ?? 0;
    const txt = w.t ?? w.w ?? w.text ?? "";
    const last = runs[runs.length - 1];
    if (last && last.spk === spk) {
      last.text += txt;
    } else {
      runs.push({ spk, text: txt });
    }
  }
  return runs;
}

/** Find the last index in an array satisfying a predicate (like Array.findLastIndex). */
function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i;
  }
  return -1;
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
  const apiKeyRef = useRef<string>("");   // stored for auto-reconnect

  // Four WebSocket refs — mic and sys each have their own en+ar pair
  const wsMicEnRef = useRef<WebSocket | null>(null);
  const wsMicArRef = useRef<WebSocket | null>(null);
  const wsSysEnRef = useRef<WebSocket | null>(null);
  const wsSysArRef = useRef<WebSocket | null>(null);

  // Two AudioWorkletNode refs — one per audio source
  const micWorkletRef = useRef<AudioWorkletNode | null>(null);
  const sysWorkletRef = useRef<AudioWorkletNode | null>(null);

  const streamsRef = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();

  // ── stop ──────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false; // set BEFORE closing WSs so onclose won't reconnect
    setIsRecording(false);

    // Seal all active phrases and clear any pending partial text
    setPhrases(prev => prev.map(p => p.active ? { ...p, active: false, pendingText: undefined } : p));

    // Disconnect AudioWorklet nodes
    micWorkletRef.current?.disconnect();
    micWorkletRef.current = null;
    sysWorkletRef.current?.disconnect();
    sysWorkletRef.current = null;

    // Send EOF + close all four WebSockets
    for (const wsRef of [wsMicEnRef, wsMicArRef, wsSysEnRef, wsSysArRef]) {
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

  // ── buildWs ───────────────────────────────────────────────────────────
  // Creates one Soniox WebSocket. Includes:
  //   • non-final words (nfw) → live pendingText updates
  //   • final words   (fw)  → committed phrase text
  //   • auto-reconnect on unexpected close while still recording
  const buildWs = useCallback((
    apiKey: string,
    model: string,
    langCode: "en" | "ar",
    spkOffset: number,
    source: "mic" | "sys",
    ownRef: MutableRefObject<WebSocket | null>,
    sourcePeerRef: MutableRefObject<WebSocket | null>, // the other WS for the same source
  ): WebSocket => {
    const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");
    // Prevents reconnect loops when the API rejects the request (e.g. invalid model)
    let apiErrorOccurred = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key: apiKey,
        model,
        audio_format: "pcm_s16le",
        sample_rate_hertz: TARGET_RATE,
        num_audio_channels: 1,
        include_nonfinal: true, // enables partial words (nfw) for low-latency display
      }));
      console.log(`[WS] ${source}/${model} connected`);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          fw?: { t?: string; w?: string; text?: string; spk?: number }[];
          nfw?: { t?: string; w?: string; text?: string; spk?: number }[];
          error?: string; code?: number; message?: string;
        };

        // Soniox API-level error (e.g. invalid model, bad API key)
        if (data.error || (typeof data.code === "number" && !data.fw && !data.nfw)) {
          const msg = data.error ?? data.message ?? `code ${data.code}`;
          console.error(`[WS] ${source}/${model} API error:`, msg, data);
          setError(`Transcription error (${source}/${model}): ${msg}`);
          apiErrorOccurred = true; // do not reconnect — same error will repeat
          return;
        }

        // ── Non-final words → update pendingText ─────────────────────
        const nfWords = data.nfw ?? [];
        if (nfWords.length > 0) {
          const pending = nfWords.map(w => w.t ?? w.w ?? w.text ?? "").join("").trim();
          if (pending) {
            // Language filter: don't let ar_v1 show English partials or vice-versa
            const isAr = isValidArabicOutput(pending);
            if (langCode === "ar" && !isAr) { /* skip */ }
            else if (langCode === "en" && isAr) { /* skip */ }
            else {
              setPhrases(prev => {
                const next = [...prev];
                const idx = findLastIndex(next,
                  p => p.active && p.source === source && p.language === langCode);
                if (idx >= 0) {
                  next[idx] = { ...next[idx]!, pendingText: pending };
                } else {
                  // No active phrase yet for this source+lang — open one
                  next.push({
                    id: nextId(),
                    speakerIndex: (nfWords[0]?.spk ?? 0) + spkOffset,
                    speakerLabel: makeSpeakerLabel(source, nfWords[0]?.spk ?? 0),
                    source,
                    text: "",
                    pendingText: pending,
                    language: langCode,
                    active: true,
                  });
                }
                return next;
              });
            }
          }
        }

        // ── Final words → commit text, clear pending ──────────────────
        const finalWords = data.fw ?? [];
        if (finalWords.length > 0) {
          const runs = groupBySpeaker(finalWords);
          setPhrases(prev => {
            const next = [...prev];
            for (const run of runs) {
              const trimmed = run.text.trim();
              if (!trimmed) continue;

              // Language filter
              if (langCode === "ar" && !isValidArabicOutput(trimmed)) continue;
              if (langCode === "en" && isValidArabicOutput(trimmed)) continue;

              const globalSpk = run.spk + spkOffset;
              const last = next[next.length - 1];

              if (last && last.active && last.speakerIndex === globalSpk) {
                // Same speaker continues → append and clear pending
                next[next.length - 1] = {
                  ...last,
                  text: last.text ? `${last.text} ${trimmed}` : trimmed,
                  pendingText: undefined,
                };
              } else {
                // Speaker changed → seal current, open new
                if (last?.active) {
                  next[next.length - 1] = { ...last, active: false, pendingText: undefined };
                }
                next.push({
                  id: nextId(),
                  speakerIndex: globalSpk,
                  speakerLabel: makeSpeakerLabel(source, run.spk),
                  source,
                  text: trimmed,
                  pendingText: undefined,
                  language: langCode,
                  active: true,
                });
              }
            }
            return next;
          });
        }
      } catch (err) {
        console.error(`[WS] ${source}/${model} parse error`, err);
      }
    };

    ws.onerror = (e) => console.error(`[WS] ${source}/${model} socket error`, e);

    ws.onclose = (e) => {
      const logFn = (e.code === 1000 || e.code === 1001) ? console.log : console.warn;
      logFn(`[WS] ${source}/${model} closed — code:${e.code} reason:"${e.reason}"`);

      if (ownRef.current === ws) ownRef.current = null;

      // Clear stale pending text from this source+lang when its connection drops
      setPhrases(prev => prev.map(p =>
        p.active && p.source === source && p.language === langCode
          ? { ...p, pendingText: undefined }
          : p
      ));

      // If the session is still running AND the close wasn't due to an API error,
      // reconnect automatically. isRecordingRef is set false BEFORE closeing WSs
      // in stop(), so this check correctly skips reconnect when the user stops.
      if (!isRecordingRef.current || apiErrorOccurred) return;

      console.log(`[WS] ${source}/${model} — scheduling reconnect in 200 ms`);
      setTimeout(() => {
        if (!isRecordingRef.current || !apiKeyRef.current) return;
        console.log(`[WS] ${source}/${model} reconnecting…`);
        const newWs = buildWs(apiKeyRef.current, model, langCode, spkOffset, source, ownRef, sourcePeerRef);
        ownRef.current = newWs;
      }, 200);
    };

    return ws;
  }, [stop]);

  // ── start ─────────────────────────────────────────────────────────────
  const start = useCallback(async (micDeviceId: string, systemDeviceId: string) => {
    try {
      setError(null);
      setPhrases([]);
      setAudioInfo("");

      const tokenRes = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();
      apiKeyRef.current = tokenRes.apiKey; // stored for auto-reconnect

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Capture at hardware native rate; worklet downsamples to TARGET_RATE
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      const nativeSR = ctx.sampleRate;
      setAudioInfo(`${nativeSR} Hz → ${TARGET_RATE} Hz (AudioWorklet)`);
      console.log(`[Audio] native rate: ${nativeSR} Hz`);

      // ── Load the AudioWorklet processor ─────────────────────────────
      // The worklet script lives in /public so Vite serves it at /pcm-processor.js
      await ctx.audioWorklet.addModule("/pcm-processor.js");

      // ── Mic capture ─────────────────────────────────────────────────
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

      // ── System audio capture (optional) ─────────────────────────────
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

      // ── Open Soniox WebSocket pairs ──────────────────────────────────
      // Mic pair (always)
      const wsMicEn = buildWs(tokenRes.apiKey, "en_v2_lowlatency", "en", OFFSETS.micEn, "mic", wsMicEnRef, wsMicArRef);
      const wsMicAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", OFFSETS.micAr, "mic", wsMicArRef, wsMicEnRef);
      wsMicEnRef.current = wsMicEn;
      wsMicArRef.current = wsMicAr;

      // Sys pair (only when a system audio device is selected)
      let wsSysEn: WebSocket | null = null;
      let wsSysAr: WebSocket | null = null;
      if (systemStream) {
        wsSysEn = buildWs(tokenRes.apiKey, "en_v2_lowlatency", "en", OFFSETS.sysEn, "sys", wsSysEnRef, wsSysArRef);
        wsSysAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", OFFSETS.sysAr, "sys", wsSysArRef, wsSysEnRef);
        wsSysEnRef.current = wsSysEn;
        wsSysArRef.current = wsSysAr;
      }

      // ── Mic audio graph ──────────────────────────────────────────────
      // micSource → micAnalyser → micWorklet → ctx.destination (silent)
      const micSource = ctx.createMediaStreamSource(micStream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSource.connect(micAnalyser);

      const micWorklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { targetRate: TARGET_RATE },
      });
      micWorkletRef.current = micWorklet;
      micAnalyser.connect(micWorklet);
      micWorklet.connect(ctx.destination); // AudioWorkletNode must be connected to stay active

      micWorklet.port.onmessage = (e) => {
        const pcm = e.data as ArrayBuffer;

        // Forward audio to mic WebSockets (use current ref — updated on reconnect)
        if (wsMicEnRef.current?.readyState === WebSocket.OPEN) wsMicEnRef.current.send(pcm);
        if (wsMicArRef.current?.readyState === WebSocket.OPEN) wsMicArRef.current.send(pcm);

        // Compute RMS level from downsampled PCM for the VU meter
        const samples = new Int16Array(pcm);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / samples.length) * 500));
      };

      // ── System audio graph ───────────────────────────────────────────
      if (systemStream && wsSysEn && wsSysAr) {
        const sysSource = ctx.createMediaStreamSource(systemStream);
        const sysAnalyser = ctx.createAnalyser();
        sysAnalyser.fftSize = 256;
        sysSource.connect(sysAnalyser);

        const sysWorklet = new AudioWorkletNode(ctx, "pcm-processor", {
          processorOptions: { targetRate: TARGET_RATE },
        });
        sysWorkletRef.current = sysWorklet;
        sysAnalyser.connect(sysWorklet);
        sysWorklet.connect(ctx.destination);

        sysWorklet.port.onmessage = (e) => {
          const pcm = e.data as ArrayBuffer;

          if (wsSysEnRef.current?.readyState === WebSocket.OPEN) wsSysEnRef.current.send(pcm);
          if (wsSysArRef.current?.readyState === WebSocket.OPEN) wsSysArRef.current.send(pcm);

          const samples = new Int16Array(pcm);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) {
            const s = (samples[i] ?? 0) / 32768;
            sum += s * s;
          }
          setSystemLevel(Math.min(100, Math.sqrt(sum / samples.length) * 500));
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
