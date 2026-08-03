import { SoftReveal, BRAND_EASE } from "./SoftReveal";
import { motion } from "framer-motion";
import {
  COMMON_LANG_PAIRS,
  formatLangBadge,
  resolveBrandLanguage,
} from "../languages";
import { brandColors, brandFonts, type BrandTheme } from "../tokens";
import { cn } from "../cn";

export { COMMON_LANG_PAIRS, formatLangBadge, BRAND_LANGUAGES, BRAND_LANGUAGE_COUNT } from "../languages";

/**
 * Animated language-pair badge.
 * Works for all 62 languages: `<LanguageBadge from="en" to="hi" />`
 */
export function LanguageBadge({
  from = "en",
  to = "es",
  label,
  theme = "dark",
  className,
}: {
  from?: string;
  to?: string;
  /** Override display text (default EN→ES style). */
  label?: string;
  theme?: BrandTheme;
  className?: string;
}) {
  const dark = theme === "dark";
  const text = label ?? formatLangBadge(from, to);
  const a = resolveBrandLanguage(from);
  const b = resolveBrandLanguage(to);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: BRAND_EASE }}
      className={cn("inline-flex pointer-events-none select-none", className)}
      style={{ fontFamily: brandFonts.sans }}
      title={`${a.name} → ${b.name}`}
    >
      <SoftReveal delay={0} duration={0.35}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide border"
          style={{
            backgroundColor: dark ? "rgba(34, 211, 238, 0.12)" : brandColors.primarySoft,
            borderColor: dark ? "rgba(34, 211, 238, 0.35)" : "rgba(37, 99, 235, 0.25)",
            color: dark ? brandColors.accent : brandColors.primary,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: dark ? brandColors.accent : brandColors.primary }}
          />
          {text}
        </span>
      </SoftReveal>
    </motion.div>
  );
}

/** Quick picks for the most common reel pairs. */
export const LanguageBadges = {
  EnEs: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="es" {...p} />
  ),
  EnAr: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="ar" {...p} />
  ),
  EnZh: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="zh" {...p} />
  ),
  EnFr: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="fr" {...p} />
  ),
  EnPt: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="pt" {...p} />
  ),
  EnRu: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="ru" {...p} />
  ),
  EnUk: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="uk" {...p} />
  ),
  EnHi: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="hi" {...p} />
  ),
  EnDe: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="de" {...p} />
  ),
  EnIt: (p?: Omit<Parameters<typeof LanguageBadge>[0], "from" | "to">) => (
    <LanguageBadge from="en" to="it" {...p} />
  ),
} as const;
