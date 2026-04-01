// In-memory store for live session snapshots.
// Data lives only while the session is active — never written to disk or DB.
// Cleared when session ends (via stop or terminate).

export interface SessionSnapshot {
  langA:       string;
  langB:       string;
  micLabel:    string;
  transcript:  string;
  translation: string;
  updatedAt:   number;
}

export const sessionStore = new Map<number, SessionSnapshot>();
