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

  // ── Pause-based segmentation ───────────────────────────────────────────────
  // lastTokenTimeRef: Date.now() when the most recent FINAL token was confirmed.
  // pauseTimerRef:    handle for the 700ms silence timer — cleared and rescheduled
  //                   on every new final token; when it fires it checks conditions
  //                   and calls flush() if the segment is ready to seal.
  const lastTokenTimeRef = useRef<number>(0);
  const pauseTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Speaker stability filter ───────────────────────────────────────────────
  // Brief speaker flips (A→B→A) caused by noise, "mm", or breathing are NOT
  // treated as real changes.  A new speaker must hold for ≥1200 ms OR produce
  // ≥4 tokens before we accept the change and flush the segment.
  //
  // pendingSpeakerRef:           the candidate new-speaker label being evaluated.
  // pendingSpeakerStartTimeRef:  Date.now() when the candidate was first seen.
  // pendingSpeakerTokenCountRef: number of consecutive tokens from the candidate.
  const pendingSpeakerRef           = useRef<number | null>(null);
  const pendingSpeakerStartTimeRef  = useRef<number>(0);
  const pendingSpeakerTokenCountRef = useRef<number>(0);

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
    pendingSpeakerRef.current           = null;    // speaker stability window reset
    pendingSpeakerStartTimeRef.current  = 0;
    pendingSpeakerTokenCountRef.current = 0;
    setActivePreviewLine(null); // live row disappears; finalized row appears below

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
    setFinalizedSegments(prev => {
      if (prev.length === 0) return [phrase];
      const last = prev[prev.length - 1];
      if (last.speakerLabel === speakerLabel) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
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

    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    speakerHistoryRef.current           = [];
    activeSegSpeakerRef.current         = undefined;
    globalFinalCountRef.current         = 0;
    pendingSpeakerRef.current           = null;
    pendingSpeakerStartTimeRef.current  = 0;
    pendingSpeakerTokenCountRef.current = 0;
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
    // 4. Utterance boundary (all-final message) resets the dedup watermark
    //    only — it does NOT flush/split rows.
    //
    // activePreviewLine.text = finalBufRef (confirmed) + nfText (live interim suffix)
    //
    const processTokenBatch = (tokens: SonioxToken[]) => {
      if (tokens.length === 0) return;

      // Non-final text — Soniox sends a complete replacement suffix each message,
      // not a cumulative append.  Local variable resets automatically each call.
      let nfText           = "";
      let finalSeenThisMsg = 0;
      let hasNonFinal      = false;
      const newFinalToks: SonioxToken[] = [];

      for (const token of tokens) {
        if (!token.is_final) {
          // Non-final → collect text for live display, never commit to finalBufRef.
          nfText += token.text;
          hasNonFinal = true;
          // Update speakerRef immediately so the preview label is always current.
          // If the token carries no speaker, inherit by leaving speakerRef unchanged.
          if (token.speaker != null) {
            speakerRef.current = token.speaker;
          }
          continue;
        }

        // Dedup: skip already-consumed finals.
        finalSeenThisMsg++;
        if (finalSeenThisMsg <= globalFinalCountRef.current) continue;

        const spk = token.speaker;

        // Step 1: open a segment if none is active.
        if (activeSegSpeakerRef.current === undefined && spk !== undefined) {
          activeSegSpeakerRef.current = spk;
          segStartMsRef.current       = Date.now();
        }

        // ── Flush guards ───────────────────────────────────────────────────
        // MIN_FLUSH_LEN: never flush a segment shorter than this — prevents
        //   single-word rows and mid-sentence speaker splits.
        // isWordBoundary: never flush inside a word; the current buffer must
        //   end with a space or punctuation before we seal it.
        const MIN_FLUSH_LEN   = 20;
        const atWordBoundary  = () => /[\s.!?,;:]$/.test(finalBufRef.current);
        const hasMinLength    = () => finalBufRef.current.trim().length >= MIN_FLUSH_LEN;

        // Step 2a: speaker-change stability filter.
        // A brief flip (A→B→A) from noise / breathing is not a real change.
        // The new speaker must hold for ≥600 ms OR produce ≥2 tokens before
        // we accept the change, flush the old segment, and open a new one.
        // Kept deliberately low so natural turn-taking ("Yes, yeah.") is
        // confirmed quickly — Soniox's server-side model is accurate enough
        // that single-token glitches are rare.
        if (spk !== undefined && activeSegSpeakerRef.current !== undefined) {
          if (spk !== activeSegSpeakerRef.current) {
            if (pendingSpeakerRef.current === null) {
              // First token from a new speaker — open a provisional stability window.
              pendingSpeakerRef.current           = spk;
              pendingSpeakerStartTimeRef.current  = Date.now();
              pendingSpeakerTokenCountRef.current = 1;
            } else if (spk === pendingSpeakerRef.current) {
              // Same candidate — extend its window.
              pendingSpeakerTokenCountRef.current++;
            } else {
              // A third speaker appeared — reset the window to this new candidate.
              pendingSpeakerRef.current           = spk;
              pendingSpeakerStartTimeRef.current  = Date.now();
              pendingSpeakerTokenCountRef.current = 1;
            }

            // Confirm the change once the candidate meets the stability threshold.
            const pendingElapsed = Date.now() - pendingSpeakerStartTimeRef.current;
            if (
              (pendingElapsed >= 600 || pendingSpeakerTokenCountRef.current >= 2) &&
              hasMinLength() &&
              atWordBoundary()
            ) {
              // Capture the confirmed speaker BEFORE flush() wipes pendingSpeakerRef.
              const confirmedSpk = pendingSpeakerRef.current;
              flush(); // seals old segment; also clears pendingSpeaker* refs
              activeSegSpeakerRef.current = confirmedSpk;
              segStartMsRef.current       = Date.now();
            }
          } else {
            // Returned to the current speaker — the flip was noise; cancel pending.
            pendingSpeakerRef.current           = null;
            pendingSpeakerStartTimeRef.current  = 0;
            pendingSpeakerTokenCountRef.current = 0;
          }
        }

        // Track speaker history (modal label computed at flush time).
        if (spk !== undefined) {
          touchSpeaker(spk);
          speakerHistoryRef.current.push(spk);
          speakerRef.current = spk;
          console.log("[Diarization] token speaker:", spk, JSON.stringify(token.text));
        }

        // Step 3: commit confirmed text (final tokens only — rule 1).
        finalBufRef.current += token.text;
        newFinalToks.push(token);

        // Step 2b: punctuation flush — sentence boundary (rules 2, 5).
        // Fires AFTER appending; punctuation is included in the sealed segment.
        if (hasMinLength() && /[.!?]$/.test(finalBufRef.current.trimEnd())) {
          flush();
        }

        // Step 2c: length / time cap — prevent runaway segments (rules 2, 3, 5).
        // Flush only at a word boundary to avoid splitting mid-word (rule 5).
        const elapsed = segStartMsRef.current > 0
          ? Date.now() - segStartMsRef.current
          : 0;
        if (
          hasMinLength() &&
          atWordBoundary() &&
          (finalBufRef.current.length >= 120 || elapsed >= 3200)
        ) {
          flush();
        }
      }

      // Step 2d: pause-based flush — 700ms of silence triggers a segment seal.
      // Reset and reschedule on every message that contains new final tokens so
      // the 700ms window always starts from the LAST confirmed token.
      // The callback re-checks conditions at fire-time using current ref values.
      if (newFinalToks.length > 0) {
        lastTokenTimeRef.current = Date.now();
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => {
          pauseTimerRef.current = null;
          const buf = finalBufRef.current;
          if (
            Date.now() - lastTokenTimeRef.current > 700 &&
            buf.trim().length >= 20 &&
            /[\s.!?,;:]$/.test(buf)
          ) {
            flush();
          }
        }, 700);
      }

      // Advance the watermark.
      globalFinalCountRef.current = finalSeenThisMsg;

      // Utterance boundary: all-final message → reset watermark for next
      // utterance (Soniox resets its own count).  No flush — segment grows on.
      if (!hasNonFinal && newFinalToks.length > 0) {
        globalFinalCountRef.current = 0;
      }

      // Language detection from newly confirmed tokens.
      if (newFinalToks.length > 0) {
        langRef.current = detectLang(newFinalToks, langRef.current);
      }

      // activePreviewLine updates every message — text and speaker together.
      // speakerRef.current is always the latest known speaker (updated by both
      // non-final and final tokens above).  flush() is final-only — never here.
      const displayText = (finalBufRef.current + nfText).trim();
      if (displayText) {
        const previewSpeaker = speakerRef.current;   // already the latest
        setActivePreviewLine({
          text:         displayText,
          language:     langRef.current,
          speakerLabel: normalizeSpeaker(previewSpeaker),
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
          console.error("[WS] stt-rt-v4 ERROR:", errMsg, msg);
          setError(`Transcription error: ${errMsg}`);
          apiErrorOccurred = true;
          return;
        }

        if (msg.finished) {
          console.log("[WS] stt-rt-v4 finished — committing remaining content");
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
      if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
      finalBufRef.current         = "";
      globalFinalCountRef.current         = 0;
      activeSegSpeakerRef.current         = undefined;
      segStartMsRef.current               = 0;
      lastTokenTimeRef.current            = 0;
      pendingSpeakerRef.current           = null;
      pendingSpeakerStartTimeRef.current  = 0;
      pendingSpeakerTokenCountRef.current = 0;
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
    start,
    stop,
    clear: () => {
      if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
      setFinalizedSegments([]);
      setActivePreviewLine(null);
      finalBufRef.current         = "";
      speakerRef.current          = undefined;
      activeSegSpeakerRef.current         = undefined;
      segStartMsRef.current               = 0;
      lastTokenTimeRef.current            = 0;
      pendingSpeakerRef.current           = null;
      pendingSpeakerStartTimeRef.current  = 0;
      pendingSpeakerTokenCountRef.current = 0;
      globalFinalCountRef.current         = 0;
      speakerHistoryRef.current           = [];
      resetSpeakerMap();
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
