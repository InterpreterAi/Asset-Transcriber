import { useRef, useState, useCallback, type MutableRefObject } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

export interface Phrase {
  id: string;
  speakerIndex: number;
  speakerLabel: string;
  source: "mic";
  text: string;           // finalized (committed) words from fw
  pendingText?: string;   // non-final partial words from nfw — shown dimmed
  language: string;       // "en" | "ar"
  active: boolean;        // true = partial in-flight; false = sealed, ready to translate
}

// ── constants ─────────────────────────────────────────────────────────────────
const TARGET_RATE = 16000; // Soniox requires 16 kHz mono PCM

// Two WebSocket channels per session (one device → en + ar):
//   en_v2_lowlatency → offset   0  (speakers   0…99)
//   ar_v1            → offset 100  (speakers 100…199)
const OFFSETS = { en: 0, ar: 100 } as const;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Returns true when ≥35% of letter codepoints in `text` are Arabic script. */
function isValidArabicOutput(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  return arabic / letters >= 0.35;
}

/** Human-readable label for a Soniox speaker index. */
function makeSpeakerLabel(localSpkIdx: number): string {
  return localSpkIdx > 0 ? `Speaker ${localSpkIdx + 1}` : "Speaker";
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

let phraseIdCounter = 0;
function nextId() { return `p-${++phraseIdCounter}`; }

// ── hook ──────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<string>("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const apiKeyRef = useRef<string>("");

  const wsEnRef = useRef<WebSocket | null>(null);
  const wsArRef = useRef<WebSocket | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);

  const streamsRef = useRef<MediaStream[]>([]);
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startSessionMut = useStartSession();
  const stopSessionMut = useStopSession();
  const getTokenMut = useGetTranscriptionToken();

  // ── stop ────────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);

    // Seal any open phrase and clear pending partial text
    setPhrases(prev =>
      prev.map(p => p.active ? { ...p, active: false, pendingText: undefined } : p)
    );

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
      } catch (err) {
        console.error("Failed to stop session", err);
      }
      sessionIdRef.current = null;
    }
  }, [stopSessionMut]);

  // ── buildWs ─────────────────────────────────────────────────────────────────
  //
  // nfw (non-final words): Soniox sends the FULL current partial utterance.
  //   → We REPLACE pendingText on the active phrase (never append).
  //   → If no active phrase exists, we create one with text="".
  //
  // fw (final words): Soniox sends only the NEWLY committed words.
  //   → We SEAL the active phrase: text = fw content, pendingText = undefined, active = false.
  //   → Sealing triggers the translation effect in the UI.
  //   → If no active phrase, we create a sealed phrase directly.
  //
  // This model means each fw batch = one sealed phrase bubble.
  // It prevents the "text + pendingText = duplicate" display bug that occurs when
  // Soniox repeats already-committed words in subsequent nfw messages.
  //
  const buildWs = useCallback((
    apiKey: string,
    model: string,
    langCode: "en" | "ar",
    spkOffset: number,
    ownRef: MutableRefObject<WebSocket | null>,
    peerRef: MutableRefObject<WebSocket | null>,
  ): WebSocket => {
    const ws = new WebSocket("wss://api.soniox.com/transcribe-websocket");
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
          fw?: { t?: string; w?: string; text?: string; spk?: number }[];
          nfw?: { t?: string; w?: string; text?: string; spk?: number }[];
          error?: string; code?: number; message?: string;
        };

        // API-level error → show once, do not reconnect
        if (data.error || (typeof data.code === "number" && !data.fw && !data.nfw)) {
          const msg = data.error ?? data.message ?? `code ${data.code}`;
          console.error(`[WS] ${model} API error:`, msg);
          setError(`Transcription error (${model}): ${msg}`);
          apiErrorOccurred = true;
          return;
        }

        // ── Non-final words → update pending text ─────────────────────────────
        // Rule: REPLACE pendingText (never accumulate). This is always the full
        // current partial from Soniox; we just show whatever Soniox sends.
        const nfWords = data.nfw ?? [];
        if (nfWords.length > 0) {
          const pending = nfWords.map(w => w.t ?? w.w ?? w.text ?? "").join("").trim();
          if (pending) {
            const isAr = isValidArabicOutput(pending);
            if (langCode === "ar" && !isAr) { /* skip */ }
            else if (langCode === "en" && isAr) { /* skip */ }
            else {
              setPhrases(prev => {
                const next = [...prev];
                const last = next[next.length - 1];

                if (last?.active && last.language === langCode) {
                  // Update pendingText on the existing active phrase (REPLACE)
                  next[next.length - 1] = { ...last, pendingText: pending };
                } else {
                  // No active same-lang phrase → seal any unrelated active, create fresh one
                  if (last?.active) {
                    next[next.length - 1] = { ...last, active: false, pendingText: undefined };
                  }
                  next.push({
                    id: nextId(),
                    speakerIndex: (nfWords[0]?.spk ?? 0) + spkOffset,
                    speakerLabel: makeSpeakerLabel(nfWords[0]?.spk ?? 0),
                    source: "mic",
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

        // ── Final words → seal the active phrase ──────────────────────────────
        // Rule: each fw batch SEALS the active phrase. The fw content becomes the
        // phrase's permanent text; pendingText is discarded. active → false fires
        // the translation effect. A subsequent nfw will open a new active phrase.
        const finalWords = data.fw ?? [];
        if (finalWords.length > 0) {
          const runs = groupBySpeaker(finalWords);
          setPhrases(prev => {
            const next = [...prev];
            for (const run of runs) {
              const trimmed = run.text.trim();
              if (!trimmed) continue;

              // Language filter: reject cross-language output
              if (langCode === "ar" && !isValidArabicOutput(trimmed)) continue;
              if (langCode === "en" && isValidArabicOutput(trimmed)) continue;

              const globalSpk = run.spk + spkOffset;
              const last = next[next.length - 1];

              if (last?.active && last.language === langCode) {
                // Seal the active phrase: fw content is authoritative
                next[next.length - 1] = {
                  ...last,
                  speakerIndex: globalSpk,
                  speakerLabel: makeSpeakerLabel(run.spk),
                  text: trimmed,
                  pendingText: undefined,
                  active: false,  // SEALED → translation fires
                };
              } else {
                // No active same-lang phrase → create a sealed phrase directly
                if (last?.active) {
                  next[next.length - 1] = { ...last, active: false, pendingText: undefined };
                }
                next.push({
                  id: nextId(),
                  speakerIndex: globalSpk,
                  speakerLabel: makeSpeakerLabel(run.spk),
                  source: "mic",
                  text: trimmed,
                  pendingText: undefined,
                  language: langCode,
                  active: false,
                });
              }
            }
            return next;
          });
        }
      } catch (err) {
        console.error(`[WS] ${model} parse error`, err);
      }
    };

    ws.onerror = (e) => console.error(`[WS] ${model} socket error`, e);

    ws.onclose = (e) => {
      const logFn = (e.code === 1000 || e.code === 1001) ? console.log : console.warn;
      logFn(`[WS] ${model} closed — code:${e.code} reason:"${e.reason}"`);

      if (ownRef.current === ws) ownRef.current = null;

      // Clear stale pending text when this connection drops
      setPhrases(prev =>
        prev.map(p =>
          p.active && p.language === langCode
            ? { ...p, pendingText: undefined }
            : p
        )
      );

      // Auto-reconnect if still recording and not an API error
      if (!isRecordingRef.current || apiErrorOccurred) return;
      console.log(`[WS] ${model} — reconnecting in 200 ms`);
      setTimeout(() => {
        if (!isRecordingRef.current || !apiKeyRef.current) return;
        console.log(`[WS] ${model} reconnecting…`);
        const newWs = buildWs(apiKeyRef.current, model, langCode, spkOffset, ownRef, peerRef);
        ownRef.current = newWs;
      }, 200);
    };

    return ws;
  }, [stop]);

  // ── start ────────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setPhrases([]);
      setAudioInfo("");

      const tokenRes = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();
      apiKeyRef.current = tokenRes.apiKey;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      const nativeSR = ctx.sampleRate;
      setAudioInfo(`${nativeSR} Hz → ${TARGET_RATE} Hz (AudioWorklet)`);
      console.log(`[Audio] native rate: ${nativeSR} Hz`);

      await ctx.audioWorklet.addModule("/pcm-processor.js");

      // ── Capture selected device ──────────────────────────────────────────────
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

      // ── Open two Soniox WebSockets (English + Arabic) ────────────────────────
      const wsEn = buildWs(tokenRes.apiKey, "en_v2_lowlatency", "en", OFFSETS.en, wsEnRef, wsArRef);
      const wsAr = buildWs(tokenRes.apiKey, "ar_v1", "ar", OFFSETS.ar, wsArRef, wsEnRef);
      wsEnRef.current = wsEn;
      wsArRef.current = wsAr;

      // ── Audio graph: device → analyser → worklet → both WSs ────────────────
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { targetRate: TARGET_RATE },
      });
      workletRef.current = worklet;
      analyser.connect(worklet);
      worklet.connect(ctx.destination); // must be connected to stay active

      worklet.port.onmessage = (e) => {
        const pcm = e.data as ArrayBuffer;

        if (wsEnRef.current?.readyState === WebSocket.OPEN) wsEnRef.current.send(pcm);
        if (wsArRef.current?.readyState === WebSocket.OPEN) wsArRef.current.send(pcm);

        // RMS level for VU meter
        const samples = new Int16Array(pcm);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / samples.length) * 500));
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
    audioInfo,
    phrases,
    micLevel,
    error,
    start,
    stop,
    clear: () => setPhrases([]),
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
