/**
 * Shared VO blob assembly + MP4 export for studio preview players.
 */

import {
  base64ToBlob,
  buildContinuousReelVoiceover,
  buildGeneratedSegments,
  computeProductPayoffDurationSec,
  computeReelTotalSec,
  computeWorkspaceDurationSec,
  hookClipsForStitch,
  resolveHookDurationSec,
  stitchSegmentClips,
  type GeneratedSegment,
  type HookVoClip,
  type ProductPayoffVoClip,
  type WorkspaceVoClip,
} from "@/lib/generatedReel";
import { exportReelMp4, type ExportProgress } from "@/lib/exportReelMp4";
import { paintStudioFrame, type StudioPaintContext } from "@/lib/paintStudioFrame";
import { resolveOutroAudioBlob } from "@/lib/outroAudio";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";
import type { OutroLayerDocument } from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import { resolveWorkspaceVoTiming, packWorkspaceAudioForStitch, stitchWorkspaceDialogue } from "@/lib/workspaceVoSync";
import type { WorkspaceExchange } from "@/lib/workspaceModel";

export type StudioVoBlobs = {
  hook?: Blob;
  workspace?: Blob;
  productPayoff?: Blob;
  outro?: Blob;
  full?: Blob;
};

export async function buildStudioVoBlobs(opts: {
  hookVoClips: HookVoClip[];
  hookAudio: string | null;
  hookDur: number;
  includeHook?: boolean;
  includeWorkspace: boolean;
  includeOutro: boolean;
  includeProductPayoff?: boolean;
  productPayoffVoClip?: ProductPayoffVoClip | null;
  productPayoffDur?: number;
  workspaceVoClips: WorkspaceVoClip[];
  workspaceExchanges?: WorkspaceExchange[];
  workspaceDur: number;
  outroAudioBase64: string | null;
  outroDur: number;
  outroVoiceover: string;
  targetLanguage: string;
  workspaceOutroGapSec?: number;
}): Promise<StudioVoBlobs> {
  const includeHook = opts.includeHook !== false;
  const includeProductPayoff = opts.includeProductPayoff !== false;
  const productPayoffDur =
    includeProductPayoff && opts.productPayoffDur && opts.productPayoffDur > 0
      ? opts.productPayoffDur
      : 0;

  const hookClipBlobs = includeHook ? hookClipsForStitch(opts.hookVoClips) : [];
  const hook =
    includeHook && hookClipBlobs.length > 0
      ? await stitchSegmentClips(hookClipBlobs, opts.hookDur)
      : includeHook && opts.hookAudio
        ? base64ToBlob(opts.hookAudio)
        : undefined;

  const resolvedWorkspace =
    opts.workspaceVoClips.length > 0
      ? await resolveWorkspaceVoTiming(opts.workspaceVoClips, opts.workspaceExchanges)
      : null;

  const workspaceClips = opts.includeWorkspace
    ? packWorkspaceAudioForStitch(
        opts.workspaceVoClips,
        resolvedWorkspace?.wordsByExchange,
        opts.workspaceExchanges,
      )
    : [];

  const productPayoff =
    includeProductPayoff && opts.productPayoffVoClip?.audioBase64
      ? base64ToBlob(opts.productPayoffVoClip.audioBase64)
      : undefined;

  const outro =
    opts.includeOutro && opts.outroAudioBase64
      ? base64ToBlob(opts.outroAudioBase64)
      : opts.includeOutro
        ? await resolveOutroAudioBlob({
            language: opts.targetLanguage,
            translatedBase64: opts.outroAudioBase64,
            durationSec: opts.outroDur,
            voiceoverText: opts.outroVoiceover,
          })
        : undefined;

  const full = await buildContinuousReelVoiceover({
    hook,
    hookClips: hookClipBlobs.length > 0 ? hookClipBlobs : undefined,
    hookSec: includeHook ? opts.hookDur : 0,
    workspaceClips,
    workspaceSec: opts.workspaceDur,
    productPayoff,
    productPayoffSec: productPayoffDur,
    outro: outro ?? undefined,
    includeHook,
    includeOutro: opts.includeOutro,
    includeWorkspace: opts.includeWorkspace,
    includeProductPayoff,
    outroSec: opts.outroDur,
    workspaceOutroGapSec: opts.workspaceOutroGapSec ?? 0,
  });

  const workspace =
    opts.includeWorkspace && opts.workspaceVoClips.length > 0
      ? await stitchWorkspaceDialogue(
          opts.workspaceVoClips,
          resolvedWorkspace?.wordsByExchange,
          opts.workspaceExchanges,
          opts.workspaceDur,
        )
      : undefined;

  return {
    hook,
    workspace: workspace ?? undefined,
    productPayoff: productPayoff ?? undefined,
    outro: outro ?? undefined,
    full: full ?? undefined,
  };
}

export function studioReelSegments(
  hookDur: number,
  workspaceDur: number,
  includeOutro: boolean,
  includeWorkspace: boolean,
  outroDur: number,
  productPayoffDur = 0,
  includeProductPayoff = true,
  includeHook = true,
  workspaceOutroGapSec = 0,
): GeneratedSegment[] {
  return buildGeneratedSegments(
    hookDur,
    workspaceDur,
    includeOutro,
    includeWorkspace,
    outroDur,
    productPayoffDur,
    includeProductPayoff,
    includeHook,
    workspaceOutroGapSec,
  );
}

export function studioReelTotalSec(
  hookDur: number,
  workspaceDur: number,
  includeOutro: boolean,
  includeWorkspace: boolean,
  outroDur: number,
  productPayoffDur = 0,
  includeProductPayoff = true,
  includeHook = true,
  workspaceOutroGapSec = 0,
): number {
  return computeReelTotalSec(
    hookDur,
    workspaceDur,
    includeOutro,
    includeWorkspace,
    outroDur,
    productPayoffDur,
    includeProductPayoff,
    includeHook,
    workspaceOutroGapSec,
  );
}

export function resolveProductPayoffDur(
  clip: ProductPayoffVoClip | null | undefined,
  fallbackSayLine?: string,
  lang = "en",
): number {
  return computeProductPayoffDurationSec(clip, fallbackSayLine, lang);
}

export async function exportStudioPreviewMp4(opts: {
  stage: HTMLElement;
  segments: GeneratedSegment[];
  totalDuration: number;
  voBlobs: StudioVoBlobs;
  includeOutro: boolean;
  outroCopy?: UniversalOutroCopy;
  outroLayout?: OutroLayerDocument;
  targetLanguage: string;
  outroPhraseTimings?: OutroPhraseTiming[];
  rtl: boolean;
  filename: string;
  autoDownload?: boolean;
  onProgress?: (p: ExportProgress) => void;
  seekTo?: (t: number) => void;
  /** Canvas export context — when set, skips html-to-image entirely. */
  studioPaint?: StudioPaintContext | null;
}): Promise<Blob> {
  const useCanvas = !!opts.studioPaint;

  return exportReelMp4({
    stage: opts.stage,
    durationSec: opts.totalDuration,
    width: 1080,
    height: 1920,
    segments: opts.segments,
    fps: 12,
    frameAccurate: true,
    videoBitrate: 8_000_000,
    outroCapture: opts.includeOutro ? "canvas" : "dom",
    outroCopy: opts.includeOutro ? opts.outroCopy : undefined,
    outroLayout: opts.includeOutro ? opts.outroLayout : undefined,
    outroDisplayLang: opts.targetLanguage,
    outroPhraseTimings: opts.includeOutro ? opts.outroPhraseTimings : undefined,
    outroRtl: opts.rtl,
    filename: opts.filename,
    fastCapture: true,
    autoDownload: opts.autoDownload,
    seekTo: opts.seekTo ?? (() => {}),
    waitForPaint: async () => {},
    onProgress: opts.onProgress,
    paintFrame: useCanvas
      ? (ctx, t, seg, w, h) => paintStudioFrame(ctx, t, seg, opts.studioPaint!)
      : undefined,
    audio: {
      musicUrl: null,
      voiceovers: opts.voBlobs.full
        ? { full: opts.voBlobs.full }
        : {
            hook: opts.voBlobs.hook,
            workspace: opts.voBlobs.workspace,
            productPayoff: opts.voBlobs.productPayoff,
            outro: opts.voBlobs.outro,
          },
      segments: opts.segments,
      volumes: { vo: 1, bgm: 0.22, brand: 0 },
    },
  });
}

import { buildReelExportFilename } from "@/lib/reelNaming";

export function studioExportFilename(storyline: string, language: string): string {
  return buildReelExportFilename({ storyline, language });
}

export { resolveHookDurationSec, computeWorkspaceDurationSec };
