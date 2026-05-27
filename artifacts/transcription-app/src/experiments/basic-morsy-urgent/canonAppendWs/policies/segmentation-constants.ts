/**
 * Intercall-style segmentation/stabilization — Basic · Morsy Urgent canonAppendWs ONLY.
 */

export const SPEAKER_SWITCH_MIN_CONFLICT_TOKENS = 3;
export const SPEAKER_SWITCH_MIN_STABLE_MS = 650;
/** Alias for hold-window semantics (speaker). */
export const SPEAKER_SWITCH_HOLD_MS = 650;

export const LANGUAGE_SWITCH_MIN_CONFLICT_TOKENS = 3;
export const LANGUAGE_SWITCH_HOLD_MS = 500;

export const MIN_UTTERANCE_CHARS = 60;
export const MIN_UTTERANCE_TOKENS = 10;

/** Long pause before we *consider* silence utterance finalization — secondary gates still apply; endpoint is preferred. */
export const CANON_SILENCE_SEGMENT_MS = 2200;

/** Force-close if an open segment row exceeds this wall-clock span (debug: max_duration). */
export const MAX_UTTERANCE_WALL_MS = 120_000;

/** Throttle DOM sync for noisy Soniox non-final bursts (experiment runtime only). */
export const LIVE_RENDER_BATCH_MS = 80;

/** Silence-path: low mean confidence on hypothesis tail postpones conversational freeze until model steadies. */
export const LIVE_TAIL_MIN_MEAN_CONFIDENCE_SILENCE_FINALIZE = 0.52;

/** Silence-path: if audio processor lag is wildly high, postpone freeze (prefer endpoint as primary latch). */
export const HYPOTHESIS_LAG_REJECT_SILENCE_FINALIZE_MS = 900;
