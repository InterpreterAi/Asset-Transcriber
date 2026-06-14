import type { CinematicTurn } from "../data/cinematic-dialogue";
import { CINEMATIC_DIALOGUE } from "../data/cinematic-dialogue";

const PAUSE_AT_END_MS = 4000;
const MS_PER_ORIG_WORD = 380;
const MS_PER_TRANS_TAIL_WORD = 320;

/** Overlapping live stream — one timeline per turn, no listen/translate gap. */
export function turnDurationMs(turn: CinematicTurn): number {
  const origWords = turn.original.split(/\s+/).filter(Boolean).length;
  const transWords = turn.translation.split(/\s+/).filter(Boolean).length;
  const origTime = origWords * MS_PER_ORIG_WORD;
  const transTail = Math.max(0, transWords - origWords + 2) * MS_PER_TRANS_TAIL_WORD;
  return Math.max(5000, origTime + transTail);
}

function turnDurations(): number[] {
  return CINEMATIC_DIALOGUE.map(turnDurationMs);
}

function cycleMs(): number {
  return turnDurations().reduce((a, b) => a + b, 0) + PAUSE_AT_END_MS;
}

let sessionStartMs: number | null = null;

function ensureSessionStart(): number {
  if (sessionStartMs === null) sessionStartMs = performance.now();
  return sessionStartMs;
}

export function getDialogueAutoplayProgress(): number {
  const durations = turnDurations();
  const total = cycleMs();
  const elapsed = (performance.now() - ensureSessionStart()) % total;
  const activeMs = total - PAUSE_AT_END_MS;

  if (elapsed >= activeMs) {
    return CINEMATIC_DIALOGUE.length;
  }

  let acc = 0;
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i]!;
    if (elapsed < acc + d) {
      return i + (elapsed - acc) / d;
    }
    acc += d;
  }
  return CINEMATIC_DIALOGUE.length;
}

export function getDialogueTurnDurations(): readonly number[] {
  return turnDurations();
}
