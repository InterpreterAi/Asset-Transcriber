import { useEffect, useState } from "react";
import { motion, useTransform } from "framer-motion";
import { useCinematicStory } from "../CinematicStoryContext";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import { CinematicWorkspace } from "../workspace/CinematicWorkspace";

/** Ch1 + Ch2: single workspace, no remount, scroll-driven dialogue. */
export function CinematicWorkspaceStage() {
  const { scrollYProgress } = useCinematicStory();
  const [dialogueProgress, setDialogueProgress] = useState(0);

  const scale = useTransform(scrollYProgress, [0, 0.14, 0.32], [0.78, 0.88, 1]);
  const ch1HeadlineOpacity = useTransform(scrollYProgress, [0.08, 0.12, 0.16], [0, 1, 0]);
  const ch2ProductOpacity = useTransform(scrollYProgress, [0.18, 0.24, 0.3], [0, 1, 0.8]);

  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      const d = Math.min(1, Math.max(0, v / 0.32));
      setDialogueProgress(d);
    });
    return unsub;
  }, [scrollYProgress]);

  return (
    <section
      className="relative"
      style={{ height: "240vh" }}
      id="product"
    >
      <div className="sticky top-16 h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 sm:px-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400/80 mb-6"
        >
          {CINEMATIC_CONTENT.eyebrow.infrastructure}
        </motion.p>

        <motion.div style={{ scale }} className="w-full flex justify-center">
          <CinematicWorkspace dialogueProgress={dialogueProgress} />
        </motion.div>

        <motion.p
          style={{ opacity: ch1HeadlineOpacity }}
          className="mt-10 text-xl sm:text-2xl font-semibold text-white text-center max-w-lg tracking-tight"
        >
          {CINEMATIC_CONTENT.chapterFrames.ch1}
        </motion.p>

        <motion.div style={{ opacity: ch2ProductOpacity }} className="mt-8 max-w-lg text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400/80 mb-2">
            {CINEMATIC_CONTENT.eyebrow.product}
          </p>
          <p className="text-lg font-semibold text-white">{CINEMATIC_CONTENT.product.title}</p>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.product.subtitle}</p>
        </motion.div>

        <p className="mt-6 text-xs text-slate-500">{CINEMATIC_CONTENT.hero.noCard}</p>
      </div>
    </section>
  );
}
