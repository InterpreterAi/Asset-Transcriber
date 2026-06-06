import { TranslationBuffer } from "./translation-buffer";
import {
  logChunkV3ChunkExtract,
  logChunkV3DisplayPaint,
  logChunkV3TranslateResult,
  logChunkV3VisibleChange,
  nextChunkV3EventId,
  type ChunkV3VisibleSnap,
} from "./chunk-translation-v3-diag";

export const CHUNK_V3_POLL_MS = 100;
export const CHUNK_V3_MAX_WAIT_MS = 800;

export type MorsyChunkV3RowState = {
  buffer: TranslationBuffer;
  fedVisiblePrefix: string;
  displayedTranslation: string;
  lastBoundaryCheck: number;
  lastLoggedVisible: string;
};

export type MorsyChunkV3EngineDeps = {
  getVisibleSnapFromSTT: () => ChunkV3VisibleSnap | null;
  getActiveRowId: () => string | null;
  translateSentence: (
    text: string,
    sourceLang: string,
    targetLang: string,
  ) => Promise<string>;
  displayTranslation: (rowId: string, translation: string, eventId: string) => void;
  resolveLangs: (text: string) => { sourceLang: string; targetLang: string };
};

function appendTranslation(left: string, chunk: string): string {
  const trimmed = chunk.trim();
  if (!trimmed) return left;
  if (!left.trim()) return trimmed;
  return `${left.trimEnd()} ${trimmed}`;
}

export class MorsyChunkV3Engine {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly rows = new Map<string, MorsyChunkV3RowState>();

  constructor(private readonly deps: MorsyChunkV3EngineDeps) {}

  private rowState(rowId: string): MorsyChunkV3RowState {
    let st = this.rows.get(rowId);
    if (!st) {
      st = {
        buffer: new TranslationBuffer(),
        fedVisiblePrefix: "",
        displayedTranslation: "",
        lastBoundaryCheck: Date.now(),
        lastLoggedVisible: "",
      };
      this.rows.set(rowId, st);
    }
    return st;
  }

  startTranslation(): void {
    if (this.pollingInterval !== null) return;
    this.pollingInterval = setInterval(() => {
      void this.pollTick();
    }, CHUNK_V3_POLL_MS);
  }

  stopTranslation(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    void this.forceFlushAll("stop");
  }

  clear(): void {
    this.stopTranslation();
    this.rows.clear();
  }

  async forceFlushRow(rowId: string): Promise<void> {
    const st = this.rows.get(rowId);
    if (!st) return;
    const remaining = st.buffer.forceFlush();
    if (remaining.trim()) {
      await this.translateAndDisplay(rowId, remaining, st, "force_flush_row");
    }
  }

  private async forceFlushAll(reason: "stop" | "force_flush_800ms"): Promise<void> {
    for (const rowId of this.rows.keys()) {
      const st = this.rows.get(rowId);
      if (!st) continue;
      const remaining = st.buffer.forceFlush();
      if (remaining.trim()) {
        await this.translateAndDisplay(rowId, remaining, st, reason);
      }
    }
  }

  private async pollTick(): Promise<void> {
    const rowId = this.deps.getActiveRowId();
    if (!rowId) return;

    const snap = this.deps.getVisibleSnapFromSTT();
    if (snap == null) return;

    const st = this.rowState(rowId);
    const visible = snap.visibleText;

    if (visible !== st.lastLoggedVisible) {
      logChunkV3VisibleChange({
        rowId,
        snap,
        fedVisiblePrefix: st.fedVisiblePrefix,
        reason: "poll_delta",
      });
      st.lastLoggedVisible = visible;
    }

    let newText = "";
    if (!st.fedVisiblePrefix.length) {
      newText = visible;
    } else if (visible.startsWith(st.fedVisiblePrefix)) {
      newText = visible.slice(st.fedVisiblePrefix.length);
    } else {
      newText = visible;
      logChunkV3VisibleChange({
        rowId,
        snap,
        fedVisiblePrefix: st.fedVisiblePrefix,
        reason: "prefix_reset",
      });
      st.fedVisiblePrefix = "";
    }
    const fedBefore = st.fedVisiblePrefix;
    st.fedVisiblePrefix = visible;

    const sentence = st.buffer.addText(newText);
    if (sentence) {
      logChunkV3VisibleChange({
        rowId,
        snap,
        fedVisiblePrefix: fedBefore,
        reason: "chunk_extract",
      });
      await this.translateAndDisplay(rowId, sentence, st, "sentence_boundary", snap, fedBefore);
    }

    if (Date.now() - st.lastBoundaryCheck > CHUNK_V3_MAX_WAIT_MS) {
      const remaining = st.buffer.forceFlush();
      if (remaining.trim()) {
        await this.translateAndDisplay(rowId, remaining, st, "force_flush_800ms", snap, fedBefore);
      }
      st.lastBoundaryCheck = Date.now();
    }
  }

  private async translateAndDisplay(
    rowId: string,
    text: string,
    st: MorsyChunkV3RowState,
    extractReason: "sentence_boundary" | "force_flush_800ms" | "force_flush_row" | "stop",
    snap?: ChunkV3VisibleSnap,
    fedVisiblePrefixBefore?: string,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    const eventId = nextChunkV3EventId();
    const visibleSnap = snap ?? this.deps.getVisibleSnapFromSTT() ?? {
      visibleText: "",
      stableText: "",
      volatileTail: "",
    };

    logChunkV3ChunkExtract({
      rowId,
      eventId,
      snap: visibleSnap,
      extractReason,
      rawChunk: trimmed,
      fedVisiblePrefixBefore: fedVisiblePrefixBefore ?? st.fedVisiblePrefix,
    });

    const { sourceLang, targetLang } = this.deps.resolveLangs(trimmed);
    const displayedBefore = st.displayedTranslation;
    const t0 = Date.now();
    const translation = await this.deps.translateSentence(trimmed, sourceLang, targetLang);
    const requestLatencyMs = Date.now() - t0;

    if (!translation.trim()) return;

    st.displayedTranslation = appendTranslation(st.displayedTranslation, translation);

    logChunkV3TranslateResult({
      rowId,
      eventId,
      rawChunk: trimmed,
      sourceLang,
      targetLang,
      translationReturned: translation,
      displayedBefore,
      displayedAfter: st.displayedTranslation,
      requestLatencyMs,
    });

    this.deps.displayTranslation(rowId, st.displayedTranslation, eventId);
  }
}
