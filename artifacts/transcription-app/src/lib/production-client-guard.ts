/**
 * Production-only hardening: reduce casual DevTools leakage (debug globals, React hook noise).
 * Cannot fully block DevTools — determined users can always inspect network traffic.
 */
const DEBUG_GLOBAL_KEYS = [
  "__trialHetznerDomAudit",
  "__trialHetznerSpeakerTrace",
  "__trialHetznerStreamTrace",
  "__trialHetznerProvisionalRow",
  "__trialHetznerMergedOriginal",
  "__interpretSttPipeline",
  "__interpretLiveBlankTrace",
  "__interpretLiveDirectionTrace",
  "__interpreterAiCanonAppendWsDbg",
  "__interpreterAiTranscriptJumpTail",
  "__interpreterAiTranscriptSnapViewport",
  "__interpreterAiTranscriptFollowPinnedSnapshot",
  "__interpreterAiMorsyUrgentNfEntityTrace",
  "__interpreterAiMorsyUrgentNfEntityTraceProbe",
  "__interpreterAiCommittedOrigDomTrace",
  "__interpreterAiCommittedOrigDomTraceProbe",
  "__interpreterAiMorsyUrgentVisualStabilityTrace",
  "__interpreterAiMorsyUrgentVisualStabilityTraceProbe",
] as const;

function scrubDebugGlobals(): void {
  const w = window as unknown as Record<string, unknown>;
  for (const key of DEBUG_GLOBAL_KEYS) {
    try {
      if (key in w) delete w[key];
    } catch {
      /* ignore */
    }
  }
}

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

  scrubDebugGlobals();
  // Hooks may attach debug surfaces after session start — re-scrub periodically.
  window.setInterval(scrubDebugGlobals, 2500);

  // Mild deterrent for casual right-click → Inspect on production UI (bypassable).
  document.addEventListener(
    "contextmenu",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.closest("[data-allow-context-menu]")) return;
      e.preventDefault();
    },
    { capture: true },
  );
}
