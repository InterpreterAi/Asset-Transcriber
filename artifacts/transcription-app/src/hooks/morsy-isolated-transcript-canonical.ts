/**
 * ## Morsy Urgent isolated transcript canonical model (Soniox-aligned)
 * **Gate:** `plan_type === "morsy-urgent"` AND `segmentBehaviorMode === "morsy-intercall-isolated-experiment"`
 * AND transcript segment isolation (`segmentBoundaryGuards || morsyUrgentTranscriptSegmentGuards`).
 *
 * ### Single source of truth
 * - **`BubbleTransState.lockedCommittedFinalOriginal`** — append-only Soniox **final** token text, in message order.
 * - **No** `finalRenderQueueRef` authority for committed finals on this path.
 * - **No** `committedLogical` shadow (no `omitPendingCommittedCanon`).
 * - **No** `dropSonioxFinalReplayAlreadyCommitted`, `nfVisibleTailBeyondCommittedTokenAware`,
 *   `nf_strip_redundant_overlap`, or `deltaNfDomMutation` for originals.
 *
 * ### Volatile hypothesis (NF)
 * - **Raw** concatenation of **non-final** tokens (same tail-speaker rule as the legacy hook).
 * - **DOM:** `nfSpan.textContent = nfText` each frame (full replace of the NF span only).
 * - **liveBufferRef:** `locked.trimEnd() + nfText` (trim ends only on the fused string).
 *
 * ### Committed DOM (canonical append-only path)
 * - **Authority:** `lockedCommittedFinalOriginal` grows immediately; translation / `liveBufferRef` fuse full **`locked`** with NF.
 * - **Visible originals column:** **`projectCommittedOriginalsVisibleUtf16`** each Soniox frame — shows
 *   `locked.slice(0, visibleCommittedBoundary)` only (**`stepVisibleCommittedBoundaryUtf16`** in `morsy-isolated-semantic-visible.ts`).
 * - **Full flush:** **`reconcileCommittedTextNodeFromLockedString(…, locked)`** at **`softFinalize`** / segment close.
 * - Legacy **`appendDataLockedOnly`** remains for non–canon-append isolated paths and queue flushes without visible projection wiring.
 *
 * ### WebSocket frame lifecycle (one tick)
 * 1. Speaker pivot / `createBubble` (unchanged).
 * 2. For each **new** final token: **`lockedCommittedFinalOriginal +=`** `t.text`; **defer** originals-column DOM (`projectCommittedOriginalsVisibleUtf16` tail of handler).
 * 3. Build `nfRaw` from current message tokens.
 * 4. Paint NF span; assign `liveBufferRef`.
 * 5. `finalCountRef = finals.length`.
 * 6. Translation pacing reads `liveBufferRef` only (unchanged orchestration hooks).
 *
 * ### Deleted for this path
 * Mid-frame queued committed flush rewriting `textContent` from queue; overlap strip; heuristic NF splice for originals.
 *
 * ```mermaid
 * flowchart TB
 *   subgraph owner["Single committed authority"]
 *     L[(lockedCommittedFinalOriginal)]
 *     PB[slice to visibleCommittedBoundary]
 *     T[Committed Text node]
 *     L --> PB --> T
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

/** Soniox-aligned originals path: append-only canon, no queued committed ownership, verbatim NF (~`canonAppendWs`). */
export function morsyUrgentAppendOnlyTranscriptDomPath(args: {
  planTypeLower: string;
  segmentBehaviorMode: string;
  transcriptSegIsolation: boolean;
}): boolean {
  return (
    args.transcriptSegIsolation &&
    planAndModeGate(args.planTypeLower, args.segmentBehaviorMode) &&
    morsyIntercallIsolatedSandboxSegment(args.segmentBehaviorMode)
  );
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

/** Ensure a single empty `Text` child on the originals committed span (`{@link projectCommittedOriginalsVisibleUtf16}` canon path). */
export function primeMorsyIsolatedCommittedTextNode(committedSpan: HTMLSpanElement): void {
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(""));
}

/**
 * **Single canon-path writer:** visible committed originals = `locked.slice(0, visibleCommittedBoundary)`.
 * Always yields exactly one `Text` child (drops stray siblings so nothing else fights this span).
 */
export function projectCommittedOriginalsVisibleUtf16(
  committedSpan: HTMLSpanElement,
  visiblePrefixUtf16: string,
): void {
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(visiblePrefixUtf16));
}

/**
 * Append-only committed delta. **`fullLockedCanonUtf16`** must match **`lockedCommittedFinalOriginal`**
 * *after* `delta` has been merged into state — used if the DOM is polluted so we recreate one Text node bearing full canon,
 * never only `delta` (would truncate finals).
 */
export function appendDataLockedOnly(
  committedSpan: HTMLSpanElement,
  delta: string,
  fullLockedCanonUtf16: string,
): void {
  if (!delta) return;
  const first = committedSpan.firstChild;
  if (first && first.nodeType === Node.TEXT_NODE) {
    (first as Text).appendData(delta);
    return;
  }
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(fullLockedCanonUtf16));
}

/** End-of-row / safety sync: committed span exactly mirrors `locked` string (boundary-only full replace). */
export function reconcileCommittedTextNodeFromLockedString(committedSpan: HTMLSpanElement, lockedUtf16: string): void {
  committedSpan.replaceChildren();
  committedSpan.appendChild(committedSpan.ownerDocument.createTextNode(lockedUtf16));
}
