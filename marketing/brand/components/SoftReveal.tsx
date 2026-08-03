import type { ReactNode } from "react";
import { motion } from "framer-motion";

export const BRAND_EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + soft scale only — official motion for all brand overlays. */
export function SoftReveal({
  delay = 0,
  duration = 0.35,
  children,
  className,
}: {
  delay?: number;
  duration?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration, ease: BRAND_EASE }}
    >
      {children}
    </motion.div>
  );
}
