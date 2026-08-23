/**
 * Reusable 15s workspace conversation model — bidirectional language pair,
 * per-line direction, editable timing. Visuals follow workspace-demo reference.
 */

import { reelLanguageLabel } from "@/lib/constants/languages";
import {
  WORKSPACE_POST_VO_HOLD_SEC,
  WORKSPACE_EXCHANGE_GAP_SEC,
  WORKSPACE_THIRD_SPEAKER_GAP_SEC,
} from "@/lib/workspaceTiming";

const TRANS_PHRASE_GAP_SEC = 0.14;
const TRANS_PHRASE_REVEAL_SEC = 0.36;
const TRANS_TAIL_HOLD_SEC = 0.24;

function estimateTranslationRevealTail(translationText: string): number {
  const trimmed = translationText.trim();
  if (!trimmed) return TRANS_PHRASE_GAP_SEC + TRANS_PHRASE_REVEAL_SEC + TRANS_TAIL_HOLD_SEC;
  const n = Math.max(
    1,
    trimmed.split(/(?<=[.!?,:;])\s+/).map((s) => s.trim()).filter(Boolean).length,
  );
  return TRANS_PHRASE_GAP_SEC + n * TRANS_PHRASE_REVEAL_SEC + TRANS_TAIL_HOLD_SEC;
}
import { languageFlag } from "@/lib/languageFlags";

export type WorkspaceSpeaker = "A" | "B" | "C";

export const WORKSPACE_SPEAKER_COLORS = {
  A: "#3B82F6",
  B: "#FBBF24",
  C: "#EC4899",
} as const;

/** One exchange row in the ORIGINAL | TRANSLATION columns. */
export type WorkspaceExchange = {
  id: string;
  /** Blue (A), yellow (B), or pink (C) accent bar — matches live app speakers. */
  speaker: WorkspaceSpeaker;
  /** When set, this exchange uses the pink 3rd speaker voice instead of A/B defaults. */
  thirdSpeakerVoiceId?: string;
  /** Spoken line (left / ORIGINAL column). */
  original: string;
  /** Interpretation (right / TRANSLATION column). */
  translation: string;
  /** BCP-47-ish code for the original line (may differ per exchange). */
  originalLang: string;
  /** Target language code for the translation column. */
  translationLang: string;
  /** Segment progress 0–1 when typing starts. */
  startFrac: number;
  /** Segment progress 0–1 when this exchange is fully settled. */
  endFrac: number;
  /** 0–1 through the typing window when partial translation begins. */
  translationStartFrac: number;
};

export type WorkspaceConversation = {
  sourceLang: string;
  targetLang: string;
  exchanges: WorkspaceExchange[];
};

/** @deprecated Legacy flat arrays — migrated on load. */
export type LegacyWorkspaceScript = {
  speakerA: string[];
  speakerB: string[];
};

let _id = 0;
export function newExchangeId(): string {
  _id += 1;
  return `wx-${_id}`;
}

const WORKSPACE_ROLE_PREFIX =
  /^(?:doctor|patient|nurse|provider|clinician|pharmacist|attorney|counsel|client|physician|interpreter)\s*[:\-–—]\s*/i;

/** Strip "Doctor:", "Patient:", etc. — roles are shown by speaker bar color only. */
export function stripWorkspaceRolePrefix(text: string): string {
  let t = text.trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(WORKSPACE_ROLE_PREFIX, "").trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/^\[(?:doctor|patient|nurse|provider|clinician|client)\]\s*/i, "").trim();
}

export function sanitizeWorkspaceLine(text: string): string {
  return stripWorkspaceRolePrefix(text);
}

/** Default two-speaker interpretation demo (Lang A ↔ Lang B). */
export function defaultWorkspaceConversation(
  sourceLang = "en",
  targetLang = "es",
): WorkspaceConversation {
  const langA = sourceLang || "en";
  const langB = targetLang && targetLang !== langA ? targetLang : langA === "en" ? "es" : "en";
  return applyInterpreterSpeakerPattern({
    sourceLang: langA,
    targetLang: langB,
    exchanges: [
      {
        id: newExchangeId(),
        speaker: "A",
        original: "Can you confirm they started the medication three days ago?",
        translation: "¿Puede confirmar que comenzó la medicación hace tres días?",
        originalLang: langA,
        translationLang: langB,
        startFrac: 0.04,
        endFrac: 0.34,
        translationStartFrac: 0.55,
      },
      {
        id: newExchangeId(),
        speaker: "B",
        original: "Sí, comenzó el lunes por la mañana, dosis de 10 miligramos.",
        translation: "Yes, they started Monday morning, ten milligram dose.",
        originalLang: langB,
        translationLang: langA,
        startFrac: 0.36,
        endFrac: 0.66,
        translationStartFrac: 0.55,
      },
      {
        id: newExchangeId(),
        speaker: "A",
        original: "Perfect. I'll note the allergy to penicillin before we continue.",
        translation: "Perfecto. Anotaré la alergia a la penicilina antes de continuar.",
        originalLang: langA,
        translationLang: langB,
        startFrac: 0.68,
        endFrac: 0.96,
        translationStartFrac: 0.5,
      },
    ],
  });
}

/**
 * Live interpretation layout:
 * - Blue (Speaker A): ORIGINAL in Language A, TRANSLATION in Language B
 * - Yellow (Speaker B): ORIGINAL in Language B, TRANSLATION in Language A
 * - Pink (3rd): can speak either language; language is preserved when set
 *
 * Turns alternate by spoken language (not blind index), so after a pink Lang B
 * line the next A/B exchange is always Blue / Lang A.
 */
export function applyInterpreterSpeakerPattern(c: WorkspaceConversation): WorkspaceConversation {
  const langA = c.sourceLang || "en";
  let langB = c.targetLang || "es";
  if (langB === langA) langB = langA === "en" ? "es" : "en";

  let prevOriginalLang: string | null = null;

  const exchanges = (c.exchanges ?? []).map((x) => {
    const thirdVoice = x.thirdSpeakerVoiceId?.trim();
    const useThird = !!thirdVoice;

    let originalLang: string;
    let speaker: WorkspaceSpeaker;

    if (useThird) {
      const kept =
        x.originalLang === langA || x.originalLang === langB ? x.originalLang : null;
      if (kept) {
        originalLang = kept;
      } else if (prevOriginalLang === langA) {
        originalLang = langB;
      } else if (prevOriginalLang === langB) {
        originalLang = langA;
      } else {
        // Pink opens the workspace — default to Lang B (patient / LEP side)
        originalLang = langB;
      }
      speaker = "C";
    } else if (prevOriginalLang === langA) {
      originalLang = langB;
      speaker = "B";
    } else if (prevOriginalLang === langB) {
      originalLang = langA;
      speaker = "A";
    } else {
      originalLang = langA;
      speaker = "A";
    }

    const translationLang = originalLang === langA ? langB : langA;
    prevOriginalLang = originalLang;

    return {
      ...x,
      id: x.id || newExchangeId(),
      speaker,
      thirdSpeakerVoiceId: useThird ? thirdVoice : undefined,
      originalLang,
      translationLang,
    };
  });

  return { sourceLang: langA, targetLang: langB, exchanges };
}

/** @deprecated Use applyInterpreterSpeakerPattern */
export const enforceEnglishAlternatingPattern = applyInterpreterSpeakerPattern;

/** Migrate legacy speakerA/B arrays into bidirectional exchanges. */
export function migrateWorkspaceScript(
  raw: LegacyWorkspaceScript | WorkspaceConversation | undefined,
  sourceLang = "en",
  targetLang = "es",
): WorkspaceConversation {
  if (raw && "exchanges" in raw && Array.isArray(raw.exchanges) && raw.exchanges.length > 0) {
    return normalizeConversation(raw as WorkspaceConversation);
  }
  const legacy = raw as LegacyWorkspaceScript | undefined;
  const a = legacy?.speakerA ?? [];
  const b = legacy?.speakerB ?? [];
  if (a.length === 0) return defaultWorkspaceConversation(sourceLang, targetLang);

  const n = Math.max(a.length, b.length);
  const span = 0.92 / n;
  const exchanges: WorkspaceExchange[] = [];
  for (let i = 0; i < n; i++) {
    const speaker: WorkspaceSpeaker = i % 2 === 0 ? "A" : "B";
    const origLang = speaker === "A" ? sourceLang : targetLang;
    const transLang = speaker === "A" ? targetLang : sourceLang;
    exchanges.push({
      id: newExchangeId(),
      speaker,
      original: a[i] ?? "",
      translation: b[i] ?? "",
      originalLang: origLang,
      translationLang: transLang,
      startFrac: 0.04 + i * span,
      endFrac: 0.04 + (i + 1) * span,
      translationStartFrac: 0.55,
    });
  }
  return applyInterpreterSpeakerPattern({ sourceLang, targetLang, exchanges });
}

/** Add an empty exchange row for Studio editing — do not strip blank lines. */
export function appendWorkspaceExchange(
  c: WorkspaceConversation,
  maxExchanges = 40,
): WorkspaceConversation {
  if (c.exchanges.length >= maxExchanges) return c;
  const n = c.exchanges.length;
  const span = n > 0 ? 0.92 / (n + 1) : 0.92;
  const langA = c.sourceLang || "en";
  const langB = c.targetLang && c.targetLang !== langA ? c.targetLang : langA === "en" ? "es" : "en";
  const last = c.exchanges[n - 1];
  const lastLang =
    last?.originalLang === langB ? langB : last?.originalLang === langA ? langA : null;
  // After pink/yellow Lang B → next is Blue Lang A; after Blue Lang A → Yellow Lang B
  const originalLang = lastLang === langA ? langB : langA;
  const translationLang = originalLang === langA ? langB : langA;
  const speaker: WorkspaceSpeaker = originalLang === langA ? "A" : "B";
  const newEx: WorkspaceExchange = {
    id: newExchangeId(),
    speaker,
    original: "",
    translation: "",
    originalLang,
    translationLang,
    startFrac: 0.04 + n * span,
    endFrac: 0.04 + (n + 1) * span,
    translationStartFrac: 0.55,
  };
  return applyInterpreterSpeakerPattern({
    ...c,
    exchanges: [...c.exchanges, newEx],
  });
}

export function normalizeConversation(c: WorkspaceConversation): WorkspaceConversation {
  const langA = c.sourceLang || "en";
  const langB = c.targetLang && c.targetLang !== langA ? c.targetLang : langA === "en" ? "es" : "en";
  const exchanges = (c.exchanges ?? [])
    .filter((x) => x.original?.trim() || x.translation?.trim())
    .map((x, i, arr) => {
      const thirdVoice =
        typeof x.thirdSpeakerVoiceId === "string" ? x.thirdSpeakerVoiceId.trim() : "";
      const useThird = !!thirdVoice;
      return {
        ...x,
        id: x.id || newExchangeId(),
        speaker: (useThird ? "C" : i % 2 === 0 ? "A" : "B") as WorkspaceSpeaker,
        thirdSpeakerVoiceId: useThird ? thirdVoice : undefined,
        original: sanitizeWorkspaceLine(x.original ?? ""),
        translation: sanitizeWorkspaceLine(x.translation ?? ""),
        startFrac: typeof x.startFrac === "number" ? x.startFrac : i / arr.length,
        endFrac: typeof x.endFrac === "number" ? x.endFrac : (i + 1) / arr.length,
        translationStartFrac:
          typeof x.translationStartFrac === "number" ? x.translationStartFrac : 0.55,
      };
    });
  return applyInterpreterSpeakerPattern({
    sourceLang: langA,
    targetLang: langB,
    exchanges:
      exchanges.length > 0
        ? exchanges
        : defaultWorkspaceConversation(langA, langB).exchanges,
  });
}

export type WorkspaceVoScheduleItem = {
  startSec: number;
  durationSec: number;
  exchangeIndex: number;
};

/** Placeholder workspace length in Studio before any dialogue is written. */
export const WORKSPACE_EDITOR_PLACEHOLDER_SEC = 15;

export function workspaceSpeechEstimateSec(exchanges: WorkspaceExchange[]): number {
  return exchanges.reduce(
    (sum, ex) => sum + estimateSpeechSec(ex.original, ex.originalLang),
    0,
  );
}

/** Per-exchange duration badge — empty rows share the 15s placeholder until speech exists. */
export function exchangeEditorDurationSec(
  ex: WorkspaceExchange,
  exchanges: WorkspaceExchange[],
): number {
  const speech = estimateSpeechSec(ex.original, ex.originalLang);
  if (speech > 0) return speech;
  if (workspaceSpeechEstimateSec(exchanges) > 0) return 0;
  const n = Math.max(1, exchanges.length);
  return WORKSPACE_EDITOR_PLACEHOLDER_SEC / n;
}

/** Pre-TTS schedule — original speech + phrase-by-phrase translation reveal + speaker gap. */
export function buildEstimatedWorkspaceSchedule(
  exchanges: WorkspaceExchange[],
): WorkspaceVoScheduleItem[] {
  const usePlaceholder = workspaceSpeechEstimateSec(exchanges) <= 0;
  const placeholderSlice =
    WORKSPACE_EDITOR_PLACEHOLDER_SEC / Math.max(1, exchanges.length);
  let cursor = 0;
  return exchanges.map((ex, i) => {
    const speechSec = usePlaceholder
      ? placeholderSlice * 0.55
      : estimateSpeechSec(ex.original, ex.originalLang);
    const transTail = usePlaceholder ? placeholderSlice * 0.35 : estimateTranslationRevealTail(ex.translation);
    const durationSec = Math.max(0.5, speechSec + transTail);
    const item = { startSec: cursor, durationSec, exchangeIndex: i };
    cursor += durationSec;
    if (i < exchanges.length - 1) {
      const next = exchanges[i + 1];
      const isThird = next?.speaker === "C" || !!next?.thirdSpeakerVoiceId?.trim();
      cursor += isThird ? WORKSPACE_THIRD_SPEAKER_GAP_SEC : WORKSPACE_EXCHANGE_GAP_SEC;
    }
    return item;
  });
}

export function workspaceScheduleDurationSec(schedule: WorkspaceVoScheduleItem[]): number {
  if (!schedule.length) return WORKSPACE_EDITOR_PLACEHOLDER_SEC;
  const last = schedule[schedule.length - 1]!;
  const total = last.startSec + last.durationSec;
  return total > 0 ? total + WORKSPACE_POST_VO_HOLD_SEC : WORKSPACE_EDITOR_PLACEHOLDER_SEC;
}

export function exchangeAccentColor(ex: WorkspaceExchange): string {
  if (ex.speaker === "C" || ex.thirdSpeakerVoiceId) return WORKSPACE_SPEAKER_COLORS.C;
  return ex.speaker === "A" ? WORKSPACE_SPEAKER_COLORS.A : WORKSPACE_SPEAKER_COLORS.B;
}

export function exchangeSpeakerLabel(ex: WorkspaceExchange): string {
  if (ex.speaker === "C" || ex.thirdSpeakerVoiceId) return "Pink · 3rd speaker";
  return ex.speaker === "A" ? "Blue · Lang A" : "Yellow · Lang B";
}

export function pairPill(sourceLang: string, targetLang: string): string {
  const a = reelLanguageLabel(sourceLang).slice(0, 12);
  const b = reelLanguageLabel(targetLang).slice(0, 12);
  return `${languageFlag(sourceLang)} ${a} → ${languageFlag(targetLang)} ${b}`;
}

/** Typing speed multiplier — slightly faster than the workspace-demo reference. */
export const TYPING_SPEED = 1.35;

/** Steady word-by-word typing — no jitter dots or extra spaces. */
export function typedText(text: string, progress: number, speed = TYPING_SPEED): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const isCjk = /[\u0600-\u06FF\u4e00-\u9fff]/.test(trimmed);
  if (isCjk) {
    const chars = [...trimmed];
    const p = Math.min(1, Math.max(0, progress * speed));
    const count = Math.max(1, Math.ceil(p * chars.length));
    return chars.slice(0, count).join("");
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const p = Math.min(1, Math.max(0, progress * speed));
  const count = Math.max(1, Math.ceil(p * words.length));
  return words.slice(0, count).join(" ");
}

/** Rough VO duration from word/character count — shown before TTS. */
export function estimateSpeechSec(text: string, lang = "en"): number {
  const t = text.trim();
  if (!t) return 0;
  const rtl = /^(ar|he|fa|ur)/.test(lang) || /[\u0600-\u06FF]/.test(t);
  if (rtl) {
    const chars = [...t.replace(/\s+/g, "")].length;
    return Math.max(0.6, chars / 11);
  }
  const words = t.split(/\s+/).filter(Boolean).length;
  return Math.max(0.5, words / 2.6);
}

/** Split translated hook script back into per-clip lines. */
export function splitHookScriptToClips(fullScript: string, count: number, fallback: string[]): string[] {
  const trimmed = fullScript.trim();
  if (!trimmed || count <= 0) return fallback;
  const parts = trimmed
    .split(/(?<=[.!?؟。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= count) return parts.slice(0, count);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= count) {
    const per = Math.ceil(words.length / count);
    return Array.from({ length: count }, (_, i) => {
      const chunk = words.slice(i * per, (i + 1) * per).join(" ").trim();
      return chunk || fallback[i] || "";
    });
  }
  return fallback.map((fb, i) => parts[i] || fb);
}

/** Block translation reveal after original column finishes (no VO on translation). */
export function translationAfterOriginalProgress(
  translationText: string,
  typeProgress: number,
  revealAt = 0.94,
): { text: string; opacity: number } {
  const trimmed = translationText.trim();
  if (!trimmed || typeProgress < revealAt) return { text: "", opacity: 0 };
  const fade = Math.min(1, (typeProgress - revealAt) / Math.max(0.01, 1 - revealAt));
  return { text: trimmed, opacity: fade };
}
