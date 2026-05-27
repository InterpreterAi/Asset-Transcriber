/**
 * SONIOX-only isolated runtime for Basic · morsy-urgent canonAppendWs experiment.
 * Utterance-stabilized projection over realtime Soniox tokens.
 */

import type { LangPair } from "@/lib/interpreter-stt-context";
import { buildSonioxInterpreterContext } from "@/lib/interpreter-stt-context";
import { buildSonioxLanguageHints } from "@/lib/soniox-stt-language-hints";

import { CANON_SILENCE_SEGMENT_MS } from "../gate";
import { LIVE_RENDER_BATCH_MS } from "../policies/segmentation-constants";
import {
  silenceCloseSecondaryGate,
  silenceConfidenceAndLagOk,
} from "../policies/silence-secondary-gates";
import { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import { ProjectionStore } from "../projection/projection-store";
import { projectTranscriptView } from "../projection/transcript-view";
import { mergedCommittedAndLiveText } from "../projection/utterance-rollup";
import { applyManualFinalizeTail, applySilenceUtteranceClose } from "../reducer/row-lifecycle";
import { reduceCanonAppendWs } from "../reducer/reducer";
import { CanonAppendWsDomWriter } from "../renderer/dom-writer";
import { RenderScheduler } from "../renderer/render-scheduler";
import { ScrollManager } from "../renderer/scroll-manager";
import { emitDebugEvent } from "../telemetry/debug-events";
import { createInitialEngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";
import { SonioxRealtimeClient } from "../ws/soniox-client";

export type CanonAppendWsRuntimeHooks = {
  onVisualTick?: () => void;
  onPcmFrame?: () => void;
};

export class CanonAppendWsIsolatedRuntime {
  private readonly ledger = new AppendOnlyCanonLedger();

  private state = createInitialEngineState();

  private readonly projections = new ProjectionStore(this.state);

  private readonly writer = new CanonAppendWsDomWriter();

  private readonly scheduler = new RenderScheduler();

  private readonly scroll = new ScrollManager();

  private readonly client = new SonioxRealtimeClient();

  private containerEl: HTMLElement | null = null;

  private hooks: CanonAppendWsRuntimeHooks;

  private domBatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(hooks: CanonAppendWsRuntimeHooks = {}) {
    this.hooks = hooks;
  }

  setHooks(next: CanonAppendWsRuntimeHooks): void {
    this.hooks = { ...this.hooks, ...next };
  }

  attachDomRoot(container: HTMLElement): void {
    this.clearDomBatch();
    this.containerEl = container;
    this.writer.detachAll(container);
    this.state = createInitialEngineState();
    this.projections.sync(this.state);
    this.hooks.onVisualTick?.();
  }

  private clearDomBatch(): void {
    if (this.domBatchTimer !== null) {
      clearTimeout(this.domBatchTimer);
      this.domBatchTimer = null;
    }
  }

  private flushDomImmediate(): void {
    if (!this.containerEl) return;
    const snap = this.projections.getProjection();
    this.scheduler.schedule(() => {
      this.writer.syncRows(this.containerEl!, snap.rows);
      this.scroll.maybeFollowTail({ stickToTail: true });
      this.hooks.onVisualTick?.();
    });
  }

  private scheduleDomBatch(immediate = false): void {
    if (immediate) {
      this.clearDomBatch();
      this.flushDomImmediate();
      return;
    }
    if (!this.containerEl) return;
    if (this.domBatchTimer !== null) clearTimeout(this.domBatchTimer);
    this.domBatchTimer = setTimeout(() => {
      this.domBatchTimer = null;
      this.flushDomImmediate();
    }, LIVE_RENDER_BATCH_MS);
  }

  /** Silence-only fallback conversational freeze — endpoint primary path skips this. */
  private maybeSilenceClose(wallMs: number): void {
    const last = this.state.lastTokenActivityWallMs;
    if (last <= 0 || wallMs - last < CANON_SILENCE_SEGMENT_MS) return;

    const active = this.state.activeUtterance;
    if (!active?.segments.length || active.is_final) return;

    const text = mergedCommittedAndLiveText(active);
    const hasPayload = Boolean(text.trim().length);
    if (!hasPayload) return;

    if (!silenceCloseSecondaryGate(this.state, active, wallMs)) return;
    if (!silenceConfidenceAndLagOk(this.state, active)) return;

    this.state = applySilenceUtteranceClose(this.state, wallMs);
    this.state = { ...this.state, lastTokenActivityWallMs: wallMs };
    this.projections.sync(this.state);
    emitDebugEvent({ kind: "endpoint_flush", segmentId: "silence_fallback", synthetic: true });
    this.scheduleDomBatch(true);
  }

  ingestFrame(frame: SonioxFrame, wallMs: number): void {
    const prevSpk = this.state.activeSpeakerId;
    const endpointFrame = Boolean(frame.endpoint);

    this.state = reduceCanonAppendWs(this.state, frame, { ledger: this.ledger, wallMs });

    if (endpointFrame) {
      emitDebugEvent({
        kind: "endpoint_flush",
        segmentId: "soniox-endpoint",
        seq: frame.seq,
        final_audio_proc_ms: frame.final_audio_proc_ms,
        total_audio_proc_ms: frame.total_audio_proc_ms,
      });
    }

    if (
      this.state.activeSpeakerId !== prevSpk &&
      this.state.activeSpeakerId !== null &&
      prevSpk !== null
    ) {
      emitDebugEvent({
        kind: "speaker_pivot_confirmed",
        prev: prevSpk,
        next: this.state.activeSpeakerId,
        seq: frame.seq,
      });
    }

    this.projections.sync(this.state);
    emitDebugEvent({
      kind: "frame",
      seq: frame.seq,
      endpoint: endpointFrame,
      final_audio_proc_ms: frame.final_audio_proc_ms,
      total_audio_proc_ms: frame.total_audio_proc_ms,
    });

    if (!endpointFrame) {
      this.maybeSilenceClose(wallMs);
    }

    this.scheduleDomBatch(endpointFrame);
  }

  startSoniox(apiKey: string, langPair: LangPair, sampleRate = 16_000): void {
    const pair = langPair as { a: string; b: string };
    const hints = buildSonioxLanguageHints(pair);
    const interpreterContext = buildSonioxInterpreterContext(pair);
    this.client.disconnect(false);
    this.client.onFrame(frame => this.ingestFrame(frame, Date.now()));
    this.client.connect({ apiKey, sampleRate, languageHints: hints, interpreterContext });
  }

  sendPcm(chunk: ArrayBuffer): void {
    this.hooks.onPcmFrame?.();
    const wall = Date.now();
    this.maybeSilenceClose(wall);
    this.client.sendPcm(chunk);
  }

  stopSoniox(): void {
    this.clearDomBatch();
    this.client.flushEnd();
    const wall = Date.now();
    this.state = applyManualFinalizeTail(this.state, wall);
    this.projections.sync(this.state);
    this.flushDomImmediate();
    this.client.disconnect(true);
    this.scheduler.cancel();
  }

  resetDom(): void {
    if (this.containerEl) this.attachDomRoot(this.containerEl);
  }

  getWorkspaceSnapshotBuffers(): {
    transcript: string;
    translation: string;
    transcriptLines: string[];
    translationLines: string[];
  } {
    const proj = projectTranscriptView(this.projections.getState());
    const combined = proj.liveCombined.trim();
    const lines = combined.length ? combined.split(/\n+/u).map(s => s.trim()).filter(Boolean) : [];
    const blanks = lines.map(() => "");
    return {
      transcript: combined,
      translation: "",
      transcriptLines: lines.length ? lines : combined.length ? [combined] : [],
      translationLines: blanks,
    };
  }

  getLiveCombined(): string {
    return this.projections.getProjection().liveCombined;
  }

  peekHasRenderableText(): boolean {
    const proj = projectTranscriptView(this.projections.getState());
    return proj.rows.some(r => r.committedText.length > 0 || r.liveText.length > 0);
  }
}
