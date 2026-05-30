/**
 * Basic · Morsy Urgent — locked stable-source prefix + live NF tail (paint-only).
 * Fetch scheduling unchanged; full visibleText still goes to POST /translate on live.
 */

export type MorsyCanonTranslationPrefixState = {
  lockedStableSource: string;
  lockedTranslationPrefix: string;
};

export function emptyMorsyCanonTranslationPrefixState(): MorsyCanonTranslationPrefixState {
  return { lockedStableSource: "", lockedTranslationPrefix: "" };
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Map Soniox stable (final) word share → translation word boundary. */
export function splitFullTranslationAtStableSource(
  stableSource: string,
  visibleSource: string,
  fullTranslation: string,
): { lockedPrefix: string; liveTail: string } {
  const stable = stableSource.trim();
  const visible = visibleSource.trim();
  const full = fullTranslation.trim();
  if (!full) return { lockedPrefix: "", liveTail: "" };
  if (!stable.length || stable.length >= visible.length) {
    return { lockedPrefix: full, liveTail: "" };
  }
  const sw = countWords(stable);
  const vw = countWords(visible);
  const tw = full.split(/\s+/).filter(Boolean);
  if (vw === 0 || tw.length === 0) return { lockedPrefix: "", liveTail: full };
  const lockCount = Math.min(tw.length, Math.max(1, Math.round((sw / vw) * tw.length)));
  return {
    lockedPrefix: tw.slice(0, lockCount).join(" "),
    liveTail: tw.slice(lockCount).join(" "),
  };
}

/** Live tail from a full cumulative translation while the locked prefix is frozen. */
export function liveTailAfterLockedPrefix(lockedPrefix: string, fullTranslation: string): string {
  const full = fullTranslation.trim();
  const locked = lockedPrefix.trim();
  if (!locked) return full;
  if (full.startsWith(locked)) {
    return full.slice(locked.length).replace(/^\s+/, "");
  }
  const lw = countWords(locked);
  const tw = full.split(/\s+/).filter(Boolean);
  if (lw >= tw.length) return "";
  return tw.slice(lw).join(" ");
}

export function composeLockedLiveTranslation(locked: string, live: string): string {
  const l = locked.trim();
  const t = live.trim();
  if (!l) return t;
  if (!t) return l;
  return `${l} ${t}`;
}

/**
 * Extend lock when Soniox finals grow; always derive editable tail from latest full translation.
 */
export function applyMorsyCanonLiveTranslationPaint(
  prefixState: MorsyCanonTranslationPrefixState,
  stableSource: string,
  visibleSource: string,
  fullTranslation: string,
): { prefixState: MorsyCanonTranslationPrefixState; locked: string; live: string; composed: string } {
  const stable = stableSource.trim();
  const visible = visibleSource.trim();
  const full = fullTranslation.trim();
  let { lockedStableSource, lockedTranslationPrefix } = prefixState;

  const prevStable = lockedStableSource.trim();
  const stableGrew =
    stable.length > prevStable.length &&
    (prevStable.length === 0 || stable.startsWith(prevStable));

  if (stableGrew && stable.length >= 3) {
    const split = splitFullTranslationAtStableSource(stable, visible, full);
    const prevLocked = lockedTranslationPrefix.trim();
    if (split.lockedPrefix.length >= prevLocked.length) {
      lockedStableSource = stable;
      lockedTranslationPrefix = split.lockedPrefix;
    }
  }

  const live = liveTailAfterLockedPrefix(lockedTranslationPrefix, full);
  const composed = composeLockedLiveTranslation(lockedTranslationPrefix, live);
  return {
    prefixState: { lockedStableSource, lockedTranslationPrefix },
    locked: lockedTranslationPrefix,
    live,
    composed,
  };
}

/** Final / endpoint / freeze — entire row becomes locked. */
export function finalizeMorsyCanonTranslationPrefix(
  finalSource: string,
  finalTranslation: string,
): MorsyCanonTranslationPrefixState {
  const src = finalSource.trim();
  const tr = finalTranslation.trim();
  return { lockedStableSource: src, lockedTranslationPrefix: tr };
}
