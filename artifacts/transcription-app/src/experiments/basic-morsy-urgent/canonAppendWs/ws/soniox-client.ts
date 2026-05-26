/**
 * Thin Soniox realtime websocket — receives audio config + binary PCM from host.
 */

import type { SonioxFrame } from "./frame-types";
import { parseSonioxWebSocketPayload } from "./soniox-parser";

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

export type SonioxClientConfig = {
  apiKey: string;
  model?: string;
  sampleRate?: number;
  languageHints?: string[];
  interpreterContext?: {
    general: { key: string; value: string }[];
    text: string;
    terms: string[];
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
      ws.send(JSON.stringify({
        api_key:                        config.apiKey,
        model:                          config.model ?? "stt-rt-v4",
        audio_format:                   "pcm_s16le",
        sample_rate:                    config.sampleRate ?? 16_000,
        num_channels:                   1,
        language_hints:                 config.languageHints ?? ["en"],
        ...(config.interpreterContext
          ? {
              context: config.interpreterContext,
            }
          : {}),
        enable_language_identification: true,
        enable_speaker_diarization:     true,
        enable_endpoint_detection:      true,
        max_endpoint_delay_ms:          800,
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
