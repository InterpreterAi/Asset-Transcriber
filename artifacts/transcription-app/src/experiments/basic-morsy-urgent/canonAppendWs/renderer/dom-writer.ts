import type { RowProjection } from "../projection/transcript-view";
import { logChunkV2DomPaint } from "@/hooks/morsy-chunk-v2-instrumentation";
import {
  createWorkspaceCopyButton,
  markWorkspaceSelectableText,
  runWorkspaceDomMutation,
  WORKSPACE_SELECTABLE_TEXT_CLASS,
} from "@/lib/workspace-text-selection";
import type { CommittedDomMirror } from "./committed-renderer";
import {
  createCommittedMirror,
  renderCommittedAppendOnly,
} from "./committed-renderer";
import { isolateLtrInRtl, renderHypothesisLcp } from "./hypothesis-renderer";
import {
  applyMorsyChunkV2BidiIsolates,
  shouldMorsyChunkV2BidiPaint,
} from "@/hooks/morsy-chunk-v2-bidi-render";
export type CanonAppendWsLayoutMode = "side-by-side" | "stacked";
export type EngineDomRowHandles = {
  row: HTMLElement;
  stripe: HTMLElement;
  committedMirror: CommittedDomMirror;
  translationEl: HTMLElement;
};
/** Per-row stripe palette — speaker and/or language changes get the next slot (blue → yellow → …). */
const ROW_STRIPE_COLOR_CLASSES = [
  "bg-blue-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
] as const;
// Complete language direction map for all 60 supported languages
const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "yi", "dv", "ku", "ps", "ug", "sd"]);
function getLangDirection(langCode: string): "rtl" | "ltr" {
  const base = langCode.split("-")[0]?.toLowerCase() ?? "";
  return RTL_LANGS.has(base) ? "rtl" : "ltr";
}
function applyDirectionToElement(el: HTMLElement, langCode: string): void {
  const dir = getLangDirection(langCode);
  el.setAttribute("dir", dir);
  el.style.textAlign = dir === "rtl" ? "right" : "left";
  el.style.unicodeBidi = "plaintext";
}
function prepareTextForDisplay(text: string, langCode: string): string {
  const dir = getLangDirection(langCode);
  // Script-based: Arabic translation of English speech is still RTL even if
  // the row language tag is the source (en). Isolate phones/IDs as one LTR run.
  if (dir === "rtl" || shouldMorsyChunkV2BidiPaint(text)) {
    return applyMorsyChunkV2BidiIsolates(text);
  }
  return text;
}
function rowSourceLanguage(row: HTMLElement): string {
  return row.dataset.cawLanguage ?? "";
}
function rowTranslationLanguage(row: HTMLElement): string {
  return row.dataset.cawTranslationLanguage ?? rowSourceLanguage(row);
}
function stripeColorFallback(language?: string): string {
  const b = (language ?? "").split("-")[0]!.toLowerCase();
  if (b === "en") return ROW_STRIPE_COLOR_CLASSES[0]!;
  if (b === "es") return ROW_STRIPE_COLOR_CLASSES[1]!;
  return "bg-muted-foreground/35";
}
function outerRowClass(layout: CanonAppendWsLayoutMode): string {
  if (layout === "stacked") {
    return "group relative mb-4";
  }
  return "group relative grid grid-cols-2 gap-3 sm:gap-6 items-start mb-4";
}
function origCardClass(): string {
  return "flex min-w-0 items-start overflow-visible";
}
function translationTextClass(layout: CanonAppendWsLayoutMode): string {
  if (layout === "stacked") {
    return "ts-text ts-translation leading-relaxed whitespace-pre-wrap pl-4 border-l border-border/30 ml-1 mt-1.5";
  }
  return "ts-text ts-translation leading-relaxed whitespace-pre-wrap";
}
/** Token-reconciled transcript DOM — Basic · Morsy Urgent canonAppendWs (Intercall bilingual rail). */
export class CanonAppendWsDomWriter {
  private readonly byRowId = new Map<string, EngineDomRowHandles>();
  /** First-seen recognized speakers map to stable stripe colors across the session. */
  private readonly rowStripeSlotBySpeaker = new Map<string, number>();
  /** Unknown/unrecognized speaker rows each get their own stable color slot. */
  private readonly rowStripeSlotByUnknownRowId = new Map<string, number>();
  private layoutMode: CanonAppendWsLayoutMode = "side-by-side";
  private chunkV2NativeTranslate = false;
  private stripeColorForRow(speaker?: string, rowId?: string): string {
    const sp = (speaker ?? "").trim();
    if (sp) {
      if (!this.rowStripeSlotBySpeaker.has(sp)) {
        this.rowStripeSlotBySpeaker.set(sp, this.rowStripeSlotBySpeaker.size);
      }
      const idx = this.rowStripeSlotBySpeaker.get(sp)! % ROW_STRIPE_COLOR_CLASSES.length;
      return ROW_STRIPE_COLOR_CLASSES[idx]!;
    }
    const unknownKey = (rowId ?? "").trim();
    if (!unknownKey) return stripeColorFallback(undefined);
    if (!this.rowStripeSlotByUnknownRowId.has(unknownKey)) {
      this.rowStripeSlotByUnknownRowId.set(
        unknownKey,
        this.rowStripeSlotBySpeaker.size + this.rowStripeSlotByUnknownRowId.size,
      );
    }
    const idx = this.rowStripeSlotByUnknownRowId.get(unknownKey)! % ROW_STRIPE_COLOR_CLASSES.length;
    return ROW_STRIPE_COLOR_CLASSES[idx]!;
  }
  private glossaryForce:
    | ((translation: string, original: string, rowLang: string, finalized: boolean) => string)
    | null = null;
  private readonly translationByRowId = new Map<string, string>();
  private readonly committedRtlCache = new Map<string, { raw: string; processed: string }>();
  /** Basic · Morsy Urgent live paint: frozen prefix span + editable tail span. */
  private readonly translationPrefixLiveByRowId = new Map<
    string,
    { locked: string; live: string; rtlBidiPaint?: boolean }
  >();
  setLayoutMode(mode: CanonAppendWsLayoutMode): void {
    if (this.layoutMode === mode) return;
    this.layoutMode = mode;
  }
  getLayoutMode(): CanonAppendWsLayoutMode {
    return this.layoutMode;
  }
  setChunkV2NativeTranslate(enabled: boolean): void {
    this.chunkV2NativeTranslate = enabled;
  }
  setGlossaryForce(
    fn: ((translation: string, original: string, rowLang: string, finalized: boolean) => string) | null,
  ): void {
    this.glossaryForce = fn;
  }
  private applyGlossaryForce(handles: EngineDomRowHandles, text: string): string {
    if (!this.chunkV2NativeTranslate || !this.glossaryForce || !text.trim()) return text;
    const original =
      handles.row.querySelector<HTMLElement>(`[data-caw-role="live-line"]`)?.textContent ?? "";
    const rowLang = handles.row.dataset.cawLanguage ?? "";
    const finalized = handles.row.dataset.cawFinalized === "1";
    const forced = this.glossaryForce(text, original, rowLang, finalized);
    // Persist only on finalized rows. Writing live force back into storage
    // made the next frame align against already-rewritten text (duplicates).
    if (finalized && forced !== text) {
      const rowId = handles.row.dataset.cawSegment ?? "";
      if (rowId) this.translationByRowId.set(rowId, forced);
    }
    return forced;
  }
  setRowTranslation(rowId: string, text: string): void {
    const hadPrefix = this.translationPrefixLiveByRowId.has(rowId);
    const prevRendered = this.translationByRowId.get(rowId) ?? "";
    this.translationPrefixLiveByRowId.delete(rowId);
    this.translationByRowId.set(rowId, text);
    if (hadPrefix) {
      logChunkV2DomPaint({
        rowId,
        method: "setRowTranslation",
        previousRendered: prevRendered,
        nextLocked: text,
        nextLive: "",
        nextComposed: text,
        caller: "setRowTranslation_clears_prefix_live",
      });
    }
    const handles = this.byRowId.get(rowId);
    if (handles) {
      runWorkspaceDomMutation(() => this.paintTranslation(handles!));
    }
  }
  /** Locked stable prefix (DOM frozen) + live tail (updated each interim response). */
  setRowTranslationPrefixLive(
    rowId: string,
    locked: string,
    live: string,
    opts?: { rtlBidiPaint?: boolean },
  ): void {
    const lockedTrim = locked.trim();
    const liveTrim = live.trim();
    const composed =
      lockedTrim && liveTrim ? `${lockedTrim} ${liveTrim}` : lockedTrim || liveTrim;
    const prevRendered = this.translationByRowId.get(rowId) ?? "";
    this.translationByRowId.set(rowId, composed);
    const handles = this.byRowId.get(rowId);
    const prev = this.translationPrefixLiveByRowId.get(rowId);
    this.translationPrefixLiveByRowId.set(rowId, {
      locked: lockedTrim,
      live: liveTrim,
      rtlBidiPaint: opts?.rtlBidiPaint,
    });
    logChunkV2DomPaint({
      rowId,
      method: "setRowTranslationPrefixLive",
      previousRendered: prevRendered,
      nextLocked: lockedTrim,
      nextLive: liveTrim,
      nextComposed: composed,
    });
    if (handles) {
      runWorkspaceDomMutation(() => this.paintTranslationPrefixLive(handles!, prev));
    }
  }
  getRowTranslation(rowId: string): string {
    return this.translationByRowId.get(rowId) ?? "";
  }
  getTranslationLines(rowIds: string[]): string[] {
    return rowIds.map(id => this.translationByRowId.get(id) ?? "");
  }
  private stackedTranslationTextEl(translationEl: HTMLElement): HTMLSpanElement {
    let arrow = translationEl.querySelector<HTMLSpanElement>(`[data-caw-translation-arrow]`);
    let textEl = translationEl.querySelector<HTMLSpanElement>(`[data-caw-translation-text]`);
    if (!arrow || !textEl) {
      translationEl.replaceChildren();
      arrow = translationEl.ownerDocument.createElement("span");
      arrow.dataset.cawTranslationArrow = "1";
      arrow.className = "text-muted-foreground/55 mr-1.5 select-none";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↳";
      textEl = translationEl.ownerDocument.createElement("span");
      textEl.dataset.cawTranslationText = "1";
      textEl.className = WORKSPACE_SELECTABLE_TEXT_CLASS;
      translationEl.appendChild(arrow);
      translationEl.appendChild(textEl);
    }
    return textEl;
  }
  private paintTranslation(handles: EngineDomRowHandles): void {
    const rowId = handles.row.dataset.cawSegment ?? "";
    const text = this.applyGlossaryForce(handles, this.translationByRowId.get(rowId) ?? "");
    const translationLanguage = rowTranslationLanguage(handles.row);
    const displayText =
      this.chunkV2NativeTranslate
        ? prepareTextForDisplay(text, translationLanguage)
        : text;
    const prevRendered = handles.translationEl.textContent ?? "";
    if (this.chunkV2NativeTranslate) {
      applyDirectionToElement(
        handles.translationEl,
        shouldMorsyChunkV2BidiPaint(text) ? "ar" : translationLanguage,
      );
    }
    if (this.layoutMode === "stacked") {
      const textEl = this.stackedTranslationTextEl(handles.translationEl);
      if (textEl.textContent === displayText) return;
      textEl.textContent = displayText;
      const arrow = handles.translationEl.querySelector(`[data-caw-translation-arrow]`);
      if (arrow instanceof HTMLElement) {
        arrow.style.display = displayText.length ? "" : "none";
      }
    } else if (handles.translationEl.textContent !== displayText) {
      handles.translationEl.textContent = displayText;
    }
    if (!this.translationPrefixLiveByRowId.has(rowId)) {
      logChunkV2DomPaint({
        rowId,
        method: "paintTranslation",
        previousRendered: prevRendered,
        nextLocked: text,
        nextLive: "",
        nextComposed: text,
        caller: "full_replace_paint",
      });
    }
  }
  private translationPartEls(
    translationEl: HTMLElement,
  ): { lockedEl: HTMLSpanElement; liveEl: HTMLSpanElement } {
    let lockedEl = translationEl.querySelector<HTMLSpanElement>(`[data-caw-part="locked"]`);
    let liveEl = translationEl.querySelector<HTMLSpanElement>(`[data-caw-part="live"]`);
    if (!lockedEl || !liveEl) {
      translationEl.replaceChildren();
      lockedEl = translationEl.ownerDocument.createElement("span");
      lockedEl.dataset.cawPart = "locked";
      liveEl = translationEl.ownerDocument.createElement("span");
      liveEl.dataset.cawPart = "live";
      translationEl.appendChild(lockedEl);
      translationEl.appendChild(liveEl);
    }
    return { lockedEl, liveEl };
  }
  private paintTranslationPrefixLive(
    handles: EngineDomRowHandles,
    prev: { locked: string; live: string; rtlBidiPaint?: boolean } | undefined,
  ): void {
    const rowId = handles.row.dataset.cawSegment ?? "";
    const parts = this.translationPrefixLiveByRowId.get(rowId);
    if (!parts) {
      this.paintTranslation(handles);
      return;
    }
    const lockedForced = this.applyGlossaryForce(handles, parts.locked);
    const liveForced = this.applyGlossaryForce(handles, parts.live);
    const composedTarget =
      lockedForced && liveForced
        ? `${lockedForced} ${liveForced}`
        : lockedForced || liveForced;
    const prevRendered = handles.translationEl.textContent ?? "";
    if (prevRendered.trim() === composedTarget.trim()) return;
    const { lockedEl, liveEl } = this.translationPartEls(handles.translationEl);
    const translationLanguage = rowTranslationLanguage(handles.row);
    markWorkspaceSelectableText(lockedEl);
    markWorkspaceSelectableText(liveEl);
    if (this.chunkV2NativeTranslate) {
      applyDirectionToElement(
        handles.translationEl,
        shouldMorsyChunkV2BidiPaint(composedTarget) ? "ar" : translationLanguage,
      );
      const lockedDisplay = lockedForced.length
        ? prepareTextForDisplay(lockedForced, translationLanguage)
        : "";
      const liveDisplay = liveForced.length
        ? prepareTextForDisplay(liveForced, translationLanguage)
        : "";
      if (prev?.locked !== parts.locked) {
        lockedEl.textContent = lockedDisplay;
      }
      const _selA = liveEl.ownerDocument.getSelection();
      const _userSelectingA = _selA != null && _selA.rangeCount > 0 && !_selA.isCollapsed &&
        handles.translationEl.contains(_selA.getRangeAt(0).commonAncestorContainer);
      if (!_userSelectingA && liveEl.textContent !== liveDisplay) {
        liveEl.textContent = liveDisplay;
      }
      return;
    }
    if (prev?.locked !== parts.locked) {
      lockedEl.textContent = lockedForced;
    }
    const _selB = liveEl.ownerDocument.getSelection();
    const _userSelectingB = _selB != null && _selB.rangeCount > 0 && !_selB.isCollapsed &&
      handles.translationEl.contains(_selB.getRangeAt(0).commonAncestorContainer);
    if (!_userSelectingB && liveEl.textContent !== parts.live) {
      liveEl.textContent = parts.live;
    }
    logChunkV2DomPaint({
      rowId,
      method: "paintTranslationPrefixLive",
      previousRendered: prevRendered,
      nextLocked: parts.locked,
      nextLive: parts.live,
      nextComposed: `${parts.locked}${parts.live ? ` ${parts.live}` : ""}`.trim(),
      caller: prev === undefined ? "syncRows_repaint" : "prefix_live_paint",
    });
  }
  private buildOrigCard(doc: Document, proj: RowProjection): {
    card: HTMLElement;
    stripe: HTMLElement;
    line: HTMLElement;
    hypo: HTMLElement;
    header: HTMLElement;
  } {
    const card = doc.createElement("div");
    card.className = origCardClass();
    const stripe = doc.createElement("div");
    stripe.className = `w-1 shrink-0 self-stretch rounded-full min-h-[1.25rem] mt-0.5 ${this.stripeColorForRow(proj.speaker, proj.row_id)}`;
    const body = doc.createElement("div");
    body.className = "min-w-0 flex-1 space-y-1 py-0.5 pl-3";
    const header = doc.createElement("div");
    header.className = "font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70";
    const origRow = doc.createElement("div");
    origRow.className = "flex items-start gap-1 min-w-0";
    const line = doc.createElement("p");
    line.className = "ts-text ts-original leading-relaxed whitespace-pre-wrap flex-1 min-w-0";
    line.dataset.cawRole = "live-line";
    markWorkspaceSelectableText(line);
    line.addEventListener("dblclick", (e) => {
      const sel = line.ownerDocument.getSelection();
      if (!sel) return;
      e.preventDefault();
      sel.removeAllRanges();
      const range = line.ownerDocument.createRange();
      range.selectNodeContents(line);
      sel.addRange(range);
    });
    if (this.chunkV2NativeTranslate) {
      applyDirectionToElement(line, proj?.language ?? "");
    }
    if (this.chunkV2NativeTranslate) {
      // Chunk V2-only: active rows render in a single grey hypothesis span.
      line.innerHTML =
        '<span data-caw-engine="committed" class="text-foreground workspace-selectable-text"></span>' +
        '<span data-caw-engine="hypothesis" class="text-muted-foreground/95 workspace-selectable-text"></span>';
    } else {
      // Default path: keep legacy hypothesis styling/behavior.
      line.innerHTML =
        '<span data-caw-engine="committed" class="text-foreground workspace-selectable-text"></span><span data-caw-engine="hypothesis" class="text-muted-foreground/95 italic workspace-selectable-text"></span>';
    }
    origRow.appendChild(line);
    origRow.appendChild(
      createWorkspaceCopyButton(() => line.textContent ?? ""),
    );
    body.appendChild(header);
    body.appendChild(origRow);
    card.appendChild(stripe);
    card.appendChild(body);
    const hypo = line.querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`)!;
    return { card, stripe, line, hypo, header };
  }
  private createRow(container: HTMLElement, proj: RowProjection): EngineDomRowHandles {
    const doc = container.ownerDocument;
    const row = doc.createElement("div");
    row.dataset.cawSegment = proj.row_id;
    row.className = outerRowClass(this.layoutMode);
    row.dataset.cawFinalized = proj.finalized ? "1" : "";
    if (proj.speaker) row.dataset.cawSpeaker = proj.speaker;
    if (proj.language) row.dataset.cawLanguage = proj.language;
    const { card, stripe } = this.buildOrigCard(doc, proj);
    let translationEl: HTMLElement;
    if (this.layoutMode === "stacked") {
      row.appendChild(card);
      const transRow = doc.createElement("div");
      transRow.className = "flex items-start gap-1 min-w-0";
      translationEl = doc.createElement("p");
      translationEl.dataset.cawRole = "translation";
      translationEl.className = `${translationTextClass("stacked")} flex-1 min-w-0`;
      markWorkspaceSelectableText(translationEl);
      translationEl.addEventListener("dblclick", (e) => {
        const sel = translationEl.ownerDocument.getSelection();
        if (!sel) return;
        e.preventDefault();
        sel.removeAllRanges();
        const range = translationEl.ownerDocument.createRange();
        range.selectNodeContents(translationEl);
        sel.addRange(range);
      });
      if (this.chunkV2NativeTranslate) {
        applyDirectionToElement(translationEl, proj.language ?? "");
      }
      transRow.appendChild(translationEl);
      transRow.appendChild(
        createWorkspaceCopyButton(() => translationEl.textContent ?? ""),
      );
      const body = card.children[1] as HTMLElement;
      body.appendChild(transRow);
    } else {
      const transWrap = doc.createElement("div");
      transWrap.className = "min-w-0 pt-0.5";
      const transRow = doc.createElement("div");
      transRow.className = "flex items-start gap-1 min-w-0";
      translationEl = doc.createElement("p");
      translationEl.dataset.cawRole = "translation";
      translationEl.className = `${translationTextClass("side-by-side")} flex-1 min-w-0`;
      markWorkspaceSelectableText(translationEl);
      translationEl.addEventListener("dblclick", (e) => {
        const sel = translationEl.ownerDocument.getSelection();
        if (!sel) return;
        e.preventDefault();
        sel.removeAllRanges();
        const range = translationEl.ownerDocument.createRange();
        range.selectNodeContents(translationEl);
        sel.addRange(range);
      });
      if (this.chunkV2NativeTranslate) {
        applyDirectionToElement(translationEl, proj.language ?? "");
      }
      transRow.appendChild(translationEl);
      transRow.appendChild(
        createWorkspaceCopyButton(() => translationEl.textContent ?? ""),
      );
      transWrap.appendChild(transRow);
      row.appendChild(card);
      row.appendChild(transWrap);
    }
    container.appendChild(row);
    const handles: EngineDomRowHandles = {
      row,
      stripe,
      committedMirror: createCommittedMirror(),
      translationEl,
    };
    this.byRowId.set(proj.row_id, handles);
    this.paintTranslation(handles);
    return handles;
  }
  /** Row-order sync — append-only committed per row; active tail via hypothesis span only. */
  syncRows(container: HTMLElement, projections: RowProjection[]): void {
    const seen = new Set<string>();
    for (const proj of projections) {
      seen.add(proj.row_id);
      let handles = this.byRowId.get(proj.row_id);
      if (!handles) {
        handles = this.createRow(container, proj);
      } else if (handles.row.className !== outerRowClass(this.layoutMode)) {
        handles.row.remove();
        this.byRowId.delete(proj.row_id);
        handles = this.createRow(container, proj);
      }
      if (handles.row.parentElement !== container) {
        container.appendChild(handles.row);
      }
      const card = handles.row.firstElementChild;
      const body = card?.children[1] as HTMLElement | undefined;
      const line = body?.querySelector<HTMLElement>(`[data-caw-role="live-line"]`);
      const hypo = line?.querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`);
      handles.row.dataset.cawFinalized = proj.finalized ? "1" : "";
      if (proj.speaker) handles.row.dataset.cawSpeaker = proj.speaker;
      if (proj.language) handles.row.dataset.cawLanguage = proj.language;
      handles.stripe.className = `w-1 shrink-0 rounded-full self-stretch min-h-[1.25rem] mt-0.5 ${this.stripeColorForRow(proj.speaker, proj.row_id)}`;
      if (!line || !hypo) continue;
      if (this.chunkV2NativeTranslate) {
        applyDirectionToElement(line, proj.language ?? "");
        if (proj.finalized) {
          // Chunk V2: freeze-time commit only.
          renderCommittedAppendOnly(line, proj.committedText, handles.committedMirror);
          renderHypothesisLcp(hypo, "");
        } else {
          // Chunk V2: keep active row fully grey until structural freeze.
          // Cache processed committedText so isolateLtrInRtl only re-runs when committed changes.
          const dir = getLangDirection(proj.language ?? "");
          let processedCommitted = proj.committedText;
          if (dir === "rtl" && proj.committedText) {
            const cached = this.committedRtlCache.get(proj.row_id);
            if (cached && cached.raw === proj.committedText) {
              processedCommitted = cached.processed;
            } else {
              processedCommitted = isolateLtrInRtl(proj.committedText);
              this.committedRtlCache.set(proj.row_id, { raw: proj.committedText, processed: processedCommitted });
            }
          }
          const combined = [processedCommitted, proj.liveText].filter(Boolean).join(" ");
          renderHypothesisLcp(hypo, combined);
        }
      } else {
        // Non-chunk-v2 path remains committed + live split.
        renderCommittedAppendOnly(line, proj.committedText, handles.committedMirror);
        renderHypothesisLcp(hypo, proj.finalized ? "" : proj.liveText);
      }
      if (this.chunkV2NativeTranslate && proj.translationText && !this.translationByRowId.get(proj.row_id)) {
        this.translationByRowId.set(proj.row_id, proj.translationText);
      }
      if (this.translationPrefixLiveByRowId.has(proj.row_id)) {
        this.paintTranslationPrefixLive(
          handles,
          this.translationPrefixLiveByRowId.get(proj.row_id),
        );
      } else {
        this.paintTranslation(handles);
      }
    }
    for (const [id, handles] of [...this.byRowId]) {
      if (!seen.has(id)) {
        handles.row.remove();
        this.byRowId.delete(id);
        this.committedRtlCache.delete(id);
        this.translationByRowId.delete(id);
        this.translationPrefixLiveByRowId.delete(id);
      }
    }
  }
  relayoutAll(container: HTMLElement, projections: RowProjection[]): void {
    container.replaceChildren();
    this.byRowId.clear();
    this.syncRows(container, projections);
  }
  detachAll(container: HTMLElement): void {
    container.replaceChildren();
    this.byRowId.clear();
    this.committedRtlCache.clear();
    this.translationByRowId.clear();
    this.translationPrefixLiveByRowId.clear();
    this.rowStripeSlotBySpeaker.clear();
    this.rowStripeSlotByUnknownRowId.clear();
  }
}
