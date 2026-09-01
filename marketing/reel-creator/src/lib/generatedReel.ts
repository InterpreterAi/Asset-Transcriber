/**
 * Focused Creative Studio — fixed 32-second reel model + generate API client.
 * Timeline: hook 10s → workspace 15s → outro 5s (no intro).
 */

import type { WorkspaceConversation } from "@/lib/workspaceModel";
import {
  migrateWorkspaceScript,
  normalizeConversation,
  applyInterpreterSpeakerPattern,
  stampWorkspaceVoRouting,
  estimateSpeechSec,
} from "@/lib/workspaceModel";
import { normalizeWordTimestamps, type TimedWord } from "@/lib/kineticCaptions";
import { trimBufferToSpeechWindow, concatMonoBuffers, silenceBuffer } from "@/lib/audioTrim";
import { base64ToBlob, type StitchClip } from "@/lib/reelBlobUtils";
import { speechTrimSecFromWords, WORKSPACE_POST_VO_HOLD_SEC } from "@/lib/workspaceTiming";
import {
  buildLockedOutroVoiceover,
  outroDurationForVoSec,
  resolveUniversalOutroCopy,
  type UniversalOutroCopy,
} from "@/lib/universalBrandOutro";
import {
  buildOutroSpokenForTts,
  DEFAULT_OUTRO_PHRASE_GAP_SEC,
  formatOutroForSingleTts,
  type OutroPhraseClip,
  stitchOutroPhraseClipsToBase64,
} from "@/lib/outroVoPacing";
import { isPlayableFootageUrl, type HookFootageProvider } from "@/lib/hookFootage";
import { normalizeVoiceActorId, type VoiceActorId, DEFAULT_WORKSPACE_SPEAKER_A_VOICE, DEFAULT_WORKSPACE_SPEAKER_B_VOICE } from "@/lib/constants/languages";

export const REEL_TOTAL_SEC = 30;
export const REEL_HOOK_SEC = 10;
export const REEL_WORKSPACE_SEC = 15;
export const REEL_PRODUCT_PAYOFF_SEC = 6;
export const REEL_OUTRO_SEC = 5;
/** Hold workspace UI after last spoken line — breathing room before outro (SaaS ad pacing). */
export { WORKSPACE_POST_VO_HOLD_SEC } from "@/lib/workspaceTiming";
/** Studio hook editor — default 3, user can add up to this many. */
export const MAX_HOOK_CLIPS = 6;
/** Soft UI ceiling — add exchanges freely in Studio (timing scales with VO). */
export const MAX_WORKSPACE_EXCHANGES = 40;

export type HookClipInput = {
  scenario: string;
  sayLine: string;
};

export type FootageSelectionStatus = "ok" | "footage_needed" | "product_recording";

export type ProductPayoffInput = {
  sayLine: string;
  scenario: string;
  headline?: string;
  supportingText?: string;
  enabled?: boolean;
};

export type HookVoClip = {
  audioBase64: string;
  startSec: number;
  durationSec: number;
  footageUrl: string;
  sayLine: string;
  scenario: string;
  words: TimedWord[];
  footageStatus?: FootageSelectionStatus;
  pexelsVideoId?: number;
  composition?: string;
};

export type ProductPayoffVoClip = {
  audioBase64: string;
  startSec: number;
  durationSec: number;
  footageUrl: string;
  sayLine: string;
  scenario: string;
  headline?: string;
  supportingText?: string;
  words: TimedWord[];
  footageStatus?: FootageSelectionStatus;
  pexelsVideoId?: number;
  composition?: string;
};

export function computeHookDurationSec(hookVoClips: HookVoClip[]): number {
  if (hookVoClips.length === 0) return REEL_HOOK_SEC;
  const last = hookVoClips[hookVoClips.length - 1]!;
  return Math.max(REEL_HOOK_SEC * 0.5, last.startSec + last.durationSec);
}

/** Never return 0 — avoids preview jumping straight to transparent outro (black stage). */
export function resolveHookDurationSec(
  hookVoClips: HookVoClip[],
  prop?: number,
): number {
  const fromClips =
    hookVoClips.length > 0 ? computeHookDurationSec(hookVoClips) : REEL_HOOK_SEC;
  const fromProp = typeof prop === "number" && prop > 0 ? prop : 0;
  return Math.max(0.5, fromClips, fromProp);
}

/** Workspace segment = speech through last line + hold so viewers can read the UI. */
export function computeWorkspaceDurationSec(
  clips: Pick<WorkspaceVoClip, "startSec" | "durationSec">[],
  estimatedSpeechSec?: number,
): number {
  const MIN = 2.5;
  const tail = WORKSPACE_POST_VO_HOLD_SEC;
  if (clips.length > 0) {
    const last = clips[clips.length - 1]!;
    return Math.max(MIN, last.startSec + (last.durationSec ?? 2) + tail);
  }
  if (estimatedSpeechSec != null && estimatedSpeechSec > 0) {
    return Math.max(MIN, estimatedSpeechSec + tail);
  }
  return REEL_WORKSPACE_SEC;
}

/** Outro segment length from spoken script (dynamic by default — pass minHoldSec for fixed brand hold). */
export function computeOutroDurationSec(
  text: string,
  lang = "en",
  minHoldSec = 0,
): number {
  return outroDurationForVoSec(estimateSpeechSec(text, lang), minHoldSec);
}

const MIN_CLIP_FOOTAGE_SEC = 0.35;

export function computeProductPayoffDurationSec(
  clip: Pick<ProductPayoffVoClip, "durationSec" | "words"> | null | undefined,
  fallbackText?: string,
  lang = "en",
): number {
  const MIN = 3;
  if (clip && clip.durationSec > 0) return Math.max(MIN, clip.durationSec + 0.08);
  if (fallbackText?.trim()) return Math.max(MIN, estimateSpeechSec(fallbackText, lang) + 0.08);
  return REEL_PRODUCT_PAYOFF_SEC;
}

/** Footage window ends when VO ends — not padded segment tail. */
export function footageDurationFromVoClips(
  clips: Pick<HookVoClip, "startSec" | "durationSec">[],
): number {
  if (clips.length === 0) return 0;
  const last = clips[clips.length - 1]!;
  return Math.max(MIN_CLIP_FOOTAGE_SEC, last.startSec + last.durationSec);
}

export function computeReelTotalSec(
  hookSec = REEL_HOOK_SEC,
  workspaceSec = REEL_WORKSPACE_SEC,
  includeOutro = true,
  includeWorkspace = true,
  outroSec = REEL_OUTRO_SEC,
  productPayoffSec = 0,
  includeProductPayoff = true,
  includeHook = true,
  workspaceOutroGapSec = 0,
): number {
  const payoff = includeProductPayoff && productPayoffSec > 0 ? productPayoffSec : 0;
  const hook = includeHook ? hookSec : 0;
  const gap = includeOutro && workspaceOutroGapSec > 0 ? workspaceOutroGapSec : 0;
  return hook + (includeWorkspace ? workspaceSec : 0) + payoff + gap + (includeOutro ? outroSec : 0);
}

export type GeneratedSegmentId = "hook" | "workspace" | "productPayoff" | "outro";

export type GeneratedSegment = {
  id: GeneratedSegmentId;
  start: number;
  end: number;
};

/** Dynamic hook + workspace length; hook, workspace, and outro optional. */
export function buildGeneratedSegments(
  hookSec = REEL_HOOK_SEC,
  workspaceSec = REEL_WORKSPACE_SEC,
  includeOutro = true,
  includeWorkspace = true,
  outroSec = REEL_OUTRO_SEC,
  productPayoffSec = 0,
  includeProductPayoff = true,
  includeHook = true,
  workspaceOutroGapSec = 0,
): GeneratedSegment[] {
  const segs: GeneratedSegment[] = [];
  let cursor = 0;
  if (includeHook && hookSec > 0) {
    segs.push({ id: "hook", start: 0, end: hookSec });
    cursor = hookSec;
  }
  if (includeWorkspace) {
    segs.push({ id: "workspace", start: cursor, end: cursor + workspaceSec });
    cursor += workspaceSec;
  }
  if (includeProductPayoff && productPayoffSec > 0) {
    segs.push({ id: "productPayoff", start: cursor, end: cursor + productPayoffSec });
    cursor += productPayoffSec;
  }
  const gap = includeOutro && workspaceOutroGapSec > 0 ? workspaceOutroGapSec : 0;
  cursor += gap;
  if (includeOutro) {
    segs.push({ id: "outro", start: cursor, end: cursor + outroSec });
  }
  return segs;
}

/** @deprecated Use WorkspaceConversation */
export type WorkspaceScript = {
  speakerA: string[];
  speakerB: string[];
};

export type GeneratedStoryboard = {
  hookScript: string;
  hookScenes: string[];
  workspace: WorkspaceConversation;
  productPayoff?: ProductPayoffInput;
  /** Locked outro VO text (English source or translated). */
  outroVoiceover: string;
  /** Translated visible outro copy for non-English overlays. */
  outroCopy?: UniversalOutroCopy;
};

export type ProviderStatus = Record<string, string>;

export type { HookFootageProvider };

export type WorkspaceVoClip = {
  audioBase64: string;
  startSec: number;
  durationSec?: number;
  /** Index in workspace.exchanges — required when some rows have no VO. */
  exchangeIndex?: number;
  words?: TimedWord[];
};

export function clipExchangeIndex(
  clip: Pick<WorkspaceVoClip, "exchangeIndex">,
  fallbackIndex: number,
): number {
  return typeof clip.exchangeIndex === "number" && clip.exchangeIndex >= 0
    ? clip.exchangeIndex
    : fallbackIndex;
}

export type GeneratedReelResult = {
  prompt: string;
  language: string;
  series: string;
  /** Localized storyboard (equals storyboardEn when language is en). */
  storyboard: GeneratedStoryboard;
  /** Original English copy — preserved so switching back to en restores it. */
  storyboardEn: GeneratedStoryboard;
  footageUrls: string[];
  /** Per-clip hook VO + Pexels footage — synced by voiceover duration. */
  hookVoClips: HookVoClip[];
  hookDurationSec: number;
  productPayoffVoClip?: ProductPayoffVoClip | null;
  productPayoffDurationSec?: number;
  audioBase64: string | null;
  words: TimedWord[];
  /** Per-exchange workspace VO clips positioned within the 15s segment. */
  workspaceVoClips: WorkspaceVoClip[];
  /** Non-English translated outro audio only — English uses canonical asset. */
  outroAudioBase64: string | null;
  outroWords: TimedWord[];
  /** Studio segment toggles — hook-only / hook+workspace exports. */
  includeHook?: boolean;
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
  providerStatus: ProviderStatus;
  createdAt: number;
};

/** Cached ElevenLabs voiceover — generate once via POST /voiceover, reuse on reel builds. */
export type StudioVoiceoverResult = {
  fingerprint: string;
  hookVoClips: HookVoClip[];
  hookDurationSec: number;
  productPayoffVoClip?: ProductPayoffVoClip | null;
  productPayoffDurationSec?: number;
  audioBase64: string | null;
  words: TimedWord[];
  workspaceVoClips: WorkspaceVoClip[];
  outroAudioBase64: string | null;
  outroWords: TimedWord[];
  workspace?: WorkspaceConversation;
  hookScript?: string;
  outroVoiceover?: string;
  productPayoff?: ProductPayoffInput;
  /** Which segments were synthesized in this cache batch. */
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
};

export function buildStudioVoFingerprint(input: {
  language: string;
  hookClips: HookClipInput[];
  workspace: WorkspaceConversation;
  productPayoff?: ProductPayoffInput | null;
  outroVoiceover: string;
  outroPhraseMuted?: boolean[];
  includeHook?: boolean;
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
  outroPhraseGapSec?: number;
  outroMinHoldSec?: number;
  workspaceOutroGapSec?: number;
  aspectRatio?: string;
  hookVoiceId?: VoiceActorId;
  productPayoffVoiceId?: VoiceActorId;
  workspaceSpeakerAVoiceId?: VoiceActorId;
  workspaceSpeakerBVoiceId?: VoiceActorId;
  workspaceThirdSpeakerVoiceId?: VoiceActorId;
  workspaceSpeakerADelivery?: string;
  workspaceSpeakerBDelivery?: string;
  workspaceThirdSpeakerDelivery?: string;
  outroVoiceId?: VoiceActorId;
}): string {
  const includeHook = input.includeHook !== false;
  const includeWorkspace = input.includeWorkspace !== false;
  const includeOutro = input.includeOutro !== false;
  const includeProductPayoff =
    input.includeProductPayoff !== false && input.productPayoff?.enabled !== false;
  const speakerA = normalizeVoiceActorId(input.workspaceSpeakerAVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_A_VOICE);
  const speakerB = normalizeVoiceActorId(input.workspaceSpeakerBVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_B_VOICE);
  const routedWorkspace = includeWorkspace
    ? stampWorkspaceVoRouting(input.workspace, {
        speakerAVoiceId: speakerA,
        speakerBVoiceId: speakerB,
        thirdSpeakerVoiceId: input.workspaceThirdSpeakerVoiceId,
      })
    : input.workspace;
  return JSON.stringify({
    language: input.language,
    hook: includeHook ? input.hookClips.map((c) => c.sayLine.trim()) : [],
    workspace: includeWorkspace
      ? routedWorkspace.exchanges.map((ex) => ({
          original: ex.original.trim(),
          speaker: ex.speaker,
          originalLang: ex.originalLang,
          thirdSpeakerVoiceId: ex.thirdSpeakerVoiceId?.trim() || "",
        }))
      : [],
    productPayoff:
      includeProductPayoff && input.productPayoff?.sayLine
        ? input.productPayoff.sayLine.trim()
        : "",
    outro: includeOutro
      ? buildOutroSpokenForTts(input.outroVoiceover.trim(), input.outroPhraseMuted).trim()
      : "",
    includeHook,
    includeWorkspace,
    includeOutro,
    includeProductPayoff,
    outroPhraseGapSec: input.outroPhraseGapSec ?? DEFAULT_OUTRO_PHRASE_GAP_SEC,
    outroMinHoldSec: input.outroMinHoldSec ?? 0,
    workspaceOutroGapSec: input.workspaceOutroGapSec ?? 0,
    aspectRatio: input.aspectRatio ?? "9:16",
    hookVoiceId: normalizeVoiceActorId(input.hookVoiceId),
    productPayoffVoiceId: normalizeVoiceActorId(
      input.productPayoffVoiceId ?? input.hookVoiceId,
    ),
    workspaceSpeakerAVoiceId: speakerA,
    workspaceSpeakerBVoiceId: speakerB,
    workspaceSpeakerADelivery: input.workspaceSpeakerADelivery ?? "professional",
    workspaceSpeakerBDelivery: input.workspaceSpeakerBDelivery ?? "hesitant_lep",
    workspaceThirdSpeakerDelivery: input.workspaceThirdSpeakerDelivery ?? "professional",
    outroVoiceId: normalizeVoiceActorId(input.outroVoiceId),
  });
}

/** Hook lines in editor match the hook lines baked into a voiceover fingerprint. */
export function hookLinesMatchFingerprint(
  editor: HookClipInput[],
  fingerprint: string | undefined,
): boolean {
  if (!fingerprint) return false;
  try {
    const fp = JSON.parse(fingerprint) as { hook?: string[] };
    if (!Array.isArray(fp.hook) || fp.hook.length !== editor.length) return false;
    return editor.every((c, i) => c.sayLine.trim() === (fp.hook![i]?.trim() ?? ""));
  } catch {
    return false;
  }
}

/** Cached VO must include audio for every segment the user wants in the reel. */
export function studioVoiceoverCoversSelection(
  vo: StudioVoiceoverResult | null | undefined,
  opts: {
    includeHook?: boolean;
    includeWorkspace: boolean;
    includeOutro: boolean;
    includeProductPayoff?: boolean;
    workspaceExchanges?: Array<{ original?: string }>;
  },
): boolean {
  if (!vo) return false;
  const wantHook = opts.includeHook === true;
  const wantPayoff = opts.includeProductPayoff === true;
  const hasHook = vo.hookVoClips.some((c) => !!c.audioBase64);
  const hasWorkspace = vo.workspaceVoClips.some((c) => !!c.audioBase64);
  const hasPayoff = !!vo.productPayoffVoClip?.audioBase64;
  const hasOutro = !!vo.outroAudioBase64;
  if (!wantHook && !opts.includeWorkspace && !wantPayoff && !opts.includeOutro) return false;
  if (wantHook && !hasHook) return false;
  // Workspace-only reels: any workspace audio is enough (do not block on exchange-index drift).
  if (opts.includeWorkspace && !hasWorkspace) return false;
  if (wantPayoff && !hasPayoff) return false;
  // Outro often arrives as phrase clips / canonical EN file — never block preview/download.
  return hasHook || hasWorkspace || hasPayoff || hasOutro || opts.includeOutro;
}

/** Build a library/preview package from voiceover alone (no Pexels/Veo needed). */
export function studioPackageFromVoiceover(
  vo: StudioVoiceoverResult,
  opts: {
    language: string;
    series: string;
    workspace: WorkspaceConversation;
    hookClips: HookClipInput[];
    productPayoff?: ProductPayoffInput | null;
    outroVoiceover: string;
    outroCopy?: UniversalOutroCopy;
    includeHook: boolean;
    includeWorkspace: boolean;
    includeOutro: boolean;
    includeProductPayoff: boolean;
  },
): GeneratedReelResult {
  const hookScript = opts.includeHook
    ? opts.hookClips
        .map((c) => c.sayLine.trim())
        .filter(Boolean)
        .join(" ")
    : "";
  const storyboard: GeneratedStoryboard = {
    hookScript,
    hookScenes: opts.includeHook ? opts.hookClips.map((c) => c.scenario.trim()) : [],
    workspace: opts.workspace,
    productPayoff: opts.includeProductPayoff ? opts.productPayoff ?? undefined : undefined,
    outroVoiceover: opts.outroVoiceover,
    outroCopy: opts.outroCopy,
  };
  return {
    prompt: hookScript || "workspace reel",
    language: opts.language,
    series: opts.series,
    storyboard,
    storyboardEn: storyboard,
    footageUrls: [],
    hookVoClips: opts.includeHook ? vo.hookVoClips : [],
    hookDurationSec: opts.includeHook ? vo.hookDurationSec : 0,
    productPayoffVoClip: opts.includeProductPayoff ? vo.productPayoffVoClip ?? null : null,
    productPayoffDurationSec: opts.includeProductPayoff ? vo.productPayoffDurationSec : 0,
    audioBase64: vo.audioBase64,
    words: vo.words,
    workspaceVoClips: opts.includeWorkspace ? vo.workspaceVoClips : [],
    outroAudioBase64: opts.includeOutro ? vo.outroAudioBase64 : null,
    outroWords: opts.includeOutro ? vo.outroWords : [],
    includeHook: opts.includeHook,
    includeWorkspace: opts.includeWorkspace,
    includeOutro: opts.includeOutro,
    includeProductPayoff: opts.includeProductPayoff,
    providerStatus: {
      storyboard: "ok",
      footage: opts.includeHook ? "skipped" : "skipped",
      voice: "ok",
    },
    createdAt: Date.now(),
  };
}

function normalizeOutroPhraseClips(raw: unknown): OutroPhraseClip[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof (c as OutroPhraseClip).audioBase64 === "string" &&
        (c as OutroPhraseClip).audioBase64.length > 0,
    )
    .map((c) => {
      const clip = c as OutroPhraseClip;
      return {
        audioBase64: clip.audioBase64,
        words: normalizeWordTimestamps(clip.words as TimedWord[] | undefined),
        durationSec:
          typeof clip.durationSec === "number" && clip.durationSec > 0
            ? clip.durationSec
            : clipDurationFromWords(clip.words ?? []),
      };
    });
}

async function parseVoiceoverResponse(
  data: Record<string, unknown>,
  fingerprint: string,
  outroPhraseGapSec: number,
): Promise<StudioVoiceoverResult> {
  const hookVoClips = normalizeHookVoClips(data.hookVoClips);
  const hookDurationSec =
    typeof data.hookDurationSec === "number" && data.hookDurationSec > 0
      ? data.hookDurationSec
      : computeHookDurationSec(hookVoClips);
  const wsRaw = data.workspace;
  const workspace =
    wsRaw && typeof wsRaw === "object"
      ? applyInterpreterSpeakerPattern(wsRaw as WorkspaceConversation)
      : undefined;
  const base: StudioVoiceoverResult = {
    fingerprint,
    hookVoClips,
    hookDurationSec,
    productPayoffVoClip: normalizeProductPayoffVoClip(data.productPayoffVoClip),
    productPayoffDurationSec:
      typeof data.productPayoffDurationSec === "number" ? data.productPayoffDurationSec : undefined,
    audioBase64: typeof data.audioBase64 === "string" && data.audioBase64 ? data.audioBase64 : null,
    words: normalizeWordTimestamps(
      data.words as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    workspaceVoClips: Array.isArray(data.workspaceVoClips)
      ? (data.workspaceVoClips as WorkspaceVoClip[]).filter(
          (c) => c && typeof c.audioBase64 === "string" && typeof c.startSec === "number",
        ).map((c, i) => ({
          audioBase64: c.audioBase64,
          startSec: c.startSec,
          durationSec: typeof c.durationSec === "number" ? c.durationSec : undefined,
          words: c.words ? normalizeWordTimestamps(c.words as TimedWord[]) : undefined,
          exchangeIndex:
            typeof c.exchangeIndex === "number" && c.exchangeIndex >= 0 ? c.exchangeIndex : i,
        }))
      : [],
    outroAudioBase64:
      typeof data.outroAudioBase64 === "string" && data.outroAudioBase64
        ? data.outroAudioBase64
        : null,
    outroWords: normalizeWordTimestamps(
      data.outroWords as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    workspace,
    hookScript: typeof data.hookScript === "string" ? data.hookScript : undefined,
    outroVoiceover: typeof data.outroVoiceover === "string" ? data.outroVoiceover : undefined,
    productPayoff: normalizeProductPayoffInput(data.productPayoff),
    includeProductPayoff:
      typeof data.includeProductPayoff === "boolean" ? data.includeProductPayoff : undefined,
  };

  const phraseClips = normalizeOutroPhraseClips(data.outroPhraseClips);
  try {
    if (phraseClips.length > 1) {
      const stitched = await stitchOutroPhraseClipsToBase64(phraseClips, outroPhraseGapSec);
      base.outroAudioBase64 = stitched.audioBase64;
      base.outroWords = normalizeWordTimestamps(stitched.words);
    } else if (phraseClips.length === 1 && !base.outroAudioBase64) {
      base.outroAudioBase64 = phraseClips[0]!.audioBase64;
      base.outroWords = normalizeWordTimestamps(phraseClips[0]!.words);
    }
  } catch (e) {
    console.warn("[voiceover] outro phrase stitch failed — using first phrase / canonical", e);
    if (!base.outroAudioBase64 && phraseClips[0]?.audioBase64) {
      base.outroAudioBase64 = phraseClips[0].audioBase64;
      base.outroWords = normalizeWordTimestamps(phraseClips[0].words);
    }
  }

  return base;
}

/** POST /api/reel-builder/voiceover — all hook + workspace + outro TTS in one batch. */
export async function generateStudioVoiceover(body: {
  hookClips: HookClipInput[];
  workspace: WorkspaceConversation;
  productPayoff?: ProductPayoffInput | null;
  language: string;
  sourceLang?: string;
  targetLang?: string;
  outroVoiceover: string;
  includeHook?: boolean;
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
  outroPhraseGapSec?: number;
  outroMinHoldSec?: number;
  fingerprint: string;
  hookVoiceId?: VoiceActorId;
  productPayoffVoiceId?: VoiceActorId;
  workspaceSpeakerAVoiceId?: VoiceActorId;
  workspaceSpeakerBVoiceId?: VoiceActorId;
  workspaceThirdSpeakerVoiceId?: VoiceActorId;
  workspaceSpeakerADelivery?: string;
  workspaceSpeakerBDelivery?: string;
  workspaceThirdSpeakerDelivery?: string;
  outroVoiceId?: VoiceActorId;
}): Promise<StudioVoiceoverResult> {
  const phraseGap = body.outroPhraseGapSec ?? DEFAULT_OUTRO_PHRASE_GAP_SEC;
  const speakerA = normalizeVoiceActorId(body.workspaceSpeakerAVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_A_VOICE);
  const speakerB = normalizeVoiceActorId(body.workspaceSpeakerBVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_B_VOICE);
  const routedWorkspace = stampWorkspaceVoRouting(body.workspace, {
    speakerAVoiceId: speakerA,
    speakerBVoiceId: speakerB,
    thirdSpeakerVoiceId: body.workspaceThirdSpeakerVoiceId,
  });
  const payload = {
    ...body,
    workspace: routedWorkspace,
    workspaceSpeakerAVoiceId: speakerA,
    workspaceSpeakerBVoiceId: speakerB,
    outroPhraseGapSec: phraseGap,
  };

  let res: Response;
  try {
    res = await fetch("/api/reel-builder/voiceover", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    return generateStudioVoiceoverViaTts(payload);
  }

  if ([404, 500, 502, 503].includes(res.status)) {
    try {
      return await generateStudioVoiceoverViaTts(payload);
    } catch {
      /* fall through to surfaced batch error */
    }
  }

  if (!res.ok) {
    const raw = await res.text();
    let err: { error?: string } = {};
    try {
      err = JSON.parse(raw) as { error?: string };
    } catch {
      /* non-JSON body — often Vite proxy when api-server is down */
    }
    const hint = voiceoverErrorHint(res.status, err.error, raw);
    throw new Error((err.error || `Voiceover failed (${res.status})`) + hint);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const parsed = await parseVoiceoverResponse(data, body.fingerprint, phraseGap);
  return {
    ...parsed,
    includeWorkspace: body.includeWorkspace !== false,
    includeOutro: body.includeOutro !== false,
    includeProductPayoff: body.includeProductPayoff !== false,
  };
}

function voiceoverErrorHint(status: number, errMsg?: string, rawBody = ""): string {
  const lower = `${errMsg ?? ""} ${rawBody}`.toLowerCase();
  if (status === 400 && lower.includes("workspace exchange")) {
    return " — add workspace dialogue or uncheck “Include workspace dialogue”";
  }
  if (status === 502 && lower.includes("elevenlabs")) {
    return " — check ElevenLabs key/quota or try a different speaker";
  }
  if (status === 500 && !errMsg) {
    return " — start api-server on :8787 (cd artifacts/api-server && npm run build && NODE_ENV=development node dist/index.mjs)";
  }
  if (status === 404) {
    return " — restart api-server after npm run build in artifacts/api-server";
  }
  return "";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function clipDurationFromWords(words: TimedWord[], speechDuration?: number): number {
  if (words.length > 0) {
    const end = words[words.length - 1]!.end;
    return Math.max(0.35, end);
  }
  if (speechDuration != null && speechDuration > 0) return speechDuration;
  return 2;
}

/** Fallback when POST /voiceover is missing — uses existing /tts per line (same ElevenLabs path). */
async function generateStudioVoiceoverViaTts(body: {
  hookClips: HookClipInput[];
  workspace: WorkspaceConversation;
  productPayoff?: ProductPayoffInput | null;
  language: string;
  outroVoiceover: string;
  includeHook?: boolean;
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
  outroPhraseGapSec?: number;
  fingerprint: string;
  hookVoiceId?: VoiceActorId;
  productPayoffVoiceId?: VoiceActorId;
  workspaceSpeakerAVoiceId?: VoiceActorId;
  workspaceSpeakerBVoiceId?: VoiceActorId;
  workspaceThirdSpeakerVoiceId?: VoiceActorId;
  workspaceSpeakerADelivery?: string;
  workspaceSpeakerBDelivery?: string;
  workspaceThirdSpeakerDelivery?: string;
  outroVoiceId?: VoiceActorId;
}): Promise<StudioVoiceoverResult> {
  const { synthesizeVoiceover } = await import("@/lib/reelBuilderApi");
  const hookVoice = normalizeVoiceActorId(body.hookVoiceId);
  const payoffVoice = normalizeVoiceActorId(body.productPayoffVoiceId ?? body.hookVoiceId);
  const speakerA = normalizeVoiceActorId(body.workspaceSpeakerAVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_A_VOICE);
  const speakerB = normalizeVoiceActorId(body.workspaceSpeakerBVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_B_VOICE);
  const outroVoice = normalizeVoiceActorId(body.outroVoiceId);
  const includeHook = body.includeHook !== false;
  const includeWorkspace = body.includeWorkspace !== false;
  const includeOutro = body.includeOutro !== false;
  const includeProductPayoff =
    body.includeProductPayoff !== false && body.productPayoff?.enabled !== false && !!body.productPayoff;
  const speakerADelivery = body.workspaceSpeakerADelivery ?? "professional";
  const speakerBDelivery = body.workspaceSpeakerBDelivery ?? "hesitant_lep";
  const thirdDelivery = body.workspaceThirdSpeakerDelivery ?? "professional";
  const workspace = stampWorkspaceVoRouting(body.workspace, {
    speakerAVoiceId: speakerA,
    speakerBVoiceId: speakerB,
    thirdSpeakerVoiceId: body.workspaceThirdSpeakerVoiceId,
  });

  const hookVoClips: HookVoClip[] = [];
  let cursor = 0;
  if (includeHook) {
    for (const clip of body.hookClips) {
      const syn = await synthesizeVoiceover(
        clip.sayLine,
        hookVoice,
        1,
        body.language !== "en" ? body.language : undefined,
      );
      const durationSec = clipDurationFromWords(syn.words, syn.speechDuration);
      hookVoClips.push({
        audioBase64: await blobToBase64(syn.blob),
        startSec: cursor,
        durationSec,
        footageUrl: "",
        sayLine: clip.sayLine,
        scenario: clip.scenario,
        words: syn.words,
      });
      cursor += durationSec;
    }
  }

  const workspaceVoClips: WorkspaceVoClip[] = [];
  if (includeWorkspace) {
    const workspaceRaw: Array<{
      audioBase64: string;
      words: TimedWord[];
      exchangeIndex: number;
    }> = [];
    for (let exIdx = 0; exIdx < workspace.exchanges.length; exIdx++) {
      const ex = workspace.exchanges[exIdx]!;
      const line = ex.original?.trim();
      if (!line) continue;
      const isThird = !!ex.thirdSpeakerVoiceId?.trim() || ex.speaker === "C";
      const lineVoice = isThird
        ? normalizeVoiceActorId(ex.thirdSpeakerVoiceId)
        : ex.speaker === "B"
          ? speakerB
          : speakerA;
      const delivery = isThird
        ? thirdDelivery
        : ex.speaker === "B"
          ? speakerBDelivery
          : speakerADelivery;
      try {
        const syn = await synthesizeVoiceover(line, lineVoice, 1, ex.originalLang, delivery);
        workspaceRaw.push({
          audioBase64: await blobToBase64(syn.blob),
          words: syn.words,
          exchangeIndex: exIdx,
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        throw new Error(
          `Workspace exchange ${exIdx + 1} voiceover failed (${lineVoice}): ${detail}. Try a different speaker voice.`,
        );
      }
    }
    const needed = workspace.exchanges.filter((ex) => ex.original?.trim()).length;
    if (needed > 0 && workspaceRaw.length < needed) {
      throw new Error(
        "Workspace voiceover incomplete — every dialogue line with ORIGINAL text needs audio. Regenerate voiceover.",
      );
    }
    if (workspaceRaw.length > 0) {
      const { packWorkspaceVoClipsMeta } = await import("@/lib/workspaceVoSync");
      workspaceVoClips.push(...packWorkspaceVoClipsMeta(workspaceRaw, workspace.exchanges));
    }
  }

  let productPayoffVoClip: ProductPayoffVoClip | null = null;
  let productPayoffDurationSec = 0;
  if (includeProductPayoff && body.productPayoff?.sayLine.trim()) {
    const syn = await synthesizeVoiceover(
      body.productPayoff.sayLine.trim(),
      payoffVoice,
      1,
      body.language !== "en" ? body.language : undefined,
    );
    const durationSec = clipDurationFromWords(syn.words, syn.speechDuration);
    productPayoffVoClip = {
      audioBase64: await blobToBase64(syn.blob),
      startSec: 0,
      durationSec,
      footageUrl: "",
      sayLine: body.productPayoff.sayLine.trim(),
      scenario: body.productPayoff.scenario.trim(),
      headline: body.productPayoff.headline,
      supportingText: body.productPayoff.supportingText,
      words: syn.words,
    };
    productPayoffDurationSec = durationSec + 0.08;
  }

  let outroAudioBase64: string | null = null;
  let outroWords: TimedWord[] = [];
  if (includeOutro && body.outroVoiceover.trim()) {
    const lang = body.language !== "en" ? body.language : "en";
    const spoken = formatOutroForSingleTts(
      body.outroVoiceover,
      body.outroPhraseGapSec ?? DEFAULT_OUTRO_PHRASE_GAP_SEC,
    );
    const syn = await synthesizeVoiceover(spoken, outroVoice, 1, lang);
    outroAudioBase64 = await blobToBase64(syn.blob);
    outroWords = syn.words;
  }

  if (hookVoClips.length === 0 && workspaceVoClips.length === 0) {
    throw new Error(
      "Voiceover synthesis failed — set ELEVENLABS_API_KEY on api-server and restart it",
    );
  }

  const hookDurationSec =
    hookVoClips.length > 0
      ? hookVoClips[hookVoClips.length - 1]!.startSec + hookVoClips[hookVoClips.length - 1]!.durationSec
      : 10;
  const words = normalizeWordTimestamps(
    hookVoClips.flatMap((c) =>
      c.words.map((w) => ({
        word: w.word,
        start: w.start + c.startSec,
        end: w.end + c.startSec,
      })),
    ),
  );

  return {
    fingerprint: body.fingerprint,
    hookVoClips,
    hookDurationSec,
    productPayoffVoClip,
    productPayoffDurationSec,
    audioBase64: hookVoClips[0]?.audioBase64 ?? null,
    words,
    workspaceVoClips,
    outroAudioBase64,
    outroWords,
    workspace,
    hookScript: body.hookClips.map((c) => c.sayLine).join(" "),
    outroVoiceover: body.outroVoiceover,
    productPayoff: body.productPayoff ?? undefined,
    includeWorkspace: body.includeWorkspace !== false,
    includeOutro: body.includeOutro !== false,
    includeProductPayoff,
  };
}

export type TranslateStudioReelResult = {
  targetLanguage: string;
  hookClips: HookClipInput[];
  hookScript: string;
  hookVoClips: HookVoClip[];
  hookDurationSec: number;
  audioBase64: string | null;
  words: TimedWord[];
  productPayoff?: ProductPayoffInput;
  productPayoffVoClip?: ProductPayoffVoClip | null;
  productPayoffDurationSec?: number;
  outroAudioBase64: string | null;
  outroWords: TimedWord[];
  outroVoiceover: string;
  outroCopy?: UniversalOutroCopy;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
};

/** POST /api/reel-builder/translate-reel — hook + outro only; workspace stays untouched. */
export async function translateStudioReel(body: {
  targetLanguage: string;
  hookClips: HookClipInput[];
  outroVoiceover: string;
  workspace: WorkspaceConversation;
  productPayoff?: ProductPayoffInput | null;
  sourceLang?: string;
  targetLang?: string;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
  outroPhraseGapSec?: number;
  hookVoiceId?: VoiceActorId;
  outroVoiceId?: VoiceActorId;
}): Promise<TranslateStudioReelResult> {
  const res = await fetch("/api/reel-builder/translate-reel", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const hint =
      res.status === 500 && !err.error
        ? " — API server not reachable on :8787 (restart api-server)"
        : "";
    throw new Error((err.error || `Translate reel failed (${res.status})`) + hint);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const hookVoClips = normalizeHookVoClips(data.hookVoClips);
  const hookDurationSec =
    typeof data.hookDurationSec === "number" && data.hookDurationSec > 0
      ? data.hookDurationSec
      : computeHookDurationSec(hookVoClips);
  const hookClipsRaw = Array.isArray(data.hookClips) ? data.hookClips : body.hookClips;
  const hookClips = hookClipsRaw
    .filter((c): c is HookClipInput => Boolean(c && typeof c === "object"))
    .map((c) => ({
      scenario: String((c as HookClipInput).scenario ?? "").trim(),
      sayLine: String((c as HookClipInput).sayLine ?? "").trim(),
    }));
  const outroCopyRaw = data.outroCopy;
  const outroCopy =
    outroCopyRaw && typeof outroCopyRaw === "object"
      ? (outroCopyRaw as UniversalOutroCopy)
      : undefined;
  return {
    targetLanguage: String(data.targetLanguage ?? body.targetLanguage),
    hookClips,
    hookScript: typeof data.hookScript === "string" ? data.hookScript : hookClips.map((c) => c.sayLine).join(" "),
    hookVoClips,
    hookDurationSec,
    audioBase64: typeof data.audioBase64 === "string" && data.audioBase64 ? data.audioBase64 : null,
    words: normalizeWordTimestamps(
      data.words as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    outroAudioBase64:
      typeof data.outroAudioBase64 === "string" && data.outroAudioBase64
        ? data.outroAudioBase64
        : null,
    outroWords: normalizeWordTimestamps(
      data.outroWords as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    outroVoiceover:
      typeof data.outroVoiceover === "string" && data.outroVoiceover.trim()
        ? data.outroVoiceover.trim()
        : body.outroVoiceover,
    outroCopy,
    includeOutro: body.includeOutro !== false,
    productPayoff: normalizeProductPayoffInput(data.productPayoff),
    productPayoffVoClip: normalizeProductPayoffVoClip(data.productPayoffVoClip),
    productPayoffDurationSec:
      typeof data.productPayoffDurationSec === "number" ? data.productPayoffDurationSec : undefined,
    includeProductPayoff:
      typeof data.includeProductPayoff === "boolean" ? data.includeProductPayoff : body.includeProductPayoff,
  };
}

/** Merge translated hook/outro VO with the English workspace audio from the original cache. */
export function mergeTranslatedStudioVoiceover(
  englishVo: StudioVoiceoverResult,
  translated: TranslateStudioReelResult,
  footageUrls: string[],
  opts: { includeOutro: boolean },
): StudioVoiceoverResult {
  const hookVoClips = translated.hookVoClips.map((clip, i) => ({
    ...clip,
    footageUrl: footageUrls[i] ?? clip.footageUrl,
  }));
  return {
    ...englishVo,
    hookVoClips,
    hookDurationSec: translated.hookDurationSec,
    audioBase64: translated.audioBase64,
    words: translated.words,
    workspaceVoClips: englishVo.workspaceVoClips,
    productPayoffVoClip: translated.productPayoffVoClip ?? englishVo.productPayoffVoClip,
    productPayoffDurationSec:
      translated.productPayoffDurationSec ?? englishVo.productPayoffDurationSec,
    outroAudioBase64: opts.includeOutro ? translated.outroAudioBase64 : null,
    outroWords: opts.includeOutro ? translated.outroWords : [],
    hookScript: translated.hookScript,
    outroVoiceover: translated.outroVoiceover,
    productPayoff: translated.productPayoff ?? englishVo.productPayoff,
    includeWorkspace: englishVo.includeWorkspace,
    includeOutro: opts.includeOutro,
  };
}

/** Attach cached voiceover + fresh hook footage to a skipVoice reel build. */
export function mergeStudioVoiceoverWithReel(
  reel: GeneratedReelResult,
  vo: StudioVoiceoverResult,
  opts: { includeWorkspace: boolean; includeOutro: boolean; includeProductPayoff?: boolean },
): GeneratedReelResult {
  const includeProductPayoff = opts.includeProductPayoff !== false;
  const hookVoClips = vo.hookVoClips.map((clip, i) => ({
    ...clip,
    footageUrl: i < reel.footageUrls.length ? (reel.footageUrls[i] ?? "") : "",
    durationSec:
      clip.durationSec > 0 ? clip.durationSec : clipDurationFromWords(clip.words),
  }));
  const hookDurationSec = resolveHookDurationSec(hookVoClips, vo.hookDurationSec);
  const productPayoffVoClip =
    includeProductPayoff && vo.productPayoffVoClip
      ? {
          ...vo.productPayoffVoClip,
          footageUrl: reel.productPayoffVoClip?.footageUrl ?? vo.productPayoffVoClip.footageUrl,
          footageStatus: reel.productPayoffVoClip?.footageStatus ?? vo.productPayoffVoClip.footageStatus,
        }
      : null;
  const productPayoffDurationSec = includeProductPayoff
    ? reel.productPayoffDurationSec ??
      vo.productPayoffDurationSec ??
      computeProductPayoffDurationSec(productPayoffVoClip, reel.storyboard.productPayoff?.sayLine)
    : 0;
  const hasVoice =
    hookVoClips.length > 0 ||
    (opts.includeWorkspace && vo.workspaceVoClips.length > 0) ||
    (includeProductPayoff && productPayoffVoClip?.audioBase64) ||
    (opts.includeOutro && vo.outroAudioBase64);
  return {
    ...reel,
    hookVoClips,
    hookDurationSec,
    productPayoffVoClip,
    productPayoffDurationSec,
    audioBase64: vo.audioBase64,
    words: vo.words,
    workspaceVoClips: opts.includeWorkspace ? vo.workspaceVoClips : [],
    outroAudioBase64: opts.includeOutro ? vo.outroAudioBase64 : null,
    outroWords: opts.includeOutro ? vo.outroWords : [],
    includeWorkspace: opts.includeWorkspace,
    includeOutro: opts.includeOutro,
    includeProductPayoff,
    providerStatus: {
      ...reel.providerStatus,
      voice: hasVoice ? "ok" : reel.providerStatus.voice ?? "unavailable",
    },
  };
}

function apiHeaders(): HeadersInit {
  const key = import.meta.env.VITE_REEL_BUILDER_API_KEY as string | undefined;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h["x-reel-builder-key"] = key;
  return h;
}

function normalizeStoryboard(raw: unknown, language: string): GeneratedStoryboard {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ws = (r.workspaceScript ?? r.workspace) as Record<string, unknown> | undefined;
  const sourceLang =
    (typeof ws?.sourceLang === "string" && ws.sourceLang) ||
    (language === "en" ? "en" : language);
  const targetLang =
    (typeof ws?.targetLang === "string" && ws.targetLang) ||
    (language === "en" ? "es" : "en");

  const workspace = migrateWorkspaceScript(
    ws as Parameters<typeof migrateWorkspaceScript>[0],
    sourceLang,
    targetLang,
  );

  const outroVoiceover =
    (typeof r.outroVoiceover === "string" && r.outroVoiceover.trim()) ||
    buildLockedOutroVoiceover();

  return {
    hookScript: String(r.hookScript ?? "").trim(),
    hookScenes: Array.isArray(r.hookScenes)
      ? r.hookScenes.map(String).filter(Boolean)
      : [],
    workspace: normalizeConversation(workspace),
    productPayoff: normalizeProductPayoffInput(r.productPayoff),
    outroVoiceover,
    outroCopy: r.outroCopy ? (r.outroCopy as UniversalOutroCopy) : undefined,
  };
}

export function defaultProductPayoff(series = "medical"): ProductPayoffInput {
  const benefits: Record<string, string> = {
    medical:
      "InterpreterAI keeps both sides of the conversation clear in real time, so you can stay focused on interpreting instead of trying to keep up.",
    legal:
      "See original speech and translation together — so you never lose legal nuance mid-deposition.",
    conference:
      "Follow both sides of the conversation without constantly switching between screens.",
    immigration:
      "Keep terminology visible while interpreting — so nothing gets lost in a high-stakes interview.",
    education:
      "Spend less time trying to catch every word and more time helping students participate.",
  };
  return {
    sayLine: benefits[series] ?? benefits.medical!,
    scenario:
      "Professional interpreter confidently continuing a remote call, premium SaaS commercial close-up. Use PRODUCT_SCREEN_RECORDING for the workspace portion; Pexels stock for the human payoff shot.",
    enabled: true,
  };
}

export function normalizeProductPayoffInput(raw: unknown): ProductPayoffInput | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const sayLine = String(o.sayLine ?? "").trim();
  const scenario = String(o.scenario ?? "").trim();
  if (!sayLine || !scenario) return undefined;
  return {
    sayLine,
    scenario,
    headline: typeof o.headline === "string" ? o.headline.trim() : undefined,
    supportingText: typeof o.supportingText === "string" ? o.supportingText.trim() : undefined,
    enabled: o.enabled !== false,
  };
}

function normalizeProductPayoffVoClip(raw: unknown): ProductPayoffVoClip | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const words = normalizeWordTimestamps(
    o.words as Array<{ word: string; start: number; end: number }> | undefined,
  );
  if (!o.audioBase64 && words.length === 0) return null;
  return {
    audioBase64: String(o.audioBase64 ?? ""),
    startSec: typeof o.startSec === "number" ? o.startSec : 0,
    durationSec: typeof o.durationSec === "number" ? o.durationSec : 0,
    footageUrl: String(o.footageUrl ?? ""),
    sayLine: String(o.sayLine ?? ""),
    scenario: String(o.scenario ?? ""),
    headline: typeof o.headline === "string" ? o.headline : undefined,
    supportingText: typeof o.supportingText === "string" ? o.supportingText : undefined,
    words,
    footageStatus: o.footageStatus as FootageSelectionStatus | undefined,
    pexelsVideoId: typeof o.pexelsVideoId === "number" ? o.pexelsVideoId : undefined,
    composition: typeof o.composition === "string" ? o.composition : undefined,
  };
}

/** POST /api/reel-builder/generate — validates + normalizes the response. */
export async function generateReel(body: {
  prompt?: string;
  hookClips?: HookClipInput[];
  workspace?: WorkspaceConversation;
  language: string;
  series: string;
  sourceLang?: string;
  targetLang?: string;
  skipVoice?: boolean;
  includeHook?: boolean;
  includeWorkspace?: boolean;
  includeOutro?: boolean;
  includeProductPayoff?: boolean;
  outroVoiceover?: string;
  productPayoff?: ProductPayoffInput;
  footageProvider?: HookFootageProvider;
}): Promise<GeneratedReelResult> {
  const includeHook = body.includeHook !== false;
  const res = await fetch("/api/reel-builder/generate", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    const hint =
      res.status === 500 && !err.error
        ? " — API server not reachable on :8787 (restart api-server)"
        : "";
    throw new Error((err.error || `Generate failed (${res.status})`) + hint);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const language = String(data.language ?? body.language);
  const storyboard = normalizeStoryboard(data.storyboard, language);
  if (includeHook && !storyboard.hookScript) {
    throw new Error("Generate API returned an empty storyboard");
  }
  const storyboardEn = data.storyboardEn
    ? normalizeStoryboard(data.storyboardEn, "en")
    : storyboard;

  if (language !== "en" && !storyboard.outroCopy) {
    storyboard.outroCopy = resolveUniversalOutroCopy({
      outroVoiceover: storyboard.outroVoiceover,
    });
  }

  const hookVoClips = normalizeHookVoClips(data.hookVoClips);
  const hookDurationSec =
    typeof data.hookDurationSec === "number" && data.hookDurationSec > 0
      ? data.hookDurationSec
      : computeHookDurationSec(hookVoClips);

  const clipCount = Math.max(
    body.hookClips?.length ?? 0,
    hookVoClips.length,
    Array.isArray(data.footageUrls) ? data.footageUrls.length : 0,
  );
  const footageUrls = Array.from({ length: clipCount }, (_, i) => {
    if (Array.isArray(data.footageUrls) && i < data.footageUrls.length) {
      return String(data.footageUrls[i] ?? "");
    }
    return hookVoClips[i]?.footageUrl ?? "";
  });

  const productPayoffVoClip = normalizeProductPayoffVoClip(data.productPayoffVoClip);
  const productPayoffDurationSec =
    typeof data.productPayoffDurationSec === "number" && data.productPayoffDurationSec > 0
      ? data.productPayoffDurationSec
      : computeProductPayoffDurationSec(productPayoffVoClip, storyboard.productPayoff?.sayLine, language);

  return {
    prompt: String(data.prompt ?? body.prompt ?? ""),
    language,
    series: String(data.series ?? body.series),
    storyboard,
    storyboardEn,
    footageUrls,
    hookVoClips,
    hookDurationSec,
    productPayoffVoClip,
    productPayoffDurationSec,
    audioBase64: typeof data.audioBase64 === "string" && data.audioBase64 ? data.audioBase64 : null,
    words: normalizeWordTimestamps(
      data.words as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    workspaceVoClips: Array.isArray(data.workspaceVoClips)
      ? (data.workspaceVoClips as WorkspaceVoClip[]).filter(
          (c) => c && typeof c.audioBase64 === "string" && typeof c.startSec === "number",
        ).map((c, i) => ({
          audioBase64: c.audioBase64,
          startSec: c.startSec,
          durationSec: typeof c.durationSec === "number" ? c.durationSec : undefined,
          words: c.words ? normalizeWordTimestamps(c.words as TimedWord[]) : undefined,
          exchangeIndex:
            typeof c.exchangeIndex === "number" && c.exchangeIndex >= 0 ? c.exchangeIndex : i,
        }))
      : [],
    outroAudioBase64:
      typeof data.outroAudioBase64 === "string" && data.outroAudioBase64
        ? data.outroAudioBase64
        : null,
    outroWords: normalizeWordTimestamps(
      data.outroWords as Array<{ word: string; start: number; end: number }> | undefined,
    ),
    includeWorkspace:
      typeof data.includeWorkspace === "boolean"
        ? data.includeWorkspace
        : body.includeWorkspace !== false,
    includeOutro:
      typeof data.includeOutro === "boolean" ? data.includeOutro : body.includeOutro !== false,
    includeProductPayoff:
      typeof data.includeProductPayoff === "boolean"
        ? data.includeProductPayoff
        : body.includeProductPayoff !== false,
    includeHook:
      typeof data.includeHook === "boolean" ? data.includeHook : body.includeHook !== false,
    providerStatus:
      data.providerStatus && typeof data.providerStatus === "object"
        ? (data.providerStatus as ProviderStatus)
        : {},
    createdAt: Date.now(),
  };
}

function normalizeHookVoClips(raw: unknown): HookVoClip[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const words = normalizeWordTimestamps(
        o.words as Array<{ word: string; start: number; end: number }> | undefined,
      );
      return {
        audioBase64: String(o.audioBase64 ?? ""),
        startSec: typeof o.startSec === "number" ? o.startSec : 0,
        durationSec: typeof o.durationSec === "number" ? o.durationSec : 0,
        footageUrl: String(o.footageUrl ?? ""),
        sayLine: String(o.sayLine ?? ""),
        scenario: String(o.scenario ?? ""),
        words,
        footageStatus: o.footageStatus as FootageSelectionStatus | undefined,
        pexelsVideoId: typeof o.pexelsVideoId === "number" ? o.pexelsVideoId : undefined,
        composition: typeof o.composition === "string" ? o.composition : undefined,
      };
    })
    .filter((c) => c.audioBase64 && c.durationSec > 0);
}

export { base64ToBlob, type StitchClip } from "@/lib/reelBlobUtils";

/**
 * If voiceover runs longer than its segment, trim with fade-out so it never bleeds.
 */
export async function trimBlobToDuration(
  blob: Blob,
  maxSec: number,
  fadeSec = 0.35,
): Promise<Blob> {
  if (!blob || blob.size === 0 || maxSec <= 0) return blob;
  try {
    const probe = new AudioContext();
    const decoded = await probe.decodeAudioData((await blob.arrayBuffer()).slice(0));
    void probe.close();
    if (decoded.duration <= maxSec + 0.05) return blob;

    const rate = decoded.sampleRate;
    const samples = Math.floor(maxSec * rate);
    const offline = new OfflineAudioContext(1, samples, rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    const gain = offline.createGain();
    gain.gain.setValueAtTime(1, 0);
    gain.gain.setValueAtTime(1, Math.max(0, maxSec - fadeSec));
    gain.gain.linearRampToValueAtTime(0, maxSec);
    src.connect(gain);
    gain.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  } catch {
    return blob;
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const dataLength = samples.length * 2;
  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

export function hookClipsForStitch(clips: HookVoClip[]): StitchClip[] {
  let cursor = 0;
  const out: StitchClip[] = [];
  for (const c of clips) {
    if (!c.audioBase64) continue;
    const words = normalizeWordTimestamps(c.words);
    const durationSec = speechTrimSecFromWords(words, c.durationSec ?? 2);
    out.push({
      blob: base64ToBlob(c.audioBase64),
      startSec: cursor,
      durationSec,
      words,
    });
    cursor += durationSec;
  }
  return out;
}

function trimDecodedBuffer(decoded: AudioBuffer, maxSec: number): AudioBuffer {
  const rate = decoded.sampleRate;
  const len = Math.min(decoded.length, Math.max(1, Math.ceil(maxSec * rate)));
  const out = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: rate });
  const src = decoded.getChannelData(0);
  const dst = out.getChannelData(0);
  for (let i = 0; i < len; i++) dst[i] = src[i]!;
  const fadeInSamples = Math.min(len, Math.floor(0.012 * rate));
  const fadeOutSamples = Math.min(len, Math.floor(0.035 * rate));
  for (let i = 0; i < fadeInSamples; i++) {
    dst[i]! *= (i + 1) / fadeInSamples;
  }
  for (let i = 0; i < fadeOutSamples; i++) {
    dst[len - 1 - i]! *= (i + 1) / fadeOutSamples;
  }
  return out;
}
/**
 * Stitch timed VO clips into one segment-length buffer (hook/workspace/outro export + preview).
 * Trims each clip to durationSec so trailing TTS silence/artifacts never bleed into the next line.
 */
export async function stitchSegmentClips(
  clips: StitchClip[],
  totalSec: number,
  sampleRate = 48000,
): Promise<Blob | undefined> {
  if (clips.length === 0 || totalSec <= 0) return undefined;
  try {
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(totalSec * sampleRate),
      sampleRate,
    );
    let placed = false;
    for (const clip of clips) {
      if (!clip.blob || clip.blob.size === 0) continue;
      try {
        const decoded = await offline.decodeAudioData(
          (await clip.blob.arrayBuffer()).slice(0),
        );
        const words = clip.words?.length ? normalizeWordTimestamps(clip.words) : [];
        const buffer =
          words.length > 0
            ? trimBufferToSpeechWindow(decoded, words, clip.durationSec ?? decoded.duration)
            : trimDecodedBuffer(
                decoded,
                clip.durationSec && clip.durationSec > 0 ? clip.durationSec : decoded.duration,
              );
        const src = offline.createBufferSource();
        src.buffer = buffer;
        src.connect(offline.destination);
        src.start(Math.max(0, clip.startSec));
        placed = true;
      } catch {
        /* skip bad clip */
      }
    }
    if (!placed) return undefined;
    return audioBufferToWav(await offline.startRendering());
  } catch {
    return undefined;
  }
}

/**
 * One continuous 32s voiceover: hook (0–10s) → workspace (10–25s) → outro (25–32s).
 * Eliminates dead air at segment boundaries when each piece is trimmed/packed to fit.
 */
export async function buildContinuousReelVoiceover(opts: {
  hook?: Blob;
  hookClips?: StitchClip[];
  hookSec?: number;
  workspaceClips: StitchClip[];
  workspaceSec?: number;
  productPayoff?: Blob;
  productPayoffSec?: number;
  outro?: Blob;
  includeOutro?: boolean;
  includeWorkspace?: boolean;
  includeProductPayoff?: boolean;
  includeHook?: boolean;
  outroSec?: number;
  workspaceOutroGapSec?: number;
}): Promise<Blob | undefined> {
  const includeHook = opts.includeHook !== false;
  const hookDuration = includeHook ? (opts.hookSec ?? REEL_HOOK_SEC) : 0;
  const workspaceSec =
    opts.workspaceSec ??
    computeWorkspaceDurationSec(
      opts.workspaceClips.map((c) => ({ startSec: c.startSec, durationSec: undefined })),
    );
  const includeOutro = opts.includeOutro !== false;
  const includeWorkspace = opts.includeWorkspace !== false;
  const includeProductPayoff = opts.includeProductPayoff !== false;
  const productPayoffSec =
    includeProductPayoff && opts.productPayoffSec && opts.productPayoffSec > 0
      ? opts.productPayoffSec
      : 0;
  const outroSec = opts.outroSec ?? REEL_OUTRO_SEC;
  const gapSec =
    includeOutro && typeof opts.workspaceOutroGapSec === "number" && opts.workspaceOutroGapSec > 0
      ? opts.workspaceOutroGapSec
      : 0;
  const outroStart =
    hookDuration + (includeWorkspace ? workspaceSec : 0) + productPayoffSec + gapSec;
  const totalSec = computeReelTotalSec(
    hookDuration,
    workspaceSec,
    includeOutro,
    includeWorkspace,
    outroSec,
    productPayoffSec,
    includeProductPayoff,
    includeHook,
    gapSec,
  );

  const hookBlob =
    includeHook && opts.hookClips && opts.hookClips.length > 0
      ? await stitchSegmentClips(opts.hookClips, hookDuration)
      : includeHook && opts.hook
        ? await trimBlobToDuration(opts.hook, hookDuration)
        : undefined;
  const workspaceBlob =
    opts.workspaceClips.length > 0
      ? await stitchSegmentClips(opts.workspaceClips, workspaceSec)
      : undefined;
  const outroBlob = opts.outro
    ? await trimBlobToDuration(opts.outro, outroSec)
    : undefined;

  const timeline: { blob: Blob; startSec: number }[] = [];
  if (includeHook && hookBlob && hookBlob.size > 0) timeline.push({ blob: hookBlob, startSec: 0 });
  if (includeWorkspace && workspaceBlob && workspaceBlob.size > 0) {
    timeline.push({ blob: workspaceBlob, startSec: hookDuration });
  }
  if (includeProductPayoff && opts.productPayoff && opts.productPayoff.size > 0) {
    timeline.push({
      blob: await trimBlobToDuration(opts.productPayoff, productPayoffSec),
      startSec: hookDuration + (includeWorkspace ? workspaceSec : 0),
    });
  }
  if (includeOutro && outroBlob && outroBlob.size > 0) {
    timeline.push({ blob: outroBlob, startSec: outroStart });
  }

  return stitchSegmentClips(timeline, totalSec);
}
