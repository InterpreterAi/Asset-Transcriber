import type { CanonToken } from "../types/canon-token";
import type { Token } from "../types/tokens";

function isEndpointText(text: string): boolean {
  return text === "<end>" || text === "<eos>" || text === "<eps>";
}

function sonioxTokenToCanon(t: Token, idx: number): CanonToken {
  const start_ms = typeof t.startMs === "number" ? t.startMs : undefined;
  const token_id = start_ms !== undefined ? `t_${start_ms}` : `t_idx_${idx}`;
  return {
    token_id,
    text: t.text ?? "",
    is_final: t.isFinal === true,
    speaker: t.speakerId?.trim() || undefined,
    language: t.language?.trim() || undefined,
    start_ms,
    end_ms: typeof t.endMs === "number" ? t.endMs : undefined,
    confidence: typeof t.confidence === "number" ? t.confidence : undefined,
  };
}

/** Transcription tokens only — translation tokens are stripped out */
export function canonTokensFromFrame(tokens: readonly Token[]): CanonToken[] {
  const out: CanonToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (typeof t.text !== "string" || !t.text.length) continue;
    if (isEndpointText(t.text)) continue;
    if (t.translation_status === "translation") continue;
    out.push(sonioxTokenToCanon(t, i));
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
 * Collapse short A→B→A / leading / trailing speaker flicker inside one frame
 * so a one-token diarization glitch does not look like a real handoff.
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
  const isEphemeral = (r: SpeakerRun): boolean => r.end - r.start < 3 && runChars(r) < 28;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k]!;
      if (!isEphemeral(r)) continue;
      if (k > 0 && k < runs.length - 1) {
        const prev = runs[k - 1]!;
        const next = runs[k + 1]!;
        if (prev.sp === next.sp && r.sp !== prev.sp) {
          r.sp = prev.sp;
          changed = true;
        }
      } else if (k === 0 && runs.length > 1 && r.sp !== runs[1]!.sp) {
        r.sp = runs[1]!.sp;
        changed = true;
      } else if (k === runs.length - 1 && k > 0 && r.sp !== runs[k - 1]!.sp) {
        r.sp = runs[k - 1]!.sp;
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
