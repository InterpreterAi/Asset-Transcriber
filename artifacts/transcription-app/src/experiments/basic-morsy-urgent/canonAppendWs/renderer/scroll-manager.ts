/**
 * Experiment scroll coordinator — renderer never decides scroll targets.
 */

export type ScrollCoordinatorOptions = {
  stickToTail: boolean;
};

export class ScrollManager {
  private container: HTMLElement | null = null;

  attachScrollParent(el: HTMLElement | null): void {
    const next = el?.parentElement ?? null;
    this.container = next;
  }

  /** Optional tail follow — must be invoked explicitly post-layout flush. */
  maybeFollowTail(_opts?: ScrollCoordinatorOptions): void {
    const el = this.container;
    if (!el || !_opts?.stickToTail) return;
    el.scrollTop = el.scrollHeight;
  }

  detach(): void {
    this.container = null;
  }
}
