import { motion } from "framer-motion";
import { SoftReveal, BRAND_EASE } from "./SoftReveal";
import { brandColors, brandFonts, type BrandTheme } from "../tokens";
import { LOWER_THIRD_PRESETS, type LowerThirdPresetKey } from "../presets";
import { cn } from "../cn";

export { LOWER_THIRD_PRESETS, LOWER_THIRD_PRESET_LIST } from "../presets";
export type { LowerThirdPresetKey } from "../presets";

/**
 * Animated lower-third label for reels.
 * Use `preset="medical"` or pass a custom `title`.
 */
export function LowerThird({
  title,
  preset,
  subtitle = "InterpreterAI",
  theme = "dark",
  className,
}: {
  title?: string;
  preset?: LowerThirdPresetKey;
  subtitle?: string;
  theme?: BrandTheme;
  className?: string;
}) {
  const dark = theme === "dark";
  const resolved = title ?? (preset ? LOWER_THIRD_PRESETS[preset] : "Interpretation");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: BRAND_EASE }}
      className={cn("pointer-events-none select-none", className)}
      style={{ fontFamily: brandFonts.sans }}
    >
      <SoftReveal delay={0} duration={0.4}>
        <div className="flex items-stretch gap-0 max-w-[min(92vw,420px)]">
          <div
            className="w-1.5 shrink-0 rounded-l-md"
            style={{ backgroundColor: dark ? brandColors.accent : brandColors.primary }}
          />
          <div
            className={cn(
              "rounded-r-xl px-3.5 py-2.5 border backdrop-blur-md",
              dark ? "border-white/10" : "border-slate-200/80",
            )}
            style={{
              backgroundColor: dark ? "rgba(11, 18, 32, 0.88)" : "rgba(248, 250, 252, 0.92)",
            }}
          >
            <p
              className="text-[15px] sm:text-base font-semibold leading-tight tracking-tight"
              style={{ color: dark ? brandColors.paper : brandColors.ink }}
            >
              {resolved}
            </p>
            {subtitle ? (
              <p
                className="mt-0.5 text-[11px] font-medium tracking-wide uppercase"
                style={{ color: dark ? brandColors.accent : brandColors.primary }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </SoftReveal>
    </motion.div>
  );
}

/** Named presets for one-line usage. */
export const LowerThirds = {
  Medical: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="medical" {...p} />
  ),
  Legal: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="legal" {...p} />
  ),
  Insurance: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="insurance" {...p} />
  ),
  Emergency911: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="emergency911" {...p} />
  ),
  Pharmacy: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="pharmacy" {...p} />
  ),
  Hospital: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="hospital" {...p} />
  ),
  MentalHealth: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="mentalHealth" {...p} />
  ),
  Immigration: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="immigration" {...p} />
  ),
  Banking: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="banking" {...p} />
  ),
  Travel: (p?: Omit<Parameters<typeof LowerThird>[0], "preset" | "title">) => (
    <LowerThird preset="travel" {...p} />
  ),
} as const;
