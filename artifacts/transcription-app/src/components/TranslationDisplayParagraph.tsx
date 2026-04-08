import {
  getTranslationTypographyMeta,
  wrapAsciiDigitRunsWithLtrSpans,
} from "@/lib/wrap-ltr-numbers";

type Props = {
  text: string;
  className?: string;
};

/**
 * Renders translation text; in RTL targets, wraps ASCII digit runs in `dir="ltr"` spans to avoid bidi reordering.
 */
export function TranslationDisplayParagraph({
  text,
  className = "text-sm text-foreground leading-relaxed whitespace-pre-wrap",
}: Props) {
  const { rtl, arabicScript, hebrewOnly } = getTranslationTypographyMeta(text);

  if (!rtl) {
    return (
      <p className={className} dir="auto">
        {text}
      </p>
    );
  }

  return (
    <p
      className={arabicScript ? `${className} ts-arabic` : className}
      dir="rtl"
      lang={hebrewOnly ? "he" : "ar"}
      dangerouslySetInnerHTML={{ __html: wrapAsciiDigitRunsWithLtrSpans(text) }}
    />
  );
}
