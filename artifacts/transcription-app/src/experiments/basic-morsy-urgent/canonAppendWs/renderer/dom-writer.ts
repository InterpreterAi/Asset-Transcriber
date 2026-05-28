import type { RowProjection } from "../projection/transcript-view";

import type { CommittedDomMirror } from "./committed-renderer";
import {
  createCommittedMirror,
  renderCommittedAppendOnly,
} from "./committed-renderer";
import { renderHypothesisLcp } from "./hypothesis-renderer";

export type CanonAppendWsLayoutMode = "side-by-side" | "stacked";

export type EngineDomRowHandles = {
  row: HTMLElement;
  stripe: HTMLElement;
  committedMirror: CommittedDomMirror;
  translationEl: HTMLElement;
};

function stripeColorClass(language?: string): string {
  const b = (language ?? "").split("-")[0]!.toLowerCase();
  if (b === "en") return "bg-blue-500";
  if (b === "es") return "bg-amber-400";
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

  private layoutMode: CanonAppendWsLayoutMode = "side-by-side";

  private readonly translationByRowId = new Map<string, string>();

  setLayoutMode(mode: CanonAppendWsLayoutMode): void {
    if (this.layoutMode === mode) return;
    this.layoutMode = mode;
  }

  getLayoutMode(): CanonAppendWsLayoutMode {
    return this.layoutMode;
  }

  setRowTranslation(rowId: string, text: string): void {
    this.translationByRowId.set(rowId, text);
    const handles = this.byRowId.get(rowId);
    if (handles) this.paintTranslation(handles);
  }

  getRowTranslation(rowId: string): string {
    return this.translationByRowId.get(rowId) ?? "";
  }

  getTranslationLines(rowIds: string[]): string[] {
    return rowIds.map(id => this.translationByRowId.get(id) ?? "");
  }

  private paintTranslation(handles: EngineDomRowHandles): void {
    const rowId = handles.row.dataset.cawSegment ?? "";
    const text = this.translationByRowId.get(rowId) ?? "";
    if (this.layoutMode === "stacked") {
      handles.translationEl.innerHTML = text.length
        ? `<span class="text-muted-foreground/55 mr-1.5 select-none" aria-hidden="true">↳</span><span>${escapeHtml(text)}</span>`
        : "";
    } else {
      handles.translationEl.textContent = text;
    }
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
    stripe.className = `w-1 shrink-0 self-stretch ${stripeColorClass(proj.language)}`;

    const body = doc.createElement("div");
    body.className = "min-w-0 flex-1 space-y-1 py-0.5 pl-3";

    const header = doc.createElement("div");
    header.className = "font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70";

    const line = doc.createElement("p");
    line.className = "ts-text ts-original leading-relaxed whitespace-pre-wrap";
    line.dataset.cawRole = "live-line";
    line.innerHTML =
      '<span data-caw-engine="committed" class="text-foreground"></span><span data-caw-engine="hypothesis" class="text-muted-foreground/95 italic"></span>';

    body.appendChild(header);
    body.appendChild(line);
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
    if (proj.speaker) row.dataset.cawSpeaker = proj.speaker;
    if (proj.language) row.dataset.cawLanguage = proj.language;

    const { card, stripe } = this.buildOrigCard(doc, proj);

    let translationEl: HTMLElement;

    if (this.layoutMode === "stacked") {
      row.appendChild(card);
      translationEl = doc.createElement("p");
      translationEl.dataset.cawRole = "translation";
      translationEl.className = translationTextClass("stacked");
      const body = card.children[1] as HTMLElement;
      body.appendChild(translationEl);
    } else {
      const transWrap = doc.createElement("div");
      transWrap.className = "min-w-0 pt-0.5";
      translationEl = doc.createElement("p");
      translationEl.dataset.cawRole = "translation";
      translationEl.className = translationTextClass("side-by-side");
      transWrap.appendChild(translationEl);
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
      container.appendChild(handles.row);

      const card = handles.row.firstElementChild;
      const body = card?.children[1] as HTMLElement | undefined;
      const line = body?.querySelector<HTMLElement>(`[data-caw-role="live-line"]`);
      const hypo = line?.querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`);

      if (proj.speaker) handles.row.dataset.cawSpeaker = proj.speaker;
      if (proj.language) handles.row.dataset.cawLanguage = proj.language;
      handles.stripe.className = `w-1 shrink-0 rounded-full self-stretch min-h-[1.25rem] mt-0.5 ${stripeColorClass(proj.language)}`;

      if (!line || !hypo) continue;

      renderCommittedAppendOnly(line, proj.committedText, handles.committedMirror);
      renderHypothesisLcp(hypo, proj.finalized ? "" : proj.liveText);
      this.paintTranslation(handles);
    }

    for (const [id, handles] of [...this.byRowId]) {
      if (!seen.has(id)) {
        handles.row.remove();
        this.byRowId.delete(id);
        this.translationByRowId.delete(id);
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
    this.translationByRowId.clear();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
