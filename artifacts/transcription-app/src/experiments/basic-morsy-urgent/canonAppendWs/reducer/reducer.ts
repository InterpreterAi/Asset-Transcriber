import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { CanonToken } from "../types/canon-token";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";
import type { Token } from "../types/tokens";

import { resolveMajoritySpeaker, pushSpeakerVote } from "./diarization";
import { appendFinalCanonToTail, applyEndpointAndOpenFresh, replaceTailLiveCanonTokens } from "./row-lifecycle";
import { sonioxTokenToCanon } from "./soniox-to-canon";

export type ReduceContext = {
  ledger: AppendOnlyCanonLedger;
  wallMs: number;
};

/** Non-final helpers from SONIOX stream (token identity preserved). */
function canonNonFinalFromStreamToken(t: Token): CanonToken {
  const ct = sonioxTokenToCanon(t);
  return { ...ct, is_final: false };
}

/**
 * Canon SONIOX ingestion — ONLY canonAppendWs (Basic · Morsy Urgent).
 *
 * Matches Soniox real-time contract:
 * finals accumulate permanently; non-finals for this websocket message **replace** the live tail entirely
 * (“reset non-final tokens on every response” — docs).
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  let next: EngineState = {
    ...state,
    lastFrameSeq: frame.seq,
    endpointState: { active: frame.endpoint, lastEndpointMs: state.endpointState.lastEndpointMs },
  };

  let tailSpk = frame.speaker;
  let tailLang = frame.language;
  if (!tailSpk || !tailLang) {
    for (let j = frame.tokens.length - 1; j >= 0; j--) {
      const tk = frame.tokens[j];
      if (!tailSpk && tk?.speakerId) tailSpk = tk.speakerId;
      if (!tailLang && tk?.language) tailLang = tk.language;
      if (tailSpk && tailLang) break;
    }
  }

  if (tailSpk) {
    next.speakerWindow = pushSpeakerVote(next.speakerWindow, tailSpk, frame.timestamp);
  }
  const maj = resolveMajoritySpeaker(next.speakerWindow);

  const nfCanon: CanonToken[] = [];
  for (const t of frame.tokens) {
    if (t.isFinal) {
      const ct = sonioxTokenToCanon(t);
      ctx.ledger.appendFinalCanon(ct);
      next = appendFinalCanonToTail(next, ct, ctx.wallMs);
      tailLang = ct.language ?? tailLang;
    } else {
      if (typeof t.text === "string" && t.text.length > 0) {
        nfCanon.push(canonNonFinalFromStreamToken(t));
      }
    }
  }

  next = replaceTailLiveCanonTokens(
    next,
    nfCanon,
    ctx.wallMs,
    maj ?? tailSpk ?? undefined,
    tailLang ?? next.activeLanguageId ?? undefined,
  );

  if (frame.tokens.length > 0 || frame.endpoint) {
    next = { ...next, lastTokenActivityWallMs: ctx.wallMs };
  }

  if (frame.endpoint) {
    next = applyEndpointAndOpenFresh(next, ctx.wallMs);
  }

  return next;
}
