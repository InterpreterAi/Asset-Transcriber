import type { ReactNode } from "react";
import { motion, useTransform } from "framer-motion";
import { useCinematicStory } from "./CinematicStoryContext";

/** One persistent visual environment — no section resets. */
export function CinematicEnvironment({ children }: { children: ReactNode }) {
  const { scrollYProgress } = useCinematicStory();
  const blob1Y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const blob2Y = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const coreGlow = useTransform(scrollYProgress, [0.28, 0.42, 0.94, 1], [0, 1, 1, 0.3]);

  return (
    <div className="cinematic-v2-root min-h-0 bg-[#030508] text-slate-100 overflow-x-clip">
      <div className="cinematic-v2-aurora fixed inset-0 pointer-events-none" aria-hidden />
      <motion.div
        style={{ y: blob1Y }}
        className="fixed top-[8%] -left-40 w-[min(520px,75vw)] h-[min(520px,75vw)] rounded-full bg-sky-500/[0.09] blur-[110px] pointer-events-none z-0"
        aria-hidden
      />
      <motion.div
        style={{ y: blob2Y }}
        className="fixed top-[42%] -right-32 w-[min(420px,60vw)] h-[min(420px,60vw)] rounded-full bg-violet-500/[0.06] blur-[100px] pointer-events-none z-0"
        aria-hidden
      />
      <motion.div
        style={{ opacity: coreGlow }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,80vw)] h-[min(600px,80vw)] rounded-full bg-cyan-400/[0.07] blur-[120px] pointer-events-none z-0"
        aria-hidden
      />
      <div className="cinematic-v2-grain fixed inset-0 pointer-events-none z-[1]" aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
