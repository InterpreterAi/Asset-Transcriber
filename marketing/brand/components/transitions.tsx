import { motion, type HTMLMotionProps, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared motion presets for marketing overlays / reel cuts. */
export const brandTransitionVariants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  },
  slideDown: {
    initial: { opacity: 0, y: -24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 32 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
  },
  slideRight: {
    initial: { opacity: 0, x: -32 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.04 },
  },
  wipeUp: {
    initial: { clipPath: "inset(100% 0 0 0)" },
    animate: { clipPath: "inset(0% 0 0 0)" },
    exit: { clipPath: "inset(0 0 100% 0)" },
  },
  softPop: {
    initial: { opacity: 0, scale: 0.85, filter: "blur(6px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.96, filter: "blur(4px)" },
  },
} as const satisfies Record<string, Variants>;

export type BrandTransitionName = keyof typeof brandTransitionVariants;

const DEFAULT_TRANSITION = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };

export function BrandTransition({
  name = "fade",
  children,
  className,
  ...rest
}: {
  name?: BrandTransitionName;
  children: ReactNode;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "variants">) {
  return (
    <motion.div
      variants={brandTransitionVariants[name]}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={DEFAULT_TRANSITION}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** CSS class names for non-React / editor timelines (also in `brand-motion.css`). */
export const brandTransitionClassNames = [
  "brand-fade-in",
  "brand-slide-up",
  "brand-slide-down",
  "brand-slide-left",
  "brand-scale-in",
  "brand-wipe-up",
  "brand-soft-pop",
] as const;
