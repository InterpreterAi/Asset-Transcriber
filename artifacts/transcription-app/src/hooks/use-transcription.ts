import { useRef, useState, useCallback, useEffect } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";

// ── Public types ───────────────────────────────────────────────────────────────

export type LangCode = "en" | "ar";

/** A completed, permanent transcript entry — sealed on speaker change, sentence boundary, or utterance end. */
export interface Phrase {
  id: string;
  speakerLabel: string;
  text: string;
  language: LangCode;
}

/** The live preview row — updated on every token event, never part of finalizedSegments. */
export interface ActivePreviewLine {
  text: string;
  language: LangCode;
  speakerLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE  = 16000;
const STORAGE_KEY  = "interpretai_phrases";



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
  const [activePreviewLine, setActivePreviewLine]  = useState<ActivePreviewLine | null>(null);
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

  // ── Token buffer refs ──────────────────────────────────────────────────────
  //
  // v4 token stream logic:
  //   • Final tokens (is_final: true) accumulate in `finalBufRef` — committed,
  //     never change.  Cleared only by flush().
  //   • Non-final tokens (is_final: false) contribute `nfText` (local variable,
  //     reset per message) — a live replacement suffix, never committed.
  //   • activePreviewLine.text = finalBufRef + nfText (live, updates in place).
  //
  // No timers — no queues — no delays.  processTokenBatch() runs synchronously
  // on every WebSocket message.
  //
  const finalBufRef    = useRef<string>("");
  const langRef        = useRef<LangCode>("en");
  const speakerRef     = useRef<number | undefined>(undefined);
  // Soniox re-sends ALL previously-finalized tokens in every message.
  // Track how many we have already processed so each message only yields the
  // truly new tail.  Reset to 0 at every utterance boundary.
  const globalFinalCountRef = useRef<number>(0);

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

  // ── Segment start timestamp ────────────────────────────────────────────────
  // Date.now() when the CURRENT segment opened (first token after a flush).
  // Used by the 3.2-second time-cap flush trigger.
  // 0 = no segment is open.
  const segStartMsRef = useRef<number>(0);

  // ── Direct DOM refs for zero-latency text rendering ───────────────────────
  // React's state updates are batched and scheduled — they can lag real-time
  // token arrival by one or more frames.  For the live transcription text we
  // write DIRECTLY to two <span> DOM elements without going through React:
  //
  //   activeFinalSpanRef  — confirmed (final) text; normal weight, full opacity.
  //   activeNFSpanRef     — live interim suffix (non-final); italic, 55% opacity.
  //
  // The spans are empty shell elements rendered by <ActiveBubble> in workspace.tsx.
  // workspace.tsx connects them via ref callbacks when the bubble mounts and
  // disconnects (sets null) when it unmounts.  All text writes check for null.
  //
  // React state (activePreviewLine) still controls STRUCTURE: whether a bubble
  // is visible at all, which speaker label it shows, and the language direction.
  // Text content is never stored in React state — only in these DOM refs.
  const activeFinalSpanRef = useRef<HTMLSpanElement | null>(null);
  const activeNFSpanRef    = useRef<HTMLSpanElement | null>(null);

  // ── Speaker tracking ───────────────────────────────────────────────────────
  // No stability window — speaker changes are instant.  When a final token
  // arrives with a different speaker_id, flush the current segment immediately
  // and open a new one.  The same-speaker merge in flush() corrects any brief
  // mislabelings by consolidating consecutive same-speaker rows into one bubble.
  // (Stability windows caused 600ms+ lag where new-speaker tokens piled up in
  // the old speaker's buffer and then burst onto the screen as a giant chunk.)

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
  // modified again.  Only activePreviewLine updates in place while speaking.
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
    speakerHistoryRef.current           = [];
    finalBufRef.current                 = "";
    activeSegSpeakerRef.current         = undefined;
    segStartMsRef.current               = 0;       // no segment open until next token

    // Clear the live DOM spans immediately so the text doesn't linger in the
    // active bubble while React schedules the finalized row render.
    if (activeFinalSpanRef.current) activeFinalSpanRef.current.textContent = "";
    if (activeNFSpanRef.current)    activeNFSpanRef.current.textContent    = "";
    // Null out refs — any tokens arriving before React re-renders the new bubble
    // will see null refs and skip DOM writes (safe no-op).  The new bubble's
    // ref callbacks will reassign these when it mounts.
    activeFinalSpanRef.current = null;
    activeNFSpanRef.current    = null;

    setActivePreviewLine(null);

    const speakerLabel = normalizeSpeaker(stableSpeaker);
    const phrase: Phrase = {
      id: nextId(),
      speakerLabel,
      text,
      language: lang,
    };

    // Same-speaker merge: if the last finalized segment belongs to the same
    // speaker, extend its text instead of creating a new row.  This collapses
    // pause-split or punctuation-split segments from a continuous speaker into
    // a single readable block.  Different speaker → always a new row.
    //
    // Extra cases that should also merge (not create a new row):
    //  • last.speakerLabel is "" (early token before Soniox assigned a speaker)
    //    → promote it to the current known label and append.
    //  • speakerLabel is "" (current flush has no speaker info yet)
    //    → treat as same speaker; don't create an orphan unlabeled row.
    // Speaker IDs from Soniox are numbers in JSON; String() coercion ensures
    // the label comparison is always string–string (defensive, labels are already
    // strings from normalizeSpeaker but guard against any future refactor).
    setFinalizedSegments(prev => {
      if (prev.length === 0) return [phrase];
      const last = prev[prev.length - 1];
      const lastLabel   = String(last.speakerLabel);
      const currentLabel = String(speakerLabel);
      const sameOrUnknown =
        lastLabel === currentLabel ||
        lastLabel === ""           ||   // last row had no speaker yet → adopt
        currentLabel === "";            // this flush has no speaker → don't split
      if (sameOrUnknown) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          // Use whichever label is more informative (non-empty wins).
          speakerLabel: currentLabel !== "" ? currentLabel : lastLabel,
          text: (last.text + " " + text).trim(),
        };
        return updated;
      }
      return [...prev, phrase];
    });
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    if (activeFinalSpanRef.current) activeFinalSpanRef.current.textContent = "";
    if (activeNFSpanRef.current)    activeNFSpanRef.current.textContent    = "";
    activeFinalSpanRef.current = null;
    activeNFSpanRef.current    = null;
    speakerHistoryRef.current           = [];
    activeSegSpeakerRef.current         = undefined;
    globalFinalCountRef.current         = 0;
    flush(); // seals any remaining confirmed text into a finalized row

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
    // ── Token processing rules ────────────────────────────────────────────
    //
    // 1. Non-final tokens  → update activePreviewLine immediately (live preview).
    //    They are a REPLACEMENT suffix each message — NEVER touch finalizedSegments.
    // 2. Final tokens      → commit to finalBufRef, detect speaker changes.
    // 3. A new finalized segment is created ONLY on token.speaker change.
    const processTokenBatch = (tokens: SonioxToken[]) => {
      if (tokens.length === 0) return;

      let nfSuffix         = "";
      let finalSeenThisMsg = 0;
      let hasNonFinal      = false;

      for (const token of tokens) {
        if (!token.is_final) {
          nfSuffix += token.text;
          hasNonFinal = true;
          if (token.speaker != null) speakerRef.current = token.speaker;
          continue;
        }

        // Dedup — skip finals already committed in a previous message.
        finalSeenThisMsg++;
        if (finalSeenThisMsg <= globalFinalCountRef.current) continue;

        const spk = token.speaker;
        if (spk !== undefined) {
          speakerRef.current = spk;
          speakerHistoryRef.current.push(spk);
          touchSpeaker(spk);
        }

        // Open segment if none active.
        if (activeSegSpeakerRef.current === undefined) {
          activeSegSpeakerRef.current = spk;
          segStartMsRef.current = Date.now();
        }

        // Instant speaker split on first final token from a new speaker.
        if (spk !== undefined && spk !== activeSegSpeakerRef.current && finalBufRef.current.trim().length > 0) {
          flush();
          activeSegSpeakerRef.current = spk;
          segStartMsRef.current = Date.now();
        }

        finalBufRef.current += token.text;

        // Punctuation flush — seal long sentences at natural boundaries.
        if (finalBufRef.current.trim().length >= 60 && /[.!?]$/.test(finalBufRef.current.trimEnd())) {
          flush();
        }

        // Time cap — 6 s max per segment.
        if (finalBufRef.current.trim().length >= 20 && segStartMsRef.current > 0 && Date.now() - segStartMsRef.current >= 6000) {
          flush();
        }
      }

      // Update watermark.
      globalFinalCountRef.current = finalSeenThisMsg;
      if (!hasNonFinal && finalSeenThisMsg > 0) globalFinalCountRef.current = 0;

      // Language detection.
      if (finalSeenThisMsg > 0) langRef.current = detectLang(tokens.filter(t => t.is_final), langRef.current);

      // ── Direct DOM write — every message, zero scheduler overhead ──────────
      // Single target: activeFinalSpanRef holds the combined live text.
      // confirmed finals + current NF suffix written in one assignment.
      const liveText = finalBufRef.current + nfSuffix;
      if (activeFinalSpanRef.current) activeFinalSpanRef.current.textContent = liveText;
      // NF span cleared — we show everything in one span now.
      if (activeNFSpanRef.current) activeNFSpanRef.current.textContent = "";

      // Structural React update — only when the bubble needs to open.
      if (liveText) {
        const label = normalizeSpeaker(speakerRef.current);
        const lang  = langRef.current;
        setActivePreviewLine(prev => {
          if (prev?.speakerLabel === label && prev?.language === lang) return prev;
          return { text: "", speakerLabel: label, language: lang };
        });
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
          console.error("[WS] error:", errMsg);
          setError(`Transcription error: ${errMsg}`);
          apiErrorOccurred = true;
          return;
        }

        if (msg.finished) {
          flush(); // stream done — finalize whatever is in the buffer
          return;
        }

        const tokens = msg.tokens ?? [];
        if (tokens.length === 0) return;

        // Process immediately — no buffer wait.
        processTokenBatch(tokens);
      } catch (err) {
        console.error("[WS] parse error", err);
      }
    };

    ws.onerror = (e) => console.error("[WS] stt-rt-v4 socket error", e);

    ws.onclose = (ev) => {
      const logFn = (ev.code === 1000 || ev.code === 1001) ? console.log : console.warn;
      logFn(`[WS] stt-rt-v4 closed — code:${ev.code} reason:"${ev.reason}"`);
      if (wsRef.current === ws) wsRef.current = null;

      flush(); // socket gone — finalize any remaining confirmed text

      // Auto-reconnect — finalizedSegments and activePreviewLine are preserved in refs
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
      setActivePreviewLine(null);
      setAudioInfo("");
      if (activeFinalSpanRef.current) activeFinalSpanRef.current.textContent = "";
      if (activeNFSpanRef.current)    activeNFSpanRef.current.textContent    = "";
      activeFinalSpanRef.current = null;
      activeNFSpanRef.current    = null;
      finalBufRef.current         = "";
      globalFinalCountRef.current         = 0;
      activeSegSpeakerRef.current         = undefined;
      segStartMsRef.current               = 0;
      speakerHistoryRef.current           = [];
      langRef.current                     = "en";
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
    activePreviewLine,
    micLevel,
    error,
    activeFinalSpanRef,
    activeNFSpanRef,
    start,
    stop,
    clear: () => {
      if (activeFinalSpanRef.current) activeFinalSpanRef.current.textContent = "";
      if (activeNFSpanRef.current)    activeNFSpanRef.current.textContent    = "";
      activeFinalSpanRef.current = null;
      activeNFSpanRef.current    = null;
      setFinalizedSegments([]);
      setActivePreviewLine(null);
      finalBufRef.current         = "";
      speakerRef.current          = undefined;
      activeSegSpeakerRef.current         = undefined;
      segStartMsRef.current               = 0;
      globalFinalCountRef.current         = 0;
      speakerHistoryRef.current           = [];
      resetSpeakerMap();
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
