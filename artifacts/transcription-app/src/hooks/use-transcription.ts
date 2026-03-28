import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface TranscriptionToken {
  text: string;
  is_final: boolean;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
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

  const stop = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    streamsRef.current.forEach(stream => stream.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    
    setMicLevel(0);
    setSystemLevel(0);

    if (sessionIdRef.current) {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      try {
        await stopSessionMut.mutateAsync({ 
          data: { sessionId: sessionIdRef.current, durationSeconds: duration } 
        });
      } catch (err) {
        console.error("Failed to stop session cleanly", err);
      }
      sessionIdRef.current = null;
    }
  }, [isRecording, stopSessionMut]);

  const start = useCallback(async (micDeviceId: string, systemDeviceId: string) => {
    try {
      setError(null);
      setTranscript("");
      setPartialTranscript("");

      // 1. Get Tokens and Session
      const tokenRes = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();

      // 2. Setup Audio Context (16kHz for Soniox)
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextCtor({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      // 3. Setup Streams
      const constraints = { audio: { deviceId: micDeviceId ? { exact: micDeviceId } : undefined } };
      const micStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamsRef.current.push(micStream);
      
      let systemStream: MediaStream | null = null;
      if (systemDeviceId && systemDeviceId !== micDeviceId) {
        systemStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: systemDeviceId } } });
        streamsRef.current.push(systemStream);
      }

      // Mix and analyze
      const merger = ctx.createChannelMerger(1);
      const micSource = ctx.createMediaStreamSource(micStream);
      const micAnalyser = ctx.createAnalyser();
      micSource.connect(micAnalyser);
      micAnalyser.connect(merger, 0, 0);

      const sysAnalyser = ctx.createAnalyser();
      if (systemStream) {
        const sysSource = ctx.createMediaStreamSource(systemStream);
        sysSource.connect(sysAnalyser);
        sysAnalyser.connect(merger, 0, 0);
      }

      // 4. WebSocket setup
      const ws = new WebSocket("wss://stt.soniox.com/transcribe-websocket");
      wsRef.current = ws;

      ws.onopen = () => {
        // Send config
        ws.send(JSON.stringify({
          api_key: tokenRes.apiKey,
          model: "soniox-1",
          audio_format: "pcm_s16le",
          sample_rate: 16000,
          num_audio_channels: 1
        }));
        setIsRecording(true);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.tokens) {
            let newText = "";
            data.tokens.forEach((t: any) => {
              newText += t.text;
            });
            if (data.tokens[data.tokens.length - 1]?.is_final) {
              setTranscript(prev => prev + " " + newText);
              setPartialTranscript("");
            } else {
              setPartialTranscript(newText);
            }
          }
        } catch (err) {
          console.error("WS Parse error", err);
        }
      };

      ws.onerror = () => {
        setError("WebSocket error occurred");
        stop();
      };

      // 5. Audio Processing Node
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      merger.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        ws.send(pcmData);

        // Update levels
        const updateLevel = (analyser: AnalyserNode, setter: (val: number) => void) => {
          const pcm = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(pcm);
          let sumSquares = 0.0;
          for (const amplitude of pcm) { sumSquares += amplitude * amplitude; }
          setter(Math.min(100, Math.sqrt(sumSquares / pcm.length) * 1000));
        };
        
        updateLevel(micAnalyser, setMicLevel);
        if (systemStream) updateLevel(sysAnalyser, setSystemLevel);
      };

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start transcription");
      stop();
    }
  }, [getTokenMut, startSessionMut, stop, isRecording]);

  return {
    isRecording,
    transcript,
    partialTranscript,
    micLevel,
    systemLevel,
    error,
    start,
    stop,
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
