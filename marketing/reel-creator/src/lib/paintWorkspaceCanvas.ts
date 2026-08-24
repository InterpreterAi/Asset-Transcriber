/**
 * Canvas workspace painter for MP4 export — layout matches WorkspaceSegment.
 */

import { isRtlLanguage, reelLanguageLabel } from "@/lib/constants/languages";
import {
  originalTextAtVoTime,
  translationPhrasesAfterOriginal,
  type WorkspaceVoScheduleItem,
} from "@/lib/workspaceVoSync";
import type { TimedWord } from "@/lib/kineticCaptions";
import {
  exchangeStripeSpeaker,
  translationAfterOriginalProgress,
  typedText,
  WORKSPACE_SPEAKER_COLORS,
  type WorkspaceConversation,
  type WorkspaceExchange,
} from "@/lib/workspaceModel";

const REF_W = 390;
const S = 1080 / REF_W;
const px = (n: number) => Math.round(n * S);

const CYAN = "#67E8F9";
const LIVE_RED = "#DC2626";
const BG = "#02050b";
const HEADER_BG = "rgba(11, 18, 32, 0.92)";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_SOFT = "rgba(255,255,255,0.06)";
const MUTED = "rgba(148,163,184,0.72)";
const CYAN_TILE = "rgba(34, 211, 238, 0.15)";
const TEXT = "rgb(241, 245, 249)";
const TRANS_ROOT_BG = "rgba(11, 17, 29, 0.92)";
const FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type RowData = {
  ex: WorkspaceExchange;
  original: string;
  translation: string;
  translationOpacity: number;
  active: boolean;
  typing: boolean;
};

function pairCodeLabel(sourceLang: string, targetLang: string): string {
  const code = (l: string) => (l.split("-")[0] ?? l).toUpperCase();
  return `${code(sourceLang)} → ${code(targetLang)}`;
}

function fmtTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function stripeColor(speaker: "A" | "B" | "C"): string {
  if (speaker === "C") return WORKSPACE_SPEAKER_COLORS.C;
  return speaker === "A" ? WORKSPACE_SPEAKER_COLORS.A : WORKSPACE_SPEAKER_COLORS.B;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function measureRowHeight(
  ctx: CanvasRenderingContext2D,
  row: RowData,
  colW: number,
  fontPx: number,
  lineHeight: number,
): number {
  ctx.font = `500 ${fontPx}px ${FONT}`;
  const origLines = wrapLines(ctx, row.original, colW - px(12) - px(4));
  ctx.font = `600 ${fontPx}px ${FONT}`;
  const transLines = wrapLines(ctx, row.translation || " ", colW);
  const origH = origLines.length * fontPx * lineHeight;
  const transH = transLines.length * fontPx * lineHeight + px(2);
  const inner = Math.max(origH, transH, px(20));
  return inner + (row.active ? px(8) : 0) + px(16);
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  conversation: WorkspaceConversation,
  elapsed: number,
  width: number,
): number {
  const h = px(44);
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, 0, width, h);
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(width, h);
  ctx.stroke();

  ctx.fillStyle = "rgba(34, 211, 238, 0.15)";
  roundRect(ctx, px(12), (h - px(28)) / 2, px(28), px(28), px(8));
  ctx.fill();
  drawZapIcon(ctx, px(12) + px(7), (h - px(28)) / 2 + px(5), px(14));

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${px(13)}px ${FONT}`;
  const brandX = px(12) + px(28) + px(8);
  ctx.fillText("Interpreter", brandX, h / 2 + px(5));
  const iw = ctx.measureText("Interpreter").width;
  ctx.fillStyle = CYAN;
  ctx.fillText("AI", brandX + iw, h / 2 + px(5));

  const pair = pairCodeLabel(conversation.sourceLang, conversation.targetLang);
  ctx.font = `600 ${px(10)}px ${FONT}`;
  const pw = ctx.measureText(pair).width + px(12);
  const px0 = brandX + iw + ctx.measureText("AI").width + px(8);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundRect(ctx, px0, h / 2 - px(10), pw, px(20), px(6));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();
  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.fillText(pair, px0 + px(6), h / 2 + px(4));

  const liveW = px(88);
  const liveX = width - px(12) - liveW;
  ctx.fillStyle = LIVE_RED;
  roundRect(ctx, liveX, h / 2 - px(11), liveW, px(22), 999);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(liveX + px(10), h / 2, px(3), 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 ${px(10)}px ${FONT}`;
  ctx.fillText("LIVE", liveX + px(16), h / 2 + px(4));
  ctx.font = `600 ${px(10)}px ${FONT}`;
  ctx.fillText(fmtTimer(elapsed), liveX + px(46), h / 2 + px(4));

  return h;
}

function drawFontSizeStepper(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  const h = px(24);
  const w = px(6) + px(12) + px(22) + px(12) + px(6);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, x, y, w, h, px(6));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();
  ctx.font = `600 ${px(12)}px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("−", x + px(6), y + h / 2 + px(4));
  ctx.font = `600 ${px(10)}px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.textAlign = "center";
  ctx.fillText("12", x + px(6) + px(12) + px(11), y + h / 2 + px(4));
  ctx.textAlign = "start";
  ctx.font = `600 ${px(12)}px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("+", x + w - px(12) - ctx.measureText("+").width, y + h / 2 + px(4));
  return x + w + px(6);
}

function drawChipIcon(ctx: CanvasRenderingContext2D, kind: "notes" | "glossary", ix: number, iy: number): void {
  const s = px(12);
  ctx.strokeStyle = "rgba(203,213,225,0.9)";
  ctx.lineWidth = 1.5;
  if (kind === "notes") {
    roundRect(ctx, ix, iy + 1, s - 2, s - 2, 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix + 2, iy + s / 2);
    ctx.lineTo(ix + s - 4, iy + s / 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(ix + 1, iy + 2);
    ctx.lineTo(ix + s / 2, iy + 1);
    ctx.lineTo(ix + s - 1, iy + 2);
    ctx.lineTo(ix + s - 1, iy + s - 1);
    ctx.lineTo(ix + 1, iy + s - 1);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawToolbarChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  icon?: "notes" | "glossary",
): number {
  const h = px(24);
  ctx.font = `500 ${px(10)}px ${FONT}`;
  const textW = ctx.measureText(label).width;
  const iconBlock = icon ? px(12) + px(4) : 0;
  const chipW = px(12) + iconBlock + textW;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, x, y, chipW, h, px(6));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();
  let tx = x + px(6);
  if (icon) {
    drawChipIcon(ctx, icon, tx, y + (h - px(12)) / 2);
    tx += px(12) + px(4);
  }
  ctx.fillStyle = "rgba(203,213,225,0.9)";
  ctx.fillText(label, tx, y + h / 2 + px(3));
  return x + chipW + px(6);
}

function drawSunIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = px(5);
  const cx = x + r;
  const cy = y + r;
  ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
  ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
    ctx.lineTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1);
    ctx.stroke();
  }
}

function drawZapIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.55, y);
  ctx.lineTo(x + size * 0.2, y + size * 0.55);
  ctx.lineTo(x + size * 0.45, y + size * 0.55);
  ctx.lineTo(x + size * 0.35, y + size);
  ctx.lineTo(x + size * 0.8, y + size * 0.42);
  ctx.lineTo(x + size * 0.52, y + size * 0.42);
  ctx.closePath();
  ctx.fill();
}

function drawToolbar(ctx: CanvasRenderingContext2D, top: number, width: number): number {
  const padY = px(6);
  const padX = px(8);
  const chipY = top + padY;
  const h = padY * 2 + px(24);

  ctx.fillStyle = "rgba(255,255,255,0.015)";
  ctx.fillRect(0, top, width, h);
  ctx.strokeStyle = BORDER_SOFT;
  ctx.beginPath();
  ctx.moveTo(0, top + h);
  ctx.lineTo(width, top + h);
  ctx.stroke();

  let x = padX;
  x = drawFontSizeStepper(ctx, x, chipY);
  x = drawToolbarChip(ctx, x, chipY, "0m / 2h · 7 days left");
  x = drawToolbarChip(ctx, x, chipY, "Notes", "notes");
  x = drawToolbarChip(ctx, x, chipY, "Glossary", "glossary");

  drawSunIcon(ctx, width - padX - px(14), chipY + px(2));

  return top + h;
}

function drawColumnHeaders(ctx: CanvasRenderingContext2D, top: number, width: number): number {
  const h = px(28);
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, top, width, h);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.moveTo(0, top + h);
  ctx.lineTo(width, top + h);
  ctx.stroke();

  ctx.font = `600 ${px(10)}px ${FONT}`;
  ctx.fillStyle = "rgba(100,116,139,0.95)";
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0.8px";
  }
  const pad = px(12);
  const gap = px(12);
  const colW = (width - pad * 2 - gap) / 2;
  ctx.fillText("ORIGINAL", pad, top + px(18));
  ctx.fillText("TRANSLATION", pad + colW + gap, top + px(18));
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  }
  return top + h;
}

function drawExchangeRow(
  ctx: CanvasRenderingContext2D,
  row: RowData,
  y: number,
  contentX: number,
  contentW: number,
  fontPx: number,
  lineHeight: number,
): number {
  const gap = px(12);
  const colW = (contentW - gap) / 2;
  const pad = row.active ? px(4) : 0;
  const rowTop = y + pad;

  ctx.font = `500 ${fontPx}px ${FONT}`;
  const origLines = wrapLines(ctx, row.original, colW - px(12) - px(4));
  ctx.font = `600 ${fontPx}px ${FONT}`;
  const transLines = wrapLines(ctx, row.translation || " ", colW);
  const origH = origLines.length * fontPx * lineHeight;
  const transH = transLines.length * fontPx * lineHeight;
  const innerH = Math.max(origH, transH + px(2), px(20));
  const rowH = innerH + pad * 2;

  if (row.active) {
    ctx.fillStyle = "rgba(34, 211, 238, 0.09)";
    roundRect(ctx, contentX, y, contentW, rowH, px(10));
    ctx.fill();
    ctx.strokeStyle = "rgba(34,211,238,0.16)";
    ctx.stroke();
  }

  const origX = contentX;
  const transX = contentX + colW + gap;

  ctx.fillStyle = stripeColor(exchangeStripeSpeaker(row.ex));
  roundRect(ctx, origX, rowTop + px(2), px(4), innerH, 999);
  ctx.fill();

  ctx.font = `500 ${fontPx}px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.textBaseline = "top";
  let oy = rowTop + px(2);
  const origRtl = isRtlLanguage(row.ex.originalLang);
  for (const line of origLines) {
    const tx = origRtl ? origX + colW - px(12) - ctx.measureText(line).width : origX + px(12) + px(4);
    ctx.fillText(line, tx, oy);
    oy += fontPx * lineHeight;
  }
  if (row.typing) {
    const lastLine = origLines.at(-1) ?? "";
    ctx.fillStyle = CYAN;
    ctx.fillRect(
      origX + px(12) + px(4) + ctx.measureText(lastLine).width + 2,
      oy - fontPx * 0.85,
      2,
      fontPx * 0.9,
    );
  }

  ctx.font = `600 ${fontPx}px ${FONT}`;
  ctx.fillStyle = `rgba(241, 245, 249, ${Math.max(0, Math.min(1, row.translationOpacity))})`;
  let ty = rowTop + px(2) + px(2);
  const transRtl = isRtlLanguage(row.ex.translationLang);
  for (const line of transLines) {
    const tx = transRtl ? transX + colW - ctx.measureText(line).width : transX;
    ctx.fillText(line, tx, ty);
    ty += fontPx * lineHeight;
  }

  ctx.textBaseline = "alphabetic";
  return y + rowH + px(16);
}

function drawChevronDown(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size / 2, y + size * 0.55);
  ctx.lineTo(x + size, y);
  ctx.stroke();
}

function drawRowsIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const ly = y + i * (size / 3) + 2;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + size, ly);
    ctx.stroke();
  }
}

function drawLangDropdown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  label: string,
): void {
  const h = px(32);
  ctx.fillStyle = "#121a2a";
  roundRect(ctx, x, y, w, h, px(8));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = `400 ${px(12)}px ${FONT}`;
  const maxTextW = w - px(8) * 2 - px(14) - px(4);
  let text = label;
  while (text.length > 1 && ctx.measureText(text).width > maxTextW) {
    text = text.slice(0, -1);
  }
  ctx.fillText(text, x + px(8), y + h / 2 + px(4));
  drawChevronDown(ctx, x + w - px(8) - px(14), y + px(8), px(14));
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  conversation: WorkspaceConversation,
  height: number,
  width: number,
): void {
  const footerH = px(92);
  const top = height - footerH;
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, top, width, footerH);
  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(width, top);
  ctx.stroke();

  const langH = px(32);
  const langY = top + px(10);
  const pad = px(12);
  const gap = px(6);
  const rowsBtnW = px(32);
  const swapW = px(16);
  const innerW = width - pad * 2;
  const langW = (innerW - rowsBtnW - gap - swapW - gap * 2) / 2;

  drawLangDropdown(ctx, pad, langY, langW, reelLanguageLabel(conversation.sourceLang));

  ctx.font = `600 ${px(10)}px ${FONT}`;
  ctx.fillStyle = "rgba(100,116,139,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("↔", pad + langW + gap + swapW / 2, langY + langH / 2 + px(4));
  ctx.textAlign = "start";

  drawLangDropdown(
    ctx,
    pad + langW + gap + swapW + gap,
    langY,
    langW,
    reelLanguageLabel(conversation.targetLang),
  );

  const rowsX = width - pad - rowsBtnW;
  ctx.fillStyle = "#121a2a";
  roundRect(ctx, rowsX, langY, rowsBtnW, langH, px(8));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();
  drawRowsIcon(ctx, rowsX + px(8), langY + px(8), px(14));

  const btnY = langY + langH + px(8);
  ctx.fillStyle = "#EF4444";
  roundRect(ctx, px(12), btnY, width - px(24), px(40), 999);
  ctx.fill();
  ctx.shadowColor = "rgba(239,68,68,0.45)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${px(14)}px ${FONT}`;
  ctx.textAlign = "center";
  const stopLabel = "Stop";
  const sq = px(14);
  const labelW = ctx.measureText(stopLabel).width;
  const totalW = sq + px(8) + labelW;
  const startX = width / 2 - totalW / 2;
  ctx.fillRect(startX, btnY + (px(40) - sq) / 2, sq, sq);
  ctx.fillText(stopLabel, startX + sq + px(8), btnY + px(26));
  ctx.shadowBlur = 0;
  ctx.textAlign = "start";
}

export function paintWorkspaceCanvas(
  ctx: CanvasRenderingContext2D,
  opts: {
    conversation: WorkspaceConversation;
    playheadSec: number;
    voSchedule: WorkspaceVoScheduleItem[];
    wordsByExchange?: TimedWord[][];
    subtitleScale?: number;
    width: number;
    height: number;
  },
): void {
  const { conversation, playheadSec, voSchedule, wordsByExchange } = opts;
  const width = opts.width;
  const height = opts.height;
  const fontPx = Math.round(px(12) * (opts.subtitleScale ?? 1));
  const lineHeight = 1.45;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  let y = drawHeader(ctx, conversation, playheadSec, width);
  y = drawToolbar(ctx, y, width);
  y = drawColumnHeaders(ctx, y, width);

  const footerH = px(92);
  const mainTop = y + px(8);
  const mainH = height - mainTop - footerH - px(8);
  const mainX = px(10);
  const mainW = width - px(20);

  ctx.fillStyle = TRANS_ROOT_BG;
  roundRect(ctx, mainX, mainTop, mainW, mainH, px(12));
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.stroke();

  const scrollPadX = px(8);
  const scrollPadY = px(10);
  const contentX = mainX + scrollPadX;
  const contentW = mainW - scrollPadX * 2;
  const viewportTop = mainTop + scrollPadY;
  const viewportH = mainH - scrollPadY * 2;

  const speechActive = voSchedule.find((s) => {
    const speech = s.speechDurSec ?? s.durationSec;
    return playheadSec >= s.startSec && playheadSec < s.startSec + speech;
  });
  const visualActive = voSchedule.find(
    (s) => playheadSec >= s.startSec && playheadSec < s.startSec + s.durationSec,
  );
  const activeIdx = speechActive?.exchangeIndex ?? visualActive?.exchangeIndex ?? -1;

  const rows: RowData[] = [];

  for (let i = 0; i < conversation.exchanges.length; i++) {
    const ex = conversation.exchanges[i]!;
    const item = voSchedule.find((s) => s.exchangeIndex === i);
    const isSettled = item ? playheadSec >= item.startSec + item.durationSec : false;
    const isActive = i === activeIdx;
    if (!isSettled && !isActive) continue;

    if (isSettled && !isActive) {
      rows.push({
        ex,
        original: ex.original,
        translation: ex.translation,
        translationOpacity: 1,
        active: false,
        typing: false,
      });
      continue;
    }

    const speechDur = item?.speechDurSec ?? item?.durationSec ?? 2;
    const localSpeech = item
      ? Math.max(0, Math.min(speechDur, playheadSec - item.startSec))
      : 0;
    const progress = item
      ? Math.max(0, Math.min(1, (playheadSec - item.startSec) / item.durationSec))
      : 0;
    const words = wordsByExchange?.[i];

    let original: string;
    let translation: string;
    let translationOpacity = 1;

    if (words && words.length > 0) {
      original = originalTextAtVoTime(words, localSpeech, ex.original, speechDur);
      const trans = translationPhrasesAfterOriginal(
        words,
        localSpeech,
        speechDur,
        ex.original,
        ex.translation,
      );
      translation = trans.text;
      translationOpacity = trans.opacity;
    } else {
      original = typedText(ex.original, progress, 1);
      const trans = translationAfterOriginalProgress(ex.translation, progress, 0.72);
      translation = trans.text;
      translationOpacity = trans.opacity;
    }

    rows.push({
      ex,
      original,
      translation,
      translationOpacity,
      active: true,
      typing: words?.length ? localSpeech < speechDur - 0.02 : progress < 0.98,
    });
  }

  ctx.font = `500 ${fontPx}px ${FONT}`;
  const colW = (contentW - px(12)) / 2;
  const rowHeights = rows.map((r) => measureRowHeight(ctx, r, colW, fontPx, lineHeight));
  const totalContentH = rowHeights.reduce((a, b) => a + b, 0);

  let scrollTop = 0;
  const padding = Math.round(fontPx * 1.1);
  const activeRowIdx = rows.findIndex((r) => r.active);
  if (activeRowIdx >= 0) {
    let offset = 0;
    for (let i = 0; i <= activeRowIdx; i++) offset += rowHeights[i]!;
    scrollTop = Math.max(0, Math.min(totalContentH - viewportH, offset - viewportH + padding));
  } else if (rows.length > 0) {
    scrollTop = Math.max(0, totalContentH - viewportH);
  }

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, mainX, mainTop, mainW, mainH, px(12));
  ctx.clip();

  let rowY = viewportTop - scrollTop;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (rowY + rowHeights[i]! >= viewportTop && rowY <= viewportTop + viewportH) {
      drawExchangeRow(ctx, row, rowY, contentX, contentW, fontPx, lineHeight);
    }
    rowY += rowHeights[i]!;
  }

  ctx.restore();
  drawFooter(ctx, conversation, height, width);
}
