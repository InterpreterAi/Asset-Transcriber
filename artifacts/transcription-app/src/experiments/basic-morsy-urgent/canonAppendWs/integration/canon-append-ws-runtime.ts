/**
 * SONIOX-only isolated runtime for Basic · morsy-urgent canonAppendWs experiment.
 */

import type { LangPair } from "@/lib/interpreter-stt-context";
import { buildSonioxInterpreterContext } from "@/lib/interpreter-stt-context";
import { buildSonioxLanguageHints } from "@/lib/soniox-stt-language-hints";

import { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import { ProjectionStore } from "../projection/projection-store";
import { projectTranscriptView } from "../projection/transcript-view";
import { reduceCanonAppendWs } from "../reducer/reducer";
import { CanonAppendWsDomWriter } from "../renderer/dom-writer";
import { RenderScheduler } from "../renderer/render-scheduler";
import { ScrollManager } from "../renderer/scroll-manager";
import { emitDebugEvent } from "../telemetry/debug-events";
import { createInitialEngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";
import { SonioxRealtimeClient } from "../ws/soniox-client";

export type CanonAppendWsRuntimeHooks = {
  /** Optional React/setState throttle hook after each flushed projection. */
  onVisualTick?: () => void;
  /** PCM chunk sent toward Soniox (before WS queue) — inactivity watchdog. */
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

  private readonly liveSegmentDatasetId = "canon-append-ws-live";

  private containerEl: HTMLElement | null = null;

  private hooks: CanonAppendWsRuntimeHooks;

  constructor(hooks: CanonAppendWsRuntimeHooks = {}) {
    this.hooks = hooks;
  }

  setHooks(next: CanonAppendWsRuntimeHooks): void {
    this.hooks = { ...this.hooks, ...next };
  }

  attachDomRoot(container: HTMLElement): void {
    this.containerEl = container;
    this.writer.detachAll(container);
    const seg = this.liveSegmentDatasetId;
    this.writer.mountSegmentRow(container, seg);
    this.scroll.attachScrollParent(container);
    this.state = createInitialEngineState();
    this.state.activeSegmentId = seg;
    this.projections.sync(this.state);
    this.hooks.onVisualTick?.();
  }

  ingestFrame(frame: SonioxFrame, wallMs: number): void {
    const prevSpk = this.state.activeSpeakerId;
    this.state = reduceCanonAppendWs(this.state, frame, { ledger: this.ledger, wallMs });
    if (frame.endpoint) {
      emitDebugEvent({
        kind: "endpoint_flush",
        segmentId: String(this.state.activeSegmentId ?? ""),
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
    emitDebugEvent({ kind: "frame", seq: frame.seq, endpoint: Boolean(frame.endpoint) });
    const active = this.writer.getActive();
    if (!active) return;
    const snap = this.projections.getProjection();
    this.scheduler.schedule(() => {
      this.writer.projectLiveSegment(active, snap.committedVisibleText, snap.hypothesisText);
      this.scroll.maybeFollowTail({ stickToTail: true });
      this.hooks.onVisualTick?.();
    });
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
    this.client.sendPcm(chunk);
  }

  stopSoniox(): void {
    this.client.flushEnd();
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
    const combined = projectTranscriptView(this.projections.getState()).liveCombined.trim();
    const lines = combined.length ? [combined] : [];
    const blanks = lines.map(() => "");
    return {
      transcript: combined,
      translation: "",
      transcriptLines: lines,
      translationLines: blanks,
    };
  }

  getLiveCombined(): string {
    return this.projections.getProjection().liveCombined;
  }

  peekHasRenderableText(): boolean {
    const st = this.projections.getState();
    return (
      st.committedInternal.length > 0 ||
      st.pendingStableTokens.length > 0 ||
      this.getLiveCombined().trim().length > 0
    );
  }
}
