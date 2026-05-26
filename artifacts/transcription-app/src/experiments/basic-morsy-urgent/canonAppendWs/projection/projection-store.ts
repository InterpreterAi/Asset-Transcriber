import type { EngineState } from "../types/transcript";

import type { TranscriptProjection } from "./transcript-view";
import { projectTranscriptView } from "./transcript-view";

/** Read-only façade over reducer state → UI projections (experiment). */
export class ProjectionStore {
  private revision = 0;

  constructor(private state: EngineState) {}

  sync(next: EngineState): void {
    this.state = next;
    this.revision++;
  }

  getState(): EngineState {
    return this.state;
  }

  getProjection(): TranscriptProjection {
    return projectTranscriptView(this.state);
  }

  snapshotRevision(): number {
    return this.revision;
  }
}
