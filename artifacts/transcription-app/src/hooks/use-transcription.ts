import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface Phrase {
  id: string;
  speakerIndex: number;
  speakerLabel: string;
  text: string;
  language: string;
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

/** Detect language from text content (Arabic Unicode range check) */
function detectLangFromText(text: string): string {
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return "en";
  return arabicChars / total > 0.3 ? "ar" : "en";
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

  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);

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
              fw?: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string; language?: string }[];
              nfw?: { t?: string; w?: string; text?: string; spk?: number; lang?: string; lg?: string; language?: string }[];
              tokens?: { text: string; is_final: boolean; speaker_tag?: number }[];
            };

            function wordText(w: { t?: string; w?: string; text?: string }) {
              return w.t ?? w.w ?? w.text ?? "";
            }
            function wordLang(w: { lang?: string; lg?: string; language?: string }) {
              return w.lang ?? w.lg ?? w.language ?? "";
            }

            // --- New v10 format: fw / nfw ---
            if (data.fw !== undefined || data.nfw !== undefined) {
              const finalWords = data.fw ?? [];
              const nonFinalWords = data.nfw ?? [];

              if (finalWords.length > 0) {
                // Group consecutive words by speaker index
                // Each group of words from the same speaker in this batch → one new bubble
                const groups: { spk: number; text: string; lang: string }[] = [];
                for (const w of finalWords) {
                  const spk = w.spk ?? 0;
                  const text = wordText(w);
                  const lang = wordLang(w);
                  const last = groups[groups.length - 1];
                  if (last && last.spk === spk) {
                    last.text += text;
                    if (!last.lang && lang) last.lang = lang;
                  } else {
                    groups.push({ spk, text, lang });
                  }
                }

                setPhrases((prev) => {
                  const next = [...prev];
                  for (const g of groups) {
                    const trimmed = g.text.trim();
                    if (!trimmed) continue;
                    const detectedLang = g.lang || detectLangFromText(trimmed);
                    next.push({
                      id: nextId(),
                      speakerIndex: g.spk,
                      speakerLabel: speakerLabel(g.spk),
                      text: trimmed,
                      language: detectedLang,
                    });
                  }
                  return next;
                });
                setPartialPhrase(null);
              } else if (nonFinalWords.length > 0) {
                const text = nonFinalWords.map(wordText).join("").trim();
                const spk = nonFinalWords[0]?.spk ?? 0;
                const lang = wordLang(nonFinalWords[0] ?? {});
                if (text) {
                  setPartialPhrase({
                    id: "partial",
                    speakerIndex: spk,
                    speakerLabel: speakerLabel(spk),
                    text,
                    language: lang || detectLangFromText(text),
                  });
                }
              }
              return;
            }

            // --- Legacy token format ---
            if (!data.tokens || data.tokens.length === 0) return;
            const groups: { tag: number; text: string }[] = [];
            let hasAnyFinal = false;
            let partialText = "";
            let partialTag = 0;

            for (const token of data.tokens) {
              const tag = token.speaker_tag ?? 1;
              if (token.is_final) {
                hasAnyFinal = true;
                const last = groups[groups.length - 1];
                if (last && last.tag === tag) {
                  last.text += token.text;
                } else {
                  groups.push({ tag, text: token.text });
                }
              } else {
                partialText += token.text;
                partialTag = tag;
              }
            }

            if (hasAnyFinal) {
              setPhrases((prev) => {
                const next = [...prev];
                for (const g of groups) {
                  const trimmed = g.text.trim();
                  if (!trimmed) continue;
                  const spkIdx = g.tag - 1;
                  next.push({
                    id: nextId(),
                    speakerIndex: spkIdx,
                    speakerLabel: speakerLabel(spkIdx),
                    text: trimmed,
                    language: detectLangFromText(trimmed),
                  });
                }
                return next;
              });
              setPartialPhrase(null);
            } else if (partialText.trim()) {
              const spkIdx = partialTag - 1;
              setPartialPhrase({
                id: "partial",
                speakerIndex: spkIdx,
                speakerLabel: speakerLabel(spkIdx),
                text: partialText.trim(),
                language: detectLangFromText(partialText),
              });
            }
          } catch (err) {
            console.error("WS Parse error", err);
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
