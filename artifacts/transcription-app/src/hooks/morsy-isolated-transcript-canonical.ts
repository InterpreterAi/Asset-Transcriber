/**
 * ## Morsy Urgent isolated transcript canonical model
 * **Gate:** `plan_type === "morsy-urgent"` AND `segmentBehaviorMode === "morsy-intercall-isolated-experiment"`
 * AND transcript segment isolation AND **Intercall lab on** (`experimentMorsyUrgentIntercallOrchestration`).
 *
 * ### Single source of truth
 * - **`BubbleTransState.lockedCommittedFinalOriginal`** — append-only Soniox **final** token text, in message order.
 * - **No** `finalRenderQueueRef` authority for this path (queue unused).
 * - **No** `committedLogical` shadow (no `omitPendingCommittedCanon`).
 * - **No** `dropSonioxFinalReplayAlreadyCommitted` (enqueue roll verbatim if used), `nfVisibleTailBeyondCommittedTokenAware`,
 *   `nf_strip_redundant_overlap`, or `deltaNfDomMutation` for originals.
 *
 * ### Volatile hypothesis (NF)
 * - **Raw** concatenation of **non-final** tokens (same tail-speaker rule as the legacy hook).
 * - **DOM:** `nfSpan.textContent = nfText` each frame (full replace of the NF span only).
 * - **liveBufferRef:** `locked.trimEnd() + nfText` (trim ends only; no `collapseWs` on the join here).
 *
 * ### Committed DOM
 * - One `Text` child under the committed `<span>`; **`Text.appendData(delta)`** per new final chunk.
 * - **End-of-segment reconcile:** `softFinalize` / safety may replace children with one `Text(locked)` if drift.
 *
 * ### WebSocket frame lifecycle (one tick)
 * 1. Speaker pivot / `createBubble` (unchanged).
 * 2. For each **new** final token: `locked += t.text`, `appendData(committedSpan, t.text)`.
 * 3. Build `nfText` from current message tokens.
 * 4. Paint NF span; assign `liveBufferRef`.
 * 5. `finalCountRef = finals.length`.
 * 6. Translation pacing (`morsyIntercallSandboxSemanticStabilizeLive`, etc.) reads `liveBufferRef` only.
 *
 * ### Deleted for this path
 * Mid-frame `flushFinalTextRenderQueue` for canon; delayed `scheduleFinalTextRenderFlush` for canon;
 * overlap strip; semantic **NF debounce** DOM path.
 *
 * ```mermaid
 * flowchart TB
 *   subgraph owner["Single committed authority"]
 *     L[(lockedCommittedFinalOriginal)]
 *     T[Committed Text node]
 *     L --> appendData --> T
 *   end
 *   subgraph ws["Each WebSocket message"]
 *     F[Final tokens delta] --> L
 *     NF[Raw NF from tokens] --> NSpan[NF span textContent replace]
 *     L --> LB[liveBufferRef = trimmed locked + nfRaw]
 *     NSpan --> LB
 *   end
 *   subgraph xfer["Translation only"]
 *     LB -.-> pacing[Semantic boundary / previews]
 *     pacing -.x owner
 *   end
 * ```
 */

import { morsyIsolatedEnglishTranscriptOrchestrationEnabled } from "@/hooks/morsy-original-transcript-orchestration";

/** Matches `{@link morsyIntercallSandboxStrictOriginalFinalSeparation}` in `use-transcription.ts`. */
export function morsyIntercallIsolatedSandboxSegment(segmentBehaviorMode: string): boolean {
  return segmentBehaviorMode === "morsy-intercall-isolated-experiment";
}

export type MorsyIsolatedCanonToken = {
  text: string;
  is_final: boolean;
};

function planAndModeGate(planTypeLower: string, segmentBehaviorMode: string): boolean {
  return morsyIsolatedEnglishTranscriptOrchestrationEnabled({
    planTypeLower,
    segmentBehaviorMode,
  });
}

/** True when this hook must use append-only canon + verbatim NF (no queue / overlap layer). */
export function morsyUrgentAppendOnlyTranscriptDomPath(args: {
  planTypeLower: string;
  segmentBehaviorMode: string;
  transcriptSegIsolation: boolean;
  /** Basic · Morsy Urgent: must match **`experimentMorsyUrgentIntercallOrchestration`** — lab off disables isolated transcript engine. */
  intercallOrchestrationLab: boolean;
}): boolean {
  if (!args.transcriptSegIsolation) return false;
  if (!planAndModeGate(args.planTypeLower, args.segmentBehaviorMode)) return false;
  if (!morsyIntercallIsolatedSandboxSegment(args.segmentBehaviorMode)) return false;
  if (args.planTypeLower.trim() === "morsy-urgent" && !args.intercallOrchestrationLab) return false;
  return true;
}

/** Concatenate `.text` from each new final in order — verbatim Soniox pieces. */
export function morsyIsolatedVerbatimLockedDelta(newFinalTokens: readonly MorsyIsolatedCanonToken[]): string {
  let s = "";
  for (const t of newFinalTokens) s += t.text ?? "";
  return s;
}

/**
 * Concatenate visible non-final token text — tail-speaker constrained when `tailSpk` is set,
 * mirroring `{@link use-transcription.ts}` semantics without overlap subtraction.
 */
export function morsyIsolatedVerbatimRawNfHypothesis(args: {
  tokens: readonly MorsyIsolatedCanonToken[];
  effSpk: readonly (string | undefined)[];
  isEndpointToken: (t: MorsyIsolatedCanonToken) => boolean;
}): { nfRaw: string; tailSpk: string | undefined } {
  let tailSpk: string | undefined;
  for (let i = args.effSpk.length - 1; i >= 0; i--) {
    if (args.effSpk[i]) {
      tailSpk = args.effSpk[i];
      break;
    }
  }
  let nfRaw = "";
  if (tailSpk !== undefined) {
    for (let i = 0; i < args.tokens.length; i++) {
      const tkw = args.tokens[i]!;
      if (tkw.is_final || args.isEndpointToken(tkw)) continue;
      if (args.effSpk[i] !== tailSpk) continue;
      nfRaw += tkw.text ?? "";
    }
  } else {
    nfRaw = args.tokens.filter(t => !t.is_final && !args.isEndpointToken(t)).map(t => t.text).join("");
  }
  return { nfRaw, tailSpk };
}

/** Ensure a single empty `Text` node so future commits use `{@link appendDataLockedOnly}`. */
export function primeMorsyIsolatedCommittedTextNode(committedSpan: HTMLSpanElement): void {
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(""));
}

/** Append-only committed delta. First use after prime; if polluted, resets to one text node bearing `delta`. */
export function appendDataLockedOnly(committedSpan: HTMLSpanElement, delta: string): void {
  if (!delta) return;
  const first = committedSpan.firstChild;
  if (first && first.nodeType === Node.TEXT_NODE) {
    (first as Text).appendData(delta);
    return;
  }
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(delta));
}

/** End-of-row / safety sync: committed span exactly mirrors `locked` string (acceptable full replace at boundary). */
export function reconcileCommittedTextNodeFromLockedString(committedSpan: HTMLSpanElement, lockedUtf16: string): void {
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(lockedUtf16));
}
