import type { Token } from "../types/tokens";

export type SonioxFrame = {
  seq: number;
  tokens: Token[];
  endpoint: boolean;
  speaker?: string;
  timestamp: number;
};
