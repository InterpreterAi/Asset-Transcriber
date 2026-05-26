import type { CommittedDomMirror } from "./committed-renderer";
import {
  createCommittedMirror,
  renderCommittedAppendOnly,
} from "./committed-renderer";
import { renderHypothesisLcp } from "./hypothesis-renderer";

export type EngineDomRowHandles = {
  row: HTMLElement;
  committedMirror: CommittedDomMirror;
};

/** The only module allowed to mutate experiment transcript DOM. */
export class CanonAppendWsDomWriter {
  private active: EngineDomRowHandles | null = null;

  mountSegmentRow(container: HTMLElement, segmentId: string): EngineDomRowHandles {
    const row = container.ownerDocument.createElement("div");
    row.dataset.cawSegment = segmentId;
    row.className = "rounded-lg border border-border/50 bg-muted/20 p-3 text-sm";
    row.innerHTML = `
      <p class="leading-relaxed whitespace-pre-wrap" data-caw-role="live-line">
        <span data-caw-engine="committed" class="text-foreground"></span><span data-caw-engine="hypothesis" class="text-muted-foreground/90 italic"></span>
      </p>
    `;
    container.appendChild(row);
    const handles = { row, committedMirror: createCommittedMirror() };
    this.active = handles;
    return handles;
  }

  getActive(): EngineDomRowHandles | null {
    return this.active;
  }

  projectLiveSegment(
    handles: EngineDomRowHandles,
    committedText: string,
    hypothesisText: string,
  ): void {
    const hypo = handles.row.querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`);
    if (!hypo) return;
    renderCommittedAppendOnly(handles.row, committedText, handles.committedMirror);
    renderHypothesisLcp(hypo, hypothesisText);
  }

  finalizeSegmentAppearance(handles: EngineDomRowHandles): void {
    const hypo = handles.row.querySelector<HTMLElement>(`[data-caw-engine="hypothesis"]`);
    hypo?.replaceChildren();
    hypo?.appendChild(hypo.ownerDocument.createTextNode(""));
  }

  detachAll(container: HTMLElement): void {
    container.replaceChildren();
    this.active = null;
  }
}
