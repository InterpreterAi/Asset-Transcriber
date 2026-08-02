import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/brand/components/BrandLogo";
import { LiveBadge } from "@/brand/components/LiveBadge";
import { brandColors, brandFonts } from "@/brand/tokens";
import { cn } from "@/lib/utils";

/** Official reel intro copy — keep in sync with STYLE_GUIDE. */
export const BRAND_INTRO_COPY = {
  slogan: [
    "Stay focused on the conversation.",
    "We'll handle the words.",
  ],
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + soft scale only — no slide, bounce, spin, or blur. */
function SoftReveal({
  delay,
  duration = 0.3,
  children,
  className,
}: {
  delay: number;
  duration?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Official InterpreterAI Brand Intro — 1.2s dark sting for every reel.
 *
 * Timeline:
 *   0.0–0.3  Logo fades in
 *   0.3–0.6  LIVE badge softly appears
 *   0.6–1.2  Slogan lines
 * Then fade into workspace via `onComplete`.
 */
export function BrandIntro({
  durationMs = 1200,
  onComplete,
  className,
}: {
  durationMs?: number;
  onComplete?: () => void;
  className?: string;
}) {
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
        backgroundColor: brandColors.night,
        fontFamily: brandFonts.sans,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${brandColors.nightPanel} 0%, ${brandColors.night} 100%)`,
        }}
      />

      <div className="relative flex flex-col items-center max-w-sm w-full text-center">
        {/* 0.0–0.3 — logo */}
        <SoftReveal delay={0} duration={0.3}>
          <BrandLogo theme="dark" variant="wordmark" format="svg" className="h-10 sm:h-12" />
        </SoftReveal>

        {/* 0.3–0.6 — LIVE */}
        <SoftReveal delay={0.3} duration={0.3} className="mt-5">
          <LiveBadge active />
        </SoftReveal>

        {/* 0.6–1.2 — slogans */}
        <div className="mt-6 space-y-1.5 min-h-[3rem]">
          {BRAND_INTRO_COPY.slogan.map((line, i) => (
            <SoftReveal key={line} delay={0.6 + i * 0.12} duration={0.35}>
              <p
                className="text-sm sm:text-base font-medium leading-snug"
                style={{ color: brandColors.paper }}
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
