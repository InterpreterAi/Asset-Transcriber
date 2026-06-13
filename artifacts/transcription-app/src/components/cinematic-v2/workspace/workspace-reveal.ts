import type { CinematicTurn } from "../data/cinematic-dialogue";

/** Split on phrase boundaries for speech-like chunks (not char-by-char). */
export function splitSpeechChunks(text: string): string[] {
  const parts = text.match(/[^.!?…?,]+[.!?…?,]?/g);
  if (!parts) return text ? [text] : [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function chunksToVisible(chunks: string[], count: number): string {
  if (count <= 0) return "";
  return chunks.slice(0, count).join(" ").replace(/\s+([.!?,])/g, "$1");
}

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

export type TurnPhase = "speaking" | "listening" | "translating" | "complete";

export type TurnRevealState = {
  phase: TurnPhase;
  origVisible: string;
  transVisible: string;
  origComplete: boolean;
  transComplete: boolean;
  showTranslationSlot: boolean;
};

/**
 * Product-accurate turn timing:
 *  speak → transcript chunks (0–48%)
 *  pause / listening (48–58%) — original complete, no translation
 *  translate word-by-word (58–100%)
 */
const SPEAK_END = 0.48;
const LISTEN_END = 0.58;
const TRANS_START = 0.58;

export function turnRevealState(turn: CinematicTurn, turnProgress: number): TurnRevealState {
  const clamped = Math.min(1, Math.max(0, turnProgress));
  const origChunks = splitSpeechChunks(turn.original);
  const chunkCount = origChunks.length;

  if (clamped >= 1) {
    return {
      phase: "complete",
      origVisible: turn.original,
      transVisible: turn.translation,
      origComplete: true,
      transComplete: true,
      showTranslationSlot: true,
    };
  }

  if (clamped < SPEAK_END) {
    const speakFrac = clamped / SPEAK_END;
    const visibleChunks = Math.min(chunkCount, Math.max(0, Math.ceil(speakFrac * chunkCount)));
    return {
      phase: "speaking",
      origVisible: chunksToVisible(origChunks, visibleChunks),
      transVisible: "",
      origComplete: visibleChunks >= chunkCount,
      transComplete: false,
      showTranslationSlot: false,
    };
  }

  if (clamped < LISTEN_END) {
    return {
      phase: "listening",
      origVisible: turn.original,
      transVisible: "",
      origComplete: true,
      transComplete: false,
      showTranslationSlot: false,
    };
  }

  const transFrac = (clamped - TRANS_START) / (1 - TRANS_START);
  const transVisible = wordReveal(turn.translation, transFrac);

  return {
    phase: "translating",
    origVisible: turn.original,
    transVisible,
    origComplete: true,
    transComplete: transFrac >= 1,
    showTranslationSlot: true,
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
