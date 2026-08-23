/**
 * Creative Studio — 3 hook clips (footage scenario + say line) synced to voiceover,
 * then 15s workspace + 7s brand outro.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Bookmark, Languages, Loader2, Play, Plus, Save, Sparkles, Trash2, Volume2 } from "lucide-react";
import { StudioHookVoPreview } from "@/components/preview/StudioHookVoPreview";
import { StudioFullReelPreview, type StudioFullReelPreviewHandle } from "@/components/preview/StudioFullReelPreview";
import { OutroPreviewPanel } from "@/components/preview/OutroPreviewPanel";
import { WorkspacePreviewPanel } from "@/components/preview/WorkspacePreviewPanel";
import { OutroPhraseClipEditor } from "@/components/studio/OutroPhraseClipEditor";
import { SavedOutrosDialog } from "@/components/studio/SavedOutrosDialog";
import { VoiceActorSelect } from "@/components/studio/VoiceActorSelect";
import { DeliveryPresetSelect } from "@/components/studio/DeliveryPresetSelect";
import { COLORS, TYPE } from "@/lib/brandSystem";
import { REEL_LANGUAGES, reelLanguageLabel, isRtlLanguage, defaultThirdSpeakerVoiceId, resolveThirdSpeakerVoiceId, DEFAULT_WORKSPACE_SPEAKER_A_VOICE, DEFAULT_WORKSPACE_SPEAKER_B_VOICE, type VoiceActorId } from "@/lib/constants/languages";
import {
  generateReel,
  generateStudioVoiceover,
  mergeStudioVoiceoverWithReel,
  mergeTranslatedStudioVoiceover,
  translateStudioReel,
  buildStudioVoFingerprint,
  hookLinesMatchFingerprint,
  studioVoiceoverCoversSelection,
  defaultProductPayoff,
  computeProductPayoffDurationSec,
  type GeneratedStoryboard,
  type HookClipInput,
  type HookVoClip,
  type ProductPayoffInput,
  type StudioVoiceoverResult,
} from "@/lib/generatedReel";
import {
  detectFootageSource,
  hookFootageLabel,
  hookFootageProviderLabel,
  formatFootageProviderError,
  isPlayableFootageUrl,
  type HookFootageProvider,
  type HookFootageSource,
} from "@/lib/hookFootage";
import { buildLanguagePair } from "@/lib/languageFlags";
import { loadOutroConfig, type OutroConfig } from "@/lib/outroConfig";
import {
  CANONICAL_OUTRO_AUDIO_URL,
} from "@/lib/outroAudio";
import { resolveOutroPreviewAudio } from "@/lib/outroPreviewAudio";
import { computeWorkspaceDurationSec, MAX_HOOK_CLIPS, MAX_WORKSPACE_EXCHANGES, resolveHookDurationSec } from "@/lib/generatedReel";
import {
  buildStudioOutroCopy,
  UNIVERSAL_OUTRO_EN,
} from "@/lib/universalBrandOutro";
import {
  buildOutroPhraseTimings,
  buildOutroSpokenForTts,
  buildOutroVoiceoverFromPhrases,
  estimateOutroVoDurationSec,
  normalizeOutroPhraseMuted,
  normalizeOutroVoPhrases,
  outroVoiceoverForTiming,
  outroSegmentSecFromSpeech,
  patchOutroVoPhraseList,
  splitOutroPhrases,
} from "@/lib/outroVoPacing";
import { OUTRO_ANIMATION_LABELS } from "@/lib/outroLayerAnimation";
import {
  applyLocalizedCopyToLayers,
  clearLocalizedLayers,
  copyFromLayerDocument,
  defaultOutroLayerDocument,
  layerDisplayText,
  migrateOutroLayerDocument,
  OUTRO_LAYER_LABELS,
  OUTRO_TEXT_LAYER_IDS,
  resetAllLayersToDefault,
  resetLayerToDefault,
  syncLayerTextFromCopy,
  updateLayerFontSize,
  updateLayerTextEn,
  updateLayerTextLocalized,
  type OutroAnimationPreset,
  type OutroLayerDocument,
  type OutroLayerId,
} from "@/lib/outroLayerLayout";
import {
  defaultWorkspaceConversation,
  applyInterpreterSpeakerPattern,
  setExchangeSpeakerRole,
  appendWorkspaceExchange,
  buildEstimatedWorkspaceSchedule,
  estimateSpeechSec,
  exchangeAccentColor,
  exchangeEditorDurationSec,
  exchangeSpeakerLabel,
  WORKSPACE_SPEAKER_COLORS,
  normalizeConversation,
  splitHookScriptToClips,
  workspaceScheduleDurationSec,
  type WorkspaceConversation,
  type WorkspaceExchange,
  type WorkspaceSpeaker,
} from "@/lib/workspaceModel";
import {
  consumePendingOutroPreset,
  DEFAULT_STUDIO_OUTRO_PRESET_NAME,
  saveOutroPreset,
  type SavedOutroPreset,
} from "@/lib/savedOutroPresets";
import { deleteReelMp4 } from "@/lib/reelMp4Cache";
import { studioExportFilename } from "@/lib/studioReelExport";
import {
  buildReelExportFilename,
  buildReelLibraryTitle,
  reelStorylineFromSayLines,
} from "@/lib/reelNaming";
import { useReels, type GeneratedReelSave, type SeriesType } from "@/hooks/use-reels";
import { useToast } from "@/hooks/use-toast";
import {
  canvasSizeForAspect,
  previewSizeForAspect,
  normalizeAspectRatio,
  type ReelAspectRatio,
} from "@/lib/reelAspectRatio";
import {
  DEFAULT_SPEAKER_A_DELIVERY,
  DEFAULT_SPEAKER_B_DELIVERY,
  DEFAULT_THIRD_SPEAKER_DELIVERY,
  normalizeDeliveryPresetId,
  type WorkspaceDeliveryPresetId,
} from "@/lib/workspaceDeliveryPresets";
import {
  clearStudioDraft,
  currentStudioRouteKey,
  enrichGeneratedForLibrary,
  freshStudioDraft,
  isFreshNewCommercial,
  libraryReelPatchFromStudio,
  loadLastStudioSettings,
  loadStudioDraft,
  openNewCommercial,
  resolveStudioDraft,
  saveLastStudioSettings,
  saveStudioDraft,
  studioDraftFromReel,
  studioDraftWithClearedText,
  STUDIO_NEW_COMMERCIAL_EVENT,
  STUDIO_NEW_KEY,
  studioDraftKeyFromLocation,
  type StudioDraft,
} from "@/lib/studioDraft";

const STUDIO_SERIES: { id: SeriesType; label: string }[] = [
  { id: "medical", label: "Medical" },
  { id: "legal", label: "Legal" },
  { id: "conference", label: "Conference" },
  { id: "immigration", label: "Immigration" },
  { id: "education", label: "Education" },
];

const FOOTAGE_PROVIDER_OPTIONS: { id: HookFootageProvider; label: string; hint: string }[] = [
  {
    id: "pexels",
    label: "Pexels",
    hint: "Stock video search — fast, free with API key",
  },
  {
    id: "google_veo",
    label: "Google AI (Veo)",
    hint: "AI-generated b-roll — requires Gemini API billing (1–3 min per clip)",
  },
];

type Phase = "idle" | "generating" | "ready" | "error";
type VoPhase = "idle" | "generating" | "ready" | "error";
type TranslatePhase = "idle" | "translating" | "ready" | "error";

type EnglishReelSnapshot = {
  hookClips: HookClipInput[];
  outroLine1: string;
  outroLine2: string;
  outroCtaHeadline: string;
  outroLanguagesLine: string;
  outroVoiceover: string;
  cachedVoiceover: StudioVoiceoverResult;
  result: GeneratedReelSave;
};

function applyDraftToState(draft: StudioDraft) {
  return {
    hookClips: draft.hookClips,
    language: draft.language,
    sourceLang: draft.sourceLang,
    targetLang: draft.targetLang,
    series: draft.series,
    workspace: draft.workspace,
    outroLine1: draft.outroLine1,
    outroLine2: draft.outroLine2,
    outroCtaHeadline: draft.outroCtaHeadline,
    outroLanguagesLine: draft.outroLanguagesLine,
    outroVoiceover: draft.outroVoiceover,
    outroVoPhrases: normalizeOutroVoPhrases(draft.outroVoPhrases, draft.outroVoiceover),
    outroPhraseMuted: normalizeOutroPhraseMuted(draft.outroPhraseMuted),
    outroPhraseGapSec: draft.outroPhraseGapSec,
    outroMinHoldSec: draft.outroMinHoldSec,
    outroTrimDurationSec: draft.outroTrimDurationSec ?? null,
    outroLayout: draft.outroLayout ?? defaultOutroLayerDocument(),
    outroCopyEn: draft.outroCopyEn,
    includeOutro: draft.includeOutro,
    includeWorkspace: draft.includeWorkspace,
    includeHook: draft.includeHook,
    includeProductPayoff: draft.includeProductPayoff,
    workspaceOutroGapSec: draft.workspaceOutroGapSec ?? 0,
    aspectRatio: normalizeAspectRatio(draft.aspectRatio),
    productPayoff: draft.productPayoff,
    subtitleScale: draft.subtitleScale,
    result: draft.result,
    cachedVoiceover: draft.cachedVoiceover,
    hookVoClips: draft.hookVoClips,
    hookDurationSec: draft.hookDurationSec,
    footageUrls: draft.footageUrls,
    footageProvider: draft.footageProvider ?? "pexels",
    hookAudio: draft.hookAudio,
    hookWords: draft.hookWords,
    workspaceVoClips: draft.workspaceVoClips,
    hookVoiceId: draft.hookVoiceId ?? "rachel",
    productPayoffVoiceId: draft.productPayoffVoiceId ?? draft.hookVoiceId ?? "rachel",
    workspaceSpeakerAVoiceId: draft.workspaceSpeakerAVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_A_VOICE,
    workspaceSpeakerBVoiceId: draft.workspaceSpeakerBVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_B_VOICE,
    workspaceThirdSpeakerVoiceId:
      draft.workspaceThirdSpeakerVoiceId ??
      defaultThirdSpeakerVoiceId(
        draft.workspaceSpeakerAVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_A_VOICE,
        draft.workspaceSpeakerBVoiceId ?? DEFAULT_WORKSPACE_SPEAKER_B_VOICE,
      ),
    workspaceSpeakerADelivery: normalizeDeliveryPresetId(draft.workspaceSpeakerADelivery ?? DEFAULT_SPEAKER_A_DELIVERY),
    workspaceSpeakerBDelivery: normalizeDeliveryPresetId(draft.workspaceSpeakerBDelivery ?? DEFAULT_SPEAKER_B_DELIVERY),
    workspaceThirdSpeakerDelivery: normalizeDeliveryPresetId(draft.workspaceThirdSpeakerDelivery ?? DEFAULT_THIRD_SPEAKER_DELIVERY),
    outroVoiceId: draft.outroVoiceId ?? "rachel",
    phase: (draft.result ? "ready" : "idle") as Phase,
    voPhase: (draft.cachedVoiceover ? "ready" : "idle") as VoPhase,
  };
}

export default function Studio() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { saveReel, getReel, isLoaded } = useReels();
  const { reelKey, isNew } = studioDraftKeyFromLocation(location);
  const editingReel = !isNew ? getReel(reelKey) : null;

  const [bootDraft] = useState(() => freshStudioDraft());
  const [hookClips, setHookClips] = useState<HookClipInput[]>(() => bootDraft.hookClips);
  const [language, setLanguage] = useState("en");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("es");
  const [series, setSeries] = useState<SeriesType>("medical");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressIdx, setProgressIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<GeneratedReelSave | null>(null);
  const [outroCfg] = useState<OutroConfig>(() => loadOutroConfig());
  const [hookVoClips, setHookVoClips] = useState<HookVoClip[]>([]);
  const [hookDurationSec, setHookDurationSec] = useState(10);
  const [footageUrls, setFootageUrls] = useState<string[]>([]);
  const [footageProvider, setFootageProvider] = useState<HookFootageProvider>(
    () => bootDraft.footageProvider ?? "pexels",
  );
  const [footageSource, setFootageSource] = useState<HookFootageSource>("none");
  const [workspaceVoClips, setWorkspaceVoClips] = useState<GeneratedReelSave["workspaceVoClips"]>([]);
  const [hookAudio, setHookAudio] = useState<string | null>(null);
  const [hookWords, setHookWords] = useState<GeneratedReelSave["words"]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceConversation>(() =>
    defaultWorkspaceConversation("en", "es"),
  );
  const [outroPreviewState, setOutroPreviewState] = useState<
    "idle" | "loading" | "playing" | "error"
  >("idle");
  const [outroPreviewMsg, setOutroPreviewMsg] = useState("");
  const [outroPlayheadSec, setOutroPlayheadSec] = useState(0);
  const [outroPreviewPlaying, setOutroPreviewPlaying] = useState(false);
  const [outroAdvancedOpen, setOutroAdvancedOpen] = useState(false);
  const [subtitleScale, setSubtitleScale] = useState(1);
  const [includeOutro, setIncludeOutro] = useState(true);
  const [includeWorkspace, setIncludeWorkspace] = useState(true);
  const [includeHook, setIncludeHook] = useState(true);
  const [includeProductPayoff, setIncludeProductPayoff] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<ReelAspectRatio>("9:16");
  const [workspaceOutroGapSec, setWorkspaceOutroGapSec] = useState(0);
  const [workspaceOutroGapEnabled, setWorkspaceOutroGapEnabled] = useState(false);
  const [workspaceSpeakerADelivery, setWorkspaceSpeakerADelivery] = useState<WorkspaceDeliveryPresetId>(
    DEFAULT_SPEAKER_A_DELIVERY,
  );
  const [workspaceSpeakerBDelivery, setWorkspaceSpeakerBDelivery] = useState<WorkspaceDeliveryPresetId>(
    DEFAULT_SPEAKER_B_DELIVERY,
  );
  const [workspaceThirdSpeakerDelivery, setWorkspaceThirdSpeakerDelivery] = useState<WorkspaceDeliveryPresetId>(
    DEFAULT_THIRD_SPEAKER_DELIVERY,
  );
  const [productPayoff, setProductPayoff] = useState<ProductPayoffInput>(() =>
    defaultProductPayoff("medical"),
  );
  const hookOnlyReel = includeHook && !includeWorkspace && !includeOutro && !includeProductPayoff;
  const effectiveWorkspaceOutroGap =
    includeOutro && workspaceOutroGapEnabled ? workspaceOutroGapSec : 0;
  const canvasSize = canvasSizeForAspect(aspectRatio);
  const previewSize = previewSizeForAspect(aspectRatio);
  const [outroLine1, setOutroLine1] = useState<string>(() => bootDraft.outroLine1);
  const [outroLine2, setOutroLine2] = useState<string>(() => bootDraft.outroLine2);
  const [outroCtaHeadline, setOutroCtaHeadline] = useState<string>(() => bootDraft.outroCtaHeadline);
  const [outroLanguagesLine, setOutroLanguagesLine] = useState<string>(() => bootDraft.outroLanguagesLine);
  const [outroVoiceover, setOutroVoiceover] = useState(() => bootDraft.outroVoiceover);
  const [outroVoPhrases, setOutroVoPhrases] = useState<string[]>(() =>
    normalizeOutroVoPhrases(bootDraft.outroVoPhrases, bootDraft.outroVoiceover),
  );
  const [outroPhraseMuted, setOutroPhraseMuted] = useState<boolean[]>(() =>
    normalizeOutroPhraseMuted(bootDraft.outroPhraseMuted),
  );
  const [outroPhraseGapSec, setOutroPhraseGapSec] = useState(() => bootDraft.outroPhraseGapSec);
  const [outroMinHoldSec, setOutroMinHoldSec] = useState(() => bootDraft.outroMinHoldSec);
  const [outroTrimDurationSec, setOutroTrimDurationSec] = useState<number | null>(
    () => bootDraft.outroTrimDurationSec ?? null,
  );
  const [outroLayout, setOutroLayout] = useState<OutroLayerDocument>(() =>
    migrateOutroLayerDocument(bootDraft.outroLayout ?? defaultOutroLayerDocument()),
  );
  const [outroCopyEn, setOutroCopyEn] = useState<ReturnType<typeof buildStudioOutroCopy>>(() =>
    bootDraft.outroCopyEn ??
      buildStudioOutroCopy({
        line1: bootDraft.outroLine1,
        line2: bootDraft.outroLine2,
        ctaHeadline: bootDraft.outroCtaHeadline,
        languagesLine: bootDraft.outroLanguagesLine,
        voiceover: bootDraft.outroVoiceover,
      }),
  );
  const [selectedOutroLayerId, setSelectedOutroLayerId] = useState<OutroLayerId | null>(null);
  const [outroEditLayersMode, setOutroEditLayersMode] = useState(false);
  const [hookVoiceId, setHookVoiceId] = useState<VoiceActorId>("rachel");
  const [productPayoffVoiceId, setProductPayoffVoiceId] = useState<VoiceActorId>("rachel");
  const [workspaceSpeakerAVoiceId, setWorkspaceSpeakerAVoiceId] = useState<VoiceActorId>(DEFAULT_WORKSPACE_SPEAKER_A_VOICE);
  const [workspaceSpeakerBVoiceId, setWorkspaceSpeakerBVoiceId] = useState<VoiceActorId>(DEFAULT_WORKSPACE_SPEAKER_B_VOICE);
  const [workspaceThirdSpeakerVoiceId, setWorkspaceThirdSpeakerVoiceId] = useState<VoiceActorId>(() =>
    defaultThirdSpeakerVoiceId(DEFAULT_WORKSPACE_SPEAKER_A_VOICE, DEFAULT_WORKSPACE_SPEAKER_B_VOICE),
  );
  const [outroVoiceId, setOutroVoiceId] = useState<VoiceActorId>("rachel");
  const [outroSaveName, setOutroSaveName] = useState(DEFAULT_STUDIO_OUTRO_PRESET_NAME);
  const [savedOutrosOpen, setSavedOutrosOpen] = useState(false);
  const pendingOutroAppliedRef = useRef(false);
  const [cachedVoiceover, setCachedVoiceover] = useState<StudioVoiceoverResult | null>(null);
  const [voPhase, setVoPhase] = useState<VoPhase>("idle");
  const [voError, setVoError] = useState("");
  const [translateTargetLang, setTranslateTargetLang] = useState("es");
  const [translatePhase, setTranslatePhase] = useState<TranslatePhase>("idle");
  const [translateError, setTranslateError] = useState("");
  const [navTick, setNavTick] = useState(0);

  const progressTimer = useRef<number | null>(null);
  const outroAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);
  const skipNextHydrateRef = useRef(false);
  const justGeneratedRef = useRef(false);
  const fullPreviewRef = useRef<StudioFullReelPreviewHandle | null>(null);
  const [libraryReelId, setLibraryReelId] = useState<string | null>(() =>
    isNew ? null : reelKey,
  );
  const [draftHydrating, setDraftHydrating] = useState(false);

  useEffect(() => {
    if (!isNew) setLibraryReelId(reelKey);
  }, [isNew, reelKey]);

  const progressSteps = useMemo(
    () =>
      [
        "Writing workspace dialogue…",
        footageProvider === "google_veo"
          ? "Generating Veo footage for each clip… (can take a few minutes)"
          : "Searching Pexels for each clip…",
        "Building your preview…",
      ] as const,
    [footageProvider],
  );
  const saveTimerRef = useRef<number | null>(null);
  const englishSnapshotRef = useRef<EnglishReelSnapshot | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      outroAudioRef.current?.pause();
    };
  }, []);

  function applyStudioDraft(draft: StudioDraft) {
    const next = applyDraftToState(draft);
    setHookClips(next.hookClips);
    setLanguage(next.language);
    setSourceLang(next.sourceLang);
    setTargetLang(next.targetLang);
    setSeries(next.series);
    setWorkspace(next.workspace);
    setOutroLine1(next.outroLine1);
    setOutroLine2(next.outroLine2);
    setOutroCtaHeadline(next.outroCtaHeadline);
    setOutroLanguagesLine(next.outroLanguagesLine);
    setOutroVoiceover(next.outroVoiceover);
    setOutroVoPhrases(normalizeOutroVoPhrases(next.outroVoPhrases, next.outroVoiceover));
    setOutroPhraseMuted(normalizeOutroPhraseMuted(next.outroPhraseMuted));
    setOutroPhraseGapSec(next.outroPhraseGapSec);
    setOutroMinHoldSec(next.outroMinHoldSec);
    setOutroTrimDurationSec(next.outroTrimDurationSec ?? null);
    setOutroLayout(migrateOutroLayerDocument(next.outroLayout ?? defaultOutroLayerDocument()));
    setOutroCopyEn(
      next.outroCopyEn ??
        buildStudioOutroCopy({
          line1: next.outroLine1,
          line2: next.outroLine2,
          ctaHeadline: next.outroCtaHeadline,
          languagesLine: next.outroLanguagesLine,
          voiceover: next.outroVoiceover,
        }),
    );
    setSelectedOutroLayerId(null);
    setIncludeOutro(next.includeOutro);
    setIncludeWorkspace(next.includeWorkspace);
    setIncludeHook(next.includeHook);
    setIncludeProductPayoff(next.includeProductPayoff);
    setWorkspaceOutroGapSec(next.workspaceOutroGapSec ?? 0);
    setWorkspaceOutroGapEnabled((next.workspaceOutroGapSec ?? 0) > 0);
    setAspectRatio(next.aspectRatio);
    setProductPayoff(next.productPayoff);
    setSubtitleScale(next.subtitleScale);
    setResult(next.result);
    setCachedVoiceover(next.cachedVoiceover);
    setHookVoClips(next.hookVoClips);
    setHookDurationSec(next.hookDurationSec);
    setFootageUrls(next.footageUrls);
    setFootageProvider(next.footageProvider ?? "pexels");
    setFootageSource(
      detectFootageSource(next.footageUrls, next.footageProvider ?? "pexels"),
    );
    setHookAudio(next.hookAudio);
    setHookWords(next.hookWords);
    setWorkspaceVoClips(next.workspaceVoClips);
    setHookVoiceId(next.hookVoiceId);
    setProductPayoffVoiceId(next.productPayoffVoiceId);
    setWorkspaceSpeakerAVoiceId(next.workspaceSpeakerAVoiceId);
    setWorkspaceSpeakerBVoiceId(next.workspaceSpeakerBVoiceId);
    setWorkspaceThirdSpeakerVoiceId(next.workspaceThirdSpeakerVoiceId);
    setWorkspaceSpeakerADelivery(next.workspaceSpeakerADelivery);
    setWorkspaceSpeakerBDelivery(next.workspaceSpeakerBDelivery);
    setWorkspaceThirdSpeakerDelivery(next.workspaceThirdSpeakerDelivery);
    setOutroVoiceId(next.outroVoiceId);
    setPhase(next.phase);
    setVoPhase(next.voPhase);
    setOutroPreviewState("idle");
    setOutroPreviewMsg("");
    setErrorMsg("");
    setVoError("");
    outroAudioRef.current?.pause();
    syncEnglishSnapshotFromLoadedDraft(next);
  }

  function applySavedOutroPreset(preset: SavedOutroPreset) {
    setOutroLine1(preset.outroLine1);
    setOutroLine2(preset.outroLine2);
    setOutroCtaHeadline(preset.outroCtaHeadline);
    setOutroLanguagesLine(preset.outroLanguagesLine);
    setOutroVoiceover(preset.outroVoiceover);
    setOutroVoPhrases(normalizeOutroVoPhrases(preset.outroVoPhrases, preset.outroVoiceover));
    setOutroPhraseMuted(normalizeOutroPhraseMuted(preset.outroPhraseMuted));
    setOutroPhraseGapSec(preset.outroPhraseGapSec);
    setOutroMinHoldSec(preset.outroMinHoldSec);
    const presetNatural = estimateOutroVoDurationSec(preset.outroVoiceover, "en");
    setOutroTrimDurationSec(
      preset.outroDurationSec < presetNatural - 0.05 ? preset.outroDurationSec : null,
    );
    setOutroLayout(migrateOutroLayerDocument(preset.outroLayout));
    setOutroCopyEn(preset.outroCopyEn);
    setSelectedOutroLayerId(null);
    setIncludeOutro(true);
    setOutroPreviewState("idle");
    setOutroPreviewMsg("");
    outroAudioRef.current?.pause();
  }

  function onSaveOutroPreset() {
    const name = outroSaveName.trim() || `Outro ${new Date().toLocaleDateString()}`;
    const copyEn = buildStudioOutroCopy({
      line1: outroLine1,
      line2: outroLine2,
      ctaHeadline: outroCtaHeadline,
      languagesLine: outroLanguagesLine,
      voiceover: outroVoiceover,
    });
    try {
      const saved = saveOutroPreset(name, {
        outroLine1,
        outroLine2,
        outroCtaHeadline,
        outroLanguagesLine,
        outroVoiceover,
        outroVoPhrases,
        outroPhraseMuted,
        outroPhraseGapSec,
        outroMinHoldSec,
        outroDurationSec: outroDurationSec,
        outroLayout: migrateOutroLayerDocument(outroLayout),
        outroCopyEn: copyEn,
        outroPhraseTimings,
        outroWords: outroWordsForSync.length > 0 ? outroWordsForSync : undefined,
      });
      setOutroSaveName(saved.name);
      toast({
        title: "Outro saved",
        description: `“${saved.name}” is in Brand Outro — load it anytime.`,
        duration: 4000,
      });
    } catch (e) {
      toast({
        title: "Could not save outro",
        description: e instanceof Error ? e.message : "Storage failed",
        variant: "destructive",
      });
    }
  }

  const outroSaveBar = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        marginTop: 16,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid rgba(32,212,240,0.28)",
        background: "rgba(32,212,240,0.08)",
      }}
    >
      <input
        value={outroSaveName}
        onChange={(e) => setOutroSaveName(e.target.value)}
        placeholder="Preset name (e.g. Medical CTA)"
        style={{ ...selectStyle, flex: "1 1 200px", minWidth: 180, maxWidth: 320 }}
      />
      <button type="button" onClick={onSaveOutroPreset} style={accentSaveBtn}>
        <Save size={15} />
        Save outro
      </button>
      <button type="button" onClick={() => setSavedOutrosOpen(true)} style={smallBtn}>
        <Bookmark size={14} />
        Load saved
      </button>
      <a href="/outro" style={{ fontSize: 12, color: COLORS.accent, textDecoration: "none", fontWeight: 650 }}>
        Brand Outro library →
      </a>
    </div>
  );

  function syncEnglishSnapshotFromLoadedDraft(next: ReturnType<typeof applyDraftToState>) {
    if (!next.result?.storyboardEn || !next.cachedVoiceover) {
      englishSnapshotRef.current = null;
      return;
    }
    const en = next.result.storyboardEn;
    const enOutro = en.outroCopy;
    const enSayLines = splitHookScriptToClips(
      en.hookScript,
      next.hookClips.length,
      next.hookClips.map((c) => c.sayLine),
    );
    englishSnapshotRef.current = {
      hookClips: next.hookClips.map((c, i) => ({
        scenario: en.hookScenes[i] ?? c.scenario,
        sayLine: enSayLines[i]?.trim() || c.sayLine,
      })),
      outroLine1: enOutro?.line1 ?? UNIVERSAL_OUTRO_EN.line1,
      outroLine2: enOutro?.line2 ?? UNIVERSAL_OUTRO_EN.line2,
      outroCtaHeadline: enOutro?.ctaHeadline ?? UNIVERSAL_OUTRO_EN.ctaHeadline,
      outroLanguagesLine: enOutro?.languagesLine ?? UNIVERSAL_OUTRO_EN.languagesLine,
      outroVoiceover: en.outroVoiceover,
      cachedVoiceover: next.cachedVoiceover,
      result:
        next.result.language === "en"
          ? next.result
          : {
              ...next.result,
              language: "en",
              storyboard: en,
              storyboardEn: en,
            },
    };
  }

  useEffect(() => {
    const bump = () => {
      loadedKeyRef.current = null;
      setNavTick((t) => t + 1);
    };
    window.addEventListener(STUDIO_NEW_COMMERCIAL_EVENT, bump);
    return () => window.removeEventListener(STUDIO_NEW_COMMERCIAL_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const routeKey = currentStudioRouteKey();
    const fresh = isFreshNewCommercial();

    if (!isNew && !editingReel && !result && !justGeneratedRef.current) {
      openNewCommercial(setLocation);
      return;
    }
    if (loadedKeyRef.current === routeKey) return;
    if (skipNextHydrateRef.current || justGeneratedRef.current) {
      skipNextHydrateRef.current = false;
      justGeneratedRef.current = false;
      loadedKeyRef.current = routeKey;
      return;
    }
    loadedKeyRef.current = routeKey;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    hydratingRef.current = true;
    setDraftHydrating(true);
    if (fresh && isNew) {
      const previous =
        loadStudioDraft(STUDIO_NEW_KEY) ??
        loadLastStudioSettings() ??
        (editingReel ? studioDraftFromReel(editingReel) : null);
      clearStudioDraft(STUDIO_NEW_KEY);
      applyStudioDraft(previous ? studioDraftWithClearedText(previous) : freshStudioDraft());
      setOutroSaveName(DEFAULT_STUDIO_OUTRO_PRESET_NAME);
    } else {
      applyStudioDraft(resolveStudioDraft(reelKey, editingReel ?? null));
    }
    window.setTimeout(() => {
      hydratingRef.current = false;
      setDraftHydrating(false);
      if (!pendingOutroAppliedRef.current) {
        const pending = consumePendingOutroPreset();
        if (pending) {
          pendingOutroAppliedRef.current = true;
          applySavedOutroPreset(pending);
          setOutroSaveName(pending.name);
          toast({
            title: "Outro loaded",
            description: `Applied “${pending.name}” from Brand Outro.`,
            duration: 4000,
          });
        }
      }
    }, 100);
  }, [isLoaded, navTick, location, reelKey, isNew, editingReel, setLocation]);

  useEffect(() => {
    if (!isLoaded || draftHydrating) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const draft: StudioDraft = {
        reelId: isNew ? null : reelKey,
        hookClips,
        language,
        sourceLang,
        targetLang,
        series,
        workspace,
        outroLine1,
        outroLine2,
        outroCtaHeadline,
        outroLanguagesLine,
        outroVoiceover,
        outroVoPhrases,
        outroPhraseMuted,
        outroPhraseGapSec,
        outroMinHoldSec,
        outroTrimDurationSec,
        includeOutro,
        includeWorkspace,
        includeHook,
        includeProductPayoff,
        workspaceOutroGapSec: effectiveWorkspaceOutroGap,
        aspectRatio,
        productPayoff,
        subtitleScale,
        result,
        cachedVoiceover,
        hookVoClips,
        hookDurationSec,
        footageUrls,
        footageProvider,
        hookAudio,
        hookWords,
        workspaceVoClips,
        outroLayout,
        outroCopyEn,
        hookVoiceId,
        productPayoffVoiceId,
        workspaceSpeakerAVoiceId,
        workspaceSpeakerBVoiceId,
        workspaceThirdSpeakerVoiceId,
        workspaceSpeakerADelivery,
        workspaceSpeakerBDelivery,
        workspaceThirdSpeakerDelivery,
        outroVoiceId,
        updatedAt: Date.now(),
      };
      saveStudioDraft(reelKey, draft);
      if (!isNew) {
        const existing = getReel(reelKey);
        if (existing) {
          saveReel(libraryReelPatchFromStudio(existing, draft));
        }
      }
    }, 400);
  }, [
    isLoaded,
    draftHydrating,
    reelKey,
    isNew,
    getReel,
    saveReel,
    hookClips,
    language,
    sourceLang,
    targetLang,
    series,
    workspace,
    outroLine1,
    outroLine2,
    outroCtaHeadline,
    outroLanguagesLine,
    outroVoiceover,
    outroVoPhrases,
    outroPhraseMuted,
    outroPhraseGapSec,
    outroMinHoldSec,
    outroTrimDurationSec,
    outroLayout,
    outroCopyEn,
    includeOutro,
    includeWorkspace,
    includeHook,
    includeProductPayoff,
    workspaceOutroGapSec,
    workspaceOutroGapEnabled,
    aspectRatio,
    productPayoff,
    subtitleScale,
    result,
    cachedVoiceover,
    hookVoClips,
    hookDurationSec,
    footageUrls,
    footageProvider,
    hookAudio,
    hookWords,
    workspaceVoClips,
    hookVoiceId,
    productPayoffVoiceId,
    workspaceSpeakerAVoiceId,
    workspaceSpeakerBVoiceId,
    workspaceThirdSpeakerVoiceId,
    workspaceSpeakerADelivery,
    workspaceSpeakerBDelivery,
    workspaceThirdSpeakerDelivery,
    outroVoiceId,
  ]);

  useEffect(() => {
    if (hydratingRef.current) return;
    if (sourceLang === targetLang) {
      const fallback = REEL_LANGUAGES.find((l) => l.code !== sourceLang)?.code ?? "es";
      setTargetLang(fallback);
      return;
    }
    setWorkspace((w) =>
      applyInterpreterSpeakerPattern({ ...w, sourceLang, targetLang }),
    );
  }, [sourceLang, targetLang]);

  function applyVoiceoverToState(vo: StudioVoiceoverResult) {
    setCachedVoiceover(vo);
    setHookVoClips(vo.hookVoClips);
    setHookDurationSec(resolveHookDurationSec(vo.hookVoClips, vo.hookDurationSec));
    setHookAudio(vo.audioBase64);
    setHookWords(vo.words);
    setWorkspaceVoClips(vo.workspaceVoClips);
    if (vo.productPayoff) setProductPayoff(vo.productPayoff);
    // Never overwrite workspace dialogue or hook script text from the server response.
  }

  /** Preview/footage after Generate Reel — keeps your editor text intact. */
  function applyGeneratePreview(save: GeneratedReelSave) {
    const playableUrls = save.footageUrls.filter(isPlayableFootageUrl);
    const syncedHookVoClips = (save.hookVoClips ?? []).map((clip, i) => ({
      ...clip,
      footageUrl: isPlayableFootageUrl(clip.footageUrl)
        ? clip.footageUrl
        : (playableUrls[i] ?? ""),
    }));
    const syncedSave = { ...save, footageUrls: playableUrls, hookVoClips: syncedHookVoClips };
    setResult(syncedSave);
    setHookVoClips(syncedHookVoClips);
    setHookDurationSec(
      resolveHookDurationSec(syncedHookVoClips, save.hookDurationSec),
    );
    setFootageUrls(playableUrls);
    const src = save.providerStatus?.footageSource;
    setFootageSource(
      src === "google_veo" || src === "pexels" || src === "local"
        ? src
        : detectFootageSource(playableUrls, footageProvider),
    );
    setHookAudio(save.audioBase64);
    setHookWords(save.words);
    setWorkspaceVoClips(save.workspaceVoClips ?? []);
    const sbPayoff = save.storyboard?.productPayoff ?? save.storyboardEn?.productPayoff;
    if (sbPayoff?.sayLine) setProductPayoff(sbPayoff);
    if (typeof save.includeProductPayoff === "boolean") {
      setIncludeProductPayoff(save.includeProductPayoff);
    }
  }

  const clipsReady = useMemo(() => {
    const payoffOn = includeProductPayoff && productPayoff.enabled !== false;
    const hasAnySegment = includeHook || includeWorkspace || includeOutro || payoffOn;
    const hookClipsReady =
      !includeHook ||
      hookClips.every((c) => c.scenario.trim().length >= 4 && c.sayLine.trim().length >= 3);
    const workspaceReady =
      !includeWorkspace ||
      workspace.exchanges.some(
        (ex) => ex.original.trim().length >= 2 || ex.translation.trim().length >= 2,
      );
    return hasAnySegment && hookClipsReady && workspaceReady;
  }, [
    includeHook,
    includeWorkspace,
    includeOutro,
    includeProductPayoff,
    productPayoff.enabled,
    hookClips,
    workspace.exchanges,
  ]);
  const generating = phase === "generating";
  const voGenerating = voPhase === "generating";

  const englishRestore = Boolean(result && result.language !== "en" && language === "en");
  const displayLanguage = result ? (englishRestore ? "en" : result.language) : language;
  const effectiveIncludeProductPayoff = includeProductPayoff && productPayoff.enabled !== false;

  const reelStoryline = useMemo(() => {
    const lines = hookClips.map((c) => c.sayLine.trim()).filter(Boolean);
    if (lines.length > 0) {
      return reelStorylineFromSayLines(
        lines,
        STUDIO_SERIES.find((s) => s.id === series)?.label ?? "Reel",
      );
    }
    if (result?.storyboard?.hookScript?.trim()) {
      return result.storyboard.hookScript.trim();
    }
    return STUDIO_SERIES.find((s) => s.id === series)?.label ?? "Reel";
  }, [hookClips, result?.storyboard?.hookScript, series]);

  const mp4ExportFilename = studioExportFilename(reelStoryline, displayLanguage);

  const languagePair = useMemo(
    () =>
      buildLanguagePair(
        workspace.sourceLang,
        reelLanguageLabel(workspace.sourceLang),
        workspace.targetLang,
        reelLanguageLabel(workspace.targetLang),
      ),
    [workspace.sourceLang, workspace.targetLang],
  );

  const outroSpokenForTts = useMemo(
    () => buildOutroSpokenForTts(outroVoiceover, outroPhraseMuted, outroVoPhrases),
    [outroVoiceover, outroPhraseMuted, outroVoPhrases],
  );

  const outroPhrases = useMemo(() => splitOutroPhrases(outroSpokenForTts), [outroSpokenForTts]);

  const outroEstimateSec = useMemo(
    () => estimateOutroVoDurationSec(outroSpokenForTts, language),
    [outroSpokenForTts, language],
  );

  const outroCopy = useMemo(
    () => copyFromLayerDocument(outroLayout, outroVoiceover, displayLanguage),
    [outroLayout, outroVoiceover, displayLanguage],
  );

  const storyboard: GeneratedStoryboard | null = useMemo(() => {
    if (result) {
      return englishRestore ? result.storyboardEn ?? result.storyboard : result.storyboard;
    }
    if (!cachedVoiceover) return null;
    const covers = studioVoiceoverCoversSelection(cachedVoiceover, {
      includeHook,
      includeWorkspace,
      includeOutro,
      includeProductPayoff: effectiveIncludeProductPayoff,
    });
    if (!covers) return null;
    return {
      hookScript: includeHook
        ? hookClips
            .map((c) => c.sayLine.trim())
            .filter(Boolean)
            .join(" ")
        : "",
      hookScenes: includeHook ? hookClips.map((c) => c.scenario.trim()) : [],
      workspace,
      productPayoff: effectiveIncludeProductPayoff ? productPayoff : undefined,
      outroVoiceover,
      outroCopy,
    };
  }, [
    result,
    englishRestore,
    cachedVoiceover,
    includeHook,
    includeWorkspace,
    includeOutro,
    effectiveIncludeProductPayoff,
    hookClips,
    workspace,
    productPayoff,
    outroVoiceover,
    outroCopy,
  ]);
  const hasHookVo =
    !includeHook || hookVoClips.some((c) => c.audioBase64 && c.durationSec > 0);

  const outroWordsForSync = useMemo(
    () =>
      englishRestore
        ? []
        : cachedVoiceover?.outroWords?.length
          ? cachedVoiceover.outroWords
          : result?.outroWords ?? [],
    [englishRestore, cachedVoiceover?.outroWords, result?.outroWords],
  );

  const outroTimingScript = useMemo(
    () => outroVoiceoverForTiming(outroVoiceover, outroVoPhrases),
    [outroVoiceover, outroVoPhrases],
  );

  const outroPhraseTimings = useMemo(
    () =>
      buildOutroPhraseTimings(
        outroTimingScript,
        outroWordsForSync,
        estimateSpeechSec(outroSpokenForTts, displayLanguage),
      ),
    [outroTimingScript, outroSpokenForTts, outroWordsForSync, displayLanguage],
  );

  const outroHasVoSync = outroWordsForSync.length > 0;

  const outroScreen = useMemo(
    () => ({
      line1: outroLine1,
      line2: outroLine2,
      languagesLine: outroLanguagesLine,
      ctaHeadline: outroCtaHeadline,
      url: layerDisplayText(outroLayout.layers.url, displayLanguage),
      ctaSubline: outroCopy.ctaSubline ?? UNIVERSAL_OUTRO_EN.ctaSubline,
    }),
    [
      outroLine1,
      outroLine2,
      outroLanguagesLine,
      outroCtaHeadline,
      outroLayout,
      outroCopy,
      displayLanguage,
    ],
  );

  const outroNaturalDurationSec = useMemo(() => {
    if (outroWordsForSync.length > 0) {
      const last = outroWordsForSync[outroWordsForSync.length - 1];
      if (last && last.end > 0) {
        return outroSegmentSecFromSpeech(last.end, { minHoldSec: 0 });
      }
    }
    return outroEstimateSec;
  }, [outroWordsForSync, outroEstimateSec]);

  const outroDurationSec = useMemo(() => {
    if (outroTrimDurationSec != null) {
      return Math.max(2.5, Math.min(outroTrimDurationSec, outroNaturalDurationSec));
    }
    return outroNaturalDurationSec;
  }, [outroTrimDurationSec, outroNaturalDurationSec]);

  useEffect(() => {
    if (
      outroTrimDurationSec != null &&
      outroTrimDurationSec > outroNaturalDurationSec + 0.05
    ) {
      setOutroTrimDurationSec(null);
    }
  }, [outroNaturalDurationSec, outroTrimDurationSec]);

  function patchOutroLayerText(id: OutroLayerId, value: string) {
    if (id === "line1") setOutroLine1(value);
    if (id === "line2") setOutroLine2(value);
    if (id === "languagesLine") setOutroLanguagesLine(value);
    if (id === "ctaHeadline") setOutroCtaHeadline(value);

    if (displayLanguage === "en") {
      if (id === "url") {
        setOutroLayout((prev) => {
          const next = migrateOutroLayerDocument(prev);
          next.layers.url.textEn = value;
          return next;
        });
      } else {
        setOutroLayout((prev) => updateLayerTextEn(prev, id, value));
      }
      setOutroCopyEn((prev) => {
        const next = { ...prev };
        if (id === "line1") next.line1 = value;
        if (id === "line2") next.line2 = value;
        if (id === "languagesLine") next.languagesLine = value;
        if (id === "ctaHeadline") next.ctaHeadline = value;
        if (id === "ctaSubline") next.ctaSubline = value;
        return next;
      });
    } else if (id !== "url") {
      setOutroLayout((prev) => updateLayerTextLocalized(prev, id, value, displayLanguage));
    }
  }

  function patchOutroVoPhrase(index: number, text: string) {
    const next = patchOutroVoPhraseList(outroVoPhrases, index, text);
    setOutroVoPhrases(next);
    setOutroVoiceover(buildOutroVoiceoverFromPhrases(next));
  }

  const voFingerprint = useMemo(
    () =>
      buildStudioVoFingerprint({
        language,
        hookClips,
        workspace,
        productPayoff,
        outroVoiceover,
        outroPhraseMuted,
        includeHook,
        includeWorkspace,
        includeOutro,
        includeProductPayoff,
        outroPhraseGapSec,
        outroMinHoldSec,
        workspaceOutroGapSec: effectiveWorkspaceOutroGap,
        aspectRatio,
        hookVoiceId,
        productPayoffVoiceId,
        workspaceSpeakerAVoiceId,
        workspaceSpeakerBVoiceId,
        workspaceThirdSpeakerVoiceId,
        workspaceSpeakerADelivery,
        workspaceSpeakerBDelivery,
        workspaceThirdSpeakerDelivery,
        outroVoiceId,
      }),
    [
      language,
      hookClips,
      workspace,
      productPayoff,
      outroVoiceover,
      outroPhraseMuted,
      includeHook,
      includeWorkspace,
      includeOutro,
      includeProductPayoff,
      outroPhraseGapSec,
      outroMinHoldSec,
      effectiveWorkspaceOutroGap,
      aspectRatio,
      hookVoiceId,
      productPayoffVoiceId,
      workspaceSpeakerAVoiceId,
      workspaceSpeakerBVoiceId,
      workspaceSpeakerADelivery,
      workspaceSpeakerBDelivery,
      workspaceThirdSpeakerDelivery,
      outroVoiceId,
    ],
  );
  const hookVoCached =
    !includeHook ||
    Boolean(
      cachedVoiceover?.hookVoClips.length &&
        hookLinesMatchFingerprint(hookClips, cachedVoiceover.fingerprint),
    );
  const voCoversSelection = Boolean(
    cachedVoiceover &&
      studioVoiceoverCoversSelection(cachedVoiceover, {
        includeHook,
        includeWorkspace,
        includeOutro,
        includeProductPayoff: effectiveIncludeProductPayoff,
      }),
  );
  const voReady = Boolean(
    cachedVoiceover &&
      cachedVoiceover.fingerprint === voFingerprint &&
      hookVoCached &&
      voCoversSelection,
  );
  const canGenerateReel = Boolean(
    clipsReady && cachedVoiceover && hasHookVo && hookVoCached && voCoversSelection,
  );
  const voStale = Boolean(cachedVoiceover && !voReady);
  const voMissingForSelection =
    includeWorkspace && (cachedVoiceover?.workspaceVoClips.length ?? 0) === 0
      ? "workspace"
      : effectiveIncludeProductPayoff && !cachedVoiceover?.productPayoffVoClip?.audioBase64
        ? "product payoff"
        : includeOutro && !cachedVoiceover?.outroAudioBase64
          ? "outro"
          : null;
  const previewIncludeWorkspace = result
    ? result.includeWorkspace !== false
    : includeWorkspace;
  const previewIncludeOutro = result ? result.includeOutro !== false : includeOutro;
  const previewIncludeProductPayoff = result
    ? result.includeProductPayoff !== false
    : effectiveIncludeProductPayoff;
  const productPayoffVoClip =
    result?.productPayoffVoClip ?? cachedVoiceover?.productPayoffVoClip ?? null;
  const productPayoffDurationSec = useMemo(
    () =>
      previewIncludeProductPayoff
        ? result?.productPayoffDurationSec ??
          cachedVoiceover?.productPayoffDurationSec ??
          computeProductPayoffDurationSec(productPayoffVoClip, productPayoff.sayLine, displayLanguage)
        : 0,
    [
      previewIncludeProductPayoff,
      result?.productPayoffDurationSec,
      cachedVoiceover?.productPayoffDurationSec,
      productPayoffVoClip,
      productPayoff.sayLine,
      displayLanguage,
    ],
  );
  const showFullReelPreview = Boolean(
    storyboard &&
      voCoversSelection &&
      (result || !includeHook),
  );
  const previewIncludeHook = result ? result.includeHook !== false : includeHook;
  /** Hook-only VO preview before Generate Reel attaches footage. */
  const showStudioHookPreview = Boolean(
    includeHook && hasHookVo && !result && !showFullReelPreview,
  );
  const hookPreviewSelectionNote = voMissingForSelection
    ? `Regenerate voiceover to include ${voMissingForSelection}`
    : !hookOnlyReel && hasHookVo && !voCoversSelection
      ? "Regenerate voiceover for the selected segments"
      : undefined;

  async function invalidateStoredMp4(reelId: string | null | undefined) {
    if (!reelId) return;
    try {
      await deleteReelMp4(reelId);
    } catch {
      /* ignore */
    }
    const existing = getReel(reelId);
    if (existing?.mp4Cached) {
      saveReel({ ...existing, mp4Cached: false });
    }
  }

  async function runGenerateVoiceover(): Promise<StudioVoiceoverResult> {
    await invalidateStoredMp4(libraryReelId ?? (!isNew ? reelKey : null));
    const vo = await generateStudioVoiceover({
      hookClips: includeHook
        ? hookClips.map((c) => ({
            scenario: c.scenario.trim(),
            sayLine: c.sayLine.trim(),
          }))
        : [],
      workspace: applyInterpreterSpeakerPattern(workspace),
      productPayoff: effectiveIncludeProductPayoff ? productPayoff : null,
      language,
      sourceLang,
      targetLang,
      outroVoiceover: outroSpokenForTts,
      includeHook,
      includeWorkspace,
      includeOutro,
      includeProductPayoff: effectiveIncludeProductPayoff,
      outroPhraseGapSec,
      outroMinHoldSec,
      fingerprint: voFingerprint,
      hookVoiceId,
      productPayoffVoiceId,
      workspaceSpeakerAVoiceId,
      workspaceSpeakerBVoiceId,
      workspaceSpeakerADelivery,
      workspaceSpeakerBDelivery,
      workspaceThirdSpeakerDelivery,
      outroVoiceId,
    });
    applyVoiceoverToState(vo);
    setVoPhase("ready");
    return vo;
  }

  async function onGenerateVoiceover() {
    if (!clipsReady || voGenerating || generating) return;
    setVoPhase("generating");
    setVoError("");
    try {
      await runGenerateVoiceover();
      toast({
        title: "Voiceover ready",
        description: includeHook
          ? `Hook preview on the right — Generate Reel adds ${hookFootageProviderLabel(footageProvider)} footage.`
          : "Reel preview on the right — Generate Reel to finalize and download MP4.",
        duration: 3200,
      });
    } catch (e) {
      setVoPhase("error");
      setVoError(e instanceof Error ? e.message : "Voiceover failed");
      toast({
        title: "Voiceover failed",
        description: e instanceof Error ? e.message : "TTS error",
        variant: "destructive",
      });
    }
  }

  async function runGenerateReel(voOverride?: StudioVoiceoverResult): Promise<GeneratedReelSave> {
    await invalidateStoredMp4(libraryReelId ?? (!isNew ? reelKey : null));
    const vo = voOverride ?? cachedVoiceover;
    if (!vo) throw new Error("Generate voiceover first");
    // Drop stale footage so preview cannot show the previous provider while generating.
    setFootageUrls([]);
    setFootageSource("none");
    setHookVoClips((prev) => prev.map((c) => ({ ...c, footageUrl: "" })));
    const res = await generateReel({
      hookClips: includeHook
        ? hookClips.map((c) => ({
            scenario: c.scenario.trim(),
            sayLine: c.sayLine.trim(),
          }))
        : [],
      workspace: applyInterpreterSpeakerPattern(workspace),
      productPayoff: effectiveIncludeProductPayoff ? productPayoff : undefined,
      prompt: includeHook ? hookClips.map((c) => c.sayLine).join(" ") : undefined,
      language: "en",
      series,
      sourceLang,
      targetLang,
      outroVoiceover,
      skipVoice: true,
      includeHook,
      includeWorkspace,
      includeOutro,
      includeProductPayoff: effectiveIncludeProductPayoff,
      footageProvider,
    });
    const merged = mergeStudioVoiceoverWithReel(res, vo, {
      includeWorkspace,
      includeOutro,
      includeProductPayoff: effectiveIncludeProductPayoff,
    });
    const save: GeneratedReelSave = {
      ...merged,
      includeHook,
      includeWorkspace,
      includeOutro,
      includeProductPayoff: effectiveIncludeProductPayoff,
      storyboard: {
        ...merged.storyboard,
        outroVoiceover,
        outroCopy,
        hookScript: hookClips.map((c) => c.sayLine.trim()).filter(Boolean).join(" "),
        hookScenes: hookClips.map((c) => c.scenario.trim()),
        workspace: applyInterpreterSpeakerPattern(workspace),
        productPayoff: effectiveIncludeProductPayoff ? productPayoff : undefined,
      },
      outroConfig: { ...outroCfg },
    };
    const enrichedSave = enrichGeneratedForLibrary(
      save,
      hookClips,
      applyInterpreterSpeakerPattern(workspace),
      outroCopy,
      outroVoiceover,
    );
    const studioSnapshot: StudioDraft = {
      reelId: isNew ? null : reelKey,
      hookClips: hookClips.map((c) => ({
        scenario: c.scenario.trim(),
        sayLine: c.sayLine.trim(),
      })),
      language,
      sourceLang,
      targetLang,
      series,
      workspace: applyInterpreterSpeakerPattern(workspace),
      outroLine1,
      outroLine2,
      outroCtaHeadline,
      outroLanguagesLine,
      outroVoiceover,
      outroVoPhrases,
      outroPhraseMuted,
      outroPhraseGapSec,
      outroMinHoldSec,
      includeOutro,
      includeWorkspace,
      includeHook,
      includeProductPayoff: effectiveIncludeProductPayoff,
      workspaceOutroGapSec: effectiveWorkspaceOutroGap,
      aspectRatio,
      productPayoff,
      subtitleScale,
      result: enrichedSave,
      cachedVoiceover: vo,
      hookVoClips: enrichedSave.hookVoClips ?? [],
      hookDurationSec: enrichedSave.hookDurationSec ?? hookDurationSec,
      footageUrls: enrichedSave.footageUrls ?? [],
      footageProvider,
      hookAudio: enrichedSave.audioBase64,
      hookWords: enrichedSave.words ?? [],
      workspaceVoClips: enrichedSave.workspaceVoClips ?? [],
      outroLayout,
      outroCopyEn,
      hookVoiceId,
      productPayoffVoiceId,
      workspaceSpeakerAVoiceId,
      workspaceSpeakerBVoiceId,
      workspaceThirdSpeakerVoiceId,
      workspaceSpeakerADelivery,
      workspaceSpeakerBDelivery,
      workspaceThirdSpeakerDelivery,
      outroVoiceId,
      updatedAt: Date.now(),
    };
    const src = enrichedSave.providerStatus?.footageSource;
    setFootageSource(
      src === "google_veo" || src === "pexels" || src === "local"
        ? src
        : detectFootageSource(enrichedSave.footageUrls ?? [], footageProvider),
    );
    applyGeneratePreview(enrichedSave);
    justGeneratedRef.current = true;
    setPhase("ready");
    setLanguage("en");
    setTranslatePhase("idle");
    setTranslateError("");
    englishSnapshotRef.current = {
      hookClips: hookClips.map((c) => ({ scenario: c.scenario.trim(), sayLine: c.sayLine.trim() })),
      outroLine1,
      outroLine2,
      outroCtaHeadline,
      outroLanguagesLine,
      outroVoiceover,
      cachedVoiceover: vo,
      result: enrichedSave,
    };

    const savedId = saveReel({
      id: isNew ? undefined : reelKey,
      series,
      reelType: "generated_35s",
      targetLanguage: enrichedSave.language,
      voiceActor: "adam",
      voiceSpeed: "1",
      musicBed: "none",
      brandTone: "none",
      brandStingEnabled: false,
      voVolume: 1,
      bgmVolume: 0.22,
      brandVolume: 0.8,
      problemVisual: "stock_broll",
      solutionVisual: "workspace_demo",
      hook: enrichedSave.storyboard.hookScript,
      problem: "",
      solution: "",
      result: "",
      captions: enrichedSave.storyboard.hookScript,
      outroLine1,
      outroLine2,
      batchId: null,
      variationIndex: 0,
      scheduleTag: `${Math.round(totalPreviewSec)}s · ${aspectRatio}`,
      fromStudio: true,
      studioBrief: hookClips.map((c) => c.sayLine.trim()).filter(Boolean).join(" "),
      storyboardTitle: buildReelLibraryTitle({
        storyline: reelStoryline,
        language: enrichedSave.language,
      }),
      generated: enrichedSave,
      studioDraft: studioSnapshot,
      downloadFilename: buildReelExportFilename({
        storyline: reelStoryline,
        language: enrichedSave.language,
      }),
      mp4Cached: false,
    });

    setLibraryReelId(savedId);

    if (isNew && savedId) {
      saveStudioDraft(savedId, { ...studioSnapshot, reelId: savedId });
      saveLastStudioSettings(studioSnapshot);
      clearStudioDraft(STUDIO_NEW_KEY);
      loadedKeyRef.current = currentStudioRouteKey();
      setLocation(`/studio/${savedId}`);
    } else if (!isNew) {
      saveStudioDraft(reelKey, { ...studioSnapshot, reelId: reelKey });
      saveLastStudioSettings(studioSnapshot);
    }

    return enrichedSave;
  }

  function buildLiveDraft(): StudioDraft {
    return {
      reelId: isNew ? null : reelKey,
      hookClips,
      language,
      sourceLang,
      targetLang,
      series,
      workspace,
      outroLine1,
      outroLine2,
      outroCtaHeadline,
      outroLanguagesLine,
      outroVoiceover,
      outroVoPhrases,
      outroPhraseMuted,
      outroPhraseGapSec,
      outroMinHoldSec,
      includeOutro,
      includeWorkspace,
      includeProductPayoff,
      productPayoff,
      subtitleScale,
      result,
      cachedVoiceover,
      hookVoClips,
      hookDurationSec,
      footageUrls,
      footageProvider,
      hookAudio,
      hookWords,
      workspaceVoClips,
      outroLayout,
      outroCopyEn,
      hookVoiceId,
      productPayoffVoiceId,
      workspaceSpeakerAVoiceId,
      workspaceSpeakerBVoiceId,
      workspaceThirdSpeakerVoiceId,
      outroVoiceId,
      updatedAt: Date.now(),
    };
  }

  function markMp4Cached(reelId: string, filename: string) {
    const existing = getReel(reelId);
    if (!existing) return;
    saveReel({
      ...libraryReelPatchFromStudio(existing, buildLiveDraft()),
      mp4Cached: true,
      downloadFilename: filename,
    });
  }

  async function onGenerateAll() {
    if (!clipsReady || generating || voGenerating) return;
    setVoError("");
    setErrorMsg("");
    let voBatch = cachedVoiceover;
    try {
      if (!hasHookVo || !voCoversSelection) {
        setVoPhase("generating");
        voBatch = await runGenerateVoiceover();
      }
      setPhase("generating");
      setProgressIdx(0);
      if (progressTimer.current) window.clearInterval(progressTimer.current);
      progressTimer.current = window.setInterval(() => {
        setProgressIdx((i) => Math.min(progressSteps.length - 1, i + 1));
      }, 3200);
      const save = await runGenerateReel(voBatch ?? undefined);
      toastAfterGenerate(save);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setPhase("error");
      setErrorMsg(msg);
      toast({
        title: "Generation failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
  }

  async function onGenerate() {
    if (!canGenerateReel || generating || !cachedVoiceover) return;
    setPhase("generating");
    setErrorMsg("");
    setProgressIdx(0);
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = window.setInterval(() => {
      setProgressIdx((i) => Math.min(progressSteps.length - 1, i + 1));
    }, 3200);

    try {
      const save = await runGenerateReel();
      toastAfterGenerate(save);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Generation failed");
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Studio error",
        variant: "destructive",
      });
    } finally {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
  }

  function restoreEnglishReel() {
    const snap = englishSnapshotRef.current;
    if (!snap) return;
    setHookClips(snap.hookClips.map((c) => ({ ...c })));
    setOutroLine1(snap.outroLine1);
    setOutroLine2(snap.outroLine2);
    setOutroCtaHeadline(snap.outroCtaHeadline);
    setOutroLanguagesLine(snap.outroLanguagesLine);
    setOutroVoiceover(snap.outroVoiceover);
    setOutroVoPhrases(normalizeOutroVoPhrases(undefined, snap.outroVoiceover));
    setOutroCopyEn(
      buildStudioOutroCopy({
        line1: snap.outroLine1,
        line2: snap.outroLine2,
        ctaHeadline: snap.outroCtaHeadline,
        languagesLine: snap.outroLanguagesLine,
        voiceover: snap.outroVoiceover,
      }),
    );
    setOutroLayout((prev) =>
      clearLocalizedLayers(
        syncLayerTextFromCopy(prev, buildStudioOutroCopy({
          line1: snap.outroLine1,
          line2: snap.outroLine2,
          ctaHeadline: snap.outroCtaHeadline,
          languagesLine: snap.outroLanguagesLine,
          voiceover: snap.outroVoiceover,
        })),
      ),
    );
    setCachedVoiceover(snap.cachedVoiceover);
    setLanguage("en");
    setResult(snap.result);
    applyGeneratePreview(snap.result);
    setTranslatePhase("ready");
    setTranslateError("");
  }

  async function onTranslateReel() {
    if (!result || !englishSnapshotRef.current || translatePhase === "translating") return;
    const snap = englishSnapshotRef.current;

    if (translateTargetLang === "en") {
      restoreEnglishReel();
      toast({
        title: "Restored English reel",
        description: "Hook and outro are back to your original English version.",
        duration: 3200,
      });
      return;
    }

    setTranslatePhase("translating");
    setTranslateError("");
    try {
      const translated = await translateStudioReel({
        targetLanguage: translateTargetLang,
        hookClips: snap.hookClips,
        outroVoiceover: snap.outroVoiceover,
        workspace: applyInterpreterSpeakerPattern(workspace),
        productPayoff: snap.result.storyboard?.productPayoff ?? productPayoff,
        sourceLang,
        targetLang,
        includeOutro,
        includeProductPayoff: snap.result.includeProductPayoff !== false,
        outroPhraseGapSec,
        hookVoiceId,
        outroVoiceId,
      });
      const mergedVo = mergeTranslatedStudioVoiceover(
        snap.cachedVoiceover,
        translated,
        snap.result.footageUrls,
        { includeOutro },
      );

      if (translated.productPayoff?.sayLine) {
        setProductPayoff(translated.productPayoff);
      }
      setHookClips(translated.hookClips.map((c) => ({ ...c })));
      if (translated.outroCopy) {
        setOutroLine1(translated.outroCopy.line1);
        setOutroLine2(translated.outroCopy.line2);
        setOutroCtaHeadline(translated.outroCopy.ctaHeadline);
        setOutroLanguagesLine(
          translated.outroCopy.languagesLine ?? UNIVERSAL_OUTRO_EN.languagesLine,
        );
        setOutroLayout((prev) =>
          applyLocalizedCopyToLayers(prev, translated.outroCopy!, translateTargetLang),
        );
      }
      setOutroVoiceover(translated.outroVoiceover);
      setOutroVoPhrases(normalizeOutroVoPhrases(undefined, translated.outroVoiceover));
      setCachedVoiceover(mergedVo);
      setLanguage(translateTargetLang);

      const updatedSave: GeneratedReelSave = {
        ...snap.result,
        language: translateTargetLang,
        hookVoClips: mergedVo.hookVoClips,
        hookDurationSec: mergedVo.hookDurationSec,
        audioBase64: mergedVo.audioBase64,
        words: mergedVo.words,
        workspaceVoClips: mergedVo.workspaceVoClips,
        outroAudioBase64: mergedVo.outroAudioBase64,
        outroWords: mergedVo.outroWords,
        productPayoffVoClip: mergedVo.productPayoffVoClip,
        productPayoffDurationSec: mergedVo.productPayoffDurationSec,
        includeProductPayoff: translated.includeProductPayoff,
        storyboard: {
          ...snap.result.storyboardEn,
          hookScript: translated.hookScript,
          hookScenes: snap.hookClips.map((c) => c.scenario),
          workspace: snap.result.storyboardEn.workspace,
          productPayoff: translated.productPayoff ?? snap.result.storyboard?.productPayoff,
          outroVoiceover: translated.outroVoiceover,
          outroCopy: translated.outroCopy,
        },
      };
      const langLabel = reelLanguageLabel(translateTargetLang);
      const translatedOutroCopy =
        translated.outroCopy ??
        buildStudioOutroCopy({
          line1: outroLine1,
          line2: outroLine2,
          ctaHeadline: outroCtaHeadline,
          languagesLine: outroLanguagesLine,
          voiceover: translated.outroVoiceover,
        });
      const enrichedSave = enrichGeneratedForLibrary(
        updatedSave,
        translated.hookClips.map((c) => ({
          scenario: c.scenario.trim(),
          sayLine: c.sayLine.trim(),
        })),
        applyInterpreterSpeakerPattern(workspace),
        translatedOutroCopy,
        translated.outroVoiceover,
      );
      const translatedDraft: StudioDraft = {
        ...buildLiveDraft(),
        hookClips: translated.hookClips.map((c) => ({
          scenario: c.scenario.trim(),
          sayLine: c.sayLine.trim(),
        })),
        language: translateTargetLang,
        outroLine1: translatedOutroCopy.line1,
        outroLine2: translatedOutroCopy.line2,
        outroCtaHeadline: translatedOutroCopy.ctaHeadline,
        outroLanguagesLine: translatedOutroCopy.languagesLine,
        outroVoiceover: translated.outroVoiceover,
        outroVoPhrases: normalizeOutroVoPhrases(undefined, translated.outroVoiceover),
        result: enrichedSave,
        cachedVoiceover: mergedVo,
        hookVoClips: enrichedSave.hookVoClips ?? [],
        hookDurationSec: enrichedSave.hookDurationSec ?? hookDurationSec,
        footageUrls: enrichedSave.footageUrls ?? footageUrls,
        hookAudio: enrichedSave.audioBase64,
        hookWords: enrichedSave.words ?? [],
        workspaceVoClips: enrichedSave.workspaceVoClips ?? [],
        updatedAt: Date.now(),
      };

      setResult(enrichedSave);
      applyGeneratePreview(enrichedSave);
      setTranslatePhase("ready");

      const newId = crypto.randomUUID();
      saveReel({
        id: newId,
        series,
        reelType: "generated_35s",
        targetLanguage: translateTargetLang,
        voiceActor: "adam",
        voiceSpeed: "1",
        musicBed: "none",
        brandTone: "none",
        brandStingEnabled: false,
        voVolume: 1,
        bgmVolume: 0.22,
        brandVolume: 0.8,
        problemVisual: "stock_broll",
        solutionVisual: "workspace_demo",
        hook: translated.hookScript,
        problem: "",
        solution: "",
        result: "",
        captions: translated.hookScript,
        outroLine1: translatedOutroCopy.line1,
        outroLine2: translatedOutroCopy.line2,
        batchId: editingReel?.batchId ?? null,
        variationIndex: 0,
        scheduleTag: langLabel,
        fromStudio: true,
        studioBrief: translated.hookScript,
        storyboardTitle: buildReelLibraryTitle({
          storyline: reelStorylineFromSayLines(
            translated.hookClips.map((c) => c.sayLine),
            STUDIO_SERIES.find((s) => s.id === series)?.label ?? "Reel",
          ),
          language: translateTargetLang,
        }),
        generated: enrichedSave,
        studioDraft: { ...translatedDraft, reelId: newId },
        downloadFilename: buildReelExportFilename({
          storyline: reelStorylineFromSayLines(
            translated.hookClips.map((c) => c.sayLine),
            STUDIO_SERIES.find((s) => s.id === series)?.label ?? "Reel",
          ),
          language: translateTargetLang,
        }),
        mp4Cached: false,
      });
      saveStudioDraft(newId, { ...translatedDraft, reelId: newId });
      setLibraryReelId(newId);

      toast({
        title: `Saved ${langLabel} version to Library`,
        description:
          "Full reel + voiceover cached locally. Preview anytime without regenerating or spending credits.",
        duration: 4200,
      });
    } catch (e) {
      setTranslatePhase("error");
      setTranslateError(e instanceof Error ? e.message : "Translation failed");
      toast({
        title: "Translation failed",
        description: e instanceof Error ? e.message : "Could not translate reel",
        variant: "destructive",
      });
    }
  }

  const providerStatus = result?.providerStatus ?? null;
  const footageErrorMsg = providerStatus?.footageError
    ? formatFootageProviderError(providerStatus.footageError)
    : null;

  function toastAfterGenerate(save: GeneratedReelSave) {
    const ps = save.providerStatus;
    const footageOk = ps.footage === "ok" && save.footageUrls.some(isPlayableFootageUrl);
    if (footageOk && ps.voice !== "unavailable") {
      toast({
        title: "Reel saved to Library",
        description: "Preview looks good — click Download MP4 under the player when ready.",
        duration: 4200,
      });
      return;
    }
    if (!footageOk && footageProvider === "google_veo") {
      toast({
        title: "Voiceover ready — no Veo footage",
        description:
          ps.footageError
            ? formatFootageProviderError(ps.footageError)
            : "Google Veo returned no clips. Enable Gemini billing or switch to Pexels.",
        variant: "destructive",
        duration: 8000,
      });
      return;
    }
    toast({
      title: "Reel saved to Library",
      description:
        !footageOk || ps.voice !== "ok"
          ? ps.footageError
            ? formatFootageProviderError(ps.footageError)
            : "Some providers were unavailable — preview what you can, then Download MP4."
          : "Click Download MP4 under the preview when you're ready.",
      duration: footageOk ? 3600 : 6000,
      variant: !footageOk ? "destructive" : undefined,
    });
  }
  const hookEstimateSec = useMemo(
    () =>
      hookClips.reduce(
        (sum, c) => sum + estimateSpeechSec(c.sayLine, language),
        0,
      ),
    [hookClips, language],
  );
  const hookPreviewSec =
    hookVoClips.length > 0 ? hookDurationSec : hookEstimateSec;
  const workspaceDurationSec = useMemo(
    () =>
      workspaceVoClips.length > 0
        ? computeWorkspaceDurationSec(workspaceVoClips)
        : workspaceScheduleDurationSec(
            buildEstimatedWorkspaceSchedule(workspace.exchanges),
          ),
    [workspaceVoClips, workspace.exchanges],
  );
  const totalEstimateSec =
    (includeHook ? hookEstimateSec : 0) +
    (includeWorkspace ? workspaceDurationSec : 0) +
    (effectiveIncludeProductPayoff ? productPayoffDurationSec : 0) +
    effectiveWorkspaceOutroGap +
    (includeOutro ? outroDurationSec : 0);
  const totalPreviewSec =
    (result || (!includeHook && voCoversSelection)) &&
    (includeHook ? hookVoClips.length > 0 : true)
      ? (previewIncludeHook ? hookPreviewSec : 0) +
        (previewIncludeWorkspace ? workspaceDurationSec : 0) +
        (previewIncludeProductPayoff ? productPayoffDurationSec : 0) +
        (previewIncludeOutro ? effectiveWorkspaceOutroGap : 0) +
        (previewIncludeOutro ? outroDurationSec : 0)
      : totalEstimateSec;

  function updateExchange(i: number, patch: Partial<WorkspaceExchange>) {
    setWorkspace((w) => {
      const exchanges = w.exchanges.map((ex, j) => (j === i ? { ...ex, ...patch } : ex));
      return applyInterpreterSpeakerPattern({ ...w, exchanges });
    });
  }

  function addHookClip() {
    setHookClips((prev) =>
      prev.length >= MAX_HOOK_CLIPS
        ? prev
        : [...prev, { scenario: "", sayLine: "" }],
    );
  }

  function removeHookClip(i: number) {
    setHookClips((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  function addExchange() {
    setWorkspace((w) => appendWorkspaceExchange(w, MAX_WORKSPACE_EXCHANGES));
  }

  function removeExchange(i: number) {
    setWorkspace((w) => {
      if (w.exchanges.length <= 1) return w;
      const exchanges = w.exchanges.filter((_, j) => j !== i);
      return applyInterpreterSpeakerPattern({ ...w, exchanges });
    });
  }

  async function playOutroPreview() {
    setOutroPreviewState("loading");
    setOutroPreviewMsg("");
    try {
      outroAudioRef.current?.pause();
      const blob = await resolveOutroPreviewAudio({
        voiceoverText: outroVoiceover,
        language: displayLanguage,
        generatedBase64: cachedVoiceover?.outroAudioBase64 ?? result?.outroAudioBase64,
        phraseGapSec: outroPhraseGapSec,
      });
      if (!blob) {
        throw new Error(
          cachedVoiceover?.outroAudioBase64 || result?.outroAudioBase64
            ? "Outro playback failed"
            : "Generate voiceover first — preview does not call ElevenLabs (saves credits)",
        );
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      outroAudioRef.current = audio;
      audio.onended = () => {
        setOutroPreviewState("idle");
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setOutroPreviewState("error");
        setOutroPreviewMsg("Playback failed");
      };
      await audio.play();
      setOutroPreviewState("playing");
      setOutroPreviewMsg("Playing your outro voiceover script");
    } catch (e) {
      setOutroPreviewState("error");
      setOutroPreviewMsg(e instanceof Error ? e.message : "Outro preview failed");
    }
  }

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: COLORS.bg, color: COLORS.ink, fontFamily: TYPE.body.family }}>
      <div style={{ maxWidth: 1480, margin: "0 auto", padding: "32px 40px 96px" }}>
        <header style={{ marginBottom: 28 }}>
          <p style={eyebrow}>Creative Studio</p>
          <h1 style={titleStyle}>
            {isNew ? "New commercial" : editingReel?.title ?? "Edit reel"}
          </h1>
          <p style={subtitleStyle}>
            {isNew
              ? "3+ clips — describe each shot, write what to say. Your draft saves automatically on refresh."
              : "Editing a saved reel — hook clips, workspace, and outro restore from Library."}
            {" "}
            Hook length follows your voiceover. Then workspace demo + optional brand outro.
          </p>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <section style={panel}>
              <SectionLabel>Video format</SectionLabel>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                Reel (9:16) for TikTok, Reels, and Shorts — or landscape (16:9) for normal widescreen video.
                Preview and MP4 export use {canvasSize.width}×{canvasSize.height}px.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {(["9:16", "16:9"] as const).map((ar) => {
                  const active = aspectRatio === ar;
                  const size = previewSizeForAspect(ar);
                  return (
                    <button
                      key={ar}
                      type="button"
                      disabled={generating || voGenerating}
                      onClick={() => setAspectRatio(ar)}
                      style={{
                        flex: 1,
                        maxWidth: 220,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: active
                          ? "1px solid rgba(32,212,240,0.55)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: active ? "rgba(32,212,240,0.12)" : "rgba(255,255,255,0.03)",
                        color: COLORS.ink,
                        cursor: generating || voGenerating ? "not-allowed" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {ar === "9:16" ? "Reel · vertical" : "Landscape · widescreen"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: COLORS.inkMuted }}>
                        {ar} · preview {size.width}×{size.height}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={panel}>
              <SectionLabel>Hook footage provider</SectionLabel>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                Choose where hook b-roll comes from — same clip descriptions, same generate flow.
                Switch providers and regenerate to compare Pexels stock vs Google Veo AI.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {FOOTAGE_PROVIDER_OPTIONS.map((opt) => {
                  const active = footageProvider === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={generating || voGenerating}
                      onClick={() => setFootageProvider(opt.id)}
                      style={{
                        flex: "1 1 220px",
                        maxWidth: 320,
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: active
                          ? "1px solid rgba(32,212,240,0.55)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: active ? "rgba(32,212,240,0.12)" : "rgba(255,255,255,0.03)",
                        color: COLORS.ink,
                        cursor: generating || voGenerating ? "not-allowed" : "pointer",
                        opacity: generating || voGenerating ? 0.65 : 1,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.4 }}>
                        {opt.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
              {footageSource !== "none" && footageSource !== footageProvider ? (
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "#FBBF24" }}>
                  Preview shows {hookFootageLabel(footageSource)} — regenerate reel to fetch{" "}
                  {hookFootageProviderLabel(footageProvider)} footage.
                </p>
              ) : null}
            </section>

            <section style={panel}>
              <SectionLabel>Hook · {hookClips.length} clip{hookClips.length === 1 ? "" : "s"}</SectionLabel>
              <div style={editorPreviewRow}>
                <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.ink,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeHook}
                  onChange={(e) => setIncludeHook(e.target.checked)}
                  disabled={generating}
                  style={{ width: 16, height: 16, accentColor: COLORS.accent }}
                />
                Include hook in the reel
              </label>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                For each clip: describe the footage ({hookFootageProviderLabel(footageProvider)} search) and exactly what the voiceover
                says. Footage, subtitles, and audio stay synced per clip. Write hook lines in English —
                translate the finished reel at the bottom after you generate it.
                {!includeHook ? (
                  <span style={{ display: "block", marginTop: 6, color: "#67E8F9" }}>
                    Hook disabled — reel starts with workspace (or outro if workspace is off).
                  </span>
                ) : null}
              </p>
              {includeHook ? (
              <>
              {hookClips.map((clip, i) => (
                <div key={i} style={clipCard}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
                      Clip {i + 1}
                      <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.inkFaint }}>
                        ~{estimateSpeechSec(clip.sayLine, language).toFixed(1)}s
                      </span>
                      {hookVoClips[i]?.footageStatus === "footage_needed" ? (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#F87171" }}>
                          · Footage needed
                        </span>
                      ) : isPlayableFootageUrl(hookVoClips[i]?.footageUrl ?? "") ? (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#34D399" }}>
                          · {hookFootageProviderLabel(
                            detectFootageSource([hookVoClips[i]!.footageUrl], footageProvider) === "google_veo"
                              ? "google_veo"
                              : "pexels",
                          )}{" "}
                          ✓
                        </span>
                      ) : null}
                    </p>
                    {hookClips.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeHookClip(i)}
                        disabled={generating}
                        style={iconBtn}
                        title="Remove clip"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                  <Field label="Footage — describe the scene">
                    <textarea
                      value={clip.scenario}
                      onChange={(e) =>
                        setHookClips((prev) =>
                          prev.map((c, j) => (j === i ? { ...c, scenario: e.target.value } : c)),
                        )
                      }
                      rows={2}
                      disabled={generating}
                      placeholder="e.g. Vertical portrait nurse typing at hospital laptop, stressed, cinematic"
                      style={{ ...selectStyle, resize: "vertical", lineHeight: 1.45 }}
                    />
                  </Field>
                  <Field label="Say this (voiceover + subtitles)">
                    <textarea
                      value={clip.sayLine}
                      onChange={(e) =>
                        setHookClips((prev) =>
                          prev.map((c, j) => (j === i ? { ...c, sayLine: e.target.value } : c)),
                        )
                      }
                      rows={2}
                      disabled={generating}
                      placeholder="e.g. Medical staff waste hours typing call transcripts."
                      style={{ ...selectStyle, resize: "vertical", lineHeight: 1.45, marginTop: 8 }}
                    />
                  </Field>
                </div>
              ))}

              {hookClips.length < MAX_HOOK_CLIPS ? (
                <button type="button" onClick={addHookClip} disabled={generating} style={addBtn}>
                  <Plus size={15} />
                  Add hook clip
                </button>
              ) : (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: COLORS.inkFaint }}>
                  Max {MAX_HOOK_CLIPS} hook clips
                </p>
              )}

              <div style={{ marginTop: 14, maxWidth: 360 }}>
                <Field label="Hook speaker · professional ElevenLabs VO">
                  <VoiceActorSelect
                    value={hookVoiceId}
                    onChange={setHookVoiceId}
                    disabled={generating || !includeHook}
                    previewLanguage="en"
                  />
                </Field>
              </div>
              </>
              ) : null}
              <div style={{ marginTop: 14, maxWidth: 360 }}>
                <ClipSubtitleSizeField
                  value={subtitleScale}
                  onChange={setSubtitleScale}
                  disabled={generating || voGenerating}
                />
              </div>
              <div style={{ marginTop: 14, maxWidth: 280 }}>
                <Field label="Series">
                  <select value={series} onChange={(e) => setSeries(e.target.value as SeriesType)} disabled={generating} style={selectStyle}>
                    {STUDIO_SERIES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
                </div>
                <PreviewColumn
                  label={
                    showStudioHookPreview
                      ? hookOnlyReel
                        ? `Hook-only preview · ${hookPreviewSec.toFixed(1)}s · ${aspectRatio}`
                        : `Hook preview · ${hookPreviewSec.toFixed(1)}s · ${aspectRatio}`
                      : `Reel preview · ${totalPreviewSec.toFixed(1)}s · ${aspectRatio}`
                  }
                >
                  {showFullReelPreview && storyboard ? (
                    <StudioFullReelPreview
                      ref={fullPreviewRef}
                      key={`full-${result?.createdAt ?? "reel"}-${displayLanguage}-${hookVoClips.length}-${footageUrls.length}-${previewIncludeOutro}-${previewIncludeWorkspace}-${previewIncludeProductPayoff}`}
                      hookVoClips={hookVoClips}
                      hookWords={englishRestore ? [] : hookWords}
                      hookAudio={englishRestore ? null : hookAudio}
                      hookDurationSec={hookPreviewSec}
                      hookScript={storyboard.hookScript}
                      footageUrls={footageUrls}
                      workspace={workspace}
                      languagePair={languagePair}
                      workspaceVoClips={
                        englishRestore || !previewIncludeWorkspace ? [] : workspaceVoClips
                      }
                      workspaceDurationSec={
                        previewIncludeWorkspace ? workspaceDurationSec : undefined
                      }
                      outroCopy={outroCopy}
                      outroLayout={outroLayout}
                      outroPhraseTimings={outroPhraseTimings}
                      outroVoiceover={outroVoiceover}
                      outroDurationSec={previewIncludeOutro ? outroDurationSec : 0}
                      outroAudioBase64={
                        previewIncludeOutro
                          ? cachedVoiceover?.outroAudioBase64 ?? result?.outroAudioBase64 ?? null
                          : null
                      }
                      includeOutro={previewIncludeOutro}
                      includeWorkspace={previewIncludeWorkspace}
                      includeHook={previewIncludeHook}
                      includeProductPayoff={previewIncludeProductPayoff}
                      workspaceOutroGapSec={effectiveWorkspaceOutroGap}
                      aspectRatio={aspectRatio}
                      productPayoffVoClip={
                        englishRestore || !previewIncludeProductPayoff ? null : productPayoffVoClip
                      }
                      productPayoffDurationSec={
                        previewIncludeProductPayoff ? productPayoffDurationSec : 0
                      }
                      productPayoffSayLine={productPayoff.sayLine}
                      productPayoffHeadline={productPayoff.headline}
                      productPayoffSupportingText={productPayoff.supportingText}
                      targetLanguage={displayLanguage}
                      subtitleScale={subtitleScale}
                      accentColor={COLORS.accent}
                      filename={mp4ExportFilename}
                      reelId={libraryReelId ?? undefined}
                      onMp4Cached={() => {
                        const id = libraryReelId ?? reelKey;
                        if (id) markMp4Cached(id, mp4ExportFilename);
                      }}
                    />
                  ) : showStudioHookPreview ? (
                    <div style={{ position: "relative" }}>
                      {generating ? (
                        <div
                          style={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            zIndex: 20,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "rgba(0,0,0,0.55)",
                            fontSize: 11,
                            color: "#67E8F9",
                          }}
                        >
                          <Loader2 size={13} className="animate-spin" />
                          Fetching footage…
                        </div>
                      ) : null}
                      <StudioHookVoPreview
                        key={`hook-${result?.createdAt ?? cachedVoiceover?.fingerprint ?? "vo"}-${hookVoClips.length}-${footageUrls.length}`}
                        hookVoClips={hookVoClips}
                        hookWords={hookWords}
                        hookAudio={hookAudio}
                        hookDurationSec={hookPreviewSec}
                        hookScript={
                          storyboard?.hookScript ?? hookClips.map((c) => c.sayLine).join(" ")
                        }
                        targetLanguage={displayLanguage}
                        subtitleScale={subtitleScale}
                        accentColor={COLORS.accent}
                        footageUrls={footageUrls}
                        selectionNote={hookPreviewSelectionNote}
                      />
                    </div>
                  ) : (
                    <div style={emptyPreview}>
                      {generating || voGenerating ? (
                        <Loader2 className="animate-spin" size={22} />
                      ) : includeHook && hasHookVo ? (
                        <>Hook voiceover ready — Generate Reel to attach footage and download MP4</>
                      ) : !includeHook && voCoversSelection ? (
                        <>Voiceover ready — preview loads above; Generate Reel to finalize MP4</>
                      ) : !includeHook ? (
                        <>~{totalEstimateSec.toFixed(1)}s reel · generate voiceover to preview</>
                      ) : (
                        <>Hook ~{hookEstimateSec.toFixed(1)}s · generate voiceover to preview</>
                      )}
                    </div>
                  )}
                </PreviewColumn>
              </div>
            </section>

            <section style={panel}>
              <SectionLabel>Workspace dialogue · ~{workspaceDurationSec.toFixed(1)}s VO</SectionLabel>
              <div style={editorPreviewRow}>
                <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.ink,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeWorkspace}
                  onChange={(e) => setIncludeWorkspace(e.target.checked)}
                  disabled={generating}
                  style={{ width: 16, height: 16, accentColor: COLORS.accent }}
                />
                Include workspace dialogue in the reel
              </label>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                Two speakers, two languages. <span style={{ color: "#3B82F6" }}>Blue</span> speaks Language A in
                ORIGINAL — <span style={{ color: "#EAB308" }}>Yellow</span> speaks Language B in ORIGINAL. TRANSLATION
                column always shows the other language so each side can understand. On each exchange pick{" "}
                <span style={{ color: "#3B82F6" }}>Blue</span>, <span style={{ color: "#EAB308" }}>Yellow</span>, or{" "}
                <span style={{ color: WORKSPACE_SPEAKER_COLORS.C }}>Pink 3rd</span> — after a pink turn you choose who
                speaks next (nothing is forced).
                {!includeWorkspace ? (
                  <span style={{ display: "block", marginTop: 6, color: "#67E8F9" }}>
                    Workspace disabled — reel jumps from hook to outro (or ends after hook if outro is off).
                  </span>
                ) : null}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <Field label="Language A · blue speaker">
                    <select
                      value={sourceLang}
                      onChange={(e) => setSourceLang(e.target.value)}
                      disabled={generating}
                      style={selectStyle}
                    >
                      {REEL_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Blue speaker voice">
                    <VoiceActorSelect
                      value={workspaceSpeakerAVoiceId}
                      onChange={setWorkspaceSpeakerAVoiceId}
                      disabled={generating || !includeWorkspace}
                      accent="#3B82F6"
                      previewLanguage={sourceLang}
                    />
                  </Field>
                  <div style={{ marginTop: 10 }}>
                    <DeliveryPresetSelect
                      value={workspaceSpeakerADelivery}
                      onChange={setWorkspaceSpeakerADelivery}
                      voiceId={workspaceSpeakerAVoiceId}
                      language={sourceLang}
                      disabled={generating || !includeWorkspace}
                      accent="#3B82F6"
                      label="Blue delivery style · all exchanges"
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 10, color: COLORS.inkFaint, lineHeight: 1.4 }}>
                    ▶ Listen to any voice/style before generating — Language A stays consistent on every blue line.
                  </p>
                </div>
                <div>
                  <Field label="Language B · yellow speaker">
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      disabled={generating}
                      style={selectStyle}
                    >
                      {REEL_LANGUAGES.filter((l) => l.code !== sourceLang).map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Yellow speaker voice">
                    <VoiceActorSelect
                      value={workspaceSpeakerBVoiceId}
                      onChange={setWorkspaceSpeakerBVoiceId}
                      disabled={generating || !includeWorkspace}
                      accent="#EAB308"
                      previewLanguage={targetLang}
                    />
                  </Field>
                  <div style={{ marginTop: 10 }}>
                    <DeliveryPresetSelect
                      value={workspaceSpeakerBDelivery}
                      onChange={setWorkspaceSpeakerBDelivery}
                      voiceId={workspaceSpeakerBVoiceId}
                      language={targetLang}
                      disabled={generating || !includeWorkspace}
                      accent="#EAB308"
                      label="Yellow delivery style · all exchanges"
                    />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 10, color: COLORS.inkFaint, lineHeight: 1.4 }}>
                    ▶ Listen first — e.g. hesitant LEP, terrified patient, or energetic staff.
                  </p>
                </div>
              </div>
              <div style={{ marginTop: 12, maxWidth: 420 }}>
                <DeliveryPresetSelect
                  value={workspaceThirdSpeakerDelivery}
                  onChange={setWorkspaceThirdSpeakerDelivery}
                  voiceId={defaultThirdSpeakerVoiceId(
                    workspaceSpeakerAVoiceId,
                    workspaceSpeakerBVoiceId,
                    workspaceThirdSpeakerVoiceId,
                  )}
                  language={sourceLang}
                  disabled={generating || !includeWorkspace}
                  accent={WORKSPACE_SPEAKER_COLORS.C}
                  label="Pink 3rd speaker delivery · all exchanges"
                />
              </div>

              {workspace.exchanges.map((ex, i) => {
                const accent = exchangeAccentColor(ex);
                const useThird = ex.speaker === "C" || !!ex.thirdSpeakerVoiceId;
                const thirdVoiceId = resolveThirdSpeakerVoiceId(
                  ex.thirdSpeakerVoiceId,
                  workspaceSpeakerAVoiceId,
                  workspaceSpeakerBVoiceId,
                  workspaceThirdSpeakerVoiceId,
                );
                const enableThirdSpeaker = () => {
                  const voice = defaultThirdSpeakerVoiceId(
                    workspaceSpeakerAVoiceId,
                    workspaceSpeakerBVoiceId,
                    workspaceThirdSpeakerVoiceId,
                  );
                  setWorkspaceThirdSpeakerVoiceId(voice);
                  setWorkspace((w) =>
                    setExchangeSpeakerRole(w, i, "C", { thirdSpeakerVoiceId: voice }),
                  );
                };
                const setThirdSpeakerVoice = (id: VoiceActorId) => {
                  setWorkspaceThirdSpeakerVoiceId(id);
                  updateExchange(i, { thirdSpeakerVoiceId: id });
                };
                const chooseSpeaker = (role: WorkspaceSpeaker) => {
                  if (role === "C") {
                    enableThirdSpeaker();
                    return;
                  }
                  setWorkspace((w) => setExchangeSpeakerRole(w, i, role));
                };
                const setPinkLanguage = (lang: string) => {
                  setWorkspace((w) =>
                    setExchangeSpeakerRole(w, i, "C", {
                      thirdSpeakerVoiceId: thirdVoiceId,
                      pinkOriginalLang: lang,
                    }),
                  );
                };
                return (
                <div key={ex.id} style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.glassBorder}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontSize: 11, color: COLORS.inkFaint }}>
                      Exchange {i + 1} ·{" "}
                      <span style={{ color: accent }}>
                        {exchangeSpeakerLabel(ex)}
                      </span>
                      {" "}· speaks {reelLanguageLabel(ex.originalLang)} · ~{exchangeEditorDurationSec(ex, workspace.exchanges).toFixed(1)}s
                    </p>
                    {workspace.exchanges.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeExchange(i)}
                        disabled={generating}
                        style={iconBtn}
                        title="Remove exchange"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                  <ExchangeSpeakerPicker
                    speaker={useThird ? "C" : ex.speaker === "B" ? "B" : "A"}
                    disabled={generating || voGenerating || !includeWorkspace}
                    sourceLang={sourceLang}
                    targetLang={targetLang}
                    pinkOriginalLang={ex.originalLang}
                    onChoose={chooseSpeaker}
                    onPinkLanguage={setPinkLanguage}
                  />
                  <Field
                    label={`ORIGINAL — ${useThird ? "Pink 3rd speaker" : ex.speaker === "A" ? "Blue speaks" : "Yellow speaks"} (${reelLanguageLabel(ex.originalLang)})`}
                  >
                    <textarea
                      value={ex.original}
                      onChange={(e) => updateExchange(i, { original: e.target.value })}
                      rows={2}
                      dir={isRtlLanguage(ex.originalLang) ? "rtl" : "ltr"}
                      style={{ ...selectStyle, resize: "vertical" }}
                    />
                  </Field>
                  {useThird ? (
                    <div style={{ marginTop: 10 }}>
                      <Field label="3rd speaker voice (pink) — different from blue & yellow">
                        <VoiceActorSelect
                          value={thirdVoiceId}
                          onChange={setThirdSpeakerVoice}
                          disabled={generating}
                          accent={WORKSPACE_SPEAKER_COLORS.C}
                          previewLanguage={ex.originalLang}
                          excludeVoiceIds={[workspaceSpeakerAVoiceId, workspaceSpeakerBVoiceId]}
                        />
                      </Field>
                      <p style={{ margin: "6px 0 0", fontSize: 10, color: COLORS.inkFaint, lineHeight: 1.4 }}>
                        Remembers this pink voice for the next time you add a 3rd speaker.
                      </p>
                    </div>
                  ) : null}
                  <Field
                    label={`TRANSLATION — other language (${reelLanguageLabel(ex.translationLang)})`}
                  >
                    <textarea
                      value={ex.translation}
                      onChange={(e) => updateExchange(i, { translation: e.target.value })}
                      rows={2}
                      dir={isRtlLanguage(ex.translationLang) ? "rtl" : "ltr"}
                      style={{ ...selectStyle, resize: "vertical", marginTop: 8 }}
                    />
                  </Field>
                </div>
              );
              })}

              {workspace.exchanges.length < MAX_WORKSPACE_EXCHANGES ? (
                <button type="button" onClick={addExchange} disabled={generating} style={addBtn}>
                  <Plus size={15} />
                  Add exchange ({workspace.exchanges.length}/{MAX_WORKSPACE_EXCHANGES})
                </button>
              ) : (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: COLORS.inkFaint }}>
                  Max {MAX_WORKSPACE_EXCHANGES} exchanges
                </p>
              )}
                </div>
                <PreviewColumn label={`Workspace preview · ~${workspaceDurationSec.toFixed(1)}s`}>
                  {includeWorkspace ? (
                    <WorkspacePreviewPanel
                      conversation={workspace}
                      languagePair={languagePair}
                      subtitleScale={subtitleScale}
                    />
                  ) : (
                    <div style={emptyPreview}>Workspace disabled — not included in reel</div>
                  )}
                </PreviewColumn>
              </div>
            </section>

            <section style={panel}>
              <SectionLabel>
                Product payoff · ~{productPayoffDurationSec.toFixed(1)}s
              </SectionLabel>
              <div style={editorPreviewRow}>
                <div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 16,
                      fontSize: 13,
                      fontWeight: 600,
                      color: COLORS.ink,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeProductPayoff}
                      onChange={(e) => setIncludeProductPayoff(e.target.checked)}
                      disabled={generating}
                      style={{ width: 16, height: 16, accentColor: COLORS.accent }}
                    />
                    Include product payoff after workspace demo
                  </label>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                    One concise benefit statement — why the interpreter should care. Does not repeat
                    the workspace demo. AI can generate this automatically; edit voiceover and footage
                    description as needed.
                    {!includeWorkspace ? (
                      <span style={{ display: "block", marginTop: 6, color: "#67E8F9" }}>
                        Workspace is off — payoff still plays between hook and outro if enabled.
                      </span>
                    ) : null}
                  </p>
                  {includeProductPayoff ? (
                    <>
                      <Field label="Say this (voiceover + subtitles)">
                        <textarea
                          value={productPayoff.sayLine}
                          onChange={(e) =>
                            setProductPayoff((p) => ({ ...p, sayLine: e.target.value, enabled: true }))
                          }
                          rows={3}
                          disabled={generating}
                          placeholder="e.g. InterpreterAI keeps both sides of the conversation clear in real time…"
                          style={{ ...selectStyle, resize: "vertical", lineHeight: 1.45 }}
                        />
                      </Field>
                      <div style={{ marginTop: 14, maxWidth: 360 }}>
                        <Field label="Payoff speaker · professional ElevenLabs VO">
                          <VoiceActorSelect
                            value={productPayoffVoiceId}
                            onChange={setProductPayoffVoiceId}
                            disabled={generating}
                            previewLanguage="en"
                          />
                        </Field>
                      </div>
                      <div style={{ marginTop: 14, maxWidth: 360 }}>
                        <ClipSubtitleSizeField
                          value={subtitleScale}
                          onChange={setSubtitleScale}
                          disabled={generating || voGenerating}
                        />
                      </div>
                      <Field label="Footage — describe the scene">
                        <textarea
                          value={productPayoff.scenario}
                          onChange={(e) =>
                            setProductPayoff((p) => ({ ...p, scenario: e.target.value, enabled: true }))
                          }
                          rows={3}
                          disabled={generating}
                          placeholder="Mix real workspace footage with diverse stock b-roll…"
                          style={{ ...selectStyle, resize: "vertical", lineHeight: 1.45, marginTop: 8 }}
                        />
                      </Field>
                      <Field label="Optional on-screen headline">
                        <input
                          type="text"
                          value={productPayoff.headline ?? ""}
                          onChange={(e) =>
                            setProductPayoff((p) => ({ ...p, headline: e.target.value, enabled: true }))
                          }
                          disabled={generating}
                          placeholder="Optional headline overlay"
                          style={{ ...selectStyle, marginTop: 8 }}
                        />
                      </Field>
                      <Field label="Optional supporting text">
                        <input
                          type="text"
                          value={productPayoff.supportingText ?? ""}
                          onChange={(e) =>
                            setProductPayoff((p) => ({
                              ...p,
                              supportingText: e.target.value,
                              enabled: true,
                            }))
                          }
                          disabled={generating}
                          placeholder="Optional subline"
                          style={{ ...selectStyle, marginTop: 8 }}
                        />
                      </Field>
                      {productPayoffVoClip?.footageStatus === "footage_needed" ? (
                        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#F87171", fontWeight: 600 }}>
                          Footage needed — regenerate reel or upload footage manually for this scene.
                        </p>
                      ) : isPlayableFootageUrl(productPayoffVoClip?.footageUrl ?? "") ? (
                        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#34D399" }}>
                          {hookFootageProviderLabel(footageProvider)} footage attached ✓
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: COLORS.inkFaint }}>
                      Product payoff disabled — reel jumps from workspace to outro.
                    </p>
                  )}
                </div>
                <PreviewColumn label={`Product payoff · ~${productPayoffDurationSec.toFixed(1)}s`}>
                  {includeProductPayoff && productPayoff.sayLine.trim() ? (
                    <div style={{ padding: 16, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
                      <p style={{ margin: "0 0 10px", fontWeight: 700, color: COLORS.ink }}>VO preview text</p>
                      <p style={{ margin: 0 }}>{productPayoff.sayLine}</p>
                      {productPayoff.headline ? (
                        <p style={{ margin: "14px 0 0", fontWeight: 700, color: COLORS.ink }}>
                          {productPayoff.headline}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div style={emptyPreview}>Enable product payoff to edit benefit copy</div>
                  )}
                </PreviewColumn>
              </div>
            </section>

            <section style={panel}>
              <SectionLabel>Workspace → outro pause</SectionLabel>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 14,
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.ink,
                  cursor: includeOutro ? "pointer" : "default",
                  opacity: includeOutro ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={workspaceOutroGapEnabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setWorkspaceOutroGapEnabled(on);
                    if (on && workspaceOutroGapSec <= 0) setWorkspaceOutroGapSec(1.5);
                  }}
                  disabled={generating || !includeOutro}
                  style={{ width: 16, height: 16, accentColor: COLORS.accent }}
                />
                Add silent gap before outro
              </label>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                Control the natural pause between workspace (or product payoff) and the brand outro only —
                does not affect hook or workspace timing.
                {!includeOutro ? (
                  <span style={{ display: "block", marginTop: 6, color: "#67E8F9" }}>
                    Outro is off — gap has no effect.
                  </span>
                ) : null}
              </p>
              {workspaceOutroGapEnabled && includeOutro ? (
                <div style={{ maxWidth: 360 }}>
                  <Field label={`Gap length · ${effectiveWorkspaceOutroGap.toFixed(1)}s`}>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={0.1}
                      value={workspaceOutroGapSec}
                      onChange={(e) => setWorkspaceOutroGapSec(Number(e.target.value))}
                      disabled={generating}
                      style={{ width: "100%", accentColor: COLORS.accent }}
                    />
                  </Field>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: COLORS.inkFaint }}>
                    Preview and export hold the last frame with no voiceover during this pause.
                  </p>
                </div>
              ) : null}
            </section>

            <section style={panel}>
              <SectionLabel>Approved outro · ~{outroDurationSec.toFixed(1)}s</SectionLabel>
              <div style={editorPreviewRow}>
                <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.ink,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeOutro}
                  onChange={(e) => setIncludeOutro(e.target.checked)}
                  disabled={generating}
                  style={{ width: 16, height: 16, accentColor: COLORS.accent }}
                />
                Include brand outro in the reel
              </label>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                Voiceover and on-screen text are edited separately — they can be completely different.
                Each clip keeps one shared timing slot so animation stays synced. Regenerate voiceover
                after VO edits. Uncheck to end the reel right after{" "}
                {includeWorkspace ? "workspace speech" : "the hook"}.
              </p>

              <OutroPhraseClipEditor
                voPhrases={outroVoPhrases}
                onVoPhraseChange={patchOutroVoPhrase}
                phraseMuted={outroPhraseMuted}
                onPhraseMutedChange={(index, muted) =>
                  setOutroPhraseMuted((prev) => {
                    const next = [...normalizeOutroPhraseMuted(prev)];
                    if (index >= 0 && index < next.length) next[index] = muted;
                    return next;
                  })
                }
                screen={outroScreen}
                onScreenChange={patchOutroLayerText}
                phraseTimings={outroPhraseTimings}
                hasVoSync={outroHasVoSync}
                playheadSec={outroPlayheadSec}
                playing={outroPreviewPlaying}
                language={displayLanguage}
                disabled={generating || voGenerating || !includeOutro}
              />

              <div style={{ marginTop: 16 }}>
                <Field label="Outro speaker · professional ElevenLabs VO">
                  <VoiceActorSelect
                    value={outroVoiceId}
                    onChange={setOutroVoiceId}
                    disabled={generating || !includeOutro}
                    previewLanguage={displayLanguage}
                  />
                </Field>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: COLORS.inkFaint }}>
                ~{outroEstimateSec.toFixed(1)}s · {outroPhrases.length} spoken phrase
                {outroPhrases.length === 1 ? "" : "s"}
                {outroPhraseMuted.some(Boolean)
                  ? ` · ${outroPhraseMuted.filter(Boolean).length} muted`
                  : ""}
                {outroHasVoSync ? " · synced to generated audio" : " · sync after voiceover"}
              </p>

              <button
                type="button"
                onClick={() => setOutroAdvancedOpen((v) => !v)}
                style={{ ...smallBtn, marginTop: 14 }}
              >
                {outroAdvancedOpen ? "Hide advanced layout" : "Advanced · layout & animation"}
              </button>

              {outroAdvancedOpen ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 14,
                  border: `1px solid ${outroEditLayersMode ? "rgba(32,212,240,0.35)" : COLORS.glassBorder}`,
                  background: outroEditLayersMode ? "rgba(32,212,240,0.06)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <button
                    type="button"
                    disabled={generating || !includeOutro}
                    onClick={() => setOutroEditLayersMode((v) => !v)}
                    style={{
                      ...smallBtn,
                      borderColor: outroEditLayersMode ? COLORS.accent : COLORS.glassBorder,
                      color: outroEditLayersMode ? COLORS.accent : COLORS.inkMuted,
                      background: outroEditLayersMode ? "rgba(32,212,240,0.12)" : "transparent",
                    }}
                  >
                    {outroEditLayersMode ? "Edit layers · ON" : "Edit layers · OFF"}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedOutroLayerId || generating || !outroEditLayersMode}
                    onClick={() => {
                      if (!selectedOutroLayerId) return;
                      setOutroLayout((prev) => resetLayerToDefault(selectedOutroLayerId, prev));
                    }}
                    style={smallBtn}
                  >
                    Reset selected
                  </button>
                  <button
                    type="button"
                    disabled={generating || !outroEditLayersMode}
                    onClick={() => {
                      setOutroLayout((prev) => resetAllLayersToDefault(prev));
                      setSelectedOutroLayerId(null);
                    }}
                    style={smallBtn}
                  >
                    Reset all layers
                  </button>
                </div>

                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.inkFaint }}>
                  Layers
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: outroEditLayersMode ? 14 : 0 }}>
                  {(Object.keys(OUTRO_LAYER_LABELS) as OutroLayerId[]).map((id) => {
                    const active = selectedOutroLayerId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={generating || !includeOutro || !outroEditLayersMode}
                        onClick={() => setSelectedOutroLayerId(id)}
                        style={{
                          ...smallBtn,
                          borderColor: active ? COLORS.accent : COLORS.glassBorder,
                          color: active ? COLORS.accent : COLORS.inkMuted,
                          background: active ? "rgba(32,212,240,0.14)" : "transparent",
                        }}
                      >
                        {OUTRO_LAYER_LABELS[id]}
                      </button>
                    );
                  })}
                </div>

                {outroEditLayersMode ? (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.inkFaint }}>
                      Text sizes (px)
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                      {OUTRO_TEXT_LAYER_IDS.map((id) => (
                        <Field key={id} label={OUTRO_LAYER_LABELS[id]}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              disabled={generating || outroLayout.layers[id].fontSize <= 10}
                              onClick={() =>
                                setOutroLayout((prev) =>
                                  updateLayerFontSize(prev, id, prev.layers[id].fontSize - 1),
                                )
                              }
                              style={{ ...smallBtn, padding: "6px 10px", minWidth: 32 }}
                              aria-label={`Decrease ${OUTRO_LAYER_LABELS[id]} font size`}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={10}
                              max={320}
                              step={1}
                              value={outroLayout.layers[id].fontSize}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!Number.isFinite(n)) return;
                                setOutroLayout((prev) => updateLayerFontSize(prev, id, n));
                              }}
                              disabled={generating}
                              style={{ ...selectStyle, width: 56, textAlign: "center", padding: "8px 6px" }}
                            />
                            <button
                              type="button"
                              disabled={generating || outroLayout.layers[id].fontSize >= 320}
                              onClick={() =>
                                setOutroLayout((prev) =>
                                  updateLayerFontSize(prev, id, prev.layers[id].fontSize + 1),
                                )
                              }
                              style={{ ...smallBtn, padding: "6px 10px", minWidth: 32 }}
                              aria-label={`Increase ${OUTRO_LAYER_LABELS[id]} font size`}
                            >
                              +
                            </button>
                          </div>
                        </Field>
                      ))}
                    </div>
                  </div>
                ) : null}

                {outroEditLayersMode && selectedOutroLayerId ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <Field label="Animation">
                      <select
                        value={outroLayout.layers[selectedOutroLayerId].animation}
                        onChange={(e) => {
                          const animation = e.target.value as OutroAnimationPreset;
                          setOutroLayout((prev) => ({
                            ...prev,
                            layers: {
                              ...prev.layers,
                              [selectedOutroLayerId]: {
                                ...prev.layers[selectedOutroLayerId],
                                animation,
                              },
                            },
                          }));
                        }}
                        disabled={generating}
                        style={selectStyle}
                      >
                        {(Object.keys(OUTRO_ANIMATION_LABELS) as OutroAnimationPreset[]).map((id) => (
                          <option key={id} value={id}>
                            {OUTRO_ANIMATION_LABELS[id]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Duration (s)">
                      <input
                        type="number"
                        min={0.05}
                        max={2}
                        step={0.05}
                        value={outroLayout.layers[selectedOutroLayerId].animDurationSec}
                        onChange={(e) => {
                          const animDurationSec = Number(e.target.value);
                          setOutroLayout((prev) => ({
                            ...prev,
                            layers: {
                              ...prev.layers,
                              [selectedOutroLayerId]: {
                                ...prev.layers[selectedOutroLayerId],
                                animDurationSec,
                              },
                            },
                          }));
                        }}
                        disabled={generating}
                        style={selectStyle}
                      />
                    </Field>
                    <Field label="Phrase delay (s)">
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.05}
                        value={outroLayout.layers[selectedOutroLayerId].phraseDelaySec}
                        onChange={(e) => {
                          const phraseDelaySec = Number(e.target.value);
                          setOutroLayout((prev) => ({
                            ...prev,
                            layers: {
                              ...prev.layers,
                              [selectedOutroLayerId]: {
                                ...prev.layers[selectedOutroLayerId],
                                phraseDelaySec,
                              },
                            },
                          }));
                        }}
                        disabled={generating}
                        style={selectStyle}
                      />
                    </Field>
                  </div>
                ) : outroEditLayersMode ? (
                  <p style={{ margin: 0, fontSize: 12, color: COLORS.inkFaint }}>
                    Select a layer above or in the preview to edit animation, duration, and phrase delay.
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: COLORS.inkFaint }}>
                    Turn on Edit layers to select, drag, and resize outro layers in the preview.
                  </p>
                )}
              </div>
              ) : null}

              {outroSaveBar}
              <audio src={CANONICAL_OUTRO_AUDIO_URL} preload="none" style={{ display: "none" }} />
                </div>
                <PreviewColumn label={`Outro preview · ~${outroDurationSec.toFixed(1)}s`}>
                  {includeOutro ? (
                    <OutroPreviewPanel
                      copy={outroCopy}
                      layout={outroLayout}
                      language={displayLanguage}
                      durationSec={outroDurationSec}
                      naturalDurationSec={outroNaturalDurationSec}
                      trimmedDurationSec={outroTrimDurationSec}
                      onTrimmedDurationChange={setOutroTrimDurationSec}
                      translatedAudioBase64={cachedVoiceover?.outroAudioBase64 ?? result?.outroAudioBase64}
                      outroVoiceover={outroVoiceover}
                      voiceoverTextForAudio={outroSpokenForTts}
                      outroPhraseTimings={outroPhraseTimings}
                      editMode={outroEditLayersMode}
                      selectedLayerId={selectedOutroLayerId}
                      onSelectLayer={setSelectedOutroLayerId}
                      onLayoutChange={setOutroLayout}
                      onPlaybackState={({ playheadSec, playing }) => {
                        setOutroPlayheadSec(playheadSec);
                        setOutroPreviewPlaying(playing);
                      }}
                    />
                  ) : (
                    <div style={emptyPreview}>
                      Outro disabled — reel ends after {includeWorkspace ? "workspace" : "hook"}
                    </div>
                  )}
                </PreviewColumn>
              </div>
            </section>

            <section style={panel}>
              <SectionLabel>Timeline estimate · ~{totalEstimateSec.toFixed(0)}s total</SectionLabel>
              <div style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.8 }}>
                {includeHook ? (
                  <div>Hook · ~{hookEstimateSec.toFixed(1)}s ({hookClips.length} clips)</div>
                ) : (
                  <div style={{ opacity: 0.55 }}>Hook · skipped</div>
                )}
                {includeWorkspace ? (
                  <div>Workspace · ~{workspaceDurationSec.toFixed(1)}s ({workspace.exchanges.length} lines)</div>
                ) : (
                  <div style={{ opacity: 0.55 }}>Workspace · skipped</div>
                )}
                {effectiveIncludeProductPayoff ? (
                  <div>Product payoff · ~{productPayoffDurationSec.toFixed(1)}s</div>
                ) : null}
                {effectiveWorkspaceOutroGap > 0 ? (
                  <div>Workspace→outro gap · {effectiveWorkspaceOutroGap.toFixed(1)}s</div>
                ) : null}
                {includeOutro ? (
                  <div>Outro · ~{outroDurationSec.toFixed(1)}s</div>
                ) : (
                  <div style={{ opacity: 0.55 }}>Outro · skipped</div>
                )}
              </div>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  type="button"
                  disabled={!clipsReady || voGenerating || generating}
                  onClick={() => void onGenerateVoiceover()}
                  style={voBtn(clipsReady, voGenerating || generating)}
                >
                  {voGenerating ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                  {voGenerating ? "Generating voiceover…" : voReady ? "Regenerate voiceover" : "Generate voiceover"}
                </button>
                {voReady ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#34D399" }}>
                    Voice cached — Generate Reel reuses this audio (no extra ElevenLabs calls).
                    {voMissingForSelection ? (
                      <span style={{ display: "block", marginTop: 4, color: "#FBBF24" }}>
                        {voMissingForSelection === "workspace"
                          ? "Workspace is on but not in cache — reel will be hook-only unless you regenerate with workspace enabled."
                          : "Outro is on but not in cache — reel will skip outro unless you regenerate with outro enabled."}
                      </span>
                    ) : null}
                  </p>
                ) : voStale ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#FBBF24" }}>
                    {hookOnlyReel
                      ? "Hook-only mode — regenerate voiceover so cache matches (workspace/outro off)."
                      : "Script or segment settings changed — regenerate voiceover to refresh audio."}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: COLORS.inkFaint }}>
                    {hookOnlyReel
                      ? "Step 1: generate hook voiceover only (workspace & outro off)."
                      : "Step 1: generate voiceover once (ElevenLabs). Preview & download reuse cache."}
                  </p>
                )}
                {voError ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#F87171" }}>{voError}</p>
                ) : null}
              </div>
              {phase === "error" && errorMsg ? (
                <p style={{ margin: "14px 0 0", fontSize: 13, color: "#F87171" }}>{errorMsg}</p>
              ) : null}
            </section>

            {providerStatus ? (
              <section style={panel}>
                <SectionLabel>Provider status</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <StatusBadge ok label="Storyboard · OpenAI" />
                  <StatusBadge
                    ok={providerStatus.footage === "ok" && footageUrls.some(isPlayableFootageUrl)}
                    label={
                      providerStatus.footage === "ok" && footageUrls.some(isPlayableFootageUrl)
                        ? hookFootageLabel(footageSource)
                        : footageProvider === "google_veo"
                          ? "Footage · Google AI (Veo) — failed"
                          : hookFootageLabel(footageSource !== "none" ? footageSource : "none")
                    }
                  />
                  <StatusBadge ok={providerStatus.voice === "ok" || canGenerateReel} label={providerStatus.voice === "ok" || canGenerateReel ? "Voice · cached" : "Voice — generate voiceover first"} />
                </div>
                {footageErrorMsg ? (
                  <p style={{ margin: "12px 0 0", fontSize: 13, color: "#F87171", lineHeight: 1.5 }}>
                    {footageErrorMsg}
                  </p>
                ) : providerStatus.footage !== "ok" && footageProvider === "google_veo" ? (
                  <p style={{ margin: "12px 0 0", fontSize: 13, color: "#FBBF24", lineHeight: 1.5 }}>
                    Google Veo needs billing enabled on your Gemini API key. Switch to Pexels for free instant stock footage, or enable billing at{" "}
                    <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: COLORS.accent }}>
                      Google AI Studio
                    </a>
                    .
                  </p>
                ) : null}
              </section>
            ) : null}

            {storyboard && hookVoClips.length > 0 ? (
              <section style={panel}>
                <SectionLabel>Hook result · {hookDurationSec.toFixed(1)}s</SectionLabel>
                {hookVoClips.map((clip, i) => (
                  <div key={i} style={{ marginBottom: 12, fontSize: 12, color: COLORS.inkMuted }}>
                    <strong style={{ color: COLORS.ink }}>Clip {i + 1}</strong> · {clip.durationSec.toFixed(1)}s
                    {isPlayableFootageUrl(clip.footageUrl) ? (
                      <span style={{ color: "#34D399" }}>
                        {" "}
                        · {hookFootageProviderLabel(
                          detectFootageSource([clip.footageUrl], footageProvider) === "google_veo"
                            ? "google_veo"
                            : "pexels",
                        )}
                      </span>
                    ) : (
                      <span style={{ color: "#F87171" }}> · no footage</span>
                    )}
                    <p style={{ margin: "4px 0 0" }}>&ldquo;{clip.sayLine}&rdquo;</p>
                  </div>
                ))}
              </section>
            ) : null}

            <section style={panel}>
              <SectionLabel>Finalize reel</SectionLabel>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                {hookOnlyReel
                  ? `Hook-only reel: voiceover + one ${hookFootageProviderLabel(footageProvider)} clip per hook row. Uncheck workspace/outro first, then generate.`
                  : `Generate voiceover + ${hookFootageProviderLabel(footageProvider)} footage in one click, or run each step separately.`}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <button
                  type="button"
                  disabled={!clipsReady || generating || voGenerating}
                  onClick={() => void onGenerateAll()}
                  style={genBtn(clipsReady, generating || voGenerating)}
                >
                  {generating || voGenerating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {generating || voGenerating
                    ? voGenerating && !generating
                      ? "Generating voiceover…"
                      : progressSteps[progressIdx]
                    : "Generate VO + Reel"}
                </button>
                <button
                  type="button"
                  disabled={!canGenerateReel || generating || voGenerating}
                  onClick={() => void onGenerate()}
                  style={voBtn(canGenerateReel, generating || voGenerating)}
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {generating ? progressSteps[progressIdx] : "Generate Reel only"}
                </button>
              </div>
              {!canGenerateReel && hasHookVo && !voCoversSelection ? (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#FBBF24" }}>
                  Regenerate voiceover — current cache doesn&apos;t match workspace/outro toggles.
                </p>
              ) : !canGenerateReel && clipsReady && !hasHookVo ? (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#FBBF24" }}>
                  Generate voiceover first, then Generate Reel adds {hookFootageProviderLabel(footageProvider)} footage.
                </p>
              ) : null}
            </section>

            {phase === "ready" && result ? (
              <section style={panel}>
                <SectionLabel>Translate reel · 62 languages</SectionLabel>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                  Like the video? Translate hook voiceover, subtitles, and outro into any language.
                  Workspace dialogue stays in your Language A / Language B pair — unchanged.
                  The brand name <strong style={{ color: COLORS.ink }}>InterpreterAI</strong> always stays spoken in English in the outro.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
                  <Field label="Target language">
                    <select
                      value={translateTargetLang}
                      onChange={(e) => setTranslateTargetLang(e.target.value)}
                      disabled={translatePhase === "translating" || generating}
                      style={selectStyle}
                    >
                      {REEL_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    disabled={translatePhase === "translating" || generating}
                    onClick={() => void onTranslateReel()}
                    style={translateBtn(translatePhase !== "translating", translatePhase === "translating")}
                  >
                    {translatePhase === "translating" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Languages size={16} />
                    )}
                    {translatePhase === "translating"
                      ? "Translating…"
                      : translateTargetLang === "en"
                        ? "Restore English"
                        : `Translate to ${reelLanguageLabel(translateTargetLang)}`}
                  </button>
                </div>
                {result.language !== "en" ? (
                  <p style={{ margin: "12px 0 0", fontSize: 12, color: "#67E8F9" }}>
                    Preview is in {reelLanguageLabel(result.language)} — workspace unchanged.
                  </p>
                ) : null}
                {translateError ? (
                  <p style={{ margin: "12px 0 0", fontSize: 12, color: "#F87171" }}>{translateError}</p>
                ) : null}
              </section>
            ) : null}

        </div>
      </div>
      <SavedOutrosDialog
        open={savedOutrosOpen}
        onOpenChange={setSavedOutrosOpen}
        onApply={(preset) => {
          applySavedOutroPreset(preset);
          setOutroSaveName(preset.name);
          toast({
            title: "Outro loaded",
            description: `Applied “${preset.name}”.`,
            duration: 3500,
          });
        }}
      />
    </div>
  );
}

function PreviewColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ position: "sticky", top: 72 }}>
      <p style={previewLabel}>{label}</p>
      {children}
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: ok ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)", border: `1px solid ${ok ? "rgba(52,211,153,0.4)" : "rgba(251,191,36,0.4)"}`, color: ok ? "#34D399" : "#FBBF24" }}>
      {ok ? <CheckCircle2 size={13} /> : <span>△</span>}
      {label}
    </span>
  );
}

function ExchangeSpeakerPicker({
  speaker,
  disabled,
  sourceLang,
  targetLang,
  pinkOriginalLang,
  onChoose,
  onPinkLanguage,
}: {
  speaker: WorkspaceSpeaker;
  disabled?: boolean;
  sourceLang: string;
  targetLang: string;
  pinkOriginalLang: string;
  onChoose: (role: WorkspaceSpeaker) => void;
  onPinkLanguage: (lang: string) => void;
}) {
  const options: { role: WorkspaceSpeaker; label: string; color: string }[] = [
    { role: "A", label: `Blue · ${reelLanguageLabel(sourceLang)}`, color: WORKSPACE_SPEAKER_COLORS.A },
    { role: "B", label: `Yellow · ${reelLanguageLabel(targetLang)}`, color: WORKSPACE_SPEAKER_COLORS.B },
    { role: "C", label: "Pink · 3rd", color: WORKSPACE_SPEAKER_COLORS.C },
  ];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((opt) => {
          const active = speaker === opt.role;
          return (
            <button
              key={opt.role}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(opt.role)}
              title={`Set this exchange to ${opt.label}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                border: `1px solid ${active ? opt.color : COLORS.glassBorder}`,
                background: active ? `${opt.color}22` : "rgba(255,255,255,0.03)",
                color: active ? opt.color : COLORS.inkFaint,
                fontSize: 11,
                fontWeight: 650,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.55 : 1,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: opt.color,
                  flexShrink: 0,
                }}
              />
              {opt.label}
            </button>
          );
        })}
      </div>
      {speaker === "C" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: COLORS.inkFaint, fontWeight: 650 }}>Pink speaks</span>
          {([sourceLang, targetLang] as const).map((lang) => {
            const active = pinkOriginalLang === lang;
            return (
              <button
                key={lang}
                type="button"
                disabled={disabled}
                onClick={() => onPinkLanguage(lang)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: `1px solid ${active ? WORKSPACE_SPEAKER_COLORS.C : COLORS.glassBorder}`,
                  background: active ? "rgba(236,72,153,0.14)" : "rgba(255,255,255,0.03)",
                  color: active ? WORKSPACE_SPEAKER_COLORS.C : COLORS.inkFaint,
                  fontSize: 10,
                  fontWeight: 650,
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                {reelLanguageLabel(lang)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  labelAction,
  children,
}: {
  label: string;
  labelAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.inkFaint,
          }}
        >
          {label}
        </span>
        {labelAction}
      </span>
      {children}
    </label>
  );
}

function ClipSubtitleSizeField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <Field label={`Clip subtitle size · ${pct}%`}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="range"
          min={0.65}
          max={1.25}
          step={0.05}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          style={{ flex: 1, accentColor: COLORS.accent }}
        />
        <input
          type="number"
          min={65}
          max={125}
          step={5}
          value={pct}
          disabled={disabled}
          onChange={(e) => onChange(Math.min(1.25, Math.max(0.65, Number(e.target.value) / 100)))}
          style={{ ...selectStyle, width: 68, padding: "8px 6px", textAlign: "center" }}
        />
      </div>
    </Field>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p style={{ ...eyebrow, marginBottom: 12 }}>{children}</p>;
}

const eyebrow: CSSProperties = { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.inkFaint };
const titleStyle: CSSProperties = { margin: 0, fontFamily: TYPE.display.family, fontSize: 38, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.08 };
const subtitleStyle: CSSProperties = { margin: "12px 0 0", fontSize: 15, color: COLORS.inkMuted, maxWidth: 620, lineHeight: 1.5 };
const panel: CSSProperties = { padding: 22, borderRadius: 18, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" };
const editorPreviewRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 290px",
  gap: 28,
  alignItems: "start",
};
const previewLabel: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: COLORS.inkFaint,
};
const clipCard: CSSProperties = { marginBottom: 16, padding: 16, borderRadius: 14, border: `1px solid ${COLORS.glassBorder}`, background: COLORS.bgElevated };
const selectStyle: CSSProperties = { width: "100%", background: COLORS.bgElevated, border: `1px solid ${COLORS.glassBorder}`, borderRadius: 10, padding: "10px 12px", color: COLORS.ink, fontSize: 13, outline: "none", boxSizing: "border-box" };
const smallBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: `1px solid ${COLORS.glassBorder}`, background: "transparent", color: COLORS.inkMuted, fontSize: 12, fontWeight: 700, cursor: "pointer" };
const accentSaveBtn: CSSProperties = { ...smallBtn, background: COLORS.accent, border: "none", color: "#fff", padding: "10px 18px", fontSize: 13 };
const addBtn: CSSProperties = { ...smallBtn, marginTop: 4, color: COLORS.ink, borderColor: "rgba(255,255,255,0.14)" };
const iconBtn: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: `1px solid ${COLORS.glassBorder}`, background: "transparent", color: COLORS.inkFaint, cursor: "pointer", flexShrink: 0 };
const emptyPreview: CSSProperties = { width: 270, height: 480, borderRadius: 16, border: `1px solid ${COLORS.glassBorder}`, background: COLORS.bgElevated, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.inkFaint, fontSize: 13, textAlign: "center", padding: 24, boxSizing: "border-box" };

function genBtn(ready: boolean, generating: boolean): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 28px", borderRadius: 999, border: "none", background: !ready || generating ? "rgba(255,255,255,0.12)" : COLORS.ink, color: !ready || generating ? COLORS.inkFaint : COLORS.bg, fontFamily: TYPE.title.family, fontSize: 15, fontWeight: 700, cursor: !ready || generating ? "default" : "pointer" };
}
function voBtn(ready: boolean, busy: boolean): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 10, padding: "13px 24px", borderRadius: 999, border: `1px solid ${ready && !busy ? "rgba(103,232,249,0.45)" : COLORS.glassBorder}`, background: ready && !busy ? "rgba(103,232,249,0.12)" : "rgba(255,255,255,0.06)", color: ready && !busy ? "#67E8F9" : COLORS.inkMuted, fontFamily: TYPE.title.family, fontSize: 14, fontWeight: 700, cursor: !ready || busy ? "default" : "pointer" };
}
function translateBtn(ready: boolean, busy: boolean): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 10, padding: "13px 24px", borderRadius: 999, border: `1px solid ${ready && !busy ? "rgba(167,139,250,0.45)" : COLORS.glassBorder}`, background: ready && !busy ? "rgba(167,139,250,0.14)" : "rgba(255,255,255,0.06)", color: ready && !busy ? "#C4B5FD" : COLORS.inkMuted, fontFamily: TYPE.title.family, fontSize: 14, fontWeight: 700, cursor: !ready || busy ? "default" : "pointer", whiteSpace: "nowrap" };
}
