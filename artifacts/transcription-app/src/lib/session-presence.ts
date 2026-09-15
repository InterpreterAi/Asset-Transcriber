const storageKey = (sessionId: number) => `interpreterai-session-presence:${sessionId}`;

function readPresence(sessionId: number): string | undefined {
  try {
    const v = sessionStorage.getItem(storageKey(sessionId));
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function rememberSessionPresence(sessionId: number, presenceKey: unknown): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  if (typeof presenceKey !== "string" || !presenceKey.trim()) return;
  try {
    sessionStorage.setItem(storageKey(sessionId), presenceKey.trim());
  } catch {
    /* private mode */
  }
}

export function forgetSessionPresence(sessionId: number): void {
  try {
    sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    /* ignore */
  }
}

export function presenceFields(sessionId: number): { sessionId: number; presenceKey?: string } {
  const presenceKey = readPresence(sessionId);
  return presenceKey ? { sessionId, presenceKey } : { sessionId };
}
