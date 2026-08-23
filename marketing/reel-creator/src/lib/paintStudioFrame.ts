/**
 * Full-frame canvas painter for studio reel MP4 export — no html-to-image.
 */

import type { GeneratedSegment, HookVoClip, ProductPayoffVoClip } from "@/lib/generatedReel";
import { buildFootageSchedule, FootageExportPool } from "@/lib/footageExportPool";
import { paintClipCaptionsCanvas } from "@/lib/paintClipCaptionsCanvas";
import { paintWorkspaceCanvas } from "@/lib/paintWorkspaceCanvas";
import {
  paintLockedOutroFrame,
  type LockedOutroPaintAssets,
} from "@/lib/renderLockedOutroFrame";
import type { TimedWord } from "@/lib/kineticCaptions";
import type { LanguagePair } from "@/lib/languageFlags";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";
import type { OutroLayerDocument } from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import type { WorkspaceConversation } from "@/lib/workspaceModel";
import type { WorkspaceVoScheduleItem } from "@/lib/workspaceVoSync";

const HOOK_POOL = "hook";
const PAYOFF_POOL = "payoff";

export type StudioPaintContext = {
  width: number;
  height: number;
  footagePool: FootageExportPool;
  outroAssets: LockedOutroPaintAssets | null;
  hookVoClips: HookVoClip[];
  footageUrls: string[];
  hookFootageDur: number;
  hasFootage: boolean;
  hookCaptionWords: TimedWord[];
  workspace: WorkspaceConversation;
  languagePair: LanguagePair;
  workspaceVoSchedule: WorkspaceVoScheduleItem[];
  wordsByExchange?: TimedWord[][];
  workspaceDur: number;
  includeWorkspace: boolean;
  productPayoffVoClip: ProductPayoffVoClip | null;
  productPayoffFootageDur: number;
  productPayoffDur: number;
  productPayoffCaptionWords: TimedWord[];
  productPayoffHeadline?: string;
  productPayoffSupportingText?: string;
  includeProductPayoff: boolean;
  includeOutro: boolean;
  outroCopy?: UniversalOutroCopy;
  outroLayout?: OutroLayerDocument;
  outroPhraseTimings?: OutroPhraseTiming[];
  outroDur: number;
  targetLanguage: string;
  rtl: boolean;
  subtitleScale: number;
};

export async function createStudioPaintContext(opts: {
  width: number;
  height: number;
  hookVoClips: HookVoClip[];
  footageUrls: string[];
  hookFootageDur: number;
  hasFootage: boolean;
  hookCaptionWords: TimedWord[];
  workspace: WorkspaceConversation;
  languagePair: LanguagePair;
  workspaceVoSchedule: WorkspaceVoScheduleItem[];
  wordsByExchange?: TimedWord[][];
  workspaceDur: number;
  includeWorkspace: boolean;
  productPayoffVoClip: ProductPayoffVoClip | null;
  productPayoffFootageDur: number;
  productPayoffDur: number;
  productPayoffCaptionWords: TimedWord[];
  productPayoffHeadline?: string;
  productPayoffSupportingText?: string;
  includeProductPayoff: boolean;
  includeOutro: boolean;
  outroCopy?: UniversalOutroCopy;
  outroLayout?: OutroLayerDocument;
  outroPhraseTimings?: OutroPhraseTiming[];
  outroDur: number;
  targetLanguage: string;
  rtl: boolean;
  subtitleScale: number;
  outroAssets: LockedOutroPaintAssets | null;
}): Promise<StudioPaintContext> {
  const pool = new FootageExportPool();
  const hookSchedule = buildFootageSchedule(opts.footageUrls, opts.hookVoClips, opts.hookFootageDur);
  await pool.load(HOOK_POOL, hookSchedule);

  if (opts.includeProductPayoff && opts.productPayoffVoClip?.footageUrl) {
    const payoffClip: HookVoClip[] = opts.productPayoffVoClip.audioBase64
      ? [{ ...opts.productPayoffVoClip, startSec: 0, footageUrl: opts.productPayoffVoClip.footageUrl }]
      : [];
    const payoffSchedule = buildFootageSchedule(
      [opts.productPayoffVoClip.footageUrl],
      payoffClip,
      opts.productPayoffFootageDur,
    );
    await pool.load(PAYOFF_POOL, payoffSchedule);
  }

  return {
    width: opts.width,
    height: opts.height,
    footagePool: pool,
    outroAssets: opts.outroAssets,
    hookVoClips: opts.hookVoClips,
    footageUrls: opts.footageUrls,
    hookFootageDur: opts.hookFootageDur,
    hasFootage: opts.hasFootage,
    hookCaptionWords: opts.hookCaptionWords,
    workspace: opts.workspace,
    languagePair: opts.languagePair,
    workspaceVoSchedule: opts.workspaceVoSchedule,
    wordsByExchange: opts.wordsByExchange,
    workspaceDur: opts.workspaceDur,
    includeWorkspace: opts.includeWorkspace,
    productPayoffVoClip: opts.productPayoffVoClip,
    productPayoffFootageDur: opts.productPayoffFootageDur,
    productPayoffDur: opts.productPayoffDur,
    productPayoffCaptionWords: opts.productPayoffCaptionWords,
    productPayoffHeadline: opts.productPayoffHeadline,
    productPayoffSupportingText: opts.productPayoffSupportingText,
    includeProductPayoff: opts.includeProductPayoff,
    includeOutro: opts.includeOutro,
    outroCopy: opts.outroCopy,
    outroLayout: opts.outroLayout,
    outroPhraseTimings: opts.outroPhraseTimings,
    outroDur: opts.outroDur,
    targetLanguage: opts.targetLanguage,
    rtl: opts.rtl,
    subtitleScale: opts.subtitleScale,
  };
}

export function disposeStudioPaintContext(ctx: StudioPaintContext | null): void {
  ctx?.footagePool.dispose();
}

function paintHookBackdrop(
  ctx: CanvasRenderingContext2D,
  localTime: number,
  width: number,
  height: number,
  hasFootage: boolean,
): void {
  const t = Math.max(0, localTime);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0A1628");
  grad.addColorStop(0.42, "#12253A");
  grad.addColorStop(1, "#061018");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const radGrad = ctx.createRadialGradient(width * 0.5, height * 0.3, 0, width * 0.5, height * 0.3, width * 0.55);
  radGrad.addColorStop(0, "rgba(0,112,243,0.35)");
  radGrad.addColorStop(1, "transparent");
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, width, height);

  if (!hasFootage) {
    ctx.fillStyle = "rgba(103,232,249,0.55)";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("HOOK VOICEOVER READY", width / 2, height * 0.64);
    ctx.textAlign = "start";
  }
}

function paintBottomGradient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gH = height * 0.42;
  const grad = ctx.createLinearGradient(0, height - gH, 0, height);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.8, "rgba(2,5,11,0.72)");
  grad.addColorStop(1, "rgba(2,5,11,0.72)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, height - gH, width, gH);
}

async function paintHookLikeSegment(
  ctx: CanvasRenderingContext2D,
  paint: StudioPaintContext,
  poolKey: string,
  localTime: number,
  hasFootage: boolean,
  captionWords: TimedWord[],
  headline?: string,
  supporting?: string,
): Promise<void> {
  const { width, height, rtl, subtitleScale } = paint;

  let drewFootage = false;
  if (hasFootage) {
    drewFootage = await paint.footagePool.draw(ctx, poolKey, localTime, width, height);
  }
  if (!drewFootage) {
    paintHookBackdrop(ctx, localTime, width, height, hasFootage);
  }

  paintBottomGradient(ctx, width, height);

  if (headline || supporting) {
    ctx.textAlign = "center";
    if (headline) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `800 ${72 * subtitleScale}px Inter, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 32;
      ctx.fillText(headline, width / 2, 120 * subtitleScale + 72 * subtitleScale);
      ctx.shadowBlur = 0;
    }
    if (supporting) {
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = `600 ${36 * subtitleScale}px Inter, sans-serif`;
      ctx.fillText(supporting, width / 2, 120 * subtitleScale + (headline ? 100 : 0) * subtitleScale);
    }
    ctx.textAlign = "start";
  }

  paintClipCaptionsCanvas(ctx, captionWords, localTime, rtl, width, height, subtitleScale);
}

export async function paintStudioFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  seg: GeneratedSegment,
  paint: StudioPaintContext,
): Promise<void> {
  const { width, height } = paint;
  const local = Math.max(0, t - seg.start);
  const segDur = Math.max(0.1, seg.end - seg.start);

  ctx.fillStyle = "#0A1628";
  ctx.fillRect(0, 0, width, height);

  if (seg.id === "hook") {
    await paintHookLikeSegment(
      ctx,
      paint,
      HOOK_POOL,
      local,
      paint.hasFootage,
      paint.hookCaptionWords,
    );
    return;
  }

  if (seg.id === "workspace" && paint.includeWorkspace) {
    paintWorkspaceCanvas(ctx, {
      conversation: paint.workspace,
      playheadSec: local,
      voSchedule: paint.workspaceVoSchedule,
      wordsByExchange: paint.wordsByExchange,
      subtitleScale: paint.subtitleScale,
      width,
      height,
    });
    return;
  }

  if (seg.id === "productPayoff" && paint.includeProductPayoff) {
    const hasPayoffFootage = Boolean(paint.productPayoffVoClip?.footageUrl);
    await paintHookLikeSegment(
      ctx,
      paint,
      PAYOFF_POOL,
      local,
      hasPayoffFootage,
      paint.productPayoffCaptionWords,
      paint.productPayoffHeadline,
      paint.productPayoffSupportingText,
    );
    return;
  }

  if (seg.id === "outro" && paint.includeOutro && paint.outroAssets && paint.outroCopy) {
    paintLockedOutroFrame(ctx, {
      assets: paint.outroAssets,
      copy: paint.outroCopy,
      layout: paint.outroLayout,
      displayLang: paint.targetLanguage,
      rtl: paint.rtl,
      phraseTimings: paint.outroPhraseTimings,
      syncToPhrases: true,
      localTime: local,
      durationSec: segDur,
      width,
      height,
    });
  }
}

/** Segment ids painted via canvas (skip html-to-image entirely). */
export function studioCanvasSegmentIds(): Set<string> {
  return new Set(["hook", "workspace", "productPayoff", "outro"]);
}
