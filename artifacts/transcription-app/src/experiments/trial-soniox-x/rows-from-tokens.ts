import type { Token } from "@soniox/speech-to-text-web";
import { applyFaithfulMeaningFixes } from "./meaning-locks";

/** Same speaker, 10s audio gap → new bubble. */
const SAME_SPEAKER_PAUSE_MS = 10000;

export type SonioxXRow = {
  id: string;
  speaker?: string;
  origLang?: string;
  transLang?: string;
  origFinal: string;
  origPartial: string;
  transFinal: string;
  transPartial: string;
  lastOrigMs?: number;
};

function emptyRow(id: string, speaker?: string): SonioxXRow {
  return {
    id,
    speaker,
    origFinal: "",
    origPartial: "",
    transFinal: "",
    transPartial: "",
  };
}

function speakerId(token: Token): string | undefined {
  const s = token.speaker;
  if (s == null || s === "") return undefined;
  return String(s);
}

function langBase(code: string | undefined): string {
  return (code ?? "").split("-")[0]?.toLowerCase() ?? "";
}

function tokenAudioMs(token: Token): number | undefined {
  const t = token as Token & { start_ms?: number; end_ms?: number };
  if (typeof t.end_ms === "number" && Number.isFinite(t.end_ms)) return t.end_ms;
  if (typeof t.start_ms === "number" && Number.isFinite(t.start_ms)) return t.start_ms;
  return undefined;
}

function appendToken(target: { final: string; partial: string }, token: Token): { final: string; partial: string } {
  if (token.is_final) return { final: target.final + token.text, partial: target.partial };
  return { final: target.final, partial: target.partial + token.text };
}

function isTranslationToken(token: Token): boolean {
  return token.translation_status === "translation";
}

function isSpokenToken(token: Token): boolean {
  return Boolean(token.text) && token.text !== "<end>" && !isTranslationToken(token);
}

function appendTranslation(row: SonioxXRow, token: Token): void {
  if (token.language && !row.transLang) row.transLang = token.language;
  const next = appendToken({ final: row.transFinal, partial: row.transPartial }, token);
  row.transFinal = next.final;
  row.transPartial = next.partial;
}

/**
 * Soniox RT diarization often omits `speaker` on the first words of a new talker,
 * then labels the rest. Look ahead so those unlabeled words join the new bubble
 * instead of sticking to the previous speaker.
 *
 * Also collapse short A→B→A flicker (1 letter, or a tiny backchannel like "Okay")
 * so "Okay" mid-monologue does not steal a bubble / stripe color.
 */
function effectiveSpokenSpeakers(tokens: Token[]): (string | undefined)[] {
  const n = tokens.length;
  const out: (string | undefined)[] = new Array(n).fill(undefined);
  const orig: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isSpokenToken(tokens[i]!)) orig.push(i);
  }

  const assigned: (string | undefined)[] = orig.map((i) => speakerId(tokens[i]!));

  const labeledAt = (k: number): string | undefined => {
    for (let j = k; j < orig.length; j++) {
      const sp = speakerId(tokens[orig[j]!]!);
      if (sp) return sp;
    }
    return undefined;
  };
  const labeledBefore = (k: number): string | undefined => {
    for (let j = k; j >= 0; j--) {
      const sp = speakerId(tokens[orig[j]!]!);
      if (sp) return sp;
    }
    return undefined;
  };

  for (let k = 0; k < orig.length; k++) {
    if (assigned[k]) continue;
    const prev = k > 0 ? labeledBefore(k - 1) : undefined;
    const next = k + 1 < orig.length ? labeledAt(k + 1) : undefined;
    if (prev && next && prev !== next) assigned[k] = next;
    else if (prev && next) assigned[k] = prev;
    else assigned[k] = next ?? prev;
  }

  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let k = 1; k < assigned.length - 1; k++) {
      const sp = assigned[k];
      const prev = assigned[k - 1];
      const next = assigned[k + 1];
      if (!sp || !prev || !next) continue;
      if (sp === prev || prev !== next) continue;
      const letters = (tokens[orig[k]!]!.text ?? "").replace(/\s/g, "").length;
      if (letters <= 1) {
        assigned[k] = prev;
        changed = true;
      }
    }

    // Short backchannel run B between A … A (e.g. "Okay.") — keep on A.
    // Do NOT collapse real short turns ("Hi.", "Hi everyone.").
    for (let k = 1; k < assigned.length; ) {
      const prev = assigned[k - 1];
      const sp = assigned[k];
      if (!prev || !sp || sp === prev) {
        k += 1;
        continue;
      }
      let end = k;
      while (end < assigned.length && assigned[end] === sp) end += 1;
      const next = end < assigned.length ? assigned[end] : undefined;
      if (next !== prev) {
        k = end;
        continue;
      }
      const runText = Array.from({ length: end - k }, (_, j) => tokens[orig[k + j]!]!.text ?? "")
        .join("")
        .trim();
      if (
        end - k <= 2 &&
        /^(ok(ay)?|yes|yeah|yep|yup|no|nope|nah|hmm+|uh+|um+|mhm|aha|ah|oh)\.?!?$/i.test(runText)
      ) {
        for (let j = k; j < end; j++) assigned[j] = prev;
        changed = true;
      }
      k = end;
    }

    if (!changed) break;
  }

  for (let k = 0; k < orig.length; k++) {
    out[orig[k]!] = assigned[k];
  }
  return out;
}

/**
 * Trial · Soniox X only.
 *
 * Soniox two-way tokens arrive in one stream: originals first, translations after
 * in the same sequence (they do not have timestamps).
 * https://soniox.com/docs/stt/rt/real-time-translation
 *
 * Official two-way stream: originals, then translations, then `<end>` when
 * endpoint detection finalizes. `<end>` is skipped — a short pause while spelling
 * a name or a phone number must not chop the same speaker into tiny bubbles.
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 *
 * A new bubble opens only for:
 * - a new speaker (real diarization turn)
 * - the same speaker after a 10s pause
 *
 * Same speaker + language tag change does NOT open a bubble. Soniox LID tags
 * every token (https://soniox.com/docs/stt/concepts/language-identification), so
 * "Okay" / "WhatsApp" mid-Arabic used to split into extra rows and rotate the
 * stripe. Keep one bubble for that speaker; loanwords stay inline.
 * Same rule for every English↔X pair.
 */
function rowHasVisibleText(row: SonioxXRow): boolean {
  return Boolean(row.origFinal || row.origPartial || row.transFinal || row.transPartial);
}

function shouldOpenNewRow(current: SonioxXRow, next: SonioxXRow, nextOrigMs?: number): boolean {
  const speakerChanged = Boolean(current.speaker && next.speaker && current.speaker !== next.speaker);
  const longPause = Boolean(
    typeof nextOrigMs === "number" &&
      typeof current.lastOrigMs === "number" &&
      nextOrigMs - current.lastOrigMs >= SAME_SPEAKER_PAUSE_MS,
  );
  return speakerChanged || longPause;
}

function mergeLiveRow(base: SonioxXRow, live: SonioxXRow): SonioxXRow {
  return {
    ...base,
    origPartial: `${base.origPartial}${live.origFinal}${live.origPartial}`,
    transPartial: `${base.transPartial}${live.transFinal}${live.transPartial}`,
    origLang: base.origLang || live.origLang,
    transLang: base.transLang || live.transLang,
    speaker: base.speaker || live.speaker,
    lastOrigMs: live.lastOrigMs ?? base.lastOrigMs,
  };
}

/**
 * Attach the current non-final hypothesis onto already-built final rows so
 * dense tab-audio partials do not rebuild the committed transcript.
 */
export function attachNonFinalRows(finalized: SonioxXRow[], nonFinalTokens: Token[]): SonioxXRow[] {
  if (nonFinalTokens.length === 0) return finalized;
  const live = rowsFromSonioxTokens(nonFinalTokens).filter(rowHasVisibleText);
  if (live.length === 0) return finalized;
  if (finalized.length === 0) return live;
  const last = finalized[finalized.length - 1]!;
  const firstLive = live[0]!;
  if (shouldOpenNewRow(last, firstLive, firstLive.lastOrigMs)) {
    return [...finalized, ...live];
  }
  return [...finalized.slice(0, -1), mergeLiveRow(last, firstLive), ...live.slice(1)];
}

export function rowsFromSonioxTokens(tokens: Token[]): SonioxXRow[] {
  const rows: SonioxXRow[] = [];
  let current: SonioxXRow | null = null;
  let seq = 0;
  const speakers = effectiveSpokenSpeakers(tokens);

  const openRow = (speaker?: string): SonioxXRow => {
    seq += 1;
    current = emptyRow(`sx-${seq}`, speaker);
    rows.push(current);
    return current;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.text) continue;
    if (token.text === "<end>") continue;

    if (!isTranslationToken(token)) {
      const speaker = speakers[i];
      const speakerChanged = Boolean(current && speaker && current.speaker && speaker !== current.speaker);
      const ms = tokenAudioMs(token);
      const longPause = Boolean(
        current &&
          typeof ms === "number" &&
          typeof current.lastOrigMs === "number" &&
          ms - current.lastOrigMs >= SAME_SPEAKER_PAUSE_MS,
      );

      // Language tag changes never open a row for the same speaker (code-switch /
      // "Okay" after Arabic / loanwords). Only speaker change or 10s pause does.
      if (!current || speakerChanged || longPause) {
        current = openRow(speaker);
      } else if (!current.speaker && speaker) {
        current.speaker = speaker;
      }
      // Keep the row's first spoken language for stripe stability.
      if (token.language && !current.origLang) current.origLang = token.language;
      if (typeof ms === "number") current.lastOrigMs = ms;
      const next = appendToken(
        { final: current.origFinal, partial: current.origPartial },
        token,
      );
      current.origFinal = next.final;
      current.origPartial = next.partial;
      continue;
    }

    if (!current) {
      current = openRow(undefined);
    }
    appendTranslation(current, token);
  }

  return rows.filter(
    (row) =>
      row.origFinal ||
      row.origPartial ||
      row.transFinal ||
      row.transPartial,
  );
}

export const ROW_STRIPE_COLOR_CLASSES = [
  "bg-blue-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
] as const;

export const RTL_LANGS = new Set(["ar", "he", "fa", "ur", "yi", "dv", "ku", "ps", "ug", "sd"]);

export function langDir(langCode: string | undefined): "rtl" | "ltr" {
  const base = (langCode ?? "").split("-")[0]?.toLowerCase() ?? "";
  return RTL_LANGS.has(base) ? "rtl" : "ltr";
}

export function snapshotLinesFromSonioxXRows(rows: SonioxXRow[]): {
  transcriptLines: string[];
  translationLines: string[];
} {
  const transcriptLines = rows.map((r) => `${r.origFinal}${r.origPartial}`);
  const translationLines = rows.map((r) =>
    applyFaithfulMeaningFixes(`${r.origFinal}${r.origPartial}`, `${r.transFinal}${r.transPartial}`),
  );
  while (translationLines.length < transcriptLines.length) translationLines.push("");
  while (transcriptLines.length < translationLines.length) transcriptLines.push("");
  return { transcriptLines, translationLines };
}

/**
 * Stripe key: speaker id only.
 * Same speaker keeps one stripe color even when they code-switch (AR↔EN).
 * Different speakers still rotate. (EN↔ES false-same speaker-id across talkers
 * is handled by diarization + the short backchannel collapse above.)
 */
export function stripeSlotKey(speaker: string | undefined, _origLang?: string | undefined): string {
  return (speaker ?? "").trim() || "unknown";
}

/**
 * Stable palette slot per first-seen speaker in this transcript.
 * Falls back to row index when speaker is missing.
 */
export function stripeClassForSpeaker(
  speaker: string | undefined,
  index: number,
  origLang?: string,
  slotByKey?: Map<string, number>,
): string {
  const key = stripeSlotKey(speaker, origLang);
  if (slotByKey) {
    if (!slotByKey.has(key)) {
      slotByKey.set(key, slotByKey.size);
    }
    const slot = slotByKey.get(key)!;
    return ROW_STRIPE_COLOR_CLASSES[slot % ROW_STRIPE_COLOR_CLASSES.length]!;
  }
  if (speaker) {
    const n = Number.parseInt(speaker, 10);
    if (Number.isFinite(n) && n > 0) {
      return ROW_STRIPE_COLOR_CLASSES[(n - 1) % ROW_STRIPE_COLOR_CLASSES.length]!;
    }
  }
  return ROW_STRIPE_COLOR_CLASSES[index % ROW_STRIPE_COLOR_CLASSES.length]!;
}

/** Build stripe classes for a full row list (one pass, stable slots). */
export function stripeClassesForRows(rows: readonly SonioxXRow[]): string[] {
  const slotByKey = new Map<string, number>();
  return rows.map((row, index) =>
    stripeClassForSpeaker(row.speaker, index, row.origLang, slotByKey),
  );
}
