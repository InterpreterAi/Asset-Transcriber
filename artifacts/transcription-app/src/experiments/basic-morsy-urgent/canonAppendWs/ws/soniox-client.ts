/**
 * Thin Soniox realtime websocket — receives audio config + binary PCM from host.
 *
 * Segmentation by `speaker` + `language` mirrors Node SDK `group_by` / RealtimeSegment
 * layout; the REST websocket schema does not expose that field — reducer rows group from token metadata.
 */

import type { SonioxFrame } from "./frame-types";
import { parseSonioxWebSocketPayload } from "./soniox-parser";

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

export type SonioxClientConfig = {
  apiKey: string;
  model?: string;
  sampleRate?: number;
  languageHints?: string[];
  forceChunkV2LanguageHints?: boolean;
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
    const ws = new WebSocket(SONIOX_WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      const language_hints = config.forceChunkV2LanguageHints
        ? ["en", "es"]
        : (config.languageHints && config.languageHints.length > 0
            ? config.languageHints
            : undefined);
      ws.send(JSON.stringify({
        api_key:                        config.apiKey,
        model:                          config.model ?? "stt-rt-v5",
        audio_format:                   "pcm_s16le",
        sample_rate:                    config.sampleRate ?? 16_000,
        num_channels:                   1,
        ...(language_hints ? { language_hints } : {}),
        enable_speaker_diarization:     true,
        enable_endpoint_detection:      true,
        enable_language_identification: true,
        ...(config.translationConfig
          ? { translation: config.translationConfig }
          : {}),
        ...(config.interpreterContext
          ? { context: config.interpreterContext }
          : {}),
        max_endpoint_delay_ms:          config.maxEndpointDelayMs ?? 1000,
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
          console.error("[canonAppendWs/engine] Soniox error:", errText);
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
