/**
 * Basic · Morsy Urgent + `morsy-intercall-isolated-experiment` only: original-column presentation
 * stabilization (translator parity, token-aware NF overlap, delta NF DOM helpers). Semantic English freeze is
 * disabled in the hook until canonical committed-only reconciliation proves stable — helpers remain for re-enable.
 */

import {
  endsWithSemanticClausePunctuation,
  effectiveSemanticStabilityMs,
} from "@/hooks/morsy-intercall-orchestrator";

/** Match product daily limits — US Eastern transcript day. Kept minimal; callers pass plan/mode gates. */

export type MorsyIsolatedOrchestrationContext = {
  planTypeLower: string;
  segmentBehaviorMode: string;
};

export function morsyIsolatedEnglishTranscriptOrchestrationEnabled(ctx: MorsyIsolatedOrchestrationContext): boolean {
  return (
    ctx.planTypeLower.trim() === "morsy-urgent" &&
    ctx.segmentBehaviorMode === "morsy-intercall-isolated-experiment"
  );
}

export function morsyIsolatedFinalRenderBufferMs(defaultMs: number): number {
  void defaultMs;
  return 34;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function countWordsWs(s: string): number {
  return collapseWs(s).split(/\s+/).filter(Boolean).length;
}

/** Longest UTF-16 prefix slice length shared by a and b. */
export function longestCommonUtf16PrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) break;
  }
  return i;
}

/** Max k such that locked.endsWith(inc.slice(0,k)) — legacy overlap strip (avoid for isolated reconcile). */
export function deductIncomingFinalTextAgainstLocked(locked: string, inc: string): string {
  if (!inc.trim()) return "";
  if (!locked) return inc;
  let bestK = 0;
  const max = Math.min(locked.length, inc.length);
  for (let k = 1; k <= max; k++) {
    if (locked.slice(-k) === inc.slice(0, k)) bestK = k;
  }
  return inc.slice(bestK);
}

export function splitIncomingFinalForIsolatedDedupe(lockedCommitted: string, incoming: string): string {
  return deductIncomingFinalTextAgainstLocked(lockedCommitted, incoming);
}

/**
 * Isolated reconcile: Soniox final chunk wholly replayed — canonical ends with identical incoming → drop entirely.
 * No k-overlap slicing (prevents substring corruption).
 */
export function dropSonioxFinalReplayAlreadyCommitted(canonicalCommitted: string, incoming: string): string {
  const inc = incoming ?? "";
  if (!inc.length) return "";
  const canon = canonicalCommitted ?? "";
  if (canon.endsWith(inc)) return "";
  return inc;
}

/** Leading English clause on collapsed remainder: ends in . ! ? , ; : — min ~8 chars & 3 words. */
const ENGLISH_CLAUSE_TAIL_RE_EN = /^(.{8,}?[.!?,:;])(?:\s+([\s\S]*))?$/u;

export function englishRemainderLeadingPunctClause(collapsedRemainderTrimmedFromV: string): { clause: string; rest: string } | null {
  const t = collapsedRemainderTrimmedFromV.trimStart();
  const m = ENGLISH_CLAUSE_TAIL_RE_EN.exec(t);
  if (!m?.[1]) return null;
  const clause = m[1].trimEnd();
  const rest = (m[2] ?? "").trimStart();
  if (clause.length < 8 || countWordsWs(clause) < 3) return null;
  return { clause, rest };
}

/**
 * Minimal physical prefix of visible V whose collapseWs equals targetCc (whitespace normalization for match only).
 */
export function physicalPrefixForCollapsedTarget(V: string, targetCc: string): string | null {
  const tail = V.trimStart();
  if (!targetCc) return null;
  for (let i = 1; i <= tail.length; i++) {
    if (collapseWs(tail.slice(0, i)) === targetCc) return tail.slice(0, i);
    const collapsed = collapseWs(tail.slice(0, i));
    if (collapsed.length > targetCc.length) break;
  }
  return null;
}

/**
 * Physical suffix of `clausePhys` to append so final+locked grow without duplicating `committedLogical`
 * (collapsed-word prefix match; falls back to deduct overlap on collapsed strings).
 */
export function computeEnglishFreezeAppend(committedLogical: string, clausePhys: string): string {
  const body = clausePhys.trimStart();
  if (!body) return "";
  const pref = collapseWs(committedLogical);
  const clauseC = collapseWs(body);
  if (!clauseC) return "";
  let remC: string;
  if (!pref.length) remC = clauseC;
  else if (clauseC.startsWith(pref)) remC = clauseC.slice(pref.length).trimStart();
  else remC = collapseWs(deductIncomingFinalTextAgainstLocked(pref, clauseC)).trimStart();
  if (!remC.length) return "";
  for (let i = 0; i <= body.length; i++) {
    const rest = body.slice(i);
    if (collapseWs(rest) === remC) return rest.trimEnd();
  }
  return "";
}

/**
 * Token-aware strip: remove committed word-prefix from NF; fall back to quality-gated char overlap only if needed.
 * Does not alter visible punctuation inside preserved segments — uses raw substrings for display.
 */
export function nfVisibleTailBeyondCommittedTokenAware(committedLogical: string, nfRaw: string): string {
  const n = nfRaw;
  if (!n || !n.trim()) return "";
  const cTrim = committedLogical.trimEnd();
  if (!cTrim.trim()) return n;

  const cw = collapseWs(cTrim).split(/\s+/).filter(Boolean);
  const nw = collapseWs(n).split(/\s+/).filter(Boolean);
  if (nw.length === 0) return n;

  if (nw.length >= cw.length) {
    let match = true;
    for (let i = 0; i < cw.length; i++) {
      const a = (nw[i] ?? "").toLowerCase();
      const b = (cw[i] ?? "").toLowerCase();
      if (a !== b) {
        match = false;
        break;
      }
    }
    if (match) return nw.slice(cw.length).join(" ").trim();
  }

  if (n.startsWith(cTrim)) return n.slice(cTrim.length).trimStart();
  const cLow = cTrim.toLowerCase();
  const nLow = n.toLowerCase();
  if (nLow.startsWith(cLow)) {
    let cut = cTrim.length;
    if (n.slice(0, cut).toLowerCase() !== nLow.slice(0, cut)) cut = longestCommonUtf16PrefixLen(cTrim, n);
    return n.slice(cut).trimStart();
  }

  const minOverlap = Math.max(3, Math.max(8, Math.floor(Math.min(cTrim.length, n.length) * 0.06)));
  const maxLen = Math.min(cTrim.length, n.length);
  const punctBoundaryOk = /[\s.!?,:;]$/.test(cTrim) || /^[\s]/.test(n);
  for (let k = maxLen; k >= minOverlap; k--) {
    if (cTrim.slice(-k) === n.slice(0, k)) {
      if (k <= 4 && !punctBoundaryOk && !/\s/.test(n.charAt(k) ?? "") && /\w$/u.test(cTrim.slice(-1) ?? "") && /\w/u.test(n.charAt(k) ?? ""))
        continue;
      return n.slice(k).trimStart();
    }
  }
  for (let k = maxLen; k >= minOverlap; k--) {
    if (cTrim.slice(-k).toLowerCase() === n.slice(0, k).toLowerCase()) return n.slice(k).trimStart();
  }
  return n;
}

export type DeltaNfPaintOutcome = {
  appendToDom: string;
  /** When true caller should nfEl.textContent = nfPaint (full replace semantics). */
  fullReplace: boolean;
};

/** Append-first NF when new paint extends prev; otherwise full replace. */
export function deltaNfDomMutation(prevRendered: string, nfPaint: string): DeltaNfPaintOutcome {
  const prev = prevRendered;
  const next = nfPaint;
  if (next === prev) return { appendToDom: "", fullReplace: false };
  if (!prev.length) return { appendToDom: next, fullReplace: true };
  if (next.startsWith(prev) && next.length >= prev.length) {
    return { appendToDom: next.slice(prev.length), fullReplace: false };
  }
  const lcp = longestCommonUtf16PrefixLen(prev, next);
  const longer = Math.max(prev.length, next.length);
  if (longer >= 24 && lcp >= Math.min(48, Math.floor(longer * 0.72))) {
    const tail = next.slice(lcp);
    return { appendToDom: tail, fullReplace: false };
  }
  if (next.length + 12 < prev.length) return { appendToDom: next, fullReplace: true };

  const minKeep = Math.max(12, Math.floor(prev.length * 0.06));
  if (lcp < minKeep || lcp === 0) return { appendToDom: next, fullReplace: true };

  const punctRewriteNearTail =
    /[.!?,;:]$/.test(prev.trimEnd()) !== /[.!?,;:]$/.test(next.trimEnd()) &&
    longestCommonUtf16PrefixLen(prev.trimEnd(), next.trimEnd()) < Math.min(prev.length, next.length) - 6;
  if (punctRewriteNearTail) return { appendToDom: next, fullReplace: true };

  return { appendToDom: next.slice(lcp), fullReplace: false };
}

export type EnglishFreezeScratch = {
  morsyEnglishFreezePendingClauseCollapsed: string;
  morsyEnglishFreezePendingSinceMs: number;
  morsyEnglishFreezePendingBaselineFinalTok: number;
  morsyEnglishFreezeLastVCollapsed: string;
};

function clearEnglishFreezePending(scratch: EnglishFreezeScratch): void {
  scratch.morsyEnglishFreezePendingClauseCollapsed = "";
  scratch.morsyEnglishFreezePendingSinceMs = 0;
  scratch.morsyEnglishFreezePendingBaselineFinalTok = -1;
}

/** Returns physical clause prefix to append to final span + locked bookkeeping, or null. */
export function englishSemanticClauseFreezeDrain(args: {
  scratch: EnglishFreezeScratch;
  V: string;
  englishCollapsedMonotone: boolean;
  finalTokensSeen: number;
  englishHintCollapsed: string;
  nowMs: number;
}): string | null {
  const cc = collapseWs(args.V);
  if (!args.englishCollapsedMonotone || !cc) {
    clearEnglishFreezePending(args.scratch);
    args.scratch.morsyEnglishFreezeLastVCollapsed = "";
    return null;
  }

  args.scratch.morsyEnglishFreezeLastVCollapsed = cc;

  const lead = englishRemainderLeadingPunctClause(cc);
  if (!lead) return null;

  const sentCc = collapseWs(lead.clause.trim());
  if (sentCc.length < 8 || countWordsWs(lead.clause) < 3) return null;

  const ftNow = args.finalTokensSeen;

  if (sentCc !== args.scratch.morsyEnglishFreezePendingClauseCollapsed) {
    args.scratch.morsyEnglishFreezePendingClauseCollapsed = sentCc;
    args.scratch.morsyEnglishFreezePendingSinceMs = args.nowMs;
    args.scratch.morsyEnglishFreezePendingBaselineFinalTok = ftNow;
    return null;
  }

  if (ftNow <= args.scratch.morsyEnglishFreezePendingBaselineFinalTok) return null;

  const stabMs = effectiveSemanticStabilityMs(
    endsWithSemanticClausePunctuation(lead.clause.trim()) ? lead.clause.trim() : args.englishHintCollapsed.trim(),
    Math.max(countWordsWs(lead.clause), countWordsWs(args.englishHintCollapsed)),
  );

  if (args.nowMs - args.scratch.morsyEnglishFreezePendingSinceMs < stabMs) return null;

  const phy = physicalPrefixForCollapsedTarget(args.V, sentCc);
  if (!phy || !phy.trim()) return null;
  clearEnglishFreezePending(args.scratch);
  return phy.trimEnd();
}
