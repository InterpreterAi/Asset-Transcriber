import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface Phrase {
  id: string;
  speaker: "Interpreter" | "Caller" | "Unknown";
  text: string;
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

// Map Soniox speaker_tag → display label
// tag 1 → first speaker detected = Interpreter (mic)
// tag 2 → second speaker = Caller (system audio)
function tagToSpeaker(tag: number): "Interpreter" | "Caller" | "Unknown" {
  if (tag === 1) return "Interpreter";
  if (tag === 2) return "Caller";
  return "Unknown";
}

let phraseIdCounter = 0;
function nextId() { return `p-${++phraseIdCounter}`; }

export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [partialPhrase, setPartialPhrase] = useState<Phrase | null>(null);
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

  // Accumulate tokens per speaker until they are final
  const pendingBySpeakerRef = useRef<Map<number, string>>(new Map());

  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    pendingBySpeakerRef.current.clear();

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
    setPartialPhrase(null);

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
        setPartialPhrase(null);
        pendingBySpeakerRef.current.clear();

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
              model: "en_v2_lowlatency",
              audio_format: "pcm_s16le",
              sample_rate_hertz: SAMPLE_RATE,
              num_audio_channels: 1,
              include_nonfinal: true,
            })
          );
          isRecordingRef.current = true;
          setIsRecording(true);
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string) as {
              // New Soniox v10 API format
              fw?: { t?: string; w?: string; text?: string; spk?: number }[];
              nfw?: { t?: string; w?: string; text?: string; spk?: number }[];
              // Legacy format
              tokens?: { text: string; is_final: boolean; speaker_tag?: number }[];
            };

            function wordText(w: { t?: string; w?: string; text?: string }) {
              return w.t ?? w.w ?? w.text ?? "";
            }

            // --- New v10 format ---
            if (data.fw !== undefined || data.nfw !== undefined) {
              const finalWords = data.fw ?? [];
              const nonFinalWords = data.nfw ?? [];

              if (finalWords.length > 0) {
                // Group final words by speaker
                const bySpeaker = new Map<number, string>();
                for (const w of finalWords) {
                  const spk = w.spk ?? 0;
                  bySpeaker.set(spk, (bySpeaker.get(spk) ?? "") + wordText(w));
                }
                setPhrases((prev) => {
                  const next = [...prev];
                  bySpeaker.forEach((text, spk) => {
                    const trimmed = text.trim();
                    if (!trimmed) return;
                    const speaker = tagToSpeaker(spk + 1); // spk 0 → tag 1, spk 1 → tag 2
                    const last = next[next.length - 1];
                    if (last && last.speaker === speaker) {
                      next[next.length - 1] = { ...last, text: last.text + " " + trimmed };
                    } else {
                      next.push({ id: nextId(), speaker, text: trimmed });
                    }
                  });
                  return next;
                });
                setPartialPhrase(null);
              } else if (nonFinalWords.length > 0) {
                const partialText = nonFinalWords.map(wordText).join("").trim();
                const partialSpk = nonFinalWords[0]?.spk ?? 0;
                if (partialText) {
                  setPartialPhrase({
                    id: "partial",
                    speaker: tagToSpeaker(partialSpk + 1),
                    text: partialText,
                  });
                }
              }
              return;
            }

            // --- Legacy token format ---
            if (!data.tokens || data.tokens.length === 0) return;

            const finalTokensBySpeaker = new Map<number, string>();
            let hasAnyFinal = false;
            let partialText = "";
            let partialTag = 0;

            for (const token of data.tokens) {
              const tag = token.speaker_tag ?? 1;
              if (token.is_final) {
                hasAnyFinal = true;
                finalTokensBySpeaker.set(tag, (finalTokensBySpeaker.get(tag) ?? "") + token.text);
              } else {
                partialText += token.text;
                partialTag = tag;
              }
            }

            if (hasAnyFinal) {
              setPhrases((prev) => {
                const next = [...prev];
                finalTokensBySpeaker.forEach((text, tag) => {
                  const trimmed = text.trim();
                  if (!trimmed) return;
                  const speaker = tagToSpeaker(tag);
                  const last = next[next.length - 1];
                  if (last && last.speaker === speaker) {
                    next[next.length - 1] = { ...last, text: last.text + " " + trimmed };
                  } else {
                    next.push({ id: nextId(), speaker, text: trimmed });
                  }
                });
                return next;
              });
              setPartialPhrase(null);
            } else if (partialText.trim()) {
              setPartialPhrase({
                id: "partial",
                speaker: tagToSpeaker(partialTag),
                text: partialText.trim(),
              });
            }
          } catch (err) {
            console.error("WS Parse error", err);
          }
        };

        ws.onerror = () => {
          setError("WebSocket connection error. Check your network.");
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
    partialPhrase,
    micLevel,
    systemLevel,
    error,
    start,
    stop,
    clear: () => { setPhrases([]); setPartialPhrase(null); },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
