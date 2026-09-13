import type { CanonToken } from "../types/canon-token";
import type { Token } from "../types/tokens";

function isEndpointText(text: string): boolean {
  return text === "<end>" || text === "<eos>" || text === "<eps>" || text === "<fin>";
}

/**
 * Preserve parser-assigned connection-scoped ids. Never collapse distinct tokens
 * onto shared timestamps or reused per-message array indexes.
 */
function sonioxTokenToCanon(t: Token, frameSeq: number, idx: number): CanonToken {
  const parserId = typeof t.id === "string" && t.id.trim() ? t.id.trim() : "";
  const token_id = parserId || `conn-${frameSeq}-${idx}`;
  return {
    token_id,
    text: t.text ?? "",
    is_final: t.isFinal === true,
    speaker: t.speakerId?.trim() || undefined,
    language: t.language?.trim() || undefined,
    start_ms: typeof t.startMs === "number" ? t.startMs : undefined,
    end_ms: typeof t.endMs === "number" ? t.endMs : undefined,
    confidence: typeof t.confidence === "number" ? t.confidence : undefined,
  };
}

/** Transcription tokens only — translation tokens are stripped out */
export function canonTokensFromFrame(tokens: readonly Token[], frameSeq = 0): CanonToken[] {
  const out: CanonToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (typeof t.text !== "string" || !t.text.length) continue;
    if (isEndpointText(t.text)) continue;
    if (t.translation_status === "translation") continue;
    out.push(sonioxTokenToCanon(t, frameSeq, i));
  }
  return out;
}

/**
 * Concatenated text of FINALIZED translation tokens in this frame.
 * Only is_final === true tokens are accumulated to prevent
 * double-counting non-final hypotheses that arrive on every frame.
 */
export function translationTextFromFrame(tokens: readonly Token[]): string {
  return tokens
    .filter(
      t =>
        t.translation_status === "translation" &&
        t.isFinal === true &&
        typeof t.text === "string" &&
        t.text.length > 0,
    )
    .map(t => t.text)
    .join("");
}

/** Non-final translation hypothesis from this frame, used for instant preview. */
export function translationPreviewTextFromFrame(tokens: readonly Token[]): string {
  return tokens
    .filter(
      t =>
        t.translation_status === "translation" &&
        t.isFinal !== true &&
        typeof t.text === "string" &&
        t.text.length > 0,
    )
    .map(t => t.text)
    .join("");
}

/** Infer speaker/language from the tail of the token list */
export function inferTailSpeakerLang(tokens: readonly CanonToken[]): {
  speaker?: string;
  language?: string;
} {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.speaker || t.language) {
      return { speaker: t.speaker, language: t.language };
    }
  }
  return {};
}

type SpeakerRun = { start: number; end: number; sp: string };

function coalesceSpeakerRuns(runs: SpeakerRun[]): SpeakerRun[] {
  const out: SpeakerRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.sp === r.sp) last.end = r.end;
    else out.push({ start: r.start, end: r.end, sp: r.sp });
  }
  return out;
}

/**
 * Collapse only interior one-token A→B→A flicker inside one frame.
 * Never rewrite a leading or trailing speaker run — two same-language
 * speakers (e.g. two males) usually arrive as a short new-speaker tail
 * on a frame that still includes the previous speaker's finals.
 */
export function stabilizeCanonSpeakers(tokens: CanonToken[]): CanonToken[] {
  const n = tokens.length;
  if (n === 0) return tokens;
  const forward: (string | undefined)[] = new Array(n).fill(undefined);
  let carry: string | undefined;
  for (let i = 0; i < n; i++) {
    const sp = tokens[i]!.speaker?.trim();
    if (sp) carry = sp;
    forward[i] = carry;
  }
  const runsFromForward = (): SpeakerRun[] => {
    const runs: SpeakerRun[] = [];
    let i = 0;
    while (i < n) {
      while (i < n && forward[i] === undefined) i++;
      if (i >= n) break;
      const sp = forward[i]!;
      const start = i;
      while (i < n && forward[i] === sp) i++;
      runs.push({ start, end: i, sp });
    }
    return runs;
  };
  let runs = runsFromForward();
  const runChars = (r: SpeakerRun): number => {
    let c = 0;
    for (let i = r.start; i < r.end; i++) c += (tokens[i]!.text ?? "").length;
    return c;
  };
  const isInteriorFlicker = (r: SpeakerRun): boolean => r.end - r.start === 1 && runChars(r) < 16;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let k = 1; k < runs.length - 1; k++) {
      const r = runs[k]!;
      if (!isInteriorFlicker(r)) continue;
      const prev = runs[k - 1]!;
      const next = runs[k + 1]!;
      if (prev.sp === next.sp && r.sp !== prev.sp) {
        r.sp = prev.sp;
        changed = true;
      }
    }
    runs = coalesceSpeakerRuns(runs);
    if (!changed) break;
  }
  const resolved: (string | undefined)[] = new Array(n).fill(undefined);
  for (const r of runs) {
    for (let i = r.start; i < r.end; i++) resolved[i] = r.sp;
  }
  return tokens.map((t, i) => {
    const sp = resolved[i];
    return sp && sp !== t.speaker ? { ...t, speaker: sp } : t;
  });
}

/**
 * Live hypothesis for this row only. Never fall back to another speaker's
 * non-finals — that painted new-speaker text on the old row, then jumped it.
 */
export function nonFinalsForRow(
  nonFinals: CanonToken[],
  rowSpeaker: string | undefined,
): CanonToken[] {
  if (!rowSpeaker) return nonFinals;
  return nonFinals.filter(t => !t.speaker || t.speaker === rowSpeaker);
}

function langBase(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t.split("-")[0]!.toLowerCase() : undefined;
}

/**
 * Chunk-v2: while a language/speaker break is waiting on N=2 confirmation,
 * do not attach live hypothesis that belongs to the pending handoff onto the
 * still-open (old) row — that stranded the first new word on the previous bubble.
 */
export function nonFinalsForChunkV2ActiveRow(
  nonFinals: CanonToken[],
  opts: {
    rowSpeaker: string | undefined;
    rowLanguage: string | undefined;
    pendingSpeakerId: string | undefined;
    pendingLanguage: string | undefined;
    pendingFinalsCount: number;
  },
): CanonToken[] {
  if (!opts.pendingFinalsCount) {
    return nonFinalsForRow(nonFinals, opts.rowSpeaker);
  }

  // Speaker-break debounce: only keep tokens that explicitly match the open row.
  // Unlabeled non-finals are ambiguous and were painting the new speaker onto the old row.
  if (opts.pendingSpeakerId) {
    const openSp = opts.rowSpeaker?.trim();
    if (!openSp) return [];
    return nonFinals.filter(t => t.speaker?.trim() === openSp);
  }

  // Language-break debounce: drop live tokens in the pending (new) language.
  if (opts.pendingLanguage) {
    const openLg = langBase(opts.rowLanguage);
    return nonFinalsForRow(nonFinals, opts.rowSpeaker).filter(t => {
      const lg = langBase(t.language);
      if (lg && lg === opts.pendingLanguage) return false;
      if (openLg && lg && lg !== openLg) return false;
      return true;
    });
  }

  return nonFinalsForRow(nonFinals, opts.rowSpeaker);
}
