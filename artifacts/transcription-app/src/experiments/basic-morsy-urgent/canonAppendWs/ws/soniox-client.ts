/**
 * Thin Soniox realtime websocket — receives audio config + binary PCM from host.
 *
 * Segmentation by `speaker` + `language` mirrors Node SDK `group_by` / RealtimeSegment
 * layout; the REST websocket schema does not expose that field — reducer rows group from token metadata.
 */

import type { SonioxFrame } from "./frame-types";
import { parseSonioxWebSocketPayload } from "./soniox-parser";

export type SonioxClientConfig = {
  apiKey: string;
  /** Realtime WebSocket URL from POST /api/transcription/token (`rtUrl`). */
  rtUrl: string;
  model?: string;
  sampleRate?: number;
  languageHints?: string[];
  enableLanguageIdentification?: boolean;
  maxEndpointDelayMs?: number;
  /** Basic · Morsy Urgent — faster endpoint fallback when maxEndpointDelayMs omitted. */
  morsyUrgentTuning?: boolean;
  translationConfig?:
    | { type: "one_way"; target_language: string }
    | { type: "two_way"; language_a: string; language_b: string };
  interpreterContext?: {
    general: { key: string; value: string }[];
    terms?: string[];
    translation_terms?: { source: string; target: string }[];
  };
};

export class SonioxRealtimeClient {
  private ws: WebSocket | null = null;

  private frameCb: ((frame: SonioxFrame) => void) | null = null;

  private closed = false;

  private pcmQueue: ArrayBuffer[] = [];

  private seq = 0;

  private allocateSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  connect(config: SonioxClientConfig): void {
    this.disconnect(false);
    this.closed = false;
    const rtUrl = config.rtUrl?.trim();
    if (!rtUrl) {
      throw new Error("Live session endpoint is not available.");
    }
    const ws = new WebSocket(rtUrl);
    this.ws = ws;
    ws.onopen = () => {
      const language_hints =
        config.languageHints && config.languageHints.length > 0
          ? config.languageHints
          : undefined;
      ws.send(JSON.stringify({
        api_key:                        config.apiKey,
        model:                          config.model ?? "stt-rt-v5",
        audio_format:                   "pcm_s16le",
        sample_rate:                    config.sampleRate ?? 16_000,
        num_channels:                   1,
        ...(language_hints
          ? { language_hints, language_hints_strict: true }
          : {}),
        enable_speaker_diarization:     true,
        // Soniox: endpointing / early finalize reduces realtime diarization accuracy.
        // Rows group by token.speaker only — see https://soniox.com/docs/stt/concepts/speaker-diarization
        enable_endpoint_detection:      false,
        enable_language_identification: config.enableLanguageIdentification ?? true,
        ...(config.translationConfig
          ? { translation: config.translationConfig }
          : {}),
        ...(config.interpreterContext
          ? { context: config.interpreterContext }
          : {}),
      }));
      this.flushPcmQueue();
    };
    ws.onmessage = evt => {
      if (typeof evt.data === "string") {
        let payload: unknown;
        try {
          payload = JSON.parse(evt.data as string);
        } catch {
          return;
        }
        const errs = payload as Record<string, unknown>;
        const errText =
          [errs.error_message, errs.error, errs.message].find(
            x => typeof x === "string" && (x as string).trim(),
          ) as string | undefined;
        if (errText) {
          if (!import.meta.env.PROD) {
            console.error("[canonAppendWs/engine] realtime STT error:", errText);
          }
          // Context overflow kills the whole chunk-v2 session (no tokens arrive).
          if (/context is too long/i.test(errText)) {
            console.error(
              "[canonAppendWs/engine] Soniox rejected oversized context — STT/translation will stay silent until context is trimmed under 10k chars.",
            );
          }
          return;
        }
        const seq = this.allocateSeq();
        const frame = parseSonioxWebSocketPayload(payload, seq);
        if (frame && (frame.tokens.length > 0 || frame.endpoint)) {
          this.frameCb?.(frame);
        }
      }
    };
  }

  disconnect(fireClosed = true): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.pcmQueue = [];
    if (fireClosed) this.closed = true;
  }

  private flushPcmQueue(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (this.pcmQueue.length) {
      const b = this.pcmQueue.shift()!;
      ws.send(b);
    }
  }

  /** Send PCM frame (ArrayBuffer mono s16le @ client sample_rate). */
  sendPcm(chunk: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.flushPcmQueue();
      this.ws.send(chunk);
    } else if (!this.closed) {
      this.pcmQueue.push(chunk.slice(0));
      if (this.pcmQueue.length > 200) {
        this.pcmQueue.splice(0, this.pcmQueue.length - 200);
      }
    }
  }

  flushEnd(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(new ArrayBuffer(0));
      } catch {
        /* ignore */
      }
    }
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onFrame(cb: (frame: SonioxFrame) => void): void {
    this.frameCb = cb;
  }
}
