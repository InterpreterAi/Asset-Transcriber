// In-memory store for live session snapshots.
// Data lives only while the session is active — never written to disk or DB.
// Cleared when session ends (via stop or terminate).

export interface SessionSnapshot {
  langA:       string;
  langB:       string;
  micLabel:    string;
  transcript:  string;
  translation: string;
  /** Parallel rows per finalized segment (from client buffers). Preferred for admin UI so embedded newlines in speech do not split rows. */
  transcriptLines?: string[];
  translationLines?: string[];
  updatedAt:   number;
}

export const sessionStore = new Map<number, SessionSnapshot>();
