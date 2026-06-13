import type { ReactNode } from "react";
import { motion } from "framer-motion";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
  children?: ReactNode;
};

export function CinematicCopyBlock({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className = "",
  children,
}: Props) {
  const alignCls = align === "center" ? "text-center mx-auto" : "text-left";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={`max-w-3xl ${alignCls} ${className}`}
    >
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-400/85 mb-4">{eyebrow}</p>
      )}
      <h2 className="text-2xl sm:text-4xl lg:text-[2.65rem] font-semibold tracking-tight leading-[1.12] text-white whitespace-pre-line">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-5 text-base sm:text-lg text-slate-400/95 leading-relaxed max-w-2xl mx-auto">{subtitle}</p>
      )}
      {children}
    </motion.div>
  );
}
