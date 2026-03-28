import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface TranscriptionToken {
  text: string;
  is_final: boolean;
}

// Capture at 48kHz (native, no virtual driver needed) and send at 48kHz.
// Soniox supports 48kHz natively.
const SAMPLE_RATE = 48000;

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [partialTranscript, setPartialTranscript] = useState<string>("");
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

    if (wsRef.current) {
      // Signal end of audio to Soniox
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
        setTranscript("");
        setPartialTranscript("");

        // 1. Get token + start backend session
        const tokenRes = await getTokenMut.mutateAsync({});
        const sessionRes = await startSessionMut.mutateAsync({});
        sessionIdRef.current = sessionRes.sessionId;
        startTimeRef.current = Date.now();

        // 2. AudioContext at 48kHz — native browser rate, no virtual driver needed
        const AudioContextCtor =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
        audioCtxRef.current = ctx;

        // 3. Mic stream
        const micConstraints: MediaStreamConstraints = {
          audio: {
            deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: SAMPLE_RATE,
          },
        };
        const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
        streamsRef.current.push(micStream);

        // 4. Optional second audio source (system/caller audio via second device)
        let systemStream: MediaStream | null = null;
        if (systemDeviceId && systemDeviceId !== micDeviceId) {
          try {
            systemStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: systemDeviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: SAMPLE_RATE,
              },
            });
            streamsRef.current.push(systemStream);
          } catch (e) {
            console.warn("Could not open system audio device:", e);
          }
        }

        // 5. Build audio graph: mix both sources into one channel
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

        // 6. WebSocket to Soniox
        const ws = new WebSocket("wss://stt.soniox.com/transcribe-websocket");
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              api_key: tokenRes.apiKey,
              model: "soniox-1",
              audio_format: "pcm_s16le",
              sample_rate: SAMPLE_RATE,
              num_audio_channels: 1,
            })
          );
          isRecordingRef.current = true;
          setIsRecording(true);
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string) as {
              tokens?: { text: string; is_final: boolean }[];
            };
            if (data.tokens && data.tokens.length > 0) {
              const hasFinal = data.tokens.some((t) => t.is_final);
              const text = data.tokens.map((t) => t.text).join("");
              if (hasFinal) {
                setTranscript((prev) => (prev ? prev + " " + text : text));
                setPartialTranscript("");
              } else {
                setPartialTranscript(text);
              }
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
          if (isRecordingRef.current) {
            stop();
          }
        };

        // 7. ScriptProcessor to stream PCM to WebSocket
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
          const inputData = e.inputBuffer.getChannelData(0);
          ws.send(floatTo16BitPCM(inputData));
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
    transcript,
    partialTranscript,
    micLevel,
    systemLevel,
    error,
    start,
    stop,
    clearTranscript: () => { setTranscript(""); setPartialTranscript(""); },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
