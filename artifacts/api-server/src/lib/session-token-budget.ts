/** Per open session: cap STT token minting to slow scripted harvest / multi-socket abuse. */
const SESSION_TOKEN_WINDOW_MS = 60 * 60 * 1000;
const SESSION_TOKEN_MAX_PER_WINDOW = 8;

const hitsBySessionId = new Map<number, number[]>();

function prune(ts: number[], now: number): void {
  const cutoff = now - SESSION_TOKEN_WINDOW_MS;
  while (ts.length > 0 && ts[0]! < cutoff) ts.shift();
}

export function sessionTokenBudgetExceeded(sessionId: number, now = Date.now()): boolean {
  let arr = hitsBySessionId.get(sessionId);
  if (!arr) {
    arr = [];
    hitsBySessionId.set(sessionId, arr);
  }
  prune(arr, now);
  return arr.length >= SESSION_TOKEN_MAX_PER_WINDOW;
}

export function recordSessionTokenIssued(sessionId: number, now = Date.now()): void {
  let arr = hitsBySessionId.get(sessionId);
  if (!arr) {
    arr = [];
    hitsBySessionId.set(sessionId, arr);
  }
  prune(arr, now);
  arr.push(now);
  if (hitsBySessionId.size > 5000) {
    for (const [sid, ts] of hitsBySessionId) {
      prune(ts, now);
      if (ts.length === 0) hitsBySessionId.delete(sid);
    }
  }
}
