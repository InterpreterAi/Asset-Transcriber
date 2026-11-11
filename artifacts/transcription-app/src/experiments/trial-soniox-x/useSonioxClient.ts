/**
 * Cloned from Soniox live demo, then wired to InterpreterAI temp keys / optional MediaStream:
 * https://github.com/soniox/soniox_examples/blob/master/apps/soniox-live-demo/react/src/hooks/useSonioxClient.tsx
 *
 * start() model / diarization / translation match the demo. Endpoint detection
 * is on, same as the official live demo and speech_to_text examples: a pause
 * finalizes original + translation together (`<end>`).
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 * `stream` and `audioConstraints` are official SDK fields used only for mic / tab audio.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SonioxClient,
  type ErrorStatus,
  type RecorderState,
  type Token,
  type TranslationConfig,
} from "@soniox/speech-to-text-web";
import type { SonioxStartContext } from "./stable-dialect-context";
import { shouldOpenFreshSonioxEar, tokenIsHeardSpeech } from "./ear-refresh";

interface UseSonioxClientOptions {
  apiKey: string | (() => Promise<string>);
  translationConfig?: TranslationConfig;
  languageHints?: string[];
  languageHintsStrict?: boolean;
  context?: SonioxStartContext;
  onStarted?: () => void;
  onFinished?: () => void;
  /** Fired when Soniox returns any speech token — used to reset the 5‑min inactivity timer. */
  onSpeechActivity?: () => void;
}

type TranscriptionError = {
  status: ErrorStatus;
  message: string;
  errorCode: number | undefined;
};

export type TrialSonioxXStartOptions = {
  stream?: MediaStream;
  audioConstraints?: MediaTrackConstraints;
  /** Prefetched temp key so start() does not wait on a second /token round-trip. */
  apiKey?: string;
  /** Keep the on-screen transcript. Used when opening a fresh Soniox socket after `<end>`. */
  keepTranscript?: boolean;
};

/** Reuse a temp key briefly so a new socket does not mint a key on every pause. */
const FRESH_EAR_KEY_REUSE_MS = 90_000;

// useTranscribe hook wraps Soniox speech-to-text-web SDK.
export default function useSonioxClient({
  apiKey,
  translationConfig,
  languageHints,
  languageHintsStrict,
  context,
  onStarted,
  onFinished,
  onSpeechActivity,
}: UseSonioxClientOptions) {
  const sonioxClient = useRef<SonioxClient | null>(null);
  const apiKeyRef = useRef(apiKey);
  const pendingStartKeyRef = useRef<string | null>(null);
  const onSpeechActivityRef = useRef(onSpeechActivity);
  apiKeyRef.current = apiKey;
  onSpeechActivityRef.current = onSpeechActivity;

  if (sonioxClient.current == null) {
    sonioxClient.current = new SonioxClient({
      apiKey: async () => {
        const pending = pendingStartKeyRef.current?.trim();
        if (pending) return pending;
        const key = apiKeyRef.current;
        const resolved = typeof key === "function" ? await key() : key;
        if (resolved) {
          lastKeyRef.current = resolved;
          lastKeyAtRef.current = Date.now();
        }
        return resolved;
      },
    });
  }

  const [state, setState] = useState<RecorderState>("Init");
  const [finalTokens, setFinalTokens] = useState<Token[]>([]);
  const [nonFinalTokens, setNonFinalTokens] = useState<Token[]>([]);
  const [error, setError] = useState<TranscriptionError | null>(null);
  /** True while the socket is restarting after an utterance. The mic and transcript stay. */
  const [refreshingEar, setRefreshingEar] = useState(false);
  const finalAccRef = useRef<Token[]>([]);
  const nonFinalRef = useRef<Token[]>([]);
  const flushRafRef = useRef<number | null>(null);
  /** When false, ignore trailing SDK partials after Stop so the UI stays wiped. */
  const acceptResultsRef = useRef(false);
  const wantLiveRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const openingFreshRef = useRef(false);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioConstraintsRef = useRef<MediaTrackConstraints | undefined>(undefined);
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyAtRef = useRef(0);
  const startRef = useRef<(opts?: TrialSonioxXStartOptions) => Promise<void>>(async () => {});

  const cancelTokenFlush = useCallback(() => {
    if (flushRafRef.current == null) return;
    cancelAnimationFrame(flushRafRef.current);
    flushRafRef.current = null;
  }, []);

  const flushTokensToState = useCallback(() => {
    flushRafRef.current = null;
    if (!acceptResultsRef.current) return;
    setFinalTokens(finalAccRef.current);
    setNonFinalTokens(nonFinalRef.current);
  }, []);

  const scheduleTokenFlush = useCallback(() => {
    if (!acceptResultsRef.current) return;
    if (flushRafRef.current != null) return;
    flushRafRef.current = requestAnimationFrame(flushTokensToState);
  }, [flushTokensToState]);

  const wipeTokens = useCallback(() => {
    cancelTokenFlush();
    finalAccRef.current = [];
    nonFinalRef.current = [];
    setFinalTokens([]);
    setNonFinalTokens([]);
  }, [cancelTokenFlush]);

  const startTranscription = useCallback(async (startOptions?: TrialSonioxXStartOptions) => {
    const keepTranscript = startOptions?.keepTranscript === true;
    wantLiveRef.current = true;
    if (startOptions?.stream) streamRef.current = startOptions.stream;
    if (startOptions?.audioConstraints) audioConstraintsRef.current = startOptions.audioConstraints;
    acceptResultsRef.current = true;
    if (!keepTranscript) {
      heardSpeechRef.current = false;
      openingFreshRef.current = false;
      wipeTokens();
    }
    setError(null);
    const reused =
      keepTranscript &&
      lastKeyRef.current &&
      Date.now() - lastKeyAtRef.current < FRESH_EAR_KEY_REUSE_MS
        ? lastKeyRef.current
        : "";
    const explicit = startOptions?.apiKey?.trim() || reused;
    pendingStartKeyRef.current = explicit || null;
    if (explicit) {
      lastKeyRef.current = explicit;
      if (!reused) lastKeyAtRef.current = Date.now();
    }

    // First message we send contains configuration. Here we set if we set if we
    // are transcribing or translating. For translation we also set if it is
    // one-way or two-way.
    // Official examples turn endpoint detection on so a pause finalizes the
    // current original AND its translation before the next utterance starts.
    await sonioxClient.current?.start({
      model: "stt-rt-v6",
      enableLanguageIdentification: true,
      enableSpeakerDiarization: true,
      enableEndpointDetection: true,
      translation: translationConfig || undefined,
      ...(languageHints && languageHints.length > 0
        ? {
            languageHints,
            ...(typeof languageHintsStrict === "boolean" ? { languageHintsStrict } : {}),
          }
        : {}),
      ...(context ? { context } : {}),
      ...(streamRef.current ? { stream: streamRef.current } : {}),
      ...(audioConstraintsRef.current ? { audioConstraints: audioConstraintsRef.current } : {}),

      onFinished: () => {
        // Utterance ended: the socket is closed. Open a new one so the next
        // word is heard fresh instead of repeating the first wrong spelling.
        if (openingFreshRef.current && wantLiveRef.current) {
          void startRef.current({ keepTranscript: true }).catch(() => {
            openingFreshRef.current = false;
            setRefreshingEar(false);
          });
          return;
        }
        onFinished?.();
      },
      onStarted: () => {
        // Require new speech before another refresh, so a bare `<end>` cannot loop.
        heardSpeechRef.current = false;
        openingFreshRef.current = false;
        setRefreshingEar(false);
        onStarted?.();
      },

      onError: (
        status: ErrorStatus,
        message: string,
        errorCode: number | undefined,
      ) => {
        setError({ status, message, errorCode });
      },

      onStateChange: ({ newState }) => {
        setState(newState);
      },

      // When we receive some tokens back, sort them based on their status --
      // is it final or non-final token.
      onPartialResult(result) {
        // Stop already wiped the UI; ignore trailing finals from client.stop().
        if (!acceptResultsRef.current) return;

        const newFinalTokens: Token[] = [];
        const newNonFinalTokens: Token[] = [];

        for (const token of result.tokens) {
          if (token.is_final) {
            newFinalTokens.push(token);
          } else {
            newNonFinalTokens.push(token);
          }
        }

        if (result.tokens.some(tokenIsHeardSpeech)) heardSpeechRef.current = true;

        if (result.tokens.length > 0) {
          onSpeechActivityRef.current?.();
        }

        if (newFinalTokens.length > 0) {
          finalAccRef.current = finalAccRef.current.concat(newFinalTokens);
        }
        nonFinalRef.current = newNonFinalTokens;
        scheduleTokenFlush();

        if (
          wantLiveRef.current &&
          !openingFreshRef.current &&
          shouldOpenFreshSonioxEar(result.tokens, heardSpeechRef.current)
        ) {
          heardSpeechRef.current = false;
          openingFreshRef.current = true;
          setRefreshingEar(true);
          queueMicrotask(() => {
            if (!wantLiveRef.current) return;
            sonioxClient.current?.stop();
          });
        }
      },
    });
    if (!wantLiveRef.current) sonioxClient.current?.stop();
  }, [context, languageHints, languageHintsStrict, onFinished, onStarted, scheduleTokenFlush, translationConfig, wipeTokens]);

  startRef.current = startTranscription;

  const stopTranscription = useCallback((opts?: { preserveTokens?: boolean }) => {
    // Match Chuck v2: wipe the transcript as soon as Stop is pressed — not on the
    // next Start. Reject any late SDK partials that arrive while stop() drains.
    // Admin inactivity / max-session auto-stop may preserveTokens so the transcript stays.
    wantLiveRef.current = false;
    openingFreshRef.current = false;
    setRefreshingEar(false);
    acceptResultsRef.current = false;
    if (!opts?.preserveTokens) wipeTokens();
    sonioxClient.current?.stop();
  }, [wipeTokens]);

  const clearTokens = useCallback(() => {
    acceptResultsRef.current = false;
    wipeTokens();
  }, [wipeTokens]);

  useEffect(() => {
    return () => {
      wantLiveRef.current = false;
      cancelTokenFlush();
      sonioxClient.current?.cancel();
    };
  }, [cancelTokenFlush]);

  return {
    startTranscription,
    stopTranscription,
    clearTokens,
    state,
    refreshingEar,
    finalTokens,
    nonFinalTokens,
    error,
  };
}
