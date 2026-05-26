/**
 * Canonical token model consumed by the isolated canonAppendWs streaming engine.
 * Distinct from legacy hook types — Soniox payloads are normalized here.
 */

export type Token = {
  id: string;
  text: string;
  isFinal: boolean;
  confidence: number;
  startMs?: number;
  endMs?: number;
  speakerId?: string;
};
