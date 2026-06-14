import type { CinematicTurn } from "../data/cinematic-dialogue";

function splitWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? (text ? [text] : []);
}

export function wordReveal(text: string, progress: number): string {
  const words = splitWords(text);
  if (progress <= 0) return "";
  if (progress >= 1) return text;
  const n = Math.ceil(progress * words.length);
  return words.slice(0, n).join("");
}

export type TurnPhase = "speaking" | "translating" | "complete";

export type TurnRevealState = {
  phase: TurnPhase;
  origVisible: string;
  transVisible: string;
  origComplete: boolean;
  transComplete: boolean;
  showTranslationSlot: boolean;
};

/** Translation trails original by ~2 words and advances slightly slower — both stream live. */
const TRANSLATION_LAG_WORDS = 2;
const TRANSLATION_RATE = 0.88;

export function turnRevealState(turn: CinematicTurn, turnProgress: number): TurnRevealState {
  const clamped = Math.min(1, Math.max(0, turnProgress));
  const origWords = splitWords(turn.original);
  const transWords = splitWords(turn.translation);
  const origLen = origWords.length;
  const transLen = transWords.length;

  if (clamped >= 1 || origLen === 0) {
    return {
      phase: "complete",
      origVisible: turn.original,
      transVisible: turn.translation,
      origComplete: true,
      transComplete: true,
      showTranslationSlot: true,
    };
  }

  const origProgress = Math.min(1, clamped / 0.96);
  const origCount = Math.min(origLen, Math.max(0, Math.ceil(origProgress * origLen)));
  const origVisible = origWords.slice(0, origCount).join("");

  let transCount = 0;
  if (origCount > TRANSLATION_LAG_WORDS && origLen > TRANSLATION_LAG_WORDS) {
    const spokenBeyondLag = origCount - TRANSLATION_LAG_WORDS;
    const speakableSpan = origLen - TRANSLATION_LAG_WORDS;
    const transProgress = (spokenBeyondLag / speakableSpan) * TRANSLATION_RATE;
    transCount = Math.min(transLen, Math.max(0, Math.ceil(transProgress * transLen)));
  }

  const transVisible = transWords.slice(0, transCount).join("");
  const origComplete = origCount >= origLen;
  const transComplete = transCount >= transLen;

  let phase: TurnPhase = "speaking";
  if (origComplete && !transComplete) phase = "translating";
  if (origComplete && transComplete) phase = "complete";

  return {
    phase,
    origVisible,
    transVisible,
    origComplete,
    transComplete,
    showTranslationSlot: transCount > 0,
  };
}

export function dialogueProgressToTurn(
  turns: readonly CinematicTurn[],
  progress: number,
): { turnIndex: number; turnFrac: number } {
  const n = turns.length;
  const scaled = progress * n;
  const turnIndex = Math.min(n - 1, Math.floor(scaled));
  const turnFrac = scaled - turnIndex;
  return { turnIndex, turnFrac };
}
