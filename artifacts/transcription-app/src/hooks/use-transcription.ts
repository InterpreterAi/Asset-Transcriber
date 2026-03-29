import { useRef, useState, useCallback, useEffect } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Public types ───────────────────────────────────────────────────────────────

export type LangCode = "en" | "ar";

/** A completed, permanent transcript entry — finalized after COMMIT_DELAY ms silence. */
export interface Phrase {
  id: string;
  speakerLabel: string;
  text: string;
  language: LangCode;
}

/** The segment currently being spoken — updated in place on every token event. */
export interface ActiveSegment {
  text: string;
  language: LangCode;
  speakerLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE  = 16000;
const STORAGE_KEY  = "interpretai_phrases";

// Declared for reference; silence-based sealing is currently handled by
// Soniox's own VAD (all-final message) rather than a client-side timer.
const COMMIT_DELAY = 1000; // ms — kept for future use

// Safety word cap — only fires if the silence/speaker-change triggers never
// fire (e.g. no speaker data and no natural pause for a very long time).
// Since we now flush on speaker change, this is a pure last-resort guard.
const MAX_SEG_WORDS = 100;

// Soniox v4 real-time endpoint (released Feb 5 2026)
const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

// ── Soniox v4 token type ───────────────────────────────────────────────────────
interface SonioxToken {
  text:      string;
  is_final:  boolean;
  language?: string;  // set when enable_language_identification: true
  speaker?:  number;  // set when enable_speaker_diarization: true
}

interface SonioxMessage {
  tokens?:   SonioxToken[];
  finished?: boolean;
  error?:    string;
  code?:     number;
  message?:  string;
}

// ── Speaker clustering ─────────────────────────────────────────────────────────
//
// Soniox v4 returns arbitrary cluster IDs (0, 10, 21, …) that are assigned
// by the diarization model and can drift mid-session: the same physical voice
// may receive different raw IDs at different points in a recording.
//
// ── Speaker identity pool ──────────────────────────────────────────────────────
//
// Soniox's raw cluster IDs are unstable — the same physical voice can be
// assigned a new rawId at any point as the model re-clusters. Without access
// to audio embeddings we use a temporal-LRU heuristic as the closest
// practical equivalent to embedding-similarity matching:
//
//   • The first MAX_SPEAKERS unique raw IDs each get a sequential display
//     slot (Speaker 1, Speaker 2, …).
//
//   • Once the pool is full, any unseen raw ID is matched to whichever
//     existing slot has been idle the longest (LRU).  The key insight:
//     in a conversation the speaker who has been silent longest is the one
//     most likely to have been re-assigned a new cluster ID by the model.
//     This mirrors what cosine-similarity matching would infer from voice
//     characteristics — but uses time rather than acoustics.
//
//   • MAX_SPEAKERS defaults to 2 (interpreter mode = two parties).
//     Raise it if more participants are expected.
//
// All state lives outside the hook so it survives React re-renders. It is
// reset on every fresh recording start and on clear().
//
const MAX_SPEAKERS = 2; // hard pool cap — LRU reuse kicks in beyond this

const _speakerMap = new Map<number, number>(); // rawId → slotIndex (1-based)
const _slotLastMs = new Map<number, number>(); // slotIndex → last-active ms
let   _slotCount  = 0;

function resetSpeakerMap() {
  _speakerMap.clear();
  _slotLastMs.clear();
  _slotCount = 0;
}

/** Mark a raw speaker ID as recently active (called once per token that carries one). */
function touchSpeaker(rawId: number): void {
  const slot = _speakerMap.get(rawId);
  if (slot !== undefined) _slotLastMs.set(slot, Date.now());
}

/**
 * Return the display label for a raw speaker ID.
 *
 * Algorithm (temporal-LRU identity matching):
 *   1. Already known raw ID → refresh its slot timestamp, return label.
 *   2. New raw ID, pool not full → allocate a new slot.
 *   3. New raw ID, pool full → reuse the Least Recently Used slot.
 *      (The idle speaker is the most likely match for the new cluster ID.)
 */
function normalizeSpeaker(rawId: number | undefined): string {
  // No real speaker data from the API yet — return empty so the UI never
  // shows a hardcoded "Speaker 1" without actual diarization evidence.
  if (rawId === undefined) return "";

  // 1. Known raw ID — refresh its timestamp and return the existing label.
  if (_speakerMap.has(rawId)) {
    const slot = _speakerMap.get(rawId)!;
    _slotLastMs.set(slot, Date.now());
    return `Speaker ${slot}`;
  }

  // 2. Pool has room — allocate a new sequential slot.
  if (_slotCount < MAX_SPEAKERS) {
    _slotCount++;
    _speakerMap.set(rawId, _slotCount);
    _slotLastMs.set(_slotCount, Date.now());
    return `Speaker ${_slotCount}`;
  }

  // 3. Pool full — reuse the Least Recently Used slot (idle speaker most
  //    likely to have been re-assigned a new cluster ID by the model).
  let lruSlot = 1;
  let lruMs   = _slotLastMs.get(1) ?? 0;
  for (let s = 2; s <= _slotCount; s++) {
    const t = _slotLastMs.get(s) ?? 0;
    if (t < lruMs) { lruMs = t; lruSlot = s; }
  }

  _speakerMap.set(rawId, lruSlot);
  _slotLastMs.set(lruSlot, Date.now());
  return `Speaker ${lruSlot}`;
}

function nextId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function loadPhrases(): Phrase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Phrase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Infer language from a batch of tokens.
 * Uses the API's own `language` field when available; falls back to Arabic
 * character ratio for tokens without a language tag.
 */
function detectLang(tokens: SonioxToken[], fallback: LangCode): LangCode {
  const counts: Record<string, number> = {};
  for (const t of tokens) {
    const lang = t.language ?? "?";
    counts[lang] = (counts[lang] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0];
  if (top && top !== "?") return top.startsWith("ar") ? "ar" : "en";
  // Fallback: check Arabic Unicode in the joined text
  const text = tokens.map(t => t.text).join("");
  const arChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters > 0 && arChars / letters >= 0.35) return "ar";
  return fallback;
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription() {
  const [isRecording, setIsRecording]             = useState(false);
  const [finalizedSegments, setFinalizedSegments] = useState<Phrase[]>(loadPhrases);
  const [activeSegment, setActiveSegment]         = useState<ActiveSegment | null>(null);
  const [micLevel, setMicLevel]                   = useState(0);
  const [error, setError]                         = useState<string | null>(null);
  const [audioInfo, setAudioInfo]                 = useState<string>("");

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const apiKeyRef    = useRef<string>("");
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Sentence buffer ────────────────────────────────────────────────────────
  //
  // v4 token stream logic:
  //   • Final tokens (is_final: true) accumulate in `finalBuf` — they are
  //     confirmed and never change.
  //   • Non-final tokens (is_final: false) represent the uncertain suffix.
  //     Each message REPLACES the previous non-final display (not appends).
  //   • liveTranscript.text = finalBuf + nfDisplay (one growing live line).
  //   • COMMIT_DELAY ms after the last final token, the entire finalBuf
  //     becomes a sealed phrase in history and translation fires.
  //
  const finalBufRef    = useRef<string>("");
  const nfDisplayRef   = useRef<string>(""); // latest non-final suffix (replaced each message)
  const langRef        = useRef<LangCode>("en");
  // undefined until a real token.speaker arrives from the API — never falls
  // back to 0 / "Speaker 1" without actual diarization data.
  const speakerRef     = useRef<number | undefined>(undefined);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Soniox re-sends ALL previously-finalized tokens in every message.
  // Track how many we have already processed so each message only yields the
  // truly new tail.  Reset to 0 at every utterance boundary.
  const globalFinalCountRef = useRef<number>(0);
  // Timestamp of the most recent token arrival — final OR non-final.
  const lastTokenTimeRef = useRef<number>(0);

  // ── Per-segment speaker history ────────────────────────────────────────────
  // Records every speaker reading seen during the CURRENT active segment.
  // flush() takes the MODE (most-frequent) of ALL readings, then clears so
  // the next segment starts completely fresh — no cross-segment contamination.
  const speakerHistoryRef = useRef<number[]>([]);

  // ── Active-segment speaker ─────────────────────────────────────────────────
  // Set to token.speaker when the first token of a new segment arrives.
  // When the next token carries a DIFFERENT speaker, the current segment is
  // flushed and this ref is updated to the new speaker.
  // undefined = no segment is currently open.
  const activeSegSpeakerRef = useRef<number | undefined>(undefined);

  // ── Token Buffer (100 ms) ──────────────────────────────────────────────────
  // WebSocket messages arrive individually, often carrying 1–3 tokens each.
  // Accumulating them over a 100 ms window before processing gives the
  // Speaker Stabilizer a larger, more representative token batch, so the
  // 3-consecutive-token confirmation threshold is reached faster and false
  // speaker flips are less likely to cross the threshold in isolation.
  //
  // Pipeline: Soniox WS → Token Buffer (100 ms) → Speaker Stabilizer
  //           → Segment Builder → Translation → UI
  //
  const wsTokenBufferRef    = useRef<SonioxToken[]>([]);
  const wsBufferTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);


  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── Persist history to localStorage ───────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(finalizedSegments)); }
    catch { /* storage full */ }
  }, [finalizedSegments]);

  // ── flush: seal the active segment into a finalized row ───────────────────
  //
  // Always immediate — no staging delay.
  // finalizedSegments is append-only: once a segment is pushed it is NEVER
  // modified again.  Only activeSegment updates in place while speaking.
  //
  const flush = useCallback(() => {
    const text = finalBufRef.current.trim();
    if (!text) return;
    const lang = langRef.current;

    // ── Per-segment speaker modal ─────────────────────────────────────────
    // Use the MODE of ALL speaker readings collected during this segment so
    // transient diarization flips at the edges don't corrupt the label.
    let stableSpeaker = speakerRef.current;
    if (speakerHistoryRef.current.length > 0) {
      const counts = new Map<number, number>();
      for (const spk of speakerHistoryRef.current) {
        counts.set(spk, (counts.get(spk) ?? 0) + 1);
      }
      let best = stableSpeaker, bestCount = 0;
      for (const [spk, count] of counts) {
        if (count > bestCount) { bestCount = count; best = spk; }
      }
      stableSpeaker = best;
    }

    // Clear per-segment state so the next segment starts completely fresh.
    speakerHistoryRef.current   = [];
    finalBufRef.current         = "";
    nfDisplayRef.current        = "";
    activeSegSpeakerRef.current = undefined;
    setActiveSegment(null); // live row disappears; finalized row appears below

    const phrase: Phrase = {
      id:           nextId(),
      speakerLabel: normalizeSpeaker(stableSpeaker),
      text,
      language:     lang,
    };

    // Append to the immutable finalized list — never rebuild from scratch.
    setFinalizedSegments(prev => [...prev, phrase]);
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    if (wsBufferTimerRef.current) { clearTimeout(wsBufferTimerRef.current); wsBufferTimerRef.current = null; }
    wsTokenBufferRef.current      = [];
    speakerHistoryRef.current     = [];
    activeSegSpeakerRef.current   = undefined;
    globalFinalCountRef.current   = 0;

    // If the final buffer is empty but there is a non-final live suffix
    // (speaker was mid-word when Stop was pressed), promote that suffix so
    // flush() has something to commit — prevents the "goes blank" bug.
    if (!finalBufRef.current.trim() && nfDisplayRef.current.trim()) {
      finalBufRef.current = nfDisplayRef.current;
    }
    nfDisplayRef.current = "";
    flush(); // seals any remaining buffered text into a finalized row

    workletRef.current?.disconnect();
    workletRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* eof signal */ }
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
  }, [stopSessionMut, flush]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  //
  // Single WebSocket to Soniox stt-rt-v4 (released Feb 5, 2026).
  // One unified multilingual model handles English ↔ Arabic switching
  // internally — no dual-socket fighting, no language guard delays.
  //
  const buildWs = useCallback((apiKey: string): WebSocket => {
    const ws = new WebSocket(SONIOX_WS_URL);
    let apiErrorOccurred = false;

    ws.onopen = () => {
      const config = {
        api_key:                        apiKey,
        model:                          "stt-rt-v4",
        audio_format:                   "pcm_s16le",
        sample_rate:                    TARGET_RATE,
        num_channels:                   1,
        language_hints:                 ["en", "ar"],
        enable_language_identification: true,
        // Two forms — stt-rt-v4 accepts either; send both for compatibility.
        enable_speaker_diarization:     true,
        diarization:                    { enable: true },
      };
      ws.send(JSON.stringify(config));
      console.log("[WS] stt-rt-v4 OPEN — config sent:", config);
    };

    // ── processTokens: Speaker Stabilizer + Segment Builder ──────────────
    //
    // Called immediately on every WebSocket message — no buffering delay.
    // Runs the full pipeline inline so tokens reach the UI the moment they
    // arrive from Soniox:
    //
    //   (each WS msg) → Speaker Stabilizer → Segment Builder → UI update
    //
    // ── Per-token finalization rules (in strict order) ───────────────────
    //
    // For each genuinely new final token:
    //
    //   1. No active segment?
    //        → create one using token.speaker.
    //
    //   2. Speaker change? (checked FIRST, before any append)
    //        → flush current segment, open a new one with token.speaker.
    //
    //   3. Append token.text to the active segment.
    //
    //   4. Sentence boundary? (checked SECOND, after append)
    //        → flush current segment, open a new one with the SAME speaker.
    //
    // Utterance boundary (all tokens final) also flushes.
    // Safety word cap is a last-resort guard.
    //
    const SENTENCE_END = /[.?!]\s*$/;

    const processTokenBatch = (tokens: SonioxToken[]) => {
      if (tokens.length === 0) return;

      // ── Walk every token in message order ────────────────────────────────
      // Non-final tokens → live preview only.
      // Final tokens     → speaker-change → append → sentence-boundary.
      //
      // Deduplication: Soniox re-sends ALL prior final tokens in every message.
      // globalFinalCountRef tracks how many we've consumed this utterance;
      // anything below the watermark is skipped.  Resets at utterance boundary.
      //
      let finalSeenThisMsg = 0;
      const newFinalToks:  SonioxToken[] = [];
      const previewParts:  string[]      = [];
      let   hasNonFinal = false;

      for (const token of tokens) {
        if (!token.is_final) {
          previewParts.push(token.text);
          hasNonFinal = true;
          continue;
        }

        // Advance watermark; skip already-processed finals.
        finalSeenThisMsg++;
        if (finalSeenThisMsg <= globalFinalCountRef.current) continue;

        // ── Genuinely new final token ─────────────────────────────────────
        const spk = token.speaker; // undefined when API omits diarization

        // ── Step 1: open a segment if none is active ──────────────────────
        if (activeSegSpeakerRef.current === undefined && spk !== undefined) {
          activeSegSpeakerRef.current = spk;
        }

        // ── Step 2: speaker-change check (BEFORE append) ──────────────────
        if (
          spk !== undefined &&
          activeSegSpeakerRef.current !== undefined &&
          spk !== activeSegSpeakerRef.current &&
          finalBufRef.current.trim()
        ) {
          flush();                           // seals old segment
          activeSegSpeakerRef.current = spk; // open new segment immediately
        }

        // Track speaker for modal computation at flush() time.
        if (spk !== undefined) {
          touchSpeaker(spk);
          speakerHistoryRef.current.push(spk);
          speakerRef.current = spk;
          console.log("[Diarization] final token — speaker:", spk, "text:", JSON.stringify(token.text));
        }

        // ── Step 3: append token text to the active segment ───────────────
        finalBufRef.current += token.text;
        newFinalToks.push(token);

        // ── Step 4: sentence-boundary check (AFTER append) ────────────────
        if (SENTENCE_END.test(token.text) && finalBufRef.current.trim()) {
          const currentSpk = activeSegSpeakerRef.current; // preserve speaker
          flush();                                         // seals this sentence
          // Keep the same speaker open for the next sentence in this turn.
          if (currentSpk !== undefined) {
            activeSegSpeakerRef.current = currentSpk;
          }
        }
      }

      // Advance the watermark to the total finals seen in this message.
      globalFinalCountRef.current = finalSeenThisMsg;

      // ── Language detection ────────────────────────────────────────────────
      if (newFinalToks.length > 0) {
        langRef.current = detectLang(newFinalToks, langRef.current);
      } else if (previewParts.length > 0 && !finalBufRef.current) {
        langRef.current = detectLang(
          tokens.filter(t => !t.is_final),
          langRef.current
        );
      }

      // ── Non-final preview tail (replaced every message) ──────────────────
      nfDisplayRef.current = previewParts.join("");

      // ── Update active segment (live row — updates in place) ───────────────
      const activeText = (finalBufRef.current + nfDisplayRef.current).trim();
      if (activeText) {
        setActiveSegment({
          text:         activeText,
          language:     langRef.current,
          speakerLabel: normalizeSpeaker(speakerRef.current),
        });
      }

      // ── Utterance boundary: no non-final tokens → Soniox VAD complete ────
      if (!hasNonFinal && finalBufRef.current.trim()) {
        globalFinalCountRef.current = 0; // next utterance starts from token 0
        flush();
        return;
      }

      // ── Safety word cap (last resort only) ───────────────────────────────
      const totalWords = activeText.split(/\s+/).filter(Boolean).length;
      if (totalWords >= MAX_SEG_WORDS) {
        // Do NOT promote non-final text — word cap only commits confirmed text.
        globalFinalCountRef.current = 0;
        nfDisplayRef.current = "";
        flush();
      }
    };

    // ── onmessage: immediate per-message processing ───────────────────────
    //
    // Every WebSocket message is processed synchronously — no buffering step.
    // Tokens flow straight into processTokens → Speaker Stabilizer → UI.
    // Text appears on screen the instant Soniox delivers each token.
    //
    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as SonioxMessage;

        if (msg.error || (typeof msg.code === "number" && !msg.tokens)) {
          const errMsg = msg.error ?? msg.message ?? `code ${msg.code}`;
          console.error("[WS] stt-rt-v4 ERROR:", errMsg, msg);
          setError(`Transcription error: ${errMsg}`);
          apiErrorOccurred = true;
          return;
        }

        if (msg.finished) {
          console.log("[WS] stt-rt-v4 finished — committing remaining content");
          if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
          if (!finalBufRef.current.trim() && nfDisplayRef.current.trim()) {
            finalBufRef.current = nfDisplayRef.current;
          }
          nfDisplayRef.current = "";
          flush(); // stream done — finalize whatever is in the buffer
          return;
        }

        const tokens = msg.tokens ?? [];
        if (tokens.length === 0) return;

        // Process immediately — no buffer wait.
        processTokenBatch(tokens);
      } catch (err) {
        console.error("[WS] stt-rt-v4 parse error", err);
      }
    };

    ws.onerror = (e) => console.error("[WS] stt-rt-v4 socket error", e);

    ws.onclose = (ev) => {
      const logFn = (ev.code === 1000 || ev.code === 1001) ? console.log : console.warn;
      logFn(`[WS] stt-rt-v4 closed — code:${ev.code} reason:"${ev.reason}"`);
      if (wsRef.current === ws) wsRef.current = null;

      // Finalize any remaining buffered content on close.
      if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
      if (!finalBufRef.current.trim() && nfDisplayRef.current.trim()) {
        finalBufRef.current = nfDisplayRef.current;
      }
      nfDisplayRef.current = "";
      flush(); // socket gone — finalize immediately

      // Auto-reconnect — preserves history and liveTranscript
      if (!isRecRef.current || apiErrorOccurred) return;
      console.log("[WS] stt-rt-v4 reconnecting in 200 ms…");
      setTimeout(() => {
        if (!isRecRef.current || !apiKeyRef.current) return;
        wsRef.current = buildWs(apiKeyRef.current);
      }, 200);
    };

    return ws;
  }, [stop, flush]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      setActiveSegment(null);
      setAudioInfo("");
      finalBufRef.current         = "";
      nfDisplayRef.current        = "";
      globalFinalCountRef.current = 0;
      activeSegSpeakerRef.current = undefined;
      speakerHistoryRef.current   = [];
      langRef.current             = "en";
      speakerRef.current          = undefined; // reset — no speaker until API sends one
      resetSpeakerMap(); // fresh sequential labels for this recording session

      const tokenRes   = await getTokenMut.mutateAsync({});
      const sessionRes = await startSessionMut.mutateAsync({});
      sessionIdRef.current = sessionRes.sessionId;
      startTimeRef.current = Date.now();
      apiKeyRef.current    = tokenRes.apiKey;

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;

      // Browsers (especially in iframes) often start AudioContext in "suspended"
      // state. Resume must be called explicitly inside a user-gesture handler.
      if (ctx.state === "suspended") {
        await ctx.resume();
        console.log("[Audio] AudioContext resumed from suspended state");
      }
      console.log("[Audio] AudioContext state:", ctx.state, "sampleRate:", ctx.sampleRate);
      setAudioInfo(`${ctx.sampleRate} Hz → ${TARGET_RATE} Hz`);

      await ctx.audioWorklet.addModule("/pcm-processor.js");

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

      // Single WebSocket — stt-rt-v4 handles bilingual internally
      const ws = buildWs(tokenRes.apiKey);
      wsRef.current = ws;

      const audioSource = ctx.createMediaStreamSource(stream);
      const analyser    = ctx.createAnalyser();
      analyser.fftSize  = 256;
      audioSource.connect(analyser);

      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { targetRate: TARGET_RATE },
      });
      workletRef.current = worklet;
      analyser.connect(worklet);
      worklet.connect(ctx.destination);

      let chunkCount = 0;
      worklet.port.onmessage = (e) => {
        const pcm = e.data as ArrayBuffer;
        chunkCount++;
        const wsState = wsRef.current?.readyState;

        // Log every 50th chunk (≈ every 3 seconds) so we can confirm audio is flowing
        if (chunkCount % 50 === 1) {
          console.log(`[Worklet] chunk #${chunkCount} — ${pcm.byteLength} bytes — WS readyState: ${wsState}`);
        }

        if (wsState === WebSocket.OPEN) {
          wsRef.current!.send(pcm);
        } else if (chunkCount % 50 === 1) {
          console.warn(`[Worklet] WS not OPEN (state=${wsState}), dropping chunk`);
        }

        // VU meter
        const samples = new Int16Array(pcm);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / samples.length) * 500));
      };

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
    finalizedSegments,
    activeSegment,
    micLevel,
    error,
    start,
    stop,
    clear: () => {
      setFinalizedSegments([]);
      setActiveSegment(null);
      finalBufRef.current         = "";
      nfDisplayRef.current        = "";
      speakerRef.current          = undefined;
      activeSegSpeakerRef.current = undefined;
      globalFinalCountRef.current = 0;
      resetSpeakerMap();
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (wsBufferTimerRef.current) { clearTimeout(wsBufferTimerRef.current); wsBufferTimerRef.current = null; }
      wsTokenBufferRef.current  = [];
      speakerHistoryRef.current = [];
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
