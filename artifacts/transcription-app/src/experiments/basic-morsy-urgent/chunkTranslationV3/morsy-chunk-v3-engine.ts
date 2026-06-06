import { TranslationBuffer } from "./translation-buffer";

export const CHUNK_V3_POLL_MS = 100;
export const CHUNK_V3_MAX_WAIT_MS = 800;

export type MorsyChunkV3RowState = {
  buffer: TranslationBuffer;
  fedVisiblePrefix: string;
  displayedTranslation: string;
  lastBoundaryCheck: number;
};

export type MorsyChunkV3EngineDeps = {
  getVisibleTextFromSTT: () => string | null;
  getActiveRowId: () => string | null;
  translateSentence: (
    text: string,
    sourceLang: string,
    targetLang: string,
  ) => Promise<string>;
  displayTranslation: (rowId: string, translation: string) => void;
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
    void this.forceFlushAll();
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
      await this.translateAndDisplay(rowId, remaining, st);
    }
  }

  private async forceFlushAll(): Promise<void> {
    for (const rowId of this.rows.keys()) {
      await this.forceFlushRow(rowId);
    }
  }

  private async pollTick(): Promise<void> {
    const rowId = this.deps.getActiveRowId();
    if (!rowId) return;

    const visible = this.deps.getVisibleTextFromSTT();
    if (visible == null) return;

    const st = this.rowState(rowId);
    let newText = "";
    if (!st.fedVisiblePrefix.length) {
      newText = visible;
    } else if (visible.startsWith(st.fedVisiblePrefix)) {
      newText = visible.slice(st.fedVisiblePrefix.length);
    } else {
      newText = visible;
      st.fedVisiblePrefix = "";
    }
    st.fedVisiblePrefix = visible;

    const sentence = st.buffer.addText(newText);
    if (sentence) {
      await this.translateAndDisplay(rowId, sentence, st);
    }

    if (Date.now() - st.lastBoundaryCheck > CHUNK_V3_MAX_WAIT_MS) {
      const remaining = st.buffer.forceFlush();
      if (remaining.trim()) {
        await this.translateAndDisplay(rowId, remaining, st);
      }
      st.lastBoundaryCheck = Date.now();
    }
  }

  private async translateAndDisplay(
    rowId: string,
    text: string,
    st: MorsyChunkV3RowState,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { sourceLang, targetLang } = this.deps.resolveLangs(trimmed);
    const translation = await this.deps.translateSentence(trimmed, sourceLang, targetLang);
    if (!translation.trim()) return;
    st.displayedTranslation = appendTranslation(st.displayedTranslation, translation);
    this.deps.displayTranslation(rowId, st.displayedTranslation);
  }
}
