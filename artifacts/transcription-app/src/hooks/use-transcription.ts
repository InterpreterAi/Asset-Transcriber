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

/** The sentence currently being spoken — updated in place on every token event. */
export interface LiveTranscript {
  text: string;
  language: LangCode;
  speakerLabel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE  = 16000;
const STORAGE_KEY  = "interpretai_phrases";

// How long the token stream must be completely silent before a live phrase
// is sealed into history.  The Soniox v4 endpoint detector creates natural
// pauses at clause boundaries (comma, breath) that can be >800 ms.  At 800ms
// we were sealing mid-sentence.  2000ms matches the API's own default
// max_endpoint_delay_ms, so a new bubble only starts after a real pause.
const COMMIT_DELAY = 1500;

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

// ── Speaker normalizer ─────────────────────────────────────────────────────────
//
// Soniox v4 returns arbitrary cluster IDs (0, 10, 21, …) that can be large
// or non-sequential.  We map each unique raw ID to a stable sequential label
// (Speaker 1, Speaker 2, …) for the duration of the recording session.
// The map lives outside the hook so it survives React re-renders; it is reset
// on every fresh recording start and on clear().
//
const _speakerMap   = new Map<number, number>(); // rawId → sequential index
let   _speakerCount = 0;

function resetSpeakerMap() {
  _speakerMap.clear();
  _speakerCount = 0;
}

function normalizeSpeaker(rawId: number | undefined): string {
  const id = rawId ?? 0;
  if (!_speakerMap.has(id)) {
    _speakerCount += 1;
    _speakerMap.set(id, _speakerCount);
  }
  return `Speaker ${_speakerMap.get(id)}`;
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
  const [isRecording, setIsRecording]       = useState(false);
  const [phrases, setPhrases]               = useState<Phrase[]>(loadPhrases);
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscript | null>(null);
  const [micLevel, setMicLevel]             = useState(0);
  const [error, setError]                   = useState<string | null>(null);
  const [audioInfo, setAudioInfo]           = useState<string>("");

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
  const speakerRef     = useRef<number>(0);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of the most recent token arrival — final OR non-final.
  // The silence flush only commits when this has been stale for ≥ COMMIT_DELAY.
  const lastTokenTimeRef = useRef<number>(0);
  // Predictive speaker detection from non-final tokens.
  // Soniox's diarization sometimes assigns the correct speaker ID to
  // non-final tokens several hundred ms BEFORE those tokens become final.
  // By watching non-final speaker IDs we can pre-flush the current speaker's
  // buffer before the new speaker's words arrive as final tokens — eliminating
  // the "reorganization" effect where text appears under the wrong speaker.
  const speakerPredictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNfSpeakerRef    = useRef<number | undefined>(undefined);

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  // ── Persist history to localStorage ───────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases)); }
    catch { /* storage full */ }
  }, [phrases]);

  // ── flush: seal the accumulated buffer into a permanent phrase ─────────────
  const flush = useCallback(() => {
    const text = finalBufRef.current.trim();
    if (!text) return;
    const lang = langRef.current;
    const spk  = speakerRef.current;
    finalBufRef.current = "";
    nfDisplayRef.current = "";
    // Cancel any pending predictive speaker timer — once a segment is sealed
    // the prediction is no longer relevant for the previous buffer.
    if (speakerPredictTimerRef.current) {
      clearTimeout(speakerPredictTimerRef.current);
      speakerPredictTimerRef.current = null;
    }
    pendingNfSpeakerRef.current = undefined;
    setPhrases(prev => [
      ...prev,
      { id: nextId(), speakerLabel: normalizeSpeaker(spk), text, language: lang },
    ]);
    setLiveTranscript(null);
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    if (speakerPredictTimerRef.current) { clearTimeout(speakerPredictTimerRef.current); speakerPredictTimerRef.current = null; }
    pendingNfSpeakerRef.current = undefined;

    // If the final buffer is empty but there is a non-final live suffix
    // (speaker was mid-word when Stop was pressed), promote that suffix so
    // flush() has something to commit — prevents the "goes blank" bug.
    if (!finalBufRef.current.trim() && nfDisplayRef.current.trim()) {
      finalBufRef.current = nfDisplayRef.current;
    }
    nfDisplayRef.current = "";
    flush(); // Commit any unsent text

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
        sample_rate:                    TARGET_RATE,   // v4 API field (NOT sample_rate_hertz)
        num_channels:                   1,             // v4 API field (NOT num_audio_channels)
        language_hints:                 ["en", "ar"],
        enable_language_identification: true,
        enable_speaker_diarization:     true,
      };
      ws.send(JSON.stringify(config));
      console.log("[WS] stt-rt-v4 OPEN — config sent:", config);
    };

    ws.onmessage = (e: MessageEvent) => {
      // Log every raw message so we can confirm tokens are arriving
      console.log("[WS] RAW message:", e.data);

      try {
        const msg = JSON.parse(e.data as string) as SonioxMessage;

        // API error — surface once, stop reconnecting
        if (msg.error || (typeof msg.code === "number" && !msg.tokens)) {
          const errMsg = msg.error ?? msg.message ?? `code ${msg.code}`;
          console.error("[WS] stt-rt-v4 ERROR:", errMsg, msg);
          setError(`Transcription error: ${errMsg}`);
          apiErrorOccurred = true;
          return;
        }

        // Stream finished (server closed cleanly) — commit any remaining content
        // immediately rather than waiting for the silence timer.
        if (msg.finished) {
          console.log("[WS] stt-rt-v4 finished");
          if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
          if (!finalBufRef.current.trim() && nfDisplayRef.current.trim()) {
            finalBufRef.current = nfDisplayRef.current;
          }
          nfDisplayRef.current = "";
          flush();
          return;
        }

        const tokens = msg.tokens ?? [];
        console.log("[WS] tokens count:", tokens.length, "| final:", tokens.filter(t => t.is_final).length);
        if (tokens.length === 0) return;

        // Stamp every arrival — used by the silence-flush guard below.
        // Non-final tokens arrive every 60–200 ms during active speech;
        // this prevents the commit timer from firing mid-sentence when
        // there is merely a gap between two consecutive final-token batches.
        lastTokenTimeRef.current = Date.now();

        const finalTokens = tokens.filter(t => t.is_final);
        const nfTokens    = tokens.filter(t => !t.is_final);

        // ── Final tokens: accumulate into the sentence buffer ──────────────
        if (finalTokens.length > 0) {
          langRef.current = detectLang(finalTokens, langRef.current);

          // ── Sequential speaker-change detection ──────────────────────────
          //
          // Scan token-by-token.  The instant the speaker ID changes, flush
          // the current buffer and start a fresh one for the new speaker.
          //
          // Previous "isLast || nextSame" guard was WRONG: when it failed
          // (single mid-batch change token) the new speaker's text was still
          // appended to the old buffer (line: finalBufRef += token.text),
          // silently misattributing speech and delaying the segment split
          // until the NEXT batch confirmed the change.  Removing the guard
          // means occasional single-token misassignments create a tiny
          // isolated segment — acceptable vs. silent text misattribution.
          //
          for (let i = 0; i < finalTokens.length; i++) {
            const token = finalTokens[i]!;
            const tSpk  = token.speaker;

            if (tSpk !== undefined && tSpk !== speakerRef.current && finalBufRef.current.trim()) {
              // Speaker changed — seal the previous speaker's segment immediately.
              if (commitTimerRef.current) {
                clearTimeout(commitTimerRef.current);
                commitTimerRef.current = null;
              }
              flush();
              speakerRef.current = tSpk;
            }

            // Lock speaker at utterance start (empty buffer = fresh segment)
            if (finalBufRef.current === "" && tSpk !== undefined) {
              speakerRef.current = tSpk;
            }

            finalBufRef.current += token.text;
          }
        }

        // ── Non-final tokens: REPLACE the live suffix (Buffer-and-Overwrite) ─
        nfDisplayRef.current = nfTokens.map(t => t.text).join("");

        // Language fallback from non-final when buffer is still empty
        if (nfTokens.length > 0 && !finalBufRef.current) {
          langRef.current = detectLang(nfTokens, langRef.current);
        }

        // ── Predictive speaker detection from non-final tokens ──────────────
        //
        // The Soniox diarization model often assigns the correct speaker ID
        // to non-final tokens 200–500 ms BEFORE those tokens become final.
        // By watching for a stable non-final speaker change we can pre-flush
        // the current speaker's buffer early, so when the tokens ARE finalized
        // they land in a fresh buffer attributed to the correct speaker.
        //
        // To avoid false positives from single-batch noise, we require the
        // same new speaker to appear in non-final tokens for 200 ms
        // continuously before acting.
        //
        if (nfTokens.length > 0 && finalBufRef.current.trim()) {
          // Take the first non-final token that has a speaker ID
          const nfSpk = nfTokens.find(t => t.speaker !== undefined)?.speaker;

          if (nfSpk !== undefined && nfSpk !== speakerRef.current) {
            // Non-final tokens predict a speaker change
            if (pendingNfSpeakerRef.current !== nfSpk) {
              // New prediction — reset the confirmation window
              pendingNfSpeakerRef.current = nfSpk;
              if (speakerPredictTimerRef.current) {
                clearTimeout(speakerPredictTimerRef.current);
                speakerPredictTimerRef.current = null;
              }
              speakerPredictTimerRef.current = setTimeout(() => {
                speakerPredictTimerRef.current = null;
                // Confirmed: same new speaker in non-final tokens for 200 ms
                // → pre-flush the current speaker's buffer
                if (
                  pendingNfSpeakerRef.current !== undefined &&
                  pendingNfSpeakerRef.current !== speakerRef.current &&
                  finalBufRef.current.trim()
                ) {
                  if (commitTimerRef.current) {
                    clearTimeout(commitTimerRef.current);
                    commitTimerRef.current = null;
                  }
                  flush();
                  speakerRef.current = pendingNfSpeakerRef.current;
                }
                pendingNfSpeakerRef.current = undefined;
              }, 200);
            }
            // else: same prediction already pending, let the timer run
          } else {
            // No change (or reverted) — cancel any pending prediction
            if (speakerPredictTimerRef.current) {
              clearTimeout(speakerPredictTimerRef.current);
              speakerPredictTimerRef.current = null;
            }
            pendingNfSpeakerRef.current = undefined;
          }
        } else if (nfTokens.length === 0) {
          // No non-final tokens (silence) — cancel pending prediction
          if (speakerPredictTimerRef.current) {
            clearTimeout(speakerPredictTimerRef.current);
            speakerPredictTimerRef.current = null;
          }
          pendingNfSpeakerRef.current = undefined;
        }

        // ── Commit-timer logic ──────────────────────────────────────────────
        //
        // Priority (highest → lowest):
        //  1. Speaker change           → synchronous flush inside the loop above
        //  2. Sentence punctuation     → synchronous flush here
        //  3. Final tokens, no boundary → (re)arm the silence-flush timer
        //  4. Non-final tokens only    → leave the timer untouched
        //
        // The silence-flush timer fires COMMIT_DELAY ms after it is armed,
        // but it ALSO checks lastTokenTimeRef at fire time.  If any token
        // arrived since the timer was armed (even just a non-final token from
        // the model continuing to emit during ongoing speech) the callback
        // reschedules itself for the remaining silence gap.
        //
        // This prevents the mid-word fragment bug: "express" commits before
        // "ions" when there is a ≥ COMMIT_DELAY gap between two consecutive
        // *final* token batches even though non-final tokens were arriving
        // continuously in that interval, showing the speaker was still talking.
        //
        if (finalTokens.length > 0 && finalBufRef.current.trim()) {
          const endsSentence = /[.!?؟،。！？]\s*$/.test(finalBufRef.current);

          if (endsSentence) {
            // Confirmed sentence end — flush immediately.
            // The non-final suffix belongs to the NEXT sentence and will
            // repopulate naturally on the next token event.
            if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
            flush();
          } else {
            // No sentence boundary — schedule a silence-aware flush.
            //
            // The callback re-checks lastTokenTimeRef when it fires.  If any
            // token (final or non-final) has arrived in the interim, speech is
            // still ongoing and the callback reschedules itself for the
            // remaining silence needed.  This prevents the mid-word commit
            // ("express" → "ions from my mom") caused by a gap between two
            // consecutive final-token batches while non-final tokens show
            // continuous speech in between.
            if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
            const silenceFlush = () => {
              commitTimerRef.current = null;
              const silentFor = Date.now() - lastTokenTimeRef.current;
              if (silentFor < COMMIT_DELAY) {
                // Tokens still arriving — wait out the remaining silence needed.
                commitTimerRef.current = setTimeout(silenceFlush, COMMIT_DELAY - silentFor + 50);
              } else {
                flush();
              }
            };
            commitTimerRef.current = setTimeout(silenceFlush, COMMIT_DELAY);
          }
        }
        // Non-final tokens only: leave commitTimerRef untouched so it fires
        // on schedule from the last final-token batch.

        // ── Update live transcript: confirmed prefix + uncertain suffix ──────
        const displayText = (finalBufRef.current + nfDisplayRef.current).trim();
        if (displayText) {
          setLiveTranscript({
            text:         displayText,
            language:     langRef.current,
            speakerLabel: normalizeSpeaker(speakerRef.current),
          });
        }
      } catch (err) {
        console.error("[WS] stt-rt-v4 parse error", err);
      }
    };

    ws.onerror = (e) => console.error("[WS] stt-rt-v4 socket error", e);

    ws.onclose = (ev) => {
      const logFn = (ev.code === 1000 || ev.code === 1001) ? console.log : console.warn;
      logFn(`[WS] stt-rt-v4 closed — code:${ev.code} reason:"${ev.reason}"`);
      if (wsRef.current === ws) wsRef.current = null;

      // Flush any buffered content immediately on close — do not wait for the
      // silence timer, which can leave content dangling for up to COMMIT_DELAY ms.
      if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
      if (!finalBufRef.current.trim() && nfDisplayRef.current.trim()) {
        finalBufRef.current = nfDisplayRef.current;
      }
      nfDisplayRef.current = "";
      flush();

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
      setLiveTranscript(null);
      setAudioInfo("");
      finalBufRef.current  = "";
      nfDisplayRef.current = "";
      langRef.current      = "en";
      speakerRef.current   = 0;
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
    phrases,
    liveTranscript,
    micLevel,
    error,
    start,
    stop,
    clear: () => {
      setPhrases([]);
      setLiveTranscript(null);
      finalBufRef.current  = "";
      nfDisplayRef.current = "";
      speakerRef.current   = 0;
      resetSpeakerMap(); // wipe speaker identities with the history
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (speakerPredictTimerRef.current) { clearTimeout(speakerPredictTimerRef.current); speakerPredictTimerRef.current = null; }
      pendingNfSpeakerRef.current = undefined;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    isStarting: getTokenMut.isPending || startSessionMut.isPending,
  };
}
