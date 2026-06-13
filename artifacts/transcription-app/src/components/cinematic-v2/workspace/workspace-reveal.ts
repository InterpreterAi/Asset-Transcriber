import type { CinematicTurn } from "../data/cinematic-dialogue";

/** Split on phrase boundaries for speech-like chunks (not char-by-char). */
export function splitSpeechChunks(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]?/g);
  if (!parts) return text ? [text] : [];
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function chunksToVisible(chunks: string[], count: number): string {
  if (count <= 0) return "";
  return chunks.slice(0, count).join(" ").replace(/\s+([.!?])/g, "$1");
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

export type TurnRevealState = {
  origChunks: string[];
  origVisible: string;
  transVisible: string;
  origComplete: boolean;
  transComplete: boolean;
  listening: boolean;
};

/** turnProgress 0..1 within a single turn */
export function turnRevealState(turn: CinematicTurn, turnProgress: number): TurnRevealState {
  const origChunks = splitSpeechChunks(turn.original);
  const chunkCount = origChunks.length;
  const clamped = Math.min(1, Math.max(0, turnProgress));

  const origChunkProgress = clamped * chunkCount;
  const visibleChunks = Math.floor(origChunkProgress) + (clamped > 0 && clamped < 1 ? 1 : 0);
  const origVisible = chunksToVisible(origChunks, Math.min(chunkCount, visibleChunks));
  const origComplete = visibleChunks >= chunkCount;

  const transLag = 0.18;
  const transProgress = Math.max(0, (clamped - transLag) / (1 - transLag));
  const transVisible = wordReveal(turn.translation, transProgress);
  const transComplete = transProgress >= 1;

  const listening = origComplete && !transComplete && clamped < 1;

  return {
    origChunks,
    origVisible,
    transVisible,
    origComplete,
    transComplete,
    listening,
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
