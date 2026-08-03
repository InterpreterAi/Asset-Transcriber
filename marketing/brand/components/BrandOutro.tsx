import { useEffect } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { SoftReveal, BRAND_EASE } from "./SoftReveal";
import {
  brandColors,
  brandFonts,
  BRAND_REFERRAL_URL,
  REEL_SAFE_AREA,
  type BrandTheme,
} from "../tokens";
import { cn } from "../cn";

export const BRAND_OUTRO_COPY = {
  title: "InterpreterAI",
  slogan: [
    "Stay focused on the conversation.",
    "We'll handle the words.",
  ],
  tagline: "Built for Professional Interpreters",
  languages: "Supports 62 Languages",
  cta: "Start Free — 7 Days Free · 2 Hours/Day",
  url: BRAND_REFERRAL_URL,
} as const;

export const BRAND_OUTRO_DURATION_MS = 3000;

/**
 * Official Brand Outro — 3.0s.
 * Large CTA + TikTok/Reels/Shorts safe area. Existing logo only.
 */
export function BrandOutro({
  durationMs = BRAND_OUTRO_DURATION_MS,
  theme = "dark",
  referralUrl = BRAND_REFERRAL_URL,
  cta = BRAND_OUTRO_COPY.cta,
  assetBase,
  onComplete,
  className,
}: {
  durationMs?: number;
  theme?: BrandTheme;
  referralUrl?: string;
  cta?: string;
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
        "absolute inset-0 z-50 flex flex-col items-center justify-center text-center overflow-hidden",
        className,
      )}
      style={{
        backgroundColor: brandColors.night,
        fontFamily: brandFonts.sans,
        paddingTop: REEL_SAFE_AREA.topPx,
        paddingBottom: REEL_SAFE_AREA.bottomPx,
        paddingLeft: REEL_SAFE_AREA.sidePx,
        paddingRight: REEL_SAFE_AREA.sidePx,
      }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.4, ease: BRAND_EASE }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${brandColors.nightPanel} 0%, ${brandColors.night} 100%)`,
        }}
      />

      <div className="relative flex flex-col items-center max-w-md w-full">
        <SoftReveal delay={0.05}>
          <BrandLogo
            theme={theme}
            variant="wordmark"
            format="svg"
            assetBase={assetBase}
            className="h-11 sm:h-14"
          />
        </SoftReveal>

        <SoftReveal delay={0.2} className="mt-4">
          <p
            className="text-xl sm:text-2xl font-semibold tracking-tight"
            style={{ color: dark ? brandColors.paper : brandColors.ink }}
          >
            {BRAND_OUTRO_COPY.title}
          </p>
        </SoftReveal>

        <SoftReveal delay={0.3} className="mt-4 space-y-1">
          {BRAND_OUTRO_COPY.slogan.map((line, i) => (
            <p
              key={line}
              className="text-sm sm:text-base font-semibold tracking-tight"
              style={{ color: i === 0 ? (dark ? brandColors.paper : brandColors.ink) : brandColors.accent }}
            >
              {line}
            </p>
          ))}
        </SoftReveal>

        <SoftReveal delay={0.45} className="mt-3">
          <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>
            {BRAND_OUTRO_COPY.languages}
          </p>
        </SoftReveal>

        <SoftReveal delay={0.6} className="mt-7 w-full">
          <div
            className="mx-auto w-full max-w-sm rounded-2xl px-5 py-4 text-base sm:text-lg font-bold leading-snug"
            style={{
              backgroundColor: brandColors.accent,
              color: brandColors.night,
            }}
          >
            {cta}
          </div>
        </SoftReveal>

        <SoftReveal delay={0.85} className="mt-4">
          <p
            className="text-[11px] sm:text-xs font-semibold tracking-wide break-all px-2"
            style={{ color: brandColors.accent }}
          >
            {referralUrl}
          </p>
        </SoftReveal>
      </div>
    </motion.div>
  );
}
