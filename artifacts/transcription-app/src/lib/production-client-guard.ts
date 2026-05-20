/**
 * Production-only hardening: dull React DevTools hooks and avoid noisy client leakage.
 * Does not block keyboard shortcuts or DevTools (would harm power users / a11y tooling).
 */
export function installProductionClientGuards(): void {
  if (!import.meta.env.PROD) return;

  try {
    const w = window as unknown as {
      __REACT_DEVTOOLS_GLOBAL_HOOK__?: Record<string, unknown>;
    };
    const hook = w.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook && typeof hook === "object") {
      const noop = (): void => {};
      for (const key of Object.keys(hook)) {
        const v = hook[key];
        if (typeof v === "function") {
          hook[key] = noop;
        }
      }
    }
  } catch {
    /* ignore */
  }
}
