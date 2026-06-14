import type { CinematicTurn } from "../data/cinematic-dialogue";
import { CINEMATIC_DIALOGUE } from "../data/cinematic-dialogue";

const PAUSE_AT_END_MS = 5000;

/** Realistic pacing: ~140 wpm speech + interpreter listen + translation reveal. */
export function turnDurationMs(turn: CinematicTurn): number {
  const origWords = turn.original.split(/\s+/).filter(Boolean).length;
  const transWords = turn.translation.split(/\s+/).filter(Boolean).length;
  const speak = Math.max(8000, origWords * 420);
  const listen = 1800;
  const translate = Math.max(6000, transWords * 340);
  return speak + listen + translate;
}

function turnDurations(): number[] {
  return CINEMATIC_DIALOGUE.map(turnDurationMs);
}

function cycleMs(): number {
  return turnDurations().reduce((a, b) => a + b, 0) + PAUSE_AT_END_MS;
}

/** Module singleton — survives scroll + route changes within the SPA session. */
let sessionStartMs: number | null = null;

function ensureSessionStart(): number {
  if (sessionStartMs === null) sessionStartMs = performance.now();
  return sessionStartMs;
}

/** Continuous progress in turn units (0 … turnCount). Loops after full script + pause. */
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
