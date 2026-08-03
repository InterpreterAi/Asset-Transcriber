import { motion } from "framer-motion";
import { BrandLogo } from "./BrandLogo";
import { SoftReveal, BRAND_EASE } from "./SoftReveal";
import {
  brandColors,
  brandFonts,
  BRAND_REFERRAL_URL,
  BRAND_SITE_URL,
  REEL_SAFE_AREA,
  type BrandTheme,
} from "../tokens";
import { cn } from "../cn";

export const CTA_CARD_COPY = {
  title: "InterpreterAI",
  languages: "Supports 62 Languages",
  trial: "Start Free — 7 Days Free • 2 Hours/Day",
  site: BRAND_SITE_URL,
  referral: BRAND_REFERRAL_URL,
} as const;

/**
 * Reusable ending CTA card: logo, site, referral, trial, 62 languages.
 * Safe-area padded for vertical short-form video.
 */
export function CtaCard({
  theme = "dark",
  referralUrl = BRAND_REFERRAL_URL,
  siteUrl = BRAND_SITE_URL,
  assetBase,
  className,
}: {
  theme?: BrandTheme;
  referralUrl?: string;
  siteUrl?: string;
  assetBase?: string;
  className?: string;
}) {
  const dark = theme === "dark";

  return (
    <motion.div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden",
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: BRAND_EASE }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${brandColors.nightPanel} 0%, ${brandColors.night} 100%)`,
        }}
      />

      <div
        className="relative w-full max-w-sm rounded-3xl border px-6 py-7 text-center"
        style={{
          backgroundColor: brandColors.nightElevated,
          borderColor: "rgba(34, 211, 238, 0.22)",
        }}
      >
        <SoftReveal delay={0.05}>
          <BrandLogo
            theme={theme}
            variant="mark"
            format="svg"
            assetBase={assetBase}
            className="h-14 w-14 mx-auto"
          />
        </SoftReveal>

        <SoftReveal delay={0.15} className="mt-4">
          <p
            className="text-xl font-semibold tracking-tight"
            style={{ color: dark ? brandColors.paper : brandColors.ink }}
          >
            {CTA_CARD_COPY.title}
          </p>
        </SoftReveal>

        <SoftReveal delay={0.25} className="mt-2">
          <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>
            {CTA_CARD_COPY.languages}
          </p>
        </SoftReveal>

        <SoftReveal delay={0.35} className="mt-5">
          <div
            className="rounded-2xl px-4 py-3.5 text-sm sm:text-base font-bold leading-snug"
            style={{
              backgroundColor: brandColors.accent,
              color: brandColors.night,
            }}
          >
            {CTA_CARD_COPY.trial}
          </div>
        </SoftReveal>

        <SoftReveal delay={0.5} className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold" style={{ color: brandColors.accent }}>
            {siteUrl.replace(/^https?:\/\//, "")}
          </p>
          <p
            className="text-[10px] font-medium break-all leading-relaxed opacity-90"
            style={{ color: "#64748B" }}
          >
            {referralUrl}
          </p>
        </SoftReveal>
      </div>
    </motion.div>
  );
}
