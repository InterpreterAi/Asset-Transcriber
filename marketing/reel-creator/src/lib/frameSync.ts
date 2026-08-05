/**
 * Frame-task registry — lets media components (e.g. footage <canvas> painters)
 * signal "I'm still painting this frame" so MP4 export waits before capturing.
 */

const pending = new Set<Promise<unknown>>();

export function trackFrameTask<T>(p: Promise<T>): Promise<T> {
  pending.add(p);
  void p.catch(() => {}).finally(() => pending.delete(p));
  return p;
}

/** Await all in-flight frame tasks (bounded — never hang an export). */
export async function waitForFrameTasks(timeoutMs = 1200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (pending.size > 0 && Date.now() < deadline) {
    const batch = [...pending];
    await Promise.race([
      Promise.allSettled(batch),
      new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now()))),
    ]);
  }
}
