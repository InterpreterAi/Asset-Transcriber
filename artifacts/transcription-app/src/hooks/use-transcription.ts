import { useRef, useState, useCallback } from "react";
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

const SAMPLE_RATE = 48000;

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

function speakerLabel(spkIndex: number): string {
  return `Speaker ${spkIndex + 1}`;
}

/** Detect language from text — Arabic Unicode range check */
function detectLangFromText(text: string): string {
  const arabicCount = (text.match(/[\u0600-\u06FF\u0750-\u077F]/g) ?? []).length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return "en";
  return arabicCount / total > 0.25 ? "ar" : "en";
}

/** Group consecutive words from the same speaker into runs */
function groupBySpeaker(words: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string }[]) {
  const runs: { spk: number; text: string; lang: string }[] = [];
  for (const w of words) {
    const spk = w.spk ?? 0;
    const txt = (w.t ?? w.w ?? w.text ?? "");
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

export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);

  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);

    // Seal all active phrases when recording stops
    setPhrases(prev => prev.map(p => p.active ? { ...p, active: false } : p));

    if (wsRef.current) {
      try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) {}
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    streamsRef.current.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));
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
        console.error("Failed to stop session cleanly", err);
      }
      sessionIdRef.current = null;
    }
  }, [stopSessionMut]);

  const start = useCallback(
    async (micDeviceId: string, systemDeviceId: string) => {
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
        const ctx = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
        audioCtxRef.current = ctx;

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        streamsRef.current.push(micStream);

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

        const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              api_key: tokenRes.apiKey,
              model: "multilingual",
              audio_format: "pcm_s16le",
              sample_rate_hertz: SAMPLE_RATE,
              num_audio_channels: 1,
              include_nonfinal: false,
            })
          );
          isRecordingRef.current = true;
          setIsRecording(true);
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string) as {
              fw?: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string }[];
              tokens?: { text: string; is_final: boolean; speaker_tag?: number }[];
            };

            // ── New v10 format ──────────────────────────────────────────
            if (data.fw !== undefined) {
              const finalWords = data.fw ?? [];
              if (finalWords.length === 0) return;

              const runs = groupBySpeaker(finalWords);

              setPhrases(prev => {
                const next = [...prev];

                for (const run of runs) {
                  const trimmed = run.text.trim();
                  if (!trimmed) continue;

                  const lang = run.lang || detectLangFromText(trimmed);
                  const last = next[next.length - 1];

                  if (last && last.active && last.speakerIndex === run.spk) {
                    // Same active speaker → append words to current bubble, keep active
                    next[next.length - 1] = {
                      ...last,
                      text: last.text + " " + trimmed,
                      language: lang || last.language,
                    };
                  } else {
                    // Speaker changed (or no phrase yet) → seal previous, open new one
                    if (last && last.active) {
                      next[next.length - 1] = { ...last, active: false };
                    }
                    next.push({
                      id: nextId(),
                      speakerIndex: run.spk,
                      speakerLabel: speakerLabel(run.spk),
                      text: trimmed,
                      language: lang,
                      active: true,
                    });
                  }
                }

                return next;
              });
              return;
            }

            // ── Legacy token format ─────────────────────────────────────
            if (!data.tokens) return;
            const finalTokens = data.tokens.filter(t => t.is_final);
            if (finalTokens.length === 0) return;

            const groups: { tag: number; text: string }[] = [];
            for (const t of finalTokens) {
              const tag = t.speaker_tag ?? 1;
              const last = groups[groups.length - 1];
              if (last && last.tag === tag) last.text += t.text;
              else groups.push({ tag, text: t.text });
            }

            setPhrases(prev => {
              const next = [...prev];
              for (const g of groups) {
                const trimmed = g.text.trim();
                if (!trimmed) continue;
                const spkIdx = g.tag - 1;
                const last = next[next.length - 1];
                if (last && last.active && last.speakerIndex === spkIdx) {
                  next[next.length - 1] = { ...last, text: last.text + " " + trimmed };
                } else {
                  if (last?.active) next[next.length - 1] = { ...last, active: false };
                  next.push({
                    id: nextId(),
                    speakerIndex: spkIdx,
                    speakerLabel: speakerLabel(spkIdx),
                    text: trimmed,
                    language: detectLangFromText(trimmed),
                    active: true,
                  });
                }
              }
              return next;
            });
          } catch (err) {
            console.error("WS parse error", err);
          }
        };

        ws.onerror = () => {
          setError("WebSocket connection error. Please check your network.");
          stop();
        };

        ws.onclose = () => {
          if (isRecordingRef.current) stop();
        };

        const processor = ctx.createScriptProcessor(4096, 1, 1);
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
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
          updateLevel(micAnalyser, setMicLevel);
          if (systemStream) updateLevel(sysAnalyser, setSystemLevel);
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start transcription";
        console.error(err);
        setError(msg);
        stop();
      }
    },
    [getTokenMut, startSessionMut, stop]
  );

  return {
    isRecording,
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
