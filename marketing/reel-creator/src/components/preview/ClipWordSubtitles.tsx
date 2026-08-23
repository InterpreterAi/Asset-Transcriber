import {
  CAPTION_SIDE_PAD,
  clipCaptionFontSizePx,
  clipCaptionWindowAt,
  KINETIC_ACTIVE_BLUE,
  KINETIC_IDLE_WHITE,
  layoutClipCaptionLines,
  REEL_CAPTION_FONT,
  type TimedWord,
} from "@/lib/kineticCaptions";

type Props = {
  words: TimedWord[];
  localTime: number;
  rtl: boolean;
  scale?: number;
  canvasWidth?: number;
  bottom?: number;
};

/** Hook / payoff clip subtitles — up to 2 lines, word-synced highlight, no ellipsis. */
export function ClipWordSubtitles({
  words,
  localTime,
  rtl,
  scale = 1,
  canvasWidth = 1080,
  bottom = 430,
}: Props) {
  const win = clipCaptionWindowAt(words, localTime);
  if (!win || win.words.length === 0) return null;
  if (localTime + 0.015 < win.phraseStart || localTime > win.phraseEnd + 0.04) return null;

  const lines = layoutClipCaptionLines(win.words);
  const maxLineWords = Math.max(...lines.map((l) => l.length), 1);
  const fontSize = clipCaptionFontSizePx(maxLineWords, canvasWidth) * scale;
  const gap = Math.round(fontSize * 0.28);

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{
        position: "absolute",
        left: CAPTION_SIDE_PAD * scale,
        right: CAPTION_SIDE_PAD * scale,
        bottom,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: Math.round(fontSize * 0.12),
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      {lines.map((lineWords, lineIdx) => (
        <div
          key={`line-${lineIdx}-${lineWords[0]?.index ?? 0}`}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            justifyContent: "center",
            alignItems: "center",
            gap,
            maxWidth: "100%",
          }}
        >
          {lineWords.map((w) => {
            const active = w.index === win.activeIndex;
            return (
              <span
                key={`${w.index}-${w.word}`}
                style={{
                  fontFamily: REEL_CAPTION_FONT,
                  fontSize,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: rtl ? 0 : "-0.02em",
                  color: active ? KINETIC_ACTIVE_BLUE : KINETIC_IDLE_WHITE,
                  textShadow: active
                    ? `0 0 24px ${KINETIC_ACTIVE_BLUE}aa, 0 8px 32px rgba(0,0,0,0.9)`
                    : "0 8px 32px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
