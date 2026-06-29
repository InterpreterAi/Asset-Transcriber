import type { EngineState } from "../types/transcript";

import type { TranscriptProjectionOptions } from "./transcript-view";
import type { TranscriptProjection } from "./transcript-view";
import { projectTranscriptView } from "./transcript-view";

/** Read-only façade over reducer state → UI projections (experiment). */
export class ProjectionStore {
  private revision = 0;
  private options: TranscriptProjectionOptions = {};

  constructor(private state: EngineState) {}

  setOptions(next: TranscriptProjectionOptions): void {
    this.options = { ...this.options, ...next };
  }

  sync(next: EngineState): void {
    this.state = next;
    this.revision++;
  }

  getState(): EngineState {
    return this.state;
  }

  getProjection(): TranscriptProjection {
    return projectTranscriptView(this.state, this.options);
  }

  snapshotRevision(): number {
    return this.revision;
  }
}
