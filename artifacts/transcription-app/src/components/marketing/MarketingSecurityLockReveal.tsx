import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Lock, Shield } from "lucide-react";
import { marketingFade } from "./marketing-motion";

type Props = {
  title: string;
  intro: string;
  bullets: readonly { title: string; body: string }[];
};

/** Scroll-driven lock opens to reveal HIPAA / trust copy. */
export function MarketingSecurityLockReveal({ title, intro, bullets }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const shackleRotate = useTransform(scrollYProgress, [0.15, 0.45], [0, -58]);
  const bodyY = useTransform(scrollYProgress, [0.15, 0.45], [0, -14]);
  const revealOpacity = useTransform(scrollYProgress, [0.35, 0.55], [0, 1]);
  const revealY = useTransform(scrollYProgress, [0.35, 0.55], [24, 0]);
  const glow = useTransform(scrollYProgress, [0.2, 0.5], [0.2, 1]);

  return (
    <div ref={ref} className="relative py-20 sm:py-28">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <motion.div {...marketingFade(0)} className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400/90 mb-3">Trust center</p>
          <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-4 text-slate-300/90 text-lg leading-relaxed max-w-2xl mx-auto">{intro}</p>
        </motion.div>

        <div className="relative flex flex-col items-center">
          <motion.div style={{ scale: glow }} className="absolute w-48 h-48 rounded-full bg-sky-500/20 blur-[60px]" aria-hidden />

          <div className="relative w-32 h-40 mb-10">
            <motion.div style={{ y: bodyY }} className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-28 rounded-2xl border-2 border-sky-400/50 bg-sky-500/10 backdrop-blur-sm flex items-end justify-center pb-4">
              <div className="w-10 h-12 rounded-lg bg-sky-400/20 border border-sky-400/30" />
            </motion.div>
            <motion.div
              style={{ rotate: shackleRotate, transformOrigin: "12px 52px" }}
              className="absolute top-2 left-1/2 -translate-x-1/2"
            >
              <svg width="80" height="56" viewBox="0 0 80 56" fill="none" className="text-sky-300">
                <path
                  d="M16 28 V20 a24 24 0 0 1 48 0 v8"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="28" r="6" fill="currentColor" />
              </svg>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              style={{ opacity: revealOpacity }}
              className="absolute -right-2 top-8"
            >
              <Shield className="w-8 h-8 text-emerald-400/80" />
            </motion.div>
          </div>

          <motion.div
            style={{ opacity: revealOpacity, y: revealY }}
            className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 sm:p-10 space-y-5"
          >
            {bullets.map(({ title: t, body }, i) => (
              <motion.div
                key={t}
                {...marketingFade(0.05 * i)}
                className="flex gap-4 items-start"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">{t}</h3>
                  <p className="mt-1.5 text-sm text-slate-300/85 leading-relaxed">{body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
