/** Coalesced rAF render pipeline — websocket never touches DOM. */

export type RenderJob = () => void;

export class RenderScheduler {
  private rafId: number | null = null;

  private queued: RenderJob[] = [];

  schedule(job: RenderJob): void {
    this.queued.push(job);
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.rafId = null;
    const batch = this.queued;
    this.queued = [];
    for (const job of batch) {
      job();
    }
  }

  cancel(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.queued = [];
  }
}
