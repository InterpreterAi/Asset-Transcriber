import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLogo } from "@/brand/components/BrandLogo";
import { LiveBadge } from "@/brand/components/LiveBadge";
import { BrandTransition } from "@/brand/components/transitions";
import { brandColors, brandFonts, type BrandTheme } from "@/brand/tokens";
import { cn } from "@/lib/utils";

/**
 * Full-bleed intro sting for marketing reels.
 * Logo → LIVE badge → slogan lines → `onComplete`.
 */
export function BrandIntro({
  theme = "dark",
  tagline,
  sloganLines = [
    "Stay focused on the conversation.",
    "We'll handle the words.",
  ],
  showLiveBadge = true,
  durationMs = 1800,
  onComplete,
  className,
}: {
  theme?: BrandTheme;
  /** Optional single-line tagline (legacy). Prefer `sloganLines`. */
  tagline?: string;
  sloganLines?: string[];
  showLiveBadge?: boolean;
  durationMs?: number;
  onComplete?: () => void;
  className?: string;
}) {
  const dark = theme === "dark";
  const lines = sloganLines.length > 0 ? sloganLines : tagline ? [tagline] : [];

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
        backgroundColor: dark ? brandColors.night : brandColors.paper,
        fontFamily: brandFonts.sans,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background: dark
            ? `radial-gradient(circle at 30% 20%, ${brandColors.accent}22, transparent 45%), radial-gradient(circle at 80% 70%, ${brandColors.primary}33, transparent 50%)`
            : `radial-gradient(circle at 30% 20%, ${brandColors.primary}18, transparent 45%)`,
        }}
      />

      <BrandTransition name="scaleIn">
        <BrandLogo theme={theme} variant="mark" format="svg" className="h-16 w-16 sm:h-20 sm:w-20" />
      </BrandTransition>

      <BrandTransition name="slideUp" className="mt-5">
        <BrandLogo theme={theme} variant="wordmark" format="svg" className="h-9 sm:h-11" />
      </BrandTransition>

      {showLiveBadge ? (
        <BrandTransition name="softPop" className="mt-5">
          <LiveBadge active />
        </BrandTransition>
      ) : null}

      <div className="relative mt-6 flex flex-col items-center gap-2 min-h-[3.5rem]">
        <AnimatePresence mode="wait">
          {lines.map((line, i) => (
            <motion.p
              key={`${i}-${line}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.55 + i * 0.35,
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="text-center text-sm sm:text-base font-medium leading-snug max-w-xs"
              style={{ color: dark ? brandColors.paper : brandColors.ink }}
            >
              {line}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>

      <motion.div
        className="absolute bottom-0 left-0 right-0 h-0.5 origin-left"
        style={{ backgroundColor: dark ? brandColors.accent : brandColors.primary }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: durationMs / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}
