import { useRef } from "react";
import { useEffect, useState } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { MarketingAnimatedWorkspace } from "./MarketingAnimatedWorkspace";
import type { MarketingDialogueLine } from "./marketing-dialogue-script";
import { marketingFade } from "./marketing-motion";

type Props = {
  title: string;
  subtitle: string;
  lines: MarketingDialogueLine[];
  scenario?: "medical" | "legal";
  eyebrow?: string;
  id?: string;
};

function ScrollLinkedWorkspace({
  lines,
  progress,
  scenario,
}: {
  lines: MarketingDialogueLine[];
  progress: MotionValue<number>;
  scenario: "medical" | "legal";
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const unsub = progress.on("change", (v) => setVal(v));
    return unsub;
  }, [progress]);

  return <MarketingAnimatedWorkspace lines={lines} progress={val} scenario={scenario} />;
}

/** Tall scroll section — workspace stays pinned while dialogue plays in real time. */
export function MarketingScrollDialogueSection({
  title,
  subtitle,
  lines,
  scenario = "medical",
  eyebrow,
  id,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const progress = useTransform(scrollYProgress, [0.08, 0.92], [0, lines.length]);
  const titleY = useTransform(scrollYProgress, [0, 0.3], [0, -40]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.3, 0.7, 0.3]);

  return (
    <section
      id={id}
      ref={ref}
      className="relative scroll-mt-24"
      style={{ height: `${Math.max(130, lines.length * 22 + 80)}vh` }}
    >
      <div className="sticky top-0 h-screen flex items-center overflow-hidden bg-[#060B14]">
        <motion.div
          style={{ opacity: glowOpacity }}
          className="absolute inset-0 marketing-aurora-bg pointer-events-none"
          aria-hidden
        />
        <motion.div
          style={{ opacity: glowOpacity }}
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-sky-500/10 blur-[100px] marketing-float-slow pointer-events-none"
          aria-hidden
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 w-full py-12 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <motion.div style={{ y: titleY }}>
            {eyebrow && (
              <motion.p {...marketingFade(0)} className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400/90 mb-4">
                {eyebrow}
              </motion.p>
            )}
            <motion.h2 {...marketingFade(0.05)} className="text-2xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
              {title}
            </motion.h2>
            <motion.p {...marketingFade(0.1)} className="mt-5 text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-lg">
              {subtitle}
            </motion.p>
          </motion.div>

          <motion.div {...marketingFade(0.12)} className="relative lg:pl-4">
            <ScrollLinkedWorkspace lines={lines} progress={progress} scenario={scenario} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
