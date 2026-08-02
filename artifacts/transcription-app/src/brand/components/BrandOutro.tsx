import { useEffect } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/brand/components/BrandLogo";
import { BrandTransition } from "@/brand/components/transitions";
import { brandColors, brandFonts, type BrandTheme } from "@/brand/tokens";
import { cn } from "@/lib/utils";

/**
 * End-card outro for marketing reels.
 */
export function BrandOutro({
  theme = "dark",
  headline = "InterpreterAI",
  lines = [
    "62 Languages",
    "Built for Professional Interpreters",
  ],
  cta = "Start Free",
  url = "app.interpreterai.org",
  durationMs = 2800,
  onComplete,
  className,
}: {
  theme?: BrandTheme;
  headline?: string;
  lines?: string[];
  cta?: string;
  url?: string;
  durationMs?: number;
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
        "absolute inset-0 z-50 flex flex-col items-center justify-center px-6 text-center overflow-hidden",
        className,
      )}
      style={{
        backgroundColor: dark ? brandColors.night : brandColors.paper,
        fontFamily: brandFonts.sans,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: dark
            ? `linear-gradient(180deg, ${brandColors.nightPanel} 0%, ${brandColors.night} 100%)`
            : `linear-gradient(180deg, #FFFFFF 0%, ${brandColors.primarySoft} 100%)`,
        }}
      />

      <BrandTransition name="scaleIn" className="relative">
        <BrandLogo theme={theme} variant="mark" format="svg" className="h-14 w-14 mx-auto" />
      </BrandTransition>

      <BrandTransition name="slideUp" className="relative mt-4">
        <h2
          className="text-2xl sm:text-3xl font-semibold tracking-tight"
          style={{ color: dark ? brandColors.paper : brandColors.ink }}
        >
          {headline}
        </h2>
      </BrandTransition>

      <div className="relative mt-4 space-y-1.5">
        {lines.map((line, i) => (
          <BrandTransition key={line} name="fade" className="block">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.12, duration: 0.4 }}
              className="text-sm font-medium"
              style={{ color: dark ? "#CBD5E1" : brandColors.inkMuted }}
            >
              {line}
            </motion.p>
          </BrandTransition>
        ))}
      </div>

      <BrandTransition name="softPop" className="relative mt-6">
        <div
          className="px-5 py-2 rounded-full text-sm font-semibold"
          style={{
            backgroundColor: dark ? brandColors.accent : brandColors.primary,
            color: dark ? brandColors.night : brandColors.white,
          }}
        >
          {cta}
        </div>
      </BrandTransition>

      <BrandTransition name="fade" className="relative mt-3">
        <p
          className="text-xs font-semibold tracking-wide"
          style={{ color: dark ? brandColors.accent : brandColors.primary }}
        >
          {url}
        </p>
      </BrandTransition>
    </motion.div>
  );
}
