import { motion, type HTMLMotionProps, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { BRAND_EASE } from "./SoftReveal";

export const brandTransitionVariants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
  },
} as const satisfies Record<string, Variants>;

export type BrandTransitionName = keyof typeof brandTransitionVariants;

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
      transition={{ duration: 0.4, ease: BRAND_EASE }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const brandTransitionClassNames = ["brand-fade-in", "brand-scale-in"] as const;
