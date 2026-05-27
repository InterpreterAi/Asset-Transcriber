import type { RowProjection } from "../projection/transcript-view";

import type { CommittedDomMirror } from "./committed-renderer";
import {
  createCommittedMirror,
  renderCommittedAppendOnly,
} from "./committed-renderer";
import { renderHypothesisLcp } from "./hypothesis-renderer";

export type EngineDomRowHandles = {
  row: HTMLElement;
  stripe: HTMLElement;
  committedMirror: CommittedDomMirror;
};

function stripeColorClass(language?: string): string {
  const b = (language ?? "").split("-")[0]!.toLowerCase();
  if (b === "en") return "bg-blue-500";
  if (b === "es") return "bg-amber-400";
  return "bg-muted-foreground/35";
}

function intercallHeaderLabel(proj: RowProjection): string {
  const sp = proj.speaker?.trim();
  const langRaw = proj.language?.trim();
  const langTag = langRaw ? langRaw.split("-")[0]!.toUpperCase() : "";
  if (sp && langTag) return `[Speaker ${sp} | ${langTag}]`;
  if (sp) return `[Speaker ${sp}]`;
  if (langTag) return `[${langTag}]`;
  return "";
}

/** Token-reconciled transcript DOM — only Basic · Morsy Urgent canonAppendWs (Intercall-style rail). */
export class CanonAppendWsDomWriter {
  private readonly byRowId = new Map<string, EngineDomRowHandles>();

  private createRow(container: HTMLElement, proj: RowProjection): EngineDomRowHandles {
    const doc = container.ownerDocument;
    const row = doc.createElement("div");
    row.dataset.cawSegment = proj.row_id;
    row.className =
      "flex overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-sm shadow-sm";

    const stripe = doc.createElement("div");
    stripe.className = `w-1 shrink-0 self-stretch ${stripeColorClass(proj.language)}`;

    const body = doc.createElement("div");
    body.className = "min-w-0 flex-1 space-y-1 p-3 pl-4";

    if (proj.speaker) row.dataset.cawSpeaker = proj.speaker;
    if (proj.language) row.dataset.cawLanguage = proj.language;

    const header = doc.createElement("div");
    header.className = "font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

    const line = doc.createElement("p");
    line.className = "leading-relaxed whitespace-pre-wrap text-[13px]";
    line.dataset.cawRole = "live-line";
    line.innerHTML =
      '<span data-caw-engine="committed" class="text-foreground"></span><span data-caw-engine="hypothesis" class="text-muted-foreground/95 italic"></span>';

    body.appendChild(header);
    body.appendChild(line);

    row.appendChild(stripe);
    row.appendChild(body);

    container.appendChild(row);

    const label = intercallHeaderLabel(proj);
    header.textContent = label;
    header.style.display = label ? "" : "none";

    const handles: EngineDomRowHandles = { row, stripe, committedMirror: createCommittedMirror() };
    this.byRowId.set(proj.row_id, handles);
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
      }
      container.appendChild(handles.row);

      const body = handles.row.children[1] as HTMLElement | undefined;
      const headerEl = body?.children[0] as HTMLElement | undefined;
      const line = body?.querySelector<HTMLElement>(`[data-caw-role="live-line"]`);
      const hypo = line?.querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`);

      if (proj.speaker) handles.row.dataset.cawSpeaker = proj.speaker;
      if (proj.language) handles.row.dataset.cawLanguage = proj.language;
      handles.stripe.className = `w-1 shrink-0 self-stretch ${stripeColorClass(proj.language)}`;

      if (headerEl) {
        const label = intercallHeaderLabel(proj);
        headerEl.textContent = label;
        headerEl.style.display = label ? "" : "none";
      }

      if (!line || !hypo) continue;

      renderCommittedAppendOnly(line, proj.committedText, handles.committedMirror);
      renderHypothesisLcp(hypo, proj.finalized ? "" : proj.liveText);
    }

    for (const [id, handles] of [...this.byRowId]) {
      if (!seen.has(id)) {
        handles.row.remove();
        this.byRowId.delete(id);
      }
    }
  }

  detachAll(container: HTMLElement): void {
    container.replaceChildren();
    this.byRowId.clear();
  }
}
