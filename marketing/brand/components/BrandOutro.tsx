import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/brand/components/BrandLogo";
import { brandColors, brandFonts } from "@/brand/tokens";
import { cn } from "@/lib/utils";

/** Official reel end-card copy — keep in sync with STYLE_GUIDE. */
export const BRAND_OUTRO_COPY = {
  slogan: [
    "Stay focused on the conversation.",
    "We'll handle the words.",
  ],
  lines: [
    "Built for Professional Interpreters",
    "Supports 62 Languages",
  ],
  cta: "Start Free — 7-Day Free Trial • 2 Hours/Day",
  url: "app.interpreterai.org",
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + soft scale only — no slide, bounce, spin, or blur. */
function SoftReveal({
  delay,
  children,
  className,
}: {
  delay: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Official InterpreterAI Brand Outro — 2.5s dark end card for every reel.
 * Motion: fade + soft scale only.
 */
export function BrandOutro({
  durationMs = 2500,
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
        "absolute inset-0 z-50 flex flex-col items-center justify-center px-6 text-center overflow-hidden",
        className,
      )}
      style={{
        backgroundColor: brandColors.night,
        fontFamily: brandFonts.sans,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${brandColors.nightPanel} 0%, ${brandColors.night} 100%)`,
        }}
      />

      <div className="relative flex flex-col items-center max-w-md w-full">
        <SoftReveal delay={0.05}>
          <BrandLogo theme="dark" variant="wordmark" format="svg" className="h-10 sm:h-12" />
        </SoftReveal>

        <div className="mt-5 space-y-1.5">
          {BRAND_OUTRO_COPY.slogan.map((line, i) => (
            <SoftReveal key={line} delay={0.2 + i * 0.1}>
              <p
                className="text-sm sm:text-base font-medium leading-snug"
                style={{ color: brandColors.paper }}
              >
                {line}
              </p>
            </SoftReveal>
          ))}
        </div>

        <div className="mt-5 space-y-1.5">
          {BRAND_OUTRO_COPY.lines.map((line, i) => (
            <SoftReveal key={line} delay={0.45 + i * 0.1}>
              <p
                className="text-xs sm:text-sm font-semibold tracking-wide"
                style={{ color: "#CBD5E1" }}
              >
                {line}
              </p>
            </SoftReveal>
          ))}
        </div>

        <SoftReveal delay={0.7} className="mt-6">
          <p
            className="text-sm font-semibold"
            style={{ color: brandColors.accent }}
          >
            {BRAND_OUTRO_COPY.cta}
          </p>
        </SoftReveal>

        <SoftReveal delay={0.85} className="mt-3">
          <p
            className="text-xs font-semibold tracking-wide"
            style={{ color: brandColors.accent }}
          >
            {BRAND_OUTRO_COPY.url}
          </p>
        </SoftReveal>
      </div>
    </motion.div>
  );
}
