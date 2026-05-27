import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { CommittedToken, EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import { resolveMajoritySpeaker, pushSpeakerVote } from "./diarization";
import {
  STAGING_BASE_MS,
  STAGING_MAX_MS,
  isEntitySensitiveToken,
} from "./entity-stability";
import { applyEndpointFlush } from "./endpoint";
import { advanceSpeakerPivot } from "./speaker-pivot-policy";
import { reconcileHypothesisVolatile } from "./volatile-tail";

export type ReduceContext = {
  ledger: AppendOnlyCanonLedger;
  wallMs: number;
};

/** Pure reducer — no DOM. Stabilization + staging + endpoint semantics. */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  let next: EngineState = {
    ...state,
    lastFrameSeq: frame.seq,
    endpointState: { active: frame.endpoint, lastEndpointMs: state.endpointState.lastEndpointMs },
  };

  let tailSpk = frame.speaker;
  if (!tailSpk) {
    for (let j = frame.tokens.length - 1; j >= 0; j--) {
      const sid = frame.tokens[j]?.speakerId;
      if (sid) {
        tailSpk = sid;
        break;
      }
    }
  }
  if (tailSpk) {
    next.speakerWindow = pushSpeakerVote(next.speakerWindow, tailSpk, frame.timestamp);
  }

  const maj = resolveMajoritySpeaker(next.speakerWindow);

  const finals = frame.tokens.filter(t => t.isFinal);
  if (finals.length) {
    ctx.ledger.appendFinalTokens(finals);
    let committedInternal = [...next.committedInternal];
    let pendingStableTokens = [...next.pendingStableTokens];
    for (const t of finals) {
      const ct: CommittedToken = {
        id: `c-${t.id}`,
        joinedText: t.text,
        speakerId: t.speakerId,
      };
      if (isEntitySensitiveToken(t)) {
        pendingStableTokens.push({ ...ct, stagedSinceMs: ctx.wallMs });
      } else {
        committedInternal.push(ct);
      }
    }

    const stillPending: CommittedToken[] = [];
    let stagedPromoted = 0;
    for (const p of pendingStableTokens) {
      const since = p.stagedSinceMs ?? ctx.wallMs;
      const dwell = ctx.wallMs - since;
      const need =
        STAGING_BASE_MS +
        (isEntitySensitiveToken({ text: p.joinedText })
          ? STAGING_MAX_MS - STAGING_BASE_MS
          : 0);
      if (dwell >= need) {
        committedInternal.push({ ...p, stagedSinceMs: undefined });
        stagedPromoted++;
      } else {
        stillPending.push(p);
      }
    }
    pendingStableTokens = stillPending;

    next = {
      ...next,
      committedInternal,
      pendingStableTokens,
      committedVisibleIndex: committedInternal.length,
      metrics:
        stagedPromoted > 0
          ? { ...next.metrics, entityFlickerCount: next.metrics.entityFlickerCount + stagedPromoted }
          : next.metrics,
    };
  }

  const nfs = frame.tokens.filter(t => !t.isFinal);
  const joinedRaw = nfs.map(t => t.text).join("");
  const prevHyp = next.hypothesisText;
  const mergedHyp = reconcileHypothesisVolatile(prevHyp, joinedRaw);
  let metrics = next.metrics;
  if (mergedHyp.length < prevHyp.length) metrics = { ...metrics, retractCount: metrics.retractCount + 1 };
  if (!joinedRaw.length && prevHyp.length) metrics = { ...metrics, staleTailCount: metrics.staleTailCount + 1 };

  next = {
    ...next,
    hypothesisTokens: nfs,
    hypothesisText: mergedHyp,
    metrics,
  };

  next = advanceSpeakerPivot(next, maj, finals, frame.endpoint, ctx.wallMs);

  if (frame.endpoint) {
    next = applyEndpointFlush(next, ctx.wallMs);
  }

  return next;
}
