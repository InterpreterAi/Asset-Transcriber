/**
 * Locked approved Brand Outro — fixed 7s canonical ending.
 */

export const OUTRO_CONFIG_KEY = "interpreterai_outro_config";

/** Outro is always exactly 7 seconds in the reel. */
export const OUTRO_FIXED_SEC = 7;

export type OutroConfig = {
  /** Locked = approved outro only (normal workflow). */
  locked: boolean;
};

export const DEFAULT_OUTRO_CONFIG: OutroConfig = {
  locked: true,
};

export function normalizeOutroConfig(raw: unknown): OutroConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<OutroConfig>;
  return { locked: r.locked !== false };
}

export function loadOutroConfig(): OutroConfig {
  try {
    const raw = localStorage.getItem(OUTRO_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_OUTRO_CONFIG };
    return normalizeOutroConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_OUTRO_CONFIG };
  }
}

export function saveOutroConfig(config: OutroConfig): void {
  try {
    localStorage.setItem(OUTRO_CONFIG_KEY, JSON.stringify(normalizeOutroConfig(config)));
  } catch {
    /* storage full */
  }
}
