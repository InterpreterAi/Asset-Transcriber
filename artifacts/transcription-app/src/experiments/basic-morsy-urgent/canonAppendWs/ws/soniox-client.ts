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
  /**
   * Chunk-v2 restored path only. Non-chunk keeps endpoint detection off
   * (daffcfbf default) for diarization accuracy.
   */
  enableEndpointDetection?: boolean;
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

export type SonioxFlushResult = "completed" | "timeout" | "closed" | "error";

export class SonioxRealtimeClient {
  private ws: WebSocket | null = null;

  private frameCb: ((frame: SonioxFrame) => void) | null = null;

  private closed = false;

  private pcmQueue: ArrayBuffer[] = [];

  private seq = 0;

  /** Connection generation — token ids / speaker maps stay scoped to this socket. */
  private connectionGen = 0;

  private allocateSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  get connectionId(): number {
    return this.connectionGen;
  }

  connect(config: SonioxClientConfig): void {
    this.disconnect(false);
    this.closed = false;
    this.connectionGen += 1;
    this.seq = 0;
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
        ...(language_hints ? { language_hints } : {}),
        enable_speaker_diarization:     true,
        // Endpoint ON + 1000ms only when explicitly requested (chunk-v2 restore).
        // Non-chunk: leave endpoint off — matches daffcfbf / Soniox diarization guidance.
        enable_endpoint_detection:      config.enableEndpointDetection === true,
        enable_language_identification: config.enableLanguageIdentification ?? true,
        ...(config.translationConfig
          ? { translation: config.translationConfig }
          : {}),
        ...(config.interpreterContext
          ? { context: config.interpreterContext }
          : {}),
        ...(config.enableEndpointDetection === true
          ? { max_endpoint_delay_ms: config.maxEndpointDelayMs ?? 1000 }
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
          return;
        }
        const seq = this.allocateSeq();
        const frame = parseSonioxWebSocketPayload(payload, seq);
        if (frame && (frame.tokens.length > 0 || frame.endpoint)) {
          this.frameCb?.(frame);
        }
        // Notify flush waiters when Soniox signals finished.
        if ((payload as { finished?: unknown }).finished === true) {
          this.resolveFlushWaiters("completed");
        }
      }
    };
  }

  private flushWaiters: Array<(r: SonioxFlushResult) => void> = [];

  private resolveFlushWaiters(result: SonioxFlushResult): void {
    const waiters = this.flushWaiters.splice(0);
    for (const w of waiters) w(result);
  }

  disconnect(fireClosed = true): void {
    this.resolveFlushWaiters("closed");
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

  /**
   * Flush remaining buffered audio and request Soniox completion (empty buffer).
   * Does not wait — prefer {@link flushEndAndWait} on stop.
   */
  flushEnd(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.flushPcmQueue();
        this.ws.send(new ArrayBuffer(0));
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Flush buffered PCM, send end-of-audio, keep the socket open long enough to
   * process remaining Soniox results, then resolve. Timeout / error handled explicitly.
   */
  flushEndAndWait(timeoutMs = 2500): Promise<SonioxFlushResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve(this.closed ? "closed" : "error");
    }
    try {
      this.flushPcmQueue();
      this.ws.send(new ArrayBuffer(0));
    } catch {
      return Promise.resolve("error");
    }
    return new Promise<SonioxFlushResult>((resolve) => {
      let settled = false;
      const finish = (r: SonioxFlushResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(r);
      };
      this.flushWaiters.push(finish);
      const timer = window.setTimeout(() => {
        // Timeout is not silent discard — caller still freezes remaining confirmed rows.
        finish("timeout");
      }, timeoutMs);
    });
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onFrame(cb: (frame: SonioxFrame) => void): void {
    this.frameCb = cb;
  }
}
