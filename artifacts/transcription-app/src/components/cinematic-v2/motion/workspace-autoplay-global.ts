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
let frozenProgress: number | null = null;

function ensureSessionStart(): number {
  if (sessionStartMs === null) sessionStartMs = performance.now();
  return sessionStartMs;
}

function liveDialogueAutoplayProgress(): number {
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

/** Map dialogue progress (turn index + fraction) → elapsed ms within the active cycle. */
function elapsedMsForProgress(progress: number): number {
  const durations = turnDurations();
  const total = cycleMs();
  const activeMs = total - PAUSE_AT_END_MS;

  if (progress >= CINEMATIC_DIALOGUE.length) {
    return activeMs;
  }

  const turnIdx = Math.max(0, Math.min(CINEMATIC_DIALOGUE.length - 1, Math.floor(progress)));
  const turnFrac = progress - turnIdx;
  let acc = 0;
  for (let i = 0; i < turnIdx; i++) acc += durations[i]!;
  return acc + turnFrac * (durations[turnIdx] ?? durations[0]!);
}

function syncSessionStartToProgress(progress: number): void {
  sessionStartMs = performance.now() - elapsedMsForProgress(progress);
}

export function isDialogueAutoplayFrozen(): boolean {
  return frozenProgress !== null;
}

/** Pause demo clock — snapshot stays on screen while user reads earlier chapters. */
export function freezeDialogueAutoplayAtCurrent(): void {
  if (frozenProgress !== null) return;
  frozenProgress = liveDialogueAutoplayProgress();
}

/** Resume demo from the last frozen frame (landing page scrolled back to bottom). */
export function unfreezeDialogueAutoplay(): void {
  if (frozenProgress === null) return;
  syncSessionStartToProgress(frozenProgress);
  frozenProgress = null;
}

/** Force live autoplay (e.g. landing mount after a bad freeze). */
export function resetDialogueAutoplayLive(): void {
  frozenProgress = null;
  ensureSessionStart();
}

export function getDialogueAutoplayProgress(): number {
  if (frozenProgress !== null) return frozenProgress;
  return liveDialogueAutoplayProgress();
}

export function getDialogueTurnDurations(): readonly number[] {
  return turnDurations();
}
