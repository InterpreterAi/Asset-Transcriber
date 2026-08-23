import {
  clipCaptionFontSizePx,
  clipCaptionWindowAt,
  KINETIC_ACTIVE_BLUE,
  KINETIC_IDLE_WHITE,
  layoutClipCaptionLines,
  REEL_CAPTION_FONT,
  type TimedWord,
} from "@/lib/kineticCaptions";

const CAPTION_BOTTOM = 430;

/** Draw hook / product-payoff kinetic captions — pixel-match ClipWordSubtitles. */
export function paintClipCaptionsCanvas(
  ctx: CanvasRenderingContext2D,
  words: TimedWord[],
  localTime: number,
  rtl: boolean,
  width: number,
  height: number,
  scale = 1,
  bottom = CAPTION_BOTTOM,
): void {
  const win = clipCaptionWindowAt(words, localTime);
  if (!win || win.words.length === 0) return;
  if (localTime + 0.015 < win.phraseStart || localTime > win.phraseEnd + 0.04) return;

  const lines = layoutClipCaptionLines(win.words);
  const maxLineWords = Math.max(...lines.map((l) => l.length), 1);
  const fontSize = clipCaptionFontSizePx(maxLineWords, width) * scale;
  const gap = Math.round(fontSize * 0.28);
  const lineGap = Math.round(fontSize * 0.12);
  const lineHeight = fontSize * 1.15;
  const anchorBottom = height - bottom;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${fontSize}px ${REEL_CAPTION_FONT}`;

  const totalBlockH =
    lines.length * lineHeight + Math.max(0, lines.length - 1) * lineGap;
  let baselineY = anchorBottom - totalBlockH + lineHeight;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineWords = lines[lineIdx]!;
    const lineWidth = lineWords.reduce(
      (acc, w, i) => acc + ctx.measureText(w.word).width + (i > 0 ? gap : 0),
      0,
    );

    let x = (width - lineWidth) / 2;
    if (rtl) x = (width + lineWidth) / 2;

    const drawOrder = rtl ? [...lineWords].reverse() : lineWords;
    for (const w of drawOrder) {
      const active = w.index === win.activeIndex;
      const wordW = ctx.measureText(w.word).width;
      const drawX = rtl ? x - wordW : x;

      ctx.shadowColor = active
        ? `${KINETIC_ACTIVE_BLUE}aa`
        : "rgba(0,0,0,0.9)";
      ctx.shadowBlur = active ? 24 : 32;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = active ? 0 : 8;
      ctx.fillStyle = active ? KINETIC_ACTIVE_BLUE : KINETIC_IDLE_WHITE;
      ctx.fillText(w.word, drawX, baselineY);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      x += rtl ? -wordW - gap : wordW + gap;
    }

    baselineY += lineHeight + lineGap;
  }

  ctx.restore();
}
