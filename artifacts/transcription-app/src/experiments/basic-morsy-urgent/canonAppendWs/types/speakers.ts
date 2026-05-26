/**
 * Speaker hysteresis primitives (experiment scope only).
 */

export type SpeakerVote = {
  speakerId: string;
  timestamp: number;
};

export const DIARIZATION_WINDOW_MS = 420;
export const DIARIZATION_MIN_STABLE_MS = 120;
export const DIARIZATION_MAJORITY_RATIO = 0.58;
