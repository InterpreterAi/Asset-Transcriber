/**
 * Basic · Morsy Urgent — Soniox-docs-faithful isolated runtime.
 * Append-only finals + replace-only non-finals + speaker/endpoint rows.
 */

import type { LangPair } from "@/lib/interpreter-stt-context";
import { buildSonioxInterpreterContext } from "@/lib/interpreter-stt-context";
import { buildSonioxLanguageHints } from "@/lib/soniox-stt-language-hints";

import { LIVE_RENDER_BATCH_MS } from "../policies/segmentation-constants";
import { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import { ProjectionStore } from "../projection/projection-store";
import { projectTranscriptView } from "../projection/transcript-view";
import { applyManualStructuralFreeze } from "../reducer/row-lifecycle";
import { maybeCloseRowAfterEndpointQuiet, reduceCanonAppendWs } from "../reducer/reducer";
import {
  CanonAppendWsDomWriter,
  type CanonAppendWsLayoutMode,
} from "../renderer/dom-writer";
import { RenderScheduler } from "../renderer/render-scheduler";
import { ScrollManager } from "../renderer/scroll-manager";
import { emitDebugEvent } from "../telemetry/debug-events";
import type { CanonUtterance } from "../types/canon-utterance";
import { utteranceCommittedText } from "../types/canon-utterance";
import { createInitialEngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";
import { SonioxRealtimeClient } from "../ws/soniox-client";

export type CanonFrozenRowPayload = {
  utterance: CanonUtterance;
  lineIndex: number;
  committedText: string;
};

export type CanonActiveRowPayload = {
  utterance: CanonUtterance;
  /** Append-only committed Soniox finals for this row — Intercall stabilization gate (no NF hypothesis). */
  sourceText: string;
};

export type CanonAppendWsRuntimeHooks = {
  onVisualTick?: () => void;
  onPcmFrame?: () => void;
  /** Active row committed growth — drives Intercall-style live translation previews. */
  onActiveRowCommittedGrow?: (payload: CanonActiveRowPayload) => void;
  /** Soniox endpoint on active row — flush translation immediately (no debounce). */
  onActiveRowTranslationFlush?: (payload: CanonActiveRowPayload) => void;
  /** Fired once per immutable row after endpoint/speaker freeze (translation lock hook). */
  onRowFrozen?: (payload: CanonFrozenRowPayload) => void;
  /** Post-layout paint — tail-follow scroll (workspace scrollPanel). */
  onAfterDomPaint?: () => void;
  /** Pre-layout latch — read scroll glue before transcript/translation DOM grows. */
  onBeforeDomPaint?: () => void;
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

  private lastFrozenCount = 0;

  private lastActiveRowId: string | null = null;

  private lastActiveCommittedEmitted = "";

  constructor(hooks: CanonAppendWsRuntimeHooks = {}) {
    this.hooks = hooks;
  }

  setHooks(next: CanonAppendWsRuntimeHooks): void {
    this.hooks = { ...this.hooks, ...next };
  }

  setLayoutMode(mode: CanonAppendWsLayoutMode): void {
    const prev = this.writer.getLayoutMode();
    this.writer.setLayoutMode(mode);
    if (prev !== mode && this.containerEl) {
      const snap = this.projections.getProjection();
      this.hooks.onBeforeDomPaint?.();
      this.writer.relayoutAll(this.containerEl, snap.rows);
      this.notifyAfterPaint();
    }
  }

  getLayoutMode(): CanonAppendWsLayoutMode {
    return this.writer.getLayoutMode();
  }

  setRowTranslation(rowId: string, text: string): void {
    this.hooks.onBeforeDomPaint?.();
    this.writer.setRowTranslation(rowId, text);
    if (this.containerEl) {
      this.notifyAfterPaint();
    }
  }

  getRowTranslation(rowId: string): string {
    return this.writer.getRowTranslation(rowId);
  }

  /** Latest append-only committed text for a row (active or frozen). */
  getRowCommittedText(rowId: string): string {
    const active = this.state.activeUtterance;
    if (active?.utterance_id === rowId) {
      return utteranceCommittedText(active).trim();
    }
    const frozen = this.state.finalizedUtterances.find((u) => u.utterance_id === rowId);
    return frozen ? utteranceCommittedText(frozen).trim() : "";
  }

  attachDomRoot(container: HTMLElement): void {
    this.clearDomBatch();
    this.containerEl = container;
    this.scroll.attachScrollParent(container);
    this.writer.detachAll(container);
    this.state = createInitialEngineState();
    this.lastFrozenCount = 0;
    this.lastActiveRowId = null;
    this.lastActiveCommittedEmitted = "";
    this.projections.sync(this.state);
    this.notifyAfterPaint();
  }

  private notifyAfterPaint(): void {
    this.hooks.onAfterDomPaint?.();
    this.hooks.onVisualTick?.();
  }

  private clearDomBatch(): void {
    if (this.domBatchTimer !== null) {
      clearTimeout(this.domBatchTimer);
      this.domBatchTimer = null;
    }
  }

  /** Intercall gate: translate only when append-only committed finals grow — not NF hypothesis. */
  private emitActiveRowTranslationTick(): void {
    const au = this.state.activeUtterance;
    if (!au) {
      this.lastActiveRowId = null;
      this.lastActiveCommittedEmitted = "";
      return;
    }
    if (au.utterance_id !== this.lastActiveRowId) {
      this.lastActiveRowId = au.utterance_id;
      this.lastActiveCommittedEmitted = "";
    }
    const committed = utteranceCommittedText(au).trim();
    if (committed.length < 3 || committed === this.lastActiveCommittedEmitted) return;
    this.lastActiveCommittedEmitted = committed;
    this.hooks.onActiveRowCommittedGrow?.({ utterance: au, sourceText: committed });
  }

  private emitNewlyFrozenRows(): void {
    const frozen = this.state.finalizedUtterances;
    if (frozen.length <= this.lastFrozenCount) return;
    for (let i = this.lastFrozenCount; i < frozen.length; i++) {
      const utterance = frozen[i]!;
      const committedText = utteranceCommittedText(utterance).trim();
      if (!committedText.length) continue;
      this.hooks.onRowFrozen?.({ utterance, lineIndex: i, committedText });
    }
    this.lastFrozenCount = frozen.length;
  }

  private flushDomImmediate(): void {
    if (!this.containerEl) return;
    const snap = this.projections.getProjection();
    this.scheduler.schedule(() => {
      this.hooks.onBeforeDomPaint?.();
      this.writer.syncRows(this.containerEl!, snap.rows);
      this.notifyAfterPaint();
    });
  }

  private scheduleDomBatch(immediate = false): void {
    if (immediate) {
      this.clearDomBatch();
      this.emitActiveRowTranslationTick();
      this.emitNewlyFrozenRows();
      this.flushDomImmediate();
      return;
    }
    if (!this.containerEl) return;
    if (this.domBatchTimer !== null) clearTimeout(this.domBatchTimer);
    this.domBatchTimer = setTimeout(() => {
      this.domBatchTimer = null;
      this.emitActiveRowTranslationTick();
      this.emitNewlyFrozenRows();
      this.flushDomImmediate();
    }, LIVE_RENDER_BATCH_MS);
  }

  ingestFrame(frame: SonioxFrame, wallMs: number): void {
    this.state = reduceCanonAppendWs(this.state, frame, { ledger: this.ledger, wallMs });

    this.projections.sync(this.state);
    emitDebugEvent({
      kind: "frame",
      seq: frame.seq,
      endpoint: Boolean(frame.endpoint),
      endpointPending: this.state.endpointPending,
      final_audio_proc_ms: frame.final_audio_proc_ms,
      total_audio_proc_ms: frame.total_audio_proc_ms,
    });

    if (frame.endpoint) {
      emitDebugEvent({ kind: "endpoint_flush", segmentId: "soniox-endpoint", seq: frame.seq });
      const au = this.state.activeUtterance;
      if (au) {
        const committed = utteranceCommittedText(au).trim();
        if (committed.length >= 3) {
          this.hooks.onActiveRowTranslationFlush?.({ utterance: au, sourceText: committed });
        }
      }
    }

    this.scheduleDomBatch(Boolean(frame.endpoint));
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
    const frozenBefore = this.state.finalizedUtterances.length;
    this.state = maybeCloseRowAfterEndpointQuiet(this.state, wall);
    if (this.state.finalizedUtterances.length !== frozenBefore) {
      this.projections.sync(this.state);
      this.scheduleDomBatch(true);
    }
    this.client.sendPcm(chunk);
  }

  stopSoniox(): void {
    this.clearDomBatch();
    const auBeforeStop = this.state.activeUtterance;
    if (auBeforeStop) {
      const committed = utteranceCommittedText(auBeforeStop).trim();
      if (committed.length >= 3) {
        this.hooks.onActiveRowTranslationFlush?.({ utterance: auBeforeStop, sourceText: committed });
      }
    }
    this.client.flushEnd();
    this.state = applyManualStructuralFreeze(this.state);
    this.projections.sync(this.state);
    this.emitActiveRowTranslationTick();
    this.emitNewlyFrozenRows();
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
    const transcriptLines = proj.rows
      .map(r => (r.committedText + r.liveText).trim())
      .filter(Boolean);
    const rowIds = proj.rows.filter(r => (r.committedText + r.liveText).trim().length > 0).map(r => r.row_id);
    const translationLines = this.writer.getTranslationLines(rowIds);
    while (translationLines.length < transcriptLines.length) translationLines.push("");
    return {
      transcript: transcriptLines.join("\n"),
      translation: translationLines.join("\n"),
      transcriptLines,
      translationLines,
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
