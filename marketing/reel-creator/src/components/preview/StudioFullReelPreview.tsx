/**
 * Studio full-reel preview — hook + workspace + outro without GeneratedReelPlayer's export stage.
 * Uses the same visual path as StudioHookVoPreview (proven working) with segment switching.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import {
  formatExportError,
  type ExportProgress,
} from "@/lib/exportReelMp4";
import {
  createStudioPaintContext,
  disposeStudioPaintContext,
} from "@/lib/paintStudioFrame";
import { loadLockedOutroPaintAssets } from "@/lib/renderLockedOutroFrame";
import { ensureExportFonts } from "@/lib/ensureExportFonts";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import { HookFootagePreview } from "@/components/preview/HookFootagePreview";
import { UniversalBrandOutro } from "@/components/preview/UniversalBrandOutro";
import { WorkspaceSegment } from "@/components/preview/WorkspaceSegment";
import {
  base64ToBlob,
  buildContinuousReelVoiceover,
  buildGeneratedSegments,
  computeProductPayoffDurationSec,
  computeReelTotalSec,
  computeWorkspaceDurationSec,
  footageDurationFromVoClips,
  hookClipsForStitch,
  resolveHookDurationSec,
  stitchSegmentClips,
  type GeneratedSegment,
  type HookVoClip,
  type ProductPayoffVoClip,
  type WorkspaceVoClip,
  clipExchangeIndex,
} from "@/lib/generatedReel";
import { ClipWordSubtitles } from "@/components/preview/ClipWordSubtitles";
import {
  estimateTimedWords,
  REEL_CAPTION_FONT,
  type TimedWord,
} from "@/lib/kineticCaptions";
import { isRtlLanguage } from "@/lib/constants/languages";
import { isPlayableFootageUrl } from "@/lib/hookFootage";
import type { LanguagePair } from "@/lib/languageFlags";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";
import type { OutroLayerDocument } from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import type { WorkspaceConversation } from "@/lib/workspaceModel";
import { resolveOutroAudioBlob } from "@/lib/outroAudio";
import { resolveWorkspaceVoTiming, packWorkspaceAudioForStitch } from "@/lib/workspaceVoSync";
import {
  buildStudioVoBlobs,
  exportStudioPreviewMp4,
  type StudioVoBlobs,
} from "@/lib/studioReelExport";
import { downloadBlob } from "@/lib/downloadBlob";
import { saveReelMp4 } from "@/lib/reelMp4Cache";
import { canvasSizeForAspect, previewSizeForAspect, type ReelAspectRatio } from "@/lib/reelAspectRatio";

type Props = {
  hookVoClips: HookVoClip[];
  hookWords: TimedWord[];
  hookAudio: string | null;
  hookDurationSec: number;
  hookScript: string;
  footageUrls: string[];
  workspace: WorkspaceConversation;
  languagePair: LanguagePair;
  workspaceVoClips: WorkspaceVoClip[];
  workspaceDurationSec?: number;
  outroCopy: UniversalOutroCopy;
  outroLayout: OutroLayerDocument;
  outroPhraseTimings: OutroPhraseTiming[];
  outroVoiceover: string;
  outroDurationSec: number;
  outroAudioBase64: string | null;
  includeWorkspace: boolean;
  includeOutro: boolean;
  includeHook?: boolean;
  includeProductPayoff?: boolean;
  workspaceOutroGapSec?: number;
  aspectRatio?: ReelAspectRatio;
  productPayoffVoClip?: ProductPayoffVoClip | null;
  productPayoffDurationSec?: number;
  productPayoffSayLine?: string;
  productPayoffHeadline?: string;
  productPayoffSupportingText?: string;
  targetLanguage?: string;
  subtitleScale?: number;
  accentColor?: string;
  filename?: string;
  reelId?: string;
  onMp4Cached?: () => void;
};

export type StudioFullReelPreviewHandle = {
  exportMp4: (opts?: { autoDownload?: boolean; cacheReelId?: string }) => Promise<Blob>;
};

function HookBackdrop({ localTime, hasFootage }: { localTime: number; hasFootage?: boolean }) {
  const t = Math.max(0, localTime);
  const drift = (t * 24) % 72;
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(ellipse 90% 70% at 50% 30%, rgba(0,112,243,0.35) 0%, transparent 55%), linear-gradient(165deg, #0A1628 0%, #12253A 42%, #061018 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-15%",
          backgroundImage:
            "linear-gradient(rgba(0,112,243,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(0,112,243,0.14) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          transform: `translate(${-drift}px, ${-drift * 0.6}px) scale(${1.04 + t * 0.01})`,
          opacity: 0.6,
        }}
      />
      {[420, 640, 880].map((size, i) => (
        <div
          key={size}
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: "50%",
            border: "2px solid rgba(103,232,249,0.32)",
            transform: `scale(${1 + 0.08 * Math.sin(t * 2 + i)})`,
            opacity: 0.55 - i * 0.12 + pulse * 0.15,
          }}
        />
      ))}
      {!hasFootage ? (
        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            bottom: "36%",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(103,232,249,0.55)",
          }}
        >
          Hook voiceover ready
        </div>
      ) : null}
    </div>
  );
}

function pickActiveSegment(segments: GeneratedSegment[], t: number): GeneratedSegment {
  const active = segments.filter((s) => s.end > s.start);
  if (active.length === 0) {
    return segments[0] ?? { id: "workspace", start: 0, end: Math.max(0.1, t + 0.1) };
  }
  const inside = active.find((s) => t >= s.start && t < s.end);
  if (inside) return inside;
  if (t <= 0.001) return active[0]!;
  let prev = active[0]!;
  for (const s of active) {
    if (s.start <= t) prev = s;
    else break;
  }
  return prev;
}

export const StudioFullReelPreview = forwardRef<StudioFullReelPreviewHandle, Props>(
  function StudioFullReelPreview(
    {
      hookVoClips,
      hookWords,
      hookAudio,
      hookDurationSec,
      hookScript,
      footageUrls,
      workspace,
      languagePair,
      workspaceVoClips,
      workspaceDurationSec: workspaceDurationProp,
      outroCopy,
      outroLayout,
      outroPhraseTimings,
      outroVoiceover,
      outroDurationSec,
      outroAudioBase64,
      includeWorkspace,
      includeOutro,
      includeHook = true,
      includeProductPayoff = true,
      workspaceOutroGapSec = 0,
      aspectRatio = "9:16",
      productPayoffVoClip,
      productPayoffDurationSec: productPayoffDurationProp,
      productPayoffSayLine,
      productPayoffHeadline,
      productPayoffSupportingText,
      targetLanguage = "en",
      subtitleScale = 1,
      accentColor = "#0070F3",
      filename = "InterpreterAI_reel.mp4",
      reelId,
      onMp4Cached,
    },
    ref,
  ) {
  const canvasSize = canvasSizeForAspect(aspectRatio);
  const previewSize = previewSizeForAspect(aspectRatio);
  const CANVAS_W = canvasSize.width;
  const CANVAS_H = canvasSize.height;
  const PREVIEW_W = previewSize.width;
  const PREVIEW_H = previewSize.height;
  const SCALE = PREVIEW_W / CANVAS_W;

  const hookDur = includeHook ? resolveHookDurationSec(hookVoClips, hookDurationSec) : 0;
  const hookFootageDur =
    hookVoClips.length > 0 ? footageDurationFromVoClips(hookVoClips) : hookDur;
  const hasFootage =
    footageUrls.some(isPlayableFootageUrl) ||
    hookVoClips.some((c) => isPlayableFootageUrl(c.footageUrl));
  const rtl = isRtlLanguage(targetLanguage);

  const [resolvedWorkspaceVo, setResolvedWorkspaceVo] = useState<Awaited<
    ReturnType<typeof resolveWorkspaceVoTiming>
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (workspaceVoClips.length === 0) {
      setResolvedWorkspaceVo(null);
      return;
    }
    void resolveWorkspaceVoTiming(workspaceVoClips, workspace.exchanges).then((r) => {
      if (!cancelled) setResolvedWorkspaceVo(r);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceVoClips, workspace.exchanges]);

  const workspaceVoSchedule = useMemo(
    () =>
      resolvedWorkspaceVo?.schedule ??
      workspaceVoClips.map((c, i) => ({
        startSec: c.startSec,
        durationSec: c.durationSec ?? 2,
        speechDurSec: c.durationSec ?? 2,
        exchangeIndex: clipExchangeIndex(c, i),
      })),
    [resolvedWorkspaceVo, workspaceVoClips],
  );

  const workspaceDur = includeWorkspace
    ? resolvedWorkspaceVo?.durationSec ??
      (typeof workspaceDurationProp === "number"
        ? workspaceDurationProp
        : computeWorkspaceDurationSec(workspaceVoClips))
    : 0;
  const outroDur = includeOutro ? outroDurationSec : 0;
  const productPayoffDur =
    includeProductPayoff !== false
      ? productPayoffDurationProp ??
        computeProductPayoffDurationSec(productPayoffVoClip, productPayoffSayLine, targetLanguage)
      : 0;
  const productPayoffFootageDur =
    productPayoffVoClip?.durationSec && productPayoffVoClip.durationSec > 0
      ? productPayoffVoClip.durationSec
      : productPayoffDur;

  const segments = useMemo(
    () =>
      buildGeneratedSegments(
        hookDur,
        workspaceDur,
        includeOutro,
        includeWorkspace,
        outroDur,
        productPayoffDur,
        includeProductPayoff !== false,
        includeHook,
        workspaceOutroGapSec,
      ),
    [hookDur, workspaceDur, includeOutro, includeWorkspace, outroDur, productPayoffDur, includeProductPayoff, includeHook, workspaceOutroGapSec],
  );
  const totalDuration = computeReelTotalSec(
    hookDur,
    workspaceDur,
    includeOutro,
    includeWorkspace,
    outroDur,
    productPayoffDur,
    includeProductPayoff !== false,
    includeHook,
    workspaceOutroGapSec,
  );

  const productPayoffCaptionWords = useMemo(
    () =>
      productPayoffVoClip?.words?.length
        ? productPayoffVoClip.words
        : estimateTimedWords(
            productPayoffSayLine ?? productPayoffVoClip?.sayLine ?? "",
            Math.max(0.5, productPayoffDur - 0.4),
          ),
    [productPayoffVoClip, productPayoffSayLine, productPayoffDur],
  );

  const hookCaptionWords = useMemo(
    () =>
      hookWords.length > 0
        ? hookWords
        : estimateTimedWords(hookScript, Math.max(0.5, hookDur - 0.4)),
    [hookWords, hookScript, hookDur],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [voBlobs, setVoBlobs] = useState<StudioVoBlobs>({});
  const [userExporting, setUserExporting] = useState(false);
  const [captureTime, setCaptureTime] = useState(0);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const resumeTimeRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAudio() {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setHasAudio(false);
      setIsPlaying(false);
      setCurrentTime(0);

      try {
        const hookClipBlobs = includeHook ? hookClipsForStitch(hookVoClips) : [];
        const hookBlob =
          includeHook && hookClipBlobs.length > 0
            ? await stitchSegmentClips(hookClipBlobs, hookDur)
            : includeHook && hookAudio
              ? base64ToBlob(hookAudio)
              : undefined;

        const workspaceClips = includeWorkspace
          ? packWorkspaceAudioForStitch(
              workspaceVoClips,
              resolvedWorkspaceVo?.wordsByExchange,
              workspace.exchanges,
            )
          : [];

        const outroBlob =
          includeOutro && outroAudioBase64
            ? base64ToBlob(outroAudioBase64)
            : includeOutro
              ? await resolveOutroAudioBlob({
                  language: targetLanguage,
                  translatedBase64: outroAudioBase64,
                  durationSec: outroDur,
                  voiceoverText: outroVoiceover,
                })
              : undefined;

        const productPayoffBlob =
          includeProductPayoff !== false && productPayoffVoClip?.audioBase64
            ? base64ToBlob(productPayoffVoClip.audioBase64)
            : undefined;

        const full = await buildContinuousReelVoiceover({
          hook: hookBlob,
          hookClips: hookClipBlobs.length > 0 ? hookClipBlobs : undefined,
          hookSec: hookDur,
          workspaceClips,
          workspaceSec: workspaceDur,
          productPayoff: productPayoffBlob,
          productPayoffSec: productPayoffDur,
          outro: outroBlob ?? undefined,
          includeHook,
          includeOutro,
          includeWorkspace,
          includeProductPayoff: includeProductPayoff !== false,
          outroSec: outroDur,
          workspaceOutroGapSec,
        });

        if (!full || cancelled) return;

        const url = URL.createObjectURL(full);
        blobUrlRef.current = url;
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.onended = () => setIsPlaying(false);
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audioRef.current = audio;
        setHasAudio(true);
      } catch {
        if (!cancelled) {
          audioRef.current = null;
          setHasAudio(false);
        }
      }
    }

    void loadAudio();

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [
    hookVoClips,
    hookAudio,
    hookDur,
    includeHook,
    includeWorkspace,
    includeOutro,
    includeProductPayoff,
    productPayoffVoClip,
    productPayoffDur,
    workspaceVoClips,
    workspaceVoSchedule,
    workspaceDur,
    outroAudioBase64,
    outroDur,
    outroVoiceover,
    targetLanguage,
    workspaceOutroGapSec,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;
    void buildStudioVoBlobs({
      hookVoClips,
      hookAudio,
      hookDur,
      includeHook,
      includeWorkspace,
      includeOutro,
      includeProductPayoff: includeProductPayoff !== false,
      productPayoffVoClip,
      productPayoffDur,
      workspaceVoClips,
      workspaceExchanges: workspace.exchanges,
      workspaceDur,
      outroAudioBase64,
      outroDur,
      outroVoiceover,
      targetLanguage,
      workspaceOutroGapSec,
    }).then((blobs) => {
      if (!cancelled) setVoBlobs(blobs);
    });
    return () => {
      cancelled = true;
    };
  }, [
    hookVoClips,
    hookAudio,
    hookDur,
    includeHook,
    includeWorkspace,
    includeOutro,
    workspaceVoClips,
    workspace.exchanges,
    workspaceDur,
    outroAudioBase64,
    outroDur,
    outroVoiceover,
    targetLanguage,
    includeProductPayoff,
    productPayoffVoClip,
    productPayoffDur,
    workspaceOutroGapSec,
  ]);

  const runExport = async (opts: { autoDownload: boolean; cacheReelId?: string }) => {
    const stage = stageRef.current;
    if (!stage) throw new Error("Preview not ready — wait a moment and try again.");
    if (userExporting) {
      throw new Error("Export already in progress — wait for the encode to finish.");
    }
    if (typeof VideoEncoder === "undefined") {
      throw new Error("MP4 export needs Chrome or Edge (WebCodecs not available in this browser).");
    }

    resumeTimeRef.current = currentTime;
    setIsPlaying(false);
    audioRef.current?.pause();
    setUserExporting(true);
    setExportMsg(null);
    setExportProgress({ pct: 0, detail: "Preparing…" });

    let studioPaint: Awaited<ReturnType<typeof createStudioPaintContext>> | null = null;

    try {
      const blobs = await buildStudioVoBlobs({
        hookVoClips,
        hookAudio,
        hookDur,
        includeHook,
        includeWorkspace,
        includeOutro,
        includeProductPayoff: includeProductPayoff !== false,
        productPayoffVoClip,
        productPayoffDur,
        workspaceVoClips,
        workspaceExchanges: workspace.exchanges,
        workspaceDur,
        outroAudioBase64,
        outroDur,
        outroVoiceover,
        targetLanguage,
        workspaceOutroGapSec,
      });

      setExportProgress({ pct: 4, detail: "Loading footage…" });
      await ensureExportFonts();
      const outroAssets =
        includeOutro && outroCopy ? await loadLockedOutroPaintAssets() : null;

      studioPaint = await createStudioPaintContext({
        width: CANVAS_W,
        height: CANVAS_H,
        hookVoClips,
        footageUrls,
        hookFootageDur,
        hasFootage,
        hookCaptionWords,
        workspace,
        languagePair,
        workspaceVoSchedule,
        wordsByExchange: resolvedWorkspaceVo?.wordsByExchange,
        workspaceDur,
        includeWorkspace,
        productPayoffVoClip: productPayoffVoClip ?? null,
        productPayoffFootageDur,
        productPayoffDur,
        productPayoffCaptionWords,
        productPayoffHeadline,
        productPayoffSupportingText,
        includeProductPayoff: includeProductPayoff !== false,
        includeOutro,
        outroCopy,
        outroLayout,
        outroPhraseTimings,
        outroDur,
        targetLanguage,
        rtl,
        subtitleScale,
        outroAssets,
      });

      const blob = await exportStudioPreviewMp4({
        stage,
        segments,
        totalDuration,
        voBlobs: blobs,
        includeOutro,
        outroCopy,
        outroLayout,
        targetLanguage,
        outroPhraseTimings,
        rtl,
        filename,
        autoDownload: false,
        onProgress: setExportProgress,
        seekTo: (t) => {
          flushSync(() => setCaptureTime(t));
        },
        studioPaint,
      });

      if (!blob || blob.size < 2048) {
        throw new Error("Export produced an empty file — try Chrome/Edge and retry.");
      }

      const storeId = opts.cacheReelId ?? reelId;
      if (storeId) {
        try {
          await saveReelMp4(storeId, blob, filename);
          onMp4Cached?.();
        } catch (cacheErr) {
          console.warn("[StudioFullReelPreview] MP4 cache write failed:", cacheErr);
        }
      }

      if (opts.autoDownload) {
        downloadBlob(blob, filename);
      }
      return blob;
    } finally {
      disposeStudioPaintContext(studioPaint);
      setUserExporting(false);
      setExportProgress(null);
      setCaptureTime(0);
      const resume = resumeTimeRef.current;
      if (audioRef.current) {
        audioRef.current.currentTime = resume;
      }
      setCurrentTime(resume);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      exportMp4: (opts) =>
        runExport({
          autoDownload: opts?.autoDownload ?? false,
          cacheReelId: opts?.cacheReelId,
        }),
    }),
    [
      segments,
      totalDuration,
      voBlobs,
      includeOutro,
      outroCopy,
      outroLayout,
      outroPhraseTimings,
      rtl,
      filename,
      userExporting,
      currentTime,
      reelId,
      hookVoClips,
      hookAudio,
      hookDur,
      includeWorkspace,
      includeProductPayoff,
      productPayoffVoClip,
      productPayoffDur,
      workspaceVoClips,
      workspace.exchanges,
      workspaceDur,
      outroAudioBase64,
      outroDur,
      outroVoiceover,
      targetLanguage,
    ],
  );

  async function downloadMp4() {
    setExportMsg(null);
    try {
      // Always encode from the live preview — never serve a stale IndexedDB cache.
      await runExport({ autoDownload: true, cacheReelId: reelId });
      setExportMsg("MP4 downloaded — check your Downloads folder.");
    } catch (e) {
      const msg = formatExportError(e);
      setExportMsg(msg);
      console.error("[StudioFullReelPreview] download failed:", e);
    }
  }

  const canDownload =
    hasAudio ||
    hookVoClips.some((c) => c.audioBase64) ||
    workspaceVoClips.some((c) => c.audioBase64) ||
    Boolean(outroAudioBase64) ||
    Boolean(productPayoffVoClip?.audioBase64);
  const exporting = userExporting;
  const stageTime = exporting ? captureTime : currentTime;
  const uiTime = exporting ? resumeTimeRef.current : currentTime;
  const currentSegment = pickActiveSegment(segments, stageTime);
  const localTime = Math.max(0, stageTime - currentSegment.start);
  const stagePlaying = isPlaying && !exporting;

  function reset() {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    setIsPlaying(true);
  }

  function togglePlay() {
    if (currentTime >= totalDuration - 0.05) {
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
      setCurrentTime(0);
    }
    setIsPlaying((p) => !p);
  }

  function renderSegment() {
    if (currentSegment.id === "hook") {
      return (
        <>
          {hasFootage ? (
            <HookFootagePreview
              urls={footageUrls}
              hookVoClips={hookVoClips}
              localTime={localTime}
              durationSec={hookFootageDur}
              playing={stagePlaying}
              fallback={<HookBackdrop localTime={localTime} hasFootage />}
            />
          ) : (
            <HookBackdrop localTime={localTime} />
          )}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "42%",
              background: "linear-gradient(180deg, transparent 0%, rgba(2,5,11,0.72) 80%)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
          <ClipWordSubtitles
            words={hookCaptionWords}
            localTime={localTime}
            rtl={rtl}
            scale={subtitleScale}
            canvasWidth={CANVAS_W}
          />
        </>
      );
    }

    if (currentSegment.id === "workspace") {
      return (
        <WorkspaceSegment
          conversation={workspace}
          languagePair={languagePair}
          segmentProgress={workspaceDur > 0 ? localTime / workspaceDur : 1}
          playheadSec={localTime}
          voSchedule={workspaceVoSchedule.length > 0 ? workspaceVoSchedule : undefined}
          wordsByExchange={resolvedWorkspaceVo?.wordsByExchange}
          durationSec={workspaceDur}
          subtitleScale={subtitleScale}
          voSyncedTyping
        />
      );
    }

    if (currentSegment.id === "productPayoff") {
      const payoffFootageUrl = productPayoffVoClip?.footageUrl ?? "";
      const hasPayoffFootage = isPlayableFootageUrl(payoffFootageUrl);
      const payoffClip: HookVoClip[] =
        productPayoffVoClip?.audioBase64
          ? [
              {
                ...productPayoffVoClip,
                startSec: 0,
                footageUrl: payoffFootageUrl,
              },
            ]
          : [];
      return (
        <>
          {hasPayoffFootage ? (
            <HookFootagePreview
              urls={[payoffFootageUrl]}
              hookVoClips={payoffClip}
              localTime={localTime}
              durationSec={productPayoffFootageDur}
              playing={stagePlaying}
              fallback={<HookBackdrop localTime={localTime} hasFootage={false} />}
            />
          ) : (
            <HookBackdrop localTime={localTime} />
          )}
          {productPayoffVoClip?.footageStatus === "footage_needed" ? (
            <div
              style={{
                position: "absolute",
                top: 48,
                left: 48,
                right: 48,
                zIndex: 4,
                padding: "12px 16px",
                borderRadius: 12,
                background: "rgba(220,38,38,0.85)",
                color: "#fff",
                fontSize: 28,
                fontWeight: 800,
                textAlign: "center",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Footage needed
            </div>
          ) : null}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "42%",
              background: "linear-gradient(180deg, transparent 0%, rgba(2,5,11,0.72) 80%)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
          {(productPayoffHeadline || productPayoffSupportingText) && (
            <div
              style={{
                position: "absolute",
                left: 48,
                right: 48,
                top: 120,
                zIndex: 3,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              {productPayoffHeadline ? (
                <div
                  style={{
                    fontFamily: REEL_CAPTION_FONT,
                    fontSize: 72 * subtitleScale,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color: "#FFFFFF",
                    textShadow: "0 8px 32px rgba(0,0,0,0.9)",
                    marginBottom: 16,
                  }}
                >
                  {productPayoffHeadline}
                </div>
              ) : null}
              {productPayoffSupportingText ? (
                <div
                  style={{
                    fontSize: 36 * subtitleScale,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: "rgba(255,255,255,0.88)",
                    textShadow: "0 6px 24px rgba(0,0,0,0.85)",
                  }}
                >
                  {productPayoffSupportingText}
                </div>
              ) : null}
            </div>
          )}
          <ClipWordSubtitles
            words={productPayoffCaptionWords}
            localTime={localTime}
            rtl={rtl}
            scale={subtitleScale}
            canvasWidth={CANVAS_W}
          />
        </>
      );
    }

    return (
      <UniversalBrandOutro
        copy={outroCopy}
        layout={outroLayout}
        displayLang={targetLanguage}
        rtl={rtl}
        localTime={localTime}
        durationSec={outroDur}
        phraseTimings={outroPhraseTimings}
        syncToPhrases
      />
    );
  }

  const segmentLabel =
    currentSegment.id === "hook"
      ? "HOOK"
      : currentSegment.id === "workspace"
        ? "WORKSPACE"
        : currentSegment.id === "productPayoff"
          ? "PRODUCT PAYOFF"
          : "OUTRO";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: PREVIEW_W,
        }}
      >
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
          {segmentLabel}
        </span>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
          {uiTime.toFixed(1)}s / {totalDuration.toFixed(0)}s
        </span>
      </div>

      <div
        style={{
          position: "relative",
          width: PREVIEW_W,
          height: PREVIEW_H,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.7)",
          background: "#0A1628",
        }}
      >
        <div
          ref={stageRef}
          data-reel-export-stage="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${SCALE})`,
            transformOrigin: "top left",
            background: "#0A1628",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0 }}>{renderSegment()}</div>
        </div>
        {exporting ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "rgba(2,5,11,0.72)",
              color: "#67E8F9",
              fontSize: 12,
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            <span>Encoding MP4…</span>
            {exportProgress ? (
              <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>
                {exportProgress.detail} {exportProgress.pct}%
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "rgba(255,255,255,0.08)",
            zIndex: 5,
          }}
        >
          <div
            style={{
              height: "100%",
              background: currentSegment.id === "outro" ? "#22D3EE" : currentSegment.id === "productPayoff" ? "#A78BFA" : accentColor,
              width: `${totalDuration > 0 ? (uiTime / totalDuration) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={reset} style={roundBtn(false)}>
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!hasAudio}
          style={{
            ...roundBtn(false),
            width: 52,
            height: 52,
            background: accentColor,
            border: "none",
            color: "#02050B",
            boxShadow: `0 0 20px ${accentColor}40`,
          }}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>
      </div>

      <button
        type="button"
        disabled={exporting || !canDownload}
        onClick={() => void downloadMp4()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: PREVIEW_W,
          background: exporting ? "rgba(0,112,243,0.12)" : accentColor,
          color: exporting ? "#67E8F9" : "#FFFFFF",
          border: exporting ? "1px solid rgba(0,112,243,0.35)" : "none",
          borderRadius: 10,
          padding: "11px 16px",
          fontSize: 13,
          fontWeight: 700,
          cursor: exporting || !canDownload ? "default" : "pointer",
          opacity: !canDownload ? 0.5 : 1,
        }}
      >
        <Download size={15} />
        {exporting
          ? exportProgress
            ? `${exportProgress.detail} ${exportProgress.pct}%`
            : "Encoding MP4…"
          : "Download MP4"}
      </button>

      {exportMsg ? (
        <p
          style={{
            margin: 0,
            width: PREVIEW_W,
            fontSize: 11,
            color:
              exportMsg.includes("failed") ||
              exportMsg.includes("needs Chrome") ||
              exportMsg.includes("empty") ||
              exportMsg.includes("not available")
                ? "#F87171"
                : "#67E8F9",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {exportMsg}
        </p>
      ) : null}

      <p style={{ margin: 0, width: PREVIEW_W, fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
        Full reel · {totalDuration.toFixed(1)}s
        {hasFootage ? " · Pexels hook footage" : ""}
        {includeWorkspace ? " · workspace" : ""}
        {includeOutro ? " · outro" : ""}
      </p>
    </div>
  );
});

function roundBtn(disabled: boolean): CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}
