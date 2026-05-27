import type { CanonToken } from "../types/canon-token";
import { joinCanonText } from "../types/canon-token";
import type { CanonUtterance } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

import {
  computeMutableTail,
  filterPaintByOwnership,
  stripReplayFromHypothesis,
} from "../policies/immutable-prefix";

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

function dominantPaintSpeakerLang(tokens: readonly CanonToken[]): { speaker?: string; language?: string } {
  const sp = new Map<string, number>();
  const lg = new Map<string, number>();
  for (const t of tokens) {
    const s = norm(t.speaker);
    const l = norm(t.language);
    if (s) sp.set(s, (sp.get(s) ?? 0) + 1);
    if (l) lg.set(l, (lg.get(l) ?? 0) + 1);
  }
  const pick = (m: Map<string, number>): string | undefined => {
    let best: string | undefined;
    let n = 0;
    for (const [k, v] of m) {
      if (v > n) {
        best = k;
        n = v;
      }
    }
    return best;
  };
  return { speaker: pick(sp), language: pick(lg) };
}

function scaffoldActiveFromPaint(state: EngineState, wallMs: number): EngineState {
  if (state.activeUtterance || !state.paint.tokens.length) return state;
  const { speaker, language } = dominantPaintSpeakerLang(state.paint.tokens);
  const u: CanonUtterance = {
    utterance_id: `utt-${state.nextUtteranceSeq}`,
    committedText: "",
    mutableTail: "",
    speaker,
    language,
    ownershipLocked: Boolean(speaker || language),
    commitCursorUtf16: 0,
    committedTokenIds: [],
    is_final: false,
    utteranceOpenedWallMs: wallMs,
  };
  return {
    ...state,
    activeUtterance: u,
    nextUtteranceSeq: state.nextUtteranceSeq + 1,
  };
}

/** Replace raw paint staging buffer — no structural mutation. */
export function replacePaintBuffer(
  state: EngineState,
  tokens: CanonToken[],
  wallMs: number,
  frameSeq: number,
): EngineState {
  const prevLen = state.paint.tokens.length;
  return {
    ...state,
    paint: {
      tokens,
      lastMutationWallMs: wallMs,
      lastFrameSeq: frameSeq,
    },
    metrics: {
      ...state.metrics,
      paintReplaceCount:
        state.metrics.paintReplaceCount +
        (tokens.length !== prevLen || frameSeq !== state.paint.lastFrameSeq ? 1 : 0),
    },
  };
}

export function clearPaintBuffer(state: EngineState): EngineState {
  return {
    ...state,
    paint: { tokens: [], lastMutationWallMs: 0, lastFrameSeq: state.paint.lastFrameSeq },
  };
}

/**
 * Project paint onto active row mutableTail ONLY — committedText is never touched here.
 * Blocks cross-speaker paint from mutating a locked row.
 */
export function syncPaintOntoActiveRow(state: EngineState): EngineState {
  let next = scaffoldActiveFromPaint(state, state.paint.lastMutationWallMs || Date.now());
  const au = next.activeUtterance;
  if (!au || au.is_final) return next;

  const filtered = filterPaintByOwnership(
    next.paint.tokens,
    au.speaker,
    au.language,
    au.ownershipLocked,
  );

  if (au.ownershipLocked && next.paint.tokens.length > 0 && filtered.length === 0) {
    return {
      ...next,
      metrics: {
        ...next.metrics,
        rejectedCrossSpeakerPaintCount: next.metrics.rejectedCrossSpeakerPaintCount + 1,
      },
    };
  }

  const paintJoin = joinCanonText(filtered);
  const stripped = stripReplayFromHypothesis(paintJoin, next.consumedCommittedTexts);
  const mutableTail = computeMutableTail(au.committedText, stripped);

  if (mutableTail === au.mutableTail) return next;

  return {
    ...next,
    activeUtterance: {
      ...au,
      mutableTail,
    },
  };
}

/** Refresh mutableTail after committedText advance (final token or freeze prep). */
export function resyncMutableTailAfterCommitAdvance(state: EngineState): EngineState {
  return syncPaintOntoActiveRow(state);
}
