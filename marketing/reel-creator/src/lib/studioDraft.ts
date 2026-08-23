/**
 * Per-reel Creative Studio drafts — survives refresh and distinguishes
 * library reels from a fresh commercial.
 */

import type { Reel, ReelSaveInput, SeriesType } from "@/hooks/use-reels";
import type { GeneratedReelSave } from "@/hooks/use-reels";
import {
  buildStudioVoFingerprint,
  defaultProductPayoff,
  normalizeProductPayoffInput,
  type HookClipInput,
  type HookVoClip,
  type ProductPayoffInput,
  type StudioVoiceoverResult,
} from "@/lib/generatedReel";
import {
  defaultWorkspaceConversation,
  normalizeConversation,
  type WorkspaceConversation,
} from "@/lib/workspaceModel";
import {
  buildStudioOutroCopy,
  type UniversalOutroCopy,
} from "@/lib/universalBrandOutro";
import {
  defaultOutroLayerDocument,
  migrateOutroLayerDocument,
  syncLayerTextFromCopy,
  type OutroLayerDocument,
} from "@/lib/outroLayerLayout";
import { normalizeVoiceActorId, type VoiceActorId } from "@/lib/constants/languages";
import { normalizeAspectRatio, type ReelAspectRatio } from "@/lib/reelAspectRatio";
import {
  DEFAULT_SPEAKER_A_DELIVERY,
  DEFAULT_SPEAKER_B_DELIVERY,
  DEFAULT_THIRD_SPEAKER_DELIVERY,
  normalizeDeliveryPresetId,
  type WorkspaceDeliveryPresetId,
} from "@/lib/workspaceDeliveryPresets";
import type { HookFootageProvider } from "@/lib/hookFootage";
import {
  resolveDefaultStudioOutroFields,
  type SavedOutroPresetFields,
} from "@/lib/savedOutroPresets";

const DRAFT_PREFIX = "interpreterai_studio_draft_";
const LAST_SETTINGS_KEY = "interpreterai_studio_last_settings";

export const STUDIO_NEW_KEY = "new";

export type StudioDraft = {
  reelId: string | null;
  hookClips: HookClipInput[];
  language: string;
  sourceLang: string;
  targetLang: string;
  series: SeriesType;
  workspace: WorkspaceConversation;
  outroLine1: string;
  outroLine2: string;
  outroCtaHeadline: string;
  outroLanguagesLine: string;
  outroVoiceover: string;
  outroVoPhrases?: string[];
  outroPhraseMuted?: boolean[];
  outroPhraseGapSec: number;
  outroMinHoldSec: number;
  /** User-trimmed outro end (seconds); null = full VO length. */
  outroTrimDurationSec?: number | null;
  includeOutro: boolean;
  includeWorkspace: boolean;
  includeProductPayoff: boolean;
  productPayoff: ProductPayoffInput;
  subtitleScale: number;
  result: GeneratedReelSave | null;
  cachedVoiceover: StudioVoiceoverResult | null;
  hookVoClips: HookVoClip[];
  hookDurationSec: number;
  footageUrls: string[];
  /** Hook b-roll source for Generate Reel — Pexels stock vs Google Veo AI. */
  footageProvider?: HookFootageProvider;
  hookAudio: string | null;
  hookWords: GeneratedReelSave["words"];
  workspaceVoClips: GeneratedReelSave["workspaceVoClips"];
  /** Editable outro layer geometry + EN/localized copy */
  outroLayout?: OutroLayerDocument;
  /** English outro originals — never overwritten by translation */
  outroCopyEn?: UniversalOutroCopy;
  hookVoiceId?: VoiceActorId;
  productPayoffVoiceId?: VoiceActorId;
  workspaceSpeakerAVoiceId?: VoiceActorId;
  workspaceSpeakerBVoiceId?: VoiceActorId;
  /** Sticky pink 3rd speaker — reused whenever you re-enable 3rd speaker on an exchange. */
  workspaceThirdSpeakerVoiceId?: VoiceActorId;
  workspaceSpeakerADelivery?: WorkspaceDeliveryPresetId;
  workspaceSpeakerBDelivery?: WorkspaceDeliveryPresetId;
  workspaceThirdSpeakerDelivery?: WorkspaceDeliveryPresetId;
  outroVoiceId?: VoiceActorId;
  updatedAt: number;
};

export const DEFAULT_HOOK_CLIPS: HookClipInput[] = [
  {
    scenario: "Vertical portrait nurse at hospital laptop typing patient charts stressed",
    sayLine: "Medical staff waste hours typing call transcripts.",
  },
  {
    scenario: "Close-up doctor using phone interpreter app vertical 9:16 cinematic",
    sayLine: "Every minute away from the patient.",
  },
  {
    scenario: "Hospital corridor urgent cinematic vertical b-roll smartphone",
    sayLine: "There is a better way.",
  },
];

function defaultOutroCopyFromFields(fields: {
  line1: string;
  line2: string;
  ctaHeadline: string;
  languagesLine: string;
  voiceover: string;
}): UniversalOutroCopy {
  return buildStudioOutroCopy(fields);
}

function outroFieldsToDraftSlice(fields: SavedOutroPresetFields): Pick<
  StudioDraft,
  | "outroLine1"
  | "outroLine2"
  | "outroCtaHeadline"
  | "outroLanguagesLine"
  | "outroVoiceover"
  | "outroVoPhrases"
  | "outroPhraseMuted"
  | "outroPhraseGapSec"
  | "outroMinHoldSec"
  | "outroLayout"
  | "outroCopyEn"
> {
  return {
    outroLine1: fields.outroLine1,
    outroLine2: fields.outroLine2,
    outroCtaHeadline: fields.outroCtaHeadline,
    outroLanguagesLine: fields.outroLanguagesLine,
    outroVoiceover: fields.outroVoiceover,
    outroVoPhrases: fields.outroVoPhrases,
    outroPhraseMuted: fields.outroPhraseMuted,
    outroPhraseGapSec: fields.outroPhraseGapSec,
    outroMinHoldSec: fields.outroMinHoldSec,
    outroLayout: migrateOutroLayerDocument(fields.outroLayout),
    outroCopyEn:
      fields.outroCopyEn ??
      buildStudioOutroCopy({
        line1: fields.outroLine1,
        line2: fields.outroLine2,
        ctaHeadline: fields.outroCtaHeadline,
        languagesLine: fields.outroLanguagesLine,
        voiceover: fields.outroVoiceover,
      }),
  };
}

/** Blank slate for "New commercial" — one empty hook row, no VO/footage. */
export function freshStudioDraft(): StudioDraft {
  const sourceLang = "en";
  const targetLang = "es";
  const defaultOutro = resolveDefaultStudioOutroFields();
  return {
    reelId: null,
    hookClips: [{ scenario: "", sayLine: "" }],
    language: "en",
    sourceLang,
    targetLang,
    series: "medical",
    workspace: {
      sourceLang,
      targetLang,
      exchanges: [
        {
          id: crypto.randomUUID(),
          speaker: "A",
          original: "",
          translation: "",
          originalLang: sourceLang,
          translationLang: targetLang,
          startFrac: 0.04,
          endFrac: 0.34,
          translationStartFrac: 0.55,
        },
      ],
    },
    ...outroFieldsToDraftSlice(defaultOutro),
    includeOutro: true,
    includeWorkspace: true,
    includeHook: true,
    includeProductPayoff: true,
    workspaceOutroGapSec: 0,
    aspectRatio: "9:16",
    productPayoff: defaultProductPayoff("medical"),
    subtitleScale: 1,
    result: null,
    cachedVoiceover: null,
    hookVoClips: [],
    hookDurationSec: 10,
    footageUrls: [],
    footageProvider: "pexels",
    hookAudio: null,
    hookWords: [],
    workspaceVoClips: [],
    hookVoiceId: "rachel",
    productPayoffVoiceId: "rachel",
    workspaceSpeakerAVoiceId: "adam",
    workspaceSpeakerBVoiceId: "elli",
    workspaceThirdSpeakerVoiceId: "antoni",
    workspaceSpeakerADelivery: DEFAULT_SPEAKER_A_DELIVERY,
    workspaceSpeakerBDelivery: DEFAULT_SPEAKER_B_DELIVERY,
    workspaceThirdSpeakerDelivery: DEFAULT_THIRD_SPEAKER_DELIVERY,
    outroVoiceId: "rachel",
    updatedAt: Date.now(),
  };
}

export function defaultStudioDraft(): StudioDraft {
  const defaultOutro = resolveDefaultStudioOutroFields();
  return {
    reelId: null,
    hookClips: DEFAULT_HOOK_CLIPS.map((c) => ({ ...c })),
    language: "en",
    sourceLang: "en",
    targetLang: "es",
    series: "medical",
    workspace: defaultWorkspaceConversation("en", "es"),
    ...outroFieldsToDraftSlice(defaultOutro),
    includeOutro: true,
    includeWorkspace: true,
    includeHook: true,
    includeProductPayoff: true,
    workspaceOutroGapSec: 0,
    aspectRatio: "9:16",
    productPayoff: defaultProductPayoff("medical"),
    subtitleScale: 1,
    result: null,
    cachedVoiceover: null,
    hookVoClips: [],
    hookDurationSec: 10,
    footageUrls: [],
    footageProvider: "pexels",
    hookAudio: null,
    hookWords: [],
    workspaceVoClips: [],
    hookVoiceId: "rachel",
    productPayoffVoiceId: "rachel",
    workspaceSpeakerAVoiceId: "adam",
    workspaceSpeakerBVoiceId: "elli",
    workspaceThirdSpeakerVoiceId: "antoni",
    workspaceSpeakerADelivery: DEFAULT_SPEAKER_A_DELIVERY,
    workspaceSpeakerBDelivery: DEFAULT_SPEAKER_B_DELIVERY,
    workspaceThirdSpeakerDelivery: DEFAULT_THIRD_SPEAKER_DELIVERY,
    outroVoiceId: "rachel",
    updatedAt: Date.now(),
  };
}

function draftStorageKey(reelKey: string): string {
  return `${DRAFT_PREFIX}${reelKey}`;
}

export function loadStudioDraft(reelKey: string): StudioDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(reelKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (!parsed || !Array.isArray(parsed.hookClips)) return null;
    return normalizeDraft(parsed);
  } catch {
    return null;
  }
}

export function saveStudioDraft(reelKey: string, draft: StudioDraft): void {
  try {
    localStorage.setItem(
      draftStorageKey(reelKey),
      JSON.stringify({ ...draft, updatedAt: Date.now() }),
    );
  } catch (e) {
    console.warn("Studio draft save failed (storage quota?)", e);
  }
}

export function clearStudioDraft(reelKey: string): void {
  localStorage.removeItem(draftStorageKey(reelKey));
}

/** Persist last-used studio configuration (no audio blobs) for the next blank commercial. */
export function saveLastStudioSettings(draft: StudioDraft): void {
  try {
    const stripped: StudioDraft = {
      ...draft,
      reelId: null,
      result: null,
      cachedVoiceover: null,
      hookVoClips: [],
      hookAudio: null,
      hookWords: [],
      workspaceVoClips: [],
      footageUrls: [],
    };
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(stripped));
  } catch (e) {
    console.warn("Last studio settings save failed", e);
  }
}

export function loadLastStudioSettings(): StudioDraft | null {
  try {
    const raw = localStorage.getItem(LAST_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (!parsed || !Array.isArray(parsed.hookClips)) return null;
    return normalizeDraft(parsed);
  } catch {
    return null;
  }
}

/**
 * New commercial — keep every toggle/voice/lang/outro setting from the last reel,
 * but wipe script text boxes and drop generated audio/footage.
 */
export function studioDraftWithClearedText(base: StudioDraft): StudioDraft {
  const hookCount = Math.max(1, base.hookClips.length);
  const clearedHooks = Array.from({ length: hookCount }, () => ({ scenario: "", sayLine: "" }));
  const clearedWorkspace = normalizeConversation({
    ...base.workspace,
    exchanges: base.workspace.exchanges.map((ex) => ({
      ...ex,
      original: "",
      translation: "",
    })),
  });
  const clearedPayoff = normalizeProductPayoffInput(base.productPayoff) ?? defaultProductPayoff(base.series);
  return normalizeDraft({
    ...base,
    reelId: null,
    hookClips: clearedHooks,
    workspace: clearedWorkspace,
    productPayoff: {
      ...clearedPayoff,
      sayLine: "",
      scenario: "",
      headline: "",
      supportingText: "",
    },
    result: null,
    cachedVoiceover: null,
    hookVoClips: [],
    hookDurationSec: 10,
    footageUrls: [],
    hookAudio: null,
    hookWords: [],
    workspaceVoClips: [],
    updatedAt: Date.now(),
  });
}

function normalizeDraft(raw: Partial<StudioDraft>): StudioDraft {
  const base = defaultStudioDraft();
  const merged = {
    ...base,
    ...raw,
    hookClips: Array.isArray(raw.hookClips)
      ? raw.hookClips.map((c) => ({
          scenario: String(c?.scenario ?? ""),
          sayLine: String(c?.sayLine ?? ""),
        }))
      : base.hookClips,
    workspace: raw.workspace
      ? normalizeConversation(raw.workspace)
      : base.workspace,
    hookVoClips: Array.isArray(raw.hookVoClips) ? raw.hookVoClips : [],
    workspaceVoClips: Array.isArray(raw.workspaceVoClips) ? raw.workspaceVoClips : [],
    hookWords: Array.isArray(raw.hookWords) ? raw.hookWords : [],
    footageUrls: Array.isArray(raw.footageUrls) ? raw.footageUrls : [],
    footageProvider:
      raw.footageProvider === "google_veo" || raw.footageProvider === "pexels"
        ? raw.footageProvider
        : base.footageProvider,
    includeProductPayoff:
      typeof raw.includeProductPayoff === "boolean" ? raw.includeProductPayoff : base.includeProductPayoff,
    includeHook: typeof raw.includeHook === "boolean" ? raw.includeHook : base.includeHook,
    workspaceOutroGapSec:
      typeof raw.workspaceOutroGapSec === "number" && raw.workspaceOutroGapSec >= 0
        ? Math.min(8, raw.workspaceOutroGapSec)
        : base.workspaceOutroGapSec ?? 0,
    aspectRatio: normalizeAspectRatio(raw.aspectRatio ?? base.aspectRatio),
    productPayoff:
      normalizeProductPayoffInput(raw.productPayoff) ??
      (raw.includeProductPayoff === false ? { ...base.productPayoff, enabled: false } : base.productPayoff),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
  const enCopy =
    raw.outroCopyEn ??
    defaultOutroCopyFromFields({
      line1: merged.outroLine1,
      line2: merged.outroLine2,
      ctaHeadline: merged.outroCtaHeadline,
      languagesLine: merged.outroLanguagesLine,
      voiceover: merged.outroVoiceover,
    });
  merged.outroCopyEn = enCopy;
  merged.outroLayout = migrateOutroLayerDocument(
    raw.outroLayout ?? syncLayerTextFromCopy(defaultOutroLayerDocument(enCopy), enCopy),
  );
  merged.hookVoiceId = normalizeVoiceActorId(raw.hookVoiceId ?? merged.hookVoiceId ?? "rachel");
  merged.productPayoffVoiceId = normalizeVoiceActorId(
    raw.productPayoffVoiceId ?? merged.productPayoffVoiceId ?? merged.hookVoiceId ?? "rachel",
  );
  merged.workspaceSpeakerAVoiceId = normalizeVoiceActorId(
    raw.workspaceSpeakerAVoiceId ?? merged.workspaceSpeakerAVoiceId ?? "adam",
  );
  merged.workspaceSpeakerBVoiceId = normalizeVoiceActorId(
    raw.workspaceSpeakerBVoiceId ?? merged.workspaceSpeakerBVoiceId ?? "elli",
  );
  const fromExchanges = merged.workspace?.exchanges?.find(
    (ex) => typeof ex.thirdSpeakerVoiceId === "string" && ex.thirdSpeakerVoiceId.trim(),
  )?.thirdSpeakerVoiceId;
  merged.workspaceThirdSpeakerVoiceId = normalizeVoiceActorId(
    raw.workspaceThirdSpeakerVoiceId ??
      merged.workspaceThirdSpeakerVoiceId ??
      fromExchanges ??
      "antoni",
  );
  merged.workspaceSpeakerADelivery = normalizeDeliveryPresetId(
    raw.workspaceSpeakerADelivery ?? merged.workspaceSpeakerADelivery ?? DEFAULT_SPEAKER_A_DELIVERY,
  );
  merged.workspaceSpeakerBDelivery = normalizeDeliveryPresetId(
    raw.workspaceSpeakerBDelivery ?? merged.workspaceSpeakerBDelivery ?? DEFAULT_SPEAKER_B_DELIVERY,
  );
  merged.workspaceThirdSpeakerDelivery = normalizeDeliveryPresetId(
    raw.workspaceThirdSpeakerDelivery ?? merged.workspaceThirdSpeakerDelivery ?? DEFAULT_THIRD_SPEAKER_DELIVERY,
  );
  merged.outroVoiceId = normalizeVoiceActorId(raw.outroVoiceId ?? merged.outroVoiceId ?? "rachel");
  merged.outroTrimDurationSec =
    typeof raw.outroTrimDurationSec === "number" && raw.outroTrimDurationSec > 0
      ? raw.outroTrimDurationSec
      : null;
  if (merged.language !== "en" && merged.language === merged.outroLayout.localizedLang) {
    merged.outroLayout = syncLayerTextFromCopy(
      merged.outroLayout,
      buildStudioOutroCopy({
        line1: merged.outroLine1,
        line2: merged.outroLine2,
        ctaHeadline: merged.outroCtaHeadline,
        languagesLine: merged.outroLanguagesLine,
        voiceover: merged.outroVoiceover,
      }),
      { localized: true, lang: merged.language },
    );
  }
  return merged;
}

function hookClipsFromGenerated(gen: GeneratedReelSave): HookClipInput[] {
  const sb = gen.storyboardEn ?? gen.storyboard;
  const scenes = sb?.hookScenes ?? [];
  if (gen.hookVoClips?.length) {
    return gen.hookVoClips.map((c, i) => ({
      scenario: c.scenario?.trim() || scenes[i]?.trim() || "",
      sayLine: c.sayLine?.trim() || "",
    }));
  }
  const lines = (sb?.hookScript ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (scenes.length || lines.length) {
    const n = Math.max(scenes.length, lines.length, 1);
    return Array.from({ length: n }, (_, i) => ({
      scenario: scenes[i]?.trim() || "",
      sayLine: lines[i]?.trim() || "",
    }));
  }
  return DEFAULT_HOOK_CLIPS.map((c) => ({ ...c }));
}

function voiceoverFromGenerated(
  gen: GeneratedReelSave,
  draft: Pick<
    StudioDraft,
    | "hookClips"
    | "workspace"
    | "language"
    | "outroVoiceover"
    | "includeWorkspace"
    | "includeOutro"
    | "includeHook"
    | "includeProductPayoff"
    | "productPayoff"
    | "outroPhraseGapSec"
    | "outroMinHoldSec"
  >,
): StudioVoiceoverResult | null {
  if (!gen.hookVoClips?.length && !gen.workspaceVoClips?.length && !gen.outroAudioBase64) {
    return null;
  }
  const fingerprint = buildStudioVoFingerprint({
    language: draft.language,
    hookClips: draft.hookClips,
    workspace: draft.workspace,
    productPayoff: draft.productPayoff,
    outroVoiceover: draft.outroVoiceover,
    includeWorkspace: draft.includeWorkspace,
    includeOutro: draft.includeOutro,
    includeHook: draft.includeHook,
    includeProductPayoff: draft.includeProductPayoff,
    outroPhraseGapSec: draft.outroPhraseGapSec,
    outroMinHoldSec: draft.outroMinHoldSec,
    workspaceOutroGapSec: draft.workspaceOutroGapSec ?? 0,
    aspectRatio: draft.aspectRatio ?? "9:16",
    hookVoiceId: draft.hookVoiceId,
    productPayoffVoiceId: draft.productPayoffVoiceId ?? draft.hookVoiceId,
    workspaceSpeakerAVoiceId: draft.workspaceSpeakerAVoiceId,
    workspaceSpeakerBVoiceId: draft.workspaceSpeakerBVoiceId,
    workspaceSpeakerADelivery: draft.workspaceSpeakerADelivery,
    workspaceSpeakerBDelivery: draft.workspaceSpeakerBDelivery,
    workspaceThirdSpeakerDelivery: draft.workspaceThirdSpeakerDelivery,
    outroVoiceId: draft.outroVoiceId,
  });
  return {
    fingerprint,
    hookVoClips: gen.hookVoClips ?? [],
    hookDurationSec: gen.hookDurationSec ?? 10,
    productPayoffVoClip: gen.productPayoffVoClip ?? null,
    productPayoffDurationSec: gen.productPayoffDurationSec,
    audioBase64: gen.audioBase64,
    words: gen.words ?? [],
    workspaceVoClips: gen.workspaceVoClips ?? [],
    outroAudioBase64: gen.outroAudioBase64,
    outroWords: gen.outroWords ?? [],
    includeWorkspace: gen.includeWorkspace !== false,
    includeOutro: gen.includeOutro !== false,
    includeProductPayoff: gen.includeProductPayoff !== false,
  };
}

/** Build editor state from a Library reel (studio snapshot + generated payload). */
export function studioDraftFromReel(reel: Reel): StudioDraft {
  if (reel.studioDraft) {
    const normalized = normalizeDraft({ ...reel.studioDraft, reelId: reel.id });
    if (reel.generated) {
      const gen = reel.generated;
      if (!normalized.result) normalized.result = gen;
      if (normalized.hookVoClips.length === 0) normalized.hookVoClips = gen.hookVoClips ?? [];
      if (normalized.hookDurationSec <= 0 && gen.hookDurationSec) {
        normalized.hookDurationSec = gen.hookDurationSec;
      }
      if (normalized.footageUrls.length === 0) normalized.footageUrls = gen.footageUrls ?? [];
      if (!normalized.hookAudio) normalized.hookAudio = gen.audioBase64;
      if (normalized.hookWords.length === 0) normalized.hookWords = gen.words ?? [];
      if (normalized.workspaceVoClips.length === 0) {
        normalized.workspaceVoClips = gen.workspaceVoClips ?? [];
      }
      if (!normalized.cachedVoiceover) {
        normalized.cachedVoiceover = voiceoverFromGenerated(gen, normalized);
      }
    }
    normalized.updatedAt = Math.max(normalized.updatedAt, reel.updatedAt);
    return normalized;
  }

  const gen = reel.generated;
  const base = defaultStudioDraft();
  if (!gen) {
    return {
      ...base,
      reelId: reel.id,
      series: reel.series,
      language: reel.targetLanguage || "en",
      hookClips: reel.studioBrief
        ? [{ scenario: "", sayLine: reel.studioBrief }]
        : reel.hook
          ? [{ scenario: "", sayLine: reel.hook }]
          : base.hookClips,
      outroLine1: reel.outroLine1 || base.outroLine1,
      outroLine2: reel.outroLine2 || base.outroLine2,
      updatedAt: reel.updatedAt,
    };
  }

  const sb = gen.storyboardEn ?? gen.storyboard;
  const hookClips = hookClipsFromGenerated(gen);
  const workspace = sb?.workspace
    ? normalizeConversation(sb.workspace)
    : defaultWorkspaceConversation(
        workspaceLangs(gen).sourceLang,
        workspaceLangs(gen).targetLang,
      );
  const outroCopy =
    sb?.outroCopy ??
    buildStudioOutroCopy({
      line1: reel.outroLine1,
      line2: reel.outroLine2,
      voiceover: sb?.outroVoiceover,
    });
  const outroVoiceover = sb?.outroVoiceover ?? base.outroVoiceover;

  const draft: StudioDraft = {
    ...base,
    reelId: reel.id,
    hookClips,
    language: gen.language || reel.targetLanguage || "en",
    sourceLang: workspace.sourceLang,
    targetLang: workspace.targetLang,
    series: (gen.series as SeriesType) || reel.series,
    workspace,
    outroLine1: outroCopy.line1,
    outroLine2: outroCopy.line2,
    outroCtaHeadline: outroCopy.ctaHeadline,
    outroLanguagesLine: outroCopy.languagesLine,
    outroVoiceover,
    includeOutro: gen.includeOutro !== false,
    includeWorkspace: gen.includeWorkspace !== false,
    includeProductPayoff: gen.includeProductPayoff !== false,
    productPayoff:
      normalizeProductPayoffInput(sb?.productPayoff) ??
      normalizeProductPayoffInput(gen.storyboardEn?.productPayoff) ??
      defaultProductPayoff((gen.series as SeriesType) || reel.series),
    result: gen,
    hookVoClips: gen.hookVoClips ?? [],
    hookDurationSec: gen.hookDurationSec ?? 10,
    footageUrls: gen.footageUrls ?? [],
    hookAudio: gen.audioBase64,
    hookWords: gen.words ?? [],
    workspaceVoClips: gen.workspaceVoClips ?? [],
    outroCopyEn: buildStudioOutroCopy({
      line1: gen.storyboardEn?.outroCopy?.line1 ?? outroCopy.line1,
      line2: gen.storyboardEn?.outroCopy?.line2 ?? outroCopy.line2,
      ctaHeadline: gen.storyboardEn?.outroCopy?.ctaHeadline ?? outroCopy.ctaHeadline,
      languagesLine: gen.storyboardEn?.outroCopy?.languagesLine ?? outroCopy.languagesLine,
      voiceover: gen.storyboardEn?.outroVoiceover ?? outroVoiceover,
    }),
    outroLayout: syncLayerTextFromCopy(
      defaultOutroLayerDocument(outroCopy),
      gen.language !== "en" && gen.storyboard?.outroCopy
        ? gen.storyboard.outroCopy
        : outroCopy,
      gen.language !== "en" ? { localized: true, lang: gen.language } : undefined,
    ),
    updatedAt: reel.updatedAt,
  };
  draft.cachedVoiceover = voiceoverFromGenerated(gen, draft);
  return draft;
}

function workspaceLangs(gen: GeneratedReelSave): { sourceLang: string; targetLang: string } {
  const ws = gen.storyboard?.workspace ?? gen.storyboardEn?.workspace;
  return {
    sourceLang: ws?.sourceLang ?? "en",
    targetLang: ws?.targetLang ?? "es",
  };
}

/** Prefer library snapshot; local draft only when clearly newer (active edit session). */
export function resolveStudioDraft(reelKey: string, reel: Reel | null): StudioDraft {
  if (reelKey === STUDIO_NEW_KEY) {
    return loadStudioDraft(STUDIO_NEW_KEY) ?? freshStudioDraft();
  }
  const local = loadStudioDraft(reelKey);
  if (reel) {
    const fromReel = studioDraftFromReel(reel);
    if (local && local.updatedAt > fromReel.updatedAt + 500) {
      return normalizeDraft({ ...local, reelId: reel.id });
    }
    return fromReel;
  }
  return local ?? defaultStudioDraft();
}

/** Merge hook editor text into generated payload before library save. */
export function enrichGeneratedForLibrary(
  gen: GeneratedReelSave,
  hookClips: HookClipInput[],
  workspace: WorkspaceConversation,
  outroCopy: UniversalOutroCopy,
  outroVoiceover: string,
): GeneratedReelSave {
  const hookScript = hookClips
    .map((c) => c.sayLine.trim())
    .filter(Boolean)
    .join(" ");
  const hookScenes = hookClips.map((c) => c.scenario.trim());
  return {
    ...gen,
    hookVoClips: (gen.hookVoClips ?? []).map((clip, i) => ({
      ...clip,
      scenario: hookClips[i]?.scenario.trim() || clip.scenario || hookScenes[i] || "",
      sayLine: hookClips[i]?.sayLine.trim() || clip.sayLine || "",
    })),
    storyboard: {
      ...gen.storyboard,
      hookScript: hookScript || gen.storyboard.hookScript,
      hookScenes,
      workspace,
      productPayoff: gen.storyboard.productPayoff ?? gen.productPayoffVoClip
        ? {
            sayLine: gen.productPayoffVoClip?.sayLine ?? gen.storyboard.productPayoff?.sayLine ?? "",
            scenario: gen.productPayoffVoClip?.scenario ?? gen.storyboard.productPayoff?.scenario ?? "",
            headline: gen.storyboard.productPayoff?.headline,
            supportingText: gen.storyboard.productPayoff?.supportingText,
            enabled: gen.includeProductPayoff !== false,
          }
        : gen.storyboard.productPayoff,
      outroVoiceover,
      outroCopy,
    },
    storyboardEn: gen.storyboardEn
      ? {
          ...gen.storyboardEn,
          hookScript: hookScript || gen.storyboardEn.hookScript,
          hookScenes,
          workspace,
          productPayoff: gen.storyboardEn.productPayoff ?? gen.storyboard.productPayoff,
          outroVoiceover,
        }
      : gen.storyboardEn,
  };
}

/** Persist full editor state onto a library reel row. */
export function libraryReelPatchFromStudio(existing: Reel, draft: StudioDraft): ReelSaveInput {
  const hook = draft.hookClips
    .map((c) => c.sayLine.trim())
    .filter(Boolean)
    .join(" ");
  const outroCopy = buildStudioOutroCopy({
    line1: draft.outroLine1,
    line2: draft.outroLine2,
    ctaHeadline: draft.outroCtaHeadline,
    languagesLine: draft.outroLanguagesLine,
    voiceover: draft.outroVoiceover,
  });
  const generated = draft.result
    ? enrichGeneratedForLibrary(
        draft.result,
        draft.hookClips,
        draft.workspace,
        outroCopy,
        draft.outroVoiceover,
      )
    : existing.generated;
  const studioDraft: StudioDraft = {
    ...draft,
    reelId: existing.id,
    result: generated ?? draft.result,
    updatedAt: Date.now(),
  };
  return {
    id: existing.id,
    series: draft.series,
    reelType: existing.reelType || "generated_35s",
    targetLanguage: draft.language,
    voiceActor: existing.voiceActor,
    voiceSpeed: existing.voiceSpeed,
    musicBed: existing.musicBed,
    brandTone: existing.brandTone,
    brandStingEnabled: existing.brandStingEnabled,
    voVolume: existing.voVolume,
    bgmVolume: existing.bgmVolume,
    brandVolume: existing.brandVolume,
    problemVisual: existing.problemVisual,
    solutionVisual: existing.solutionVisual,
    hook: hook || existing.hook,
    problem: existing.problem,
    solution: existing.solution,
    result: existing.result,
    captions: hook || existing.captions,
    outroLine1: draft.outroLine1,
    outroLine2: draft.outroLine2,
    batchId: existing.batchId,
    variationIndex: existing.variationIndex,
    scheduleTag: existing.scheduleTag || "35s · 9:16",
    fromStudio: existing.fromStudio ?? true,
    studioBrief: hook || existing.studioBrief,
    storyboardTitle: existing.storyboardTitle,
    downloadUrl: existing.downloadUrl,
    downloadFilename: existing.downloadFilename,
    mp4Cached: existing.mp4Cached,
    generated,
    studioDraft,
  };
}

export function currentStudioRouteKey(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/** Wouter pathname omits ?query — read the real URL for fresh=1. */
export function isFreshNewCommercial(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fresh") === "1";
}

export const STUDIO_NEW_COMMERCIAL_EVENT = "interpreterai:studio-new-commercial";

export function openNewCommercial(setLocation: (path: string) => void): void {
  const path = newCommercialPath();
  setLocation(path);
  window.dispatchEvent(new CustomEvent(STUDIO_NEW_COMMERCIAL_EVENT));
}

export function newCommercialPath(): string {
  return `/studio/new?fresh=1&t=${Date.now()}`;
}

export function studioDraftKeyFromLocation(pathname: string): {
  reelKey: string;
  isNew: boolean;
  fresh: boolean;
} {
  const path = pathname.split("?")[0] ?? pathname;
  const fresh = isFreshNewCommercial();
  if (path === "/studio/new" || path.endsWith("/studio/new")) {
    return { reelKey: STUDIO_NEW_KEY, isNew: true, fresh };
  }
  const m = path.match(/\/studio\/([^/]+)/);
  if (m?.[1] && m[1] !== "new") {
    return { reelKey: m[1], isNew: false, fresh };
  }
  return { reelKey: STUDIO_NEW_KEY, isNew: true, fresh };
}
