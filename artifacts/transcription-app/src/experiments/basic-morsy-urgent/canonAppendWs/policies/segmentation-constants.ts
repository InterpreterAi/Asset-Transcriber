/**
 * Intercall-style stabilization — Basic · Morsy Urgent canonAppendWs ONLY.
 */

export const SPEAKER_SWITCH_MIN_CONFLICT_TOKENS = 3;
export const SPEAKER_SWITCH_HOLD_MS = 650;

export const LANGUAGE_SWITCH_MIN_CONFLICT_TOKENS = 3;
export const LANGUAGE_SWITCH_HOLD_MS = 500;

export const MIN_UTTERANCE_CHARS = 60;
export const MIN_UTTERANCE_TOKENS = 10;

/** Fallback silence before *considering* delayed freeze (endpoint path is primary). */
export const CANON_SILENCE_SEGMENT_MS = 2200;

export const MAX_UTTERANCE_WALL_MS = 120_000;

export const LIVE_RENDER_BATCH_MS = 80;

/** After `<end>`, require paint quiet for this long before structural freeze. */
export const STABILIZATION_QUIET_MS = 480;

/** Max hypothesis lag (`total - final` ms) to treat audio stream as caught up. */
export const HYPOTHESIS_LAG_COLLAPSED_MS = 420;

/** Silence-path mean live confidence floor. */
export const LIVE_TAIL_MIN_MEAN_CONFIDENCE_SILENCE_FINALIZE = 0.52;

/** Hard cap waiting for endpoint maturity before forced reconcile-freeze. */
export const ENDPOINT_MATURITY_MAX_WAIT_MS = 4_500;

/** Reject short structural finals superseded by longer paint tail (Jess → Jessica). */
export const MIN_STRUCTURAL_FINAL_CHARS = 2;
