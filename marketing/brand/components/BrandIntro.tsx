import { useEffect } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { SoftReveal, BRAND_EASE } from "./SoftReveal";
import { brandColors, brandFonts, type BrandTheme } from "../tokens";
import { cn } from "../cn";

export const BRAND_INTRO_COPY = {
  title: "InterpreterAI",
  slogan: [
    "Stay focused on the conversation.",
    "We'll handle the words.",
  ],
} as const;

export const BRAND_INTRO_DURATION_MS = 1000;

/**
 * Official Brand Intro — 1.0s.
 * Motion: fade + soft scale only. Uses existing logo assets.
 */
export function BrandIntro({
  durationMs = BRAND_INTRO_DURATION_MS,
  theme = "dark",
  /** When true, no fill — overlays footage. */
  transparent = false,
  /** Extra wordmark title under logo (off for reel intro — logo only + slogans). */
  showTitle = false,
  assetBase,
  onComplete,
  className,
}: {
  durationMs?: number;
  theme?: BrandTheme;
  transparent?: boolean;
  showTitle?: boolean;
  assetBase?: string;
  onComplete?: () => void;
  className?: string;
}) {
  const dark = theme === "dark";

  useEffect(() => {
    if (!onComplete) return;
    const id = window.setTimeout(onComplete, durationMs);
    return () => window.clearTimeout(id);
  }, [durationMs, onComplete]);

  return (
    <motion.div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6",
        className,
      )}
      style={{
        backgroundColor: transparent ? "transparent" : brandColors.night,
        fontFamily: brandFonts.sans,
      }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.35, ease: BRAND_EASE }}
    >
      {!transparent ? (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${brandColors.nightPanel} 0%, ${brandColors.night} 100%)`,
          }}
        />
      ) : null}

      <div className="relative flex flex-col items-center max-w-sm w-full text-center">
        <SoftReveal delay={0} duration={0.32}>
          <BrandLogo
            theme={theme}
            variant="wordmark"
            format="svg"
            assetBase={assetBase}
            className="h-12 sm:h-14"
          />
        </SoftReveal>

        {showTitle ? (
          <SoftReveal delay={0.2} duration={0.28} className="mt-4">
            <p
              className="text-lg sm:text-xl font-semibold tracking-tight"
              style={{ color: dark ? brandColors.paper : brandColors.ink }}
            >
              {BRAND_INTRO_COPY.title}
            </p>
          </SoftReveal>
        ) : null}

        <div className="mt-5 space-y-2">
          {BRAND_INTRO_COPY.slogan.map((line, i) => (
            <SoftReveal key={line} delay={0.28 + i * 0.14} duration={0.32}>
              <p
                className="text-base sm:text-lg font-medium leading-snug"
                style={{ color: dark ? "#F1F5F9" : brandColors.inkMuted }}
              >
                {line}
              </p>
            </SoftReveal>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
