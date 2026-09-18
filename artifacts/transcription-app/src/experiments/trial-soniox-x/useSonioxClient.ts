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

interface UseSonioxClientOptions {
  apiKey: string | (() => Promise<string>);
  translationConfig?: TranslationConfig;
  languageHints?: string[];
  languageHintsStrict?: boolean;
  context?: SonioxStartContext;
  onStarted?: () => void;
  onFinished?: () => void;
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
};

// useTranscribe hook wraps Soniox speech-to-text-web SDK.
export default function useSonioxClient({
  apiKey,
  translationConfig,
  languageHints,
  languageHintsStrict,
  context,
  onStarted,
  onFinished,
}: UseSonioxClientOptions) {
  const sonioxClient = useRef<SonioxClient | null>(null);
  const apiKeyRef = useRef(apiKey);
  const pendingStartKeyRef = useRef<string | null>(null);
  apiKeyRef.current = apiKey;

  if (sonioxClient.current == null) {
    sonioxClient.current = new SonioxClient({
      apiKey: async () => {
        const pending = pendingStartKeyRef.current?.trim();
        if (pending) return pending;
        const key = apiKeyRef.current;
        return typeof key === "function" ? key() : key;
      },
    });
  }

  const [state, setState] = useState<RecorderState>("Init");
  const [finalTokens, setFinalTokens] = useState<Token[]>([]);
  const [nonFinalTokens, setNonFinalTokens] = useState<Token[]>([]);
  const [error, setError] = useState<TranscriptionError | null>(null);
  const finalAccRef = useRef<Token[]>([]);
  const nonFinalRef = useRef<Token[]>([]);
  const flushRafRef = useRef<number | null>(null);

  const cancelTokenFlush = useCallback(() => {
    if (flushRafRef.current == null) return;
    cancelAnimationFrame(flushRafRef.current);
    flushRafRef.current = null;
  }, []);

  const flushTokensToState = useCallback(() => {
    flushRafRef.current = null;
    setFinalTokens(finalAccRef.current);
    setNonFinalTokens(nonFinalRef.current);
  }, []);

  const scheduleTokenFlush = useCallback(() => {
    if (flushRafRef.current != null) return;
    flushRafRef.current = requestAnimationFrame(flushTokensToState);
  }, [flushTokensToState]);

  const startTranscription = useCallback(async (startOptions?: TrialSonioxXStartOptions) => {
    cancelTokenFlush();
    finalAccRef.current = [];
    nonFinalRef.current = [];
    setFinalTokens([]);
    setNonFinalTokens([]);
    setError(null);
    pendingStartKeyRef.current = startOptions?.apiKey?.trim() || null;

    // First message we send contains configuration. Here we set if we set if we
    // are transcribing or translating. For translation we also set if it is
    // one-way or two-way.
    // Official examples turn endpoint detection on so a pause finalizes the
    // current original AND its translation before the next utterance starts.
    await sonioxClient.current?.start({
      model: "stt-rt-v5",
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
      ...(startOptions?.stream ? { stream: startOptions.stream } : {}),
      ...(startOptions?.audioConstraints
        ? { audioConstraints: startOptions.audioConstraints }
        : {}),

      onFinished: onFinished,
      onStarted: onStarted,

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
        const newFinalTokens: Token[] = [];
        const newNonFinalTokens: Token[] = [];

        for (const token of result.tokens) {
          if (token.is_final) {
            newFinalTokens.push(token);
          } else {
            newNonFinalTokens.push(token);
          }
        }

        if (newFinalTokens.length > 0) {
          finalAccRef.current = finalAccRef.current.concat(newFinalTokens);
        }
        nonFinalRef.current = newNonFinalTokens;
        scheduleTokenFlush();
      },
    });
  }, [cancelTokenFlush, context, languageHints, languageHintsStrict, onFinished, onStarted, scheduleTokenFlush, translationConfig]);

  const stopTranscription = useCallback(() => {
    cancelTokenFlush();
    setFinalTokens(finalAccRef.current);
    setNonFinalTokens(nonFinalRef.current);
    sonioxClient.current?.stop();
  }, [cancelTokenFlush]);

  const clearTokens = useCallback(() => {
    cancelTokenFlush();
    finalAccRef.current = [];
    nonFinalRef.current = [];
    setFinalTokens([]);
    setNonFinalTokens([]);
  }, [cancelTokenFlush]);

  useEffect(() => {
    return () => {
      cancelTokenFlush();
      sonioxClient.current?.cancel();
    };
  }, [cancelTokenFlush]);

  return {
    startTranscription,
    stopTranscription,
    clearTokens,
    state,
    finalTokens,
    nonFinalTokens,
    error,
  };
}
