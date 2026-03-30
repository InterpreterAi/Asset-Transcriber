import { useRef, useState, useCallback } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE   = 16000;
const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

// ── DOM class names — defined here so Tailwind's scanner preserves them ───────
const CLS = {
  wrapper:    "mb-4",
  speakerTag: "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  text:       "text-[13px] leading-relaxed text-foreground font-medium",
  nf:         "text-muted-foreground/55 italic",
} as const;

// ── Soniox v4 types ────────────────────────────────────────────────────────────
interface SonioxToken {
  text:      string;
  is_final:  boolean;
  speaker?:  number;
  language?: string;
}

interface SonioxMessage {
  tokens?:   SonioxToken[];
  finished?: boolean;
  error?:    string;
  code?:     number;
  message?:  string;
}

// ── Speaker normalization (temporal-LRU pool) ──────────────────────────────────
const MAX_SPEAKERS = 2;
const _speakerMap  = new Map<number, number>();
const _slotLastMs  = new Map<number, number>();
let   _slotCount   = 0;

function resetSpeakerMap() { _speakerMap.clear(); _slotLastMs.clear(); _slotCount = 0; }

function normalizeSpeaker(rawId: number | undefined): string {
  if (rawId === undefined) return "";
  if (_speakerMap.has(rawId)) {
    const slot = _speakerMap.get(rawId)!;
    _slotLastMs.set(slot, Date.now());
    return `Speaker ${slot}`;
  }
  if (_slotCount < MAX_SPEAKERS) {
    _slotCount++;
    _speakerMap.set(rawId, _slotCount);
    _slotLastMs.set(_slotCount, Date.now());
    return `Speaker ${_slotCount}`;
  }
  let lruSlot = 1, lruMs = _slotLastMs.get(1) ?? 0;
  for (let s = 2; s <= _slotCount; s++) {
    const t = _slotLastMs.get(s) ?? 0;
    if (t < lruMs) { lruMs = t; lruSlot = s; }
  }
  _speakerMap.set(rawId, lruSlot);
  _slotLastMs.set(lruSlot, Date.now());
  return `Speaker ${lruSlot}`;
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording,   setIsRecording]   = useState(false);
  const [micLevel,      setMicLevel]      = useState(0);
  const [error,         setError]         = useState<string | null>(null);
  const [audioInfo,     setAudioInfo]     = useState<string>("");
  const [hasTranscript, setHasTranscript] = useState(false);

  // Audio / WebSocket infrastructure refs
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Direct-to-DOM transcript refs ─────────────────────────────────────────
  //
  // Two simple trackers — exactly as described:
  //   currentSpeakerRef  — raw Soniox speaker ID of the active bubble
  //   activeBubbleRef    — the <p> element being filled with live text
  //   activeBubbleNFRef  — the NF suffix <span> inside that <p>
  //
  // containerRef is attached to a <div> in workspace.tsx. Every new speaker
  // bubble is created imperatively and appended directly — no React state,
  // no arrays, no flush().
  //
  const containerRef     = useRef<HTMLDivElement | null>(null);
  const currentSpeakerRef = useRef<number | undefined>(undefined);
  const activeBubbleRef   = useRef<HTMLParagraphElement | null>(null);
  const activeBubbleNFRef = useRef<HTMLSpanElement | null>(null);
  // Soniox re-sends ALL prior final tokens as a prefix in every message.
  // This counter tracks how many we have already written so we only process
  // the new tail. Reset to 0 when speaker changes (new bubble = new baseline).
  const finalCountRef     = useRef(0);

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── createBubble — imperatively build one speaker bubble in the DOM ────────
  const createBubble = useCallback((rawSpeaker: number | undefined): HTMLParagraphElement => {
    const container = containerRef.current!;
    const label     = normalizeSpeaker(rawSpeaker);

    const wrapper = document.createElement("div");
    wrapper.className = CLS.wrapper;

    if (label) {
      const tag = document.createElement("span");
      tag.className   = CLS.speakerTag;
      tag.textContent = label;
      wrapper.appendChild(tag);
    }

    const p = document.createElement("p");
    p.className = CLS.text;

    // Two child spans: confirmed text (black) + live NF guess (gray italic)
    const finalSpan = document.createElement("span");
    const nfSpan    = document.createElement("span");
    nfSpan.className = CLS.nf;
    p.appendChild(finalSpan);
    p.appendChild(nfSpan);

    wrapper.appendChild(p);
    container.appendChild(wrapper);

    activeBubbleNFRef.current = nfSpan;

    // Keep bottom of transcript visible
    wrapper.scrollIntoView({ block: "end", behavior: "smooth" });

    return finalSpan as HTMLParagraphElement;
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    currentSpeakerRef.current  = undefined;
    activeBubbleRef.current    = null;
    activeBubbleNFRef.current  = null;
    finalCountRef.current      = 0;

    workletRef.current?.disconnect();
    workletRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* eof */ }
      wsRef.current.close();
      wsRef.current = null;
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
      } catch (err) { console.error("Failed to stop session", err); }
      sessionIdRef.current = null;
    }
  }, [stopSessionMut]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  const buildWs = useCallback((apiKey: string): WebSocket => {
    const ws = new WebSocket(SONIOX_WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key:                        apiKey,
        model:                          "stt-rt-v4",
        audio_format:                   "pcm_s16le",
        sample_rate:                    TARGET_RATE,
        num_channels:                   1,
        language_hints:                 ["en", "ar"],
        enable_language_identification: true,
        enable_speaker_diarization:     true,
        diarization:                    { enable: true },
      }));
      console.log("[WS] stt-rt-v4 OPEN");
    };

    ws.onmessage = (evt: MessageEvent) => {
      if (!isRecRef.current) return;

      let msg: SonioxMessage;
      try { msg = JSON.parse(evt.data as string); } catch { return; }

      if (msg.error) { setError(msg.error); void stop(); return; }
      if (msg.finished) { void stop(); return; }

      const tokens = msg.tokens ?? [];
      if (tokens.length === 0) return;

      // ── FINAL tokens ────────────────────────────────────────────────────
      //
      // Soniox re-sends ALL prior finals as a prefix in every message.
      // Slice off what we've already written — only the new tail matters.
      //
      // NF tokens are the model's CURRENT full hypothesis for in-progress speech.
      // They REPLACE (not add to) the previous NF display — see NF section below.
      //
      const finals    = tokens.filter(t => t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      for (const token of newFinals) {
        // Speaker changed → start a new bubble, reset the final counter
        // to the current total (new bubble = new baseline; don't re-process
        // old finals into the new speaker's text).
        if (token.speaker !== currentSpeakerRef.current || !activeBubbleRef.current) {
          currentSpeakerRef.current = token.speaker;
          finalCountRef.current     = finals.length - newFinals.length +
            newFinals.indexOf(token); // processed up to (not including) this token
          activeBubbleRef.current = createBubble(token.speaker);
          setHasTranscript(true);
        }

        activeBubbleRef.current.textContent =
          (activeBubbleRef.current.textContent ?? "") + token.text;

        activeBubbleRef.current
          .closest("div")
          ?.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      // Update final count to include everything processed this message
      finalCountRef.current = finals.length;

      // ── NF (non-final) tokens ─────────────────────────────────────────
      //
      // NF tokens = the model's LIVE hypothesis for speech still in progress.
      // Each message's NF set REPLACES the previous one (not additive).
      // Write the whole suffix directly to the NF span — no append, just assign.
      //
      const nfText = tokens.filter(t => !t.is_final).map(t => t.text).join("");
      if (activeBubbleNFRef.current) {
        activeBubbleNFRef.current.textContent = nfText;
      } else if (nfText && containerRef.current) {
        // First tokens are NF before any final arrives — create the bubble now
        if (!activeBubbleRef.current) {
          const spk = tokens.find(t => t.speaker !== undefined)?.speaker;
          currentSpeakerRef.current = spk;
          activeBubbleRef.current   = createBubble(spk);
          setHasTranscript(true);
        }
        if (activeBubbleNFRef.current) {
          activeBubbleNFRef.current.textContent = nfText;
        }
      }
    };

    ws.onerror = () => { setError("WebSocket error"); void stop(); };

    ws.onclose = (e) => {
      if (isRecRef.current && e.code !== 1000) {
        setError(`Connection closed (${e.code})`);
        void stop();
      }
    };

    return ws;
  }, [stop, createBubble]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setAudioInfo("");
      currentSpeakerRef.current = undefined;
      activeBubbleRef.current   = null;
      activeBubbleNFRef.current = null;
      finalCountRef.current     = 0;
      resetSpeakerMap();

      const tokenRes   = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamsRef.current = [stream];

      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;

      await ctx.audioWorklet.addModule("/pcm-processor.js");
      const source  = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "pcm-processor");
      workletRef.current = worklet;

      const ws = buildWs(tokenRes.token);
      wsRef.current = ws;

      worklet.port.onmessage = (e: MessageEvent) => {
        // pcm-processor.js transfers a raw ArrayBuffer (Int16 PCM at 16 kHz)
        const buf = e.data as ArrayBuffer;
        if (ws.readyState === WebSocket.OPEN) ws.send(buf);
        // Compute RMS for the VU meter from the Int16 samples
        const samples = new Int16Array(buf);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += (samples[i] / 32768) ** 2;
        setMicLevel(Math.min(100, Math.sqrt(sum / (samples.length || 1)) * 500));
      };

      source.connect(worklet);
      worklet.connect(ctx.destination);

      const track = stream.getAudioTracks()[0];
      if (track) {
        const settings = track.getSettings();
        setAudioInfo(`${settings.sampleRate ?? ctx.sampleRate}Hz → 16kHz`);
      }

      isRecRef.current = true;
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
    micLevel,
    error,
    hasTranscript,
    containerRef,
    start,
    stop,
    clear: () => {
      currentSpeakerRef.current = undefined;
      activeBubbleRef.current   = null;
      activeBubbleNFRef.current = null;
      finalCountRef.current     = 0;
      if (containerRef.current) containerRef.current.innerHTML = "";
      setHasTranscript(false);
      resetSpeakerMap();
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
