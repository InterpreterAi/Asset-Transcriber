import { motion } from "framer-motion";
import { brandColors, brandFonts, type BrandTheme } from "@/brand/tokens";
import { cn } from "@/lib/utils";

/**
 * Branded lower-third caption bar for reels / explainers.
 * Example title: “Medical Interpretation”.
 */
export function LowerThird({
  title,
  subtitle,
  theme = "dark",
  className,
}: {
  title: string;
  subtitle?: string;
  theme?: BrandTheme;
  className?: string;
}) {
  const dark = theme === "dark";

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, x: -12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("pointer-events-none select-none", className)}
      style={{ fontFamily: brandFonts.sans }}
    >
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
            {title}
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
    </motion.div>
  );
}
