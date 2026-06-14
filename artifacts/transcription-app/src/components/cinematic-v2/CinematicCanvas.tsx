import { useTransform, motion } from "framer-motion";
import { useCinematicStory } from "./CinematicStoryContext";
import { useCinematicTimeline } from "./motion/useCinematicTimeline";
import { interpolateWorkspaceMotion } from "./motion/cinematic-workspace-motion";
import { CinematicWorkspace } from "./workspace/CinematicWorkspace";
import { CinematicNetwork } from "./visuals/CinematicNetwork";
import { CinematicTranslationStreams } from "./visuals/CinematicTranslationStreams";
import { CinematicPrivacyPaths } from "./visuals/CinematicPrivacyPaths";
import { CinematicChapterPanels, CinematicChapterSidePanels } from "./visuals/CinematicChapterPanels";
import type { ChapterLayoutMode } from "./motion/cinematic-layout";

const COPY_GRID: Record<ChapterLayoutMode, string> = {
  "stack-copy-top": "grid-rows-[minmax(0,38%)_1fr] grid-cols-1",
  "stack-copy-bottom": "grid-rows-[1fr_minmax(0,42%)] grid-cols-1",
  "split-copy-left": "grid-cols-1 lg:grid-cols-2 grid-rows-1",
  "split-copy-right": "grid-cols-1 lg:grid-cols-2 grid-rows-1",
  finale: "grid-cols-1 grid-rows-1",
};

function copyOrder(mode: ChapterLayoutMode): string {
  if (mode === "stack-copy-top") return "order-1";
  if (mode === "stack-copy-bottom") return "order-2";
  if (mode === "split-copy-left") return "order-1 lg:order-1";
  if (mode === "split-copy-right") return "order-2 lg:order-2";
  return "order-1";
}

export function CinematicCanvas() {
  const { scrollYProgress } = useCinematicStory();
  const { timeline } = useCinematicTimeline(scrollYProgress);
  const mode = timeline.layoutMode;
  const collapse = timeline.finaleCollapse;
  const showFinale = mode === "finale" || timeline.logoReveal > 0.01;
  const showCopy = timeline.visibility.chapterCopy || timeline.visibility.testimonials;

  const wsLeft = useTransform(scrollYProgress, (p) => `${interpolateWorkspaceMotion(p).x}%`);
  const wsTop = useTransform(scrollYProgress, (p) => `${interpolateWorkspaceMotion(p).y}%`);
  const wsWidth = useTransform(scrollYProgress, (p) => `${interpolateWorkspaceMotion(p).w}%`);
  const wsScale = useTransform(scrollYProgress, (p) => interpolateWorkspaceMotion(p).scale);
  const wsOpacity = useTransform(scrollYProgress, (p) => interpolateWorkspaceMotion(p).opacity);

  const copyAlign =
    timeline.chapterId === "interpreterai" ? "justify-start pt-1" : "justify-center";

  return (
    <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0">
        {timeline.visibility.network && <CinematicNetwork timeline={timeline} />}
        {timeline.visibility.privacyPaths && <CinematicPrivacyPaths timeline={timeline} />}
        <CinematicTranslationStreams timeline={timeline} />
      </div>

      <div className={`relative z-10 h-full w-full grid ${COPY_GRID[mode]} gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4`}>
        {showFinale && (
          <div className="col-span-full row-span-full flex items-center justify-center pointer-events-auto z-30">
            <CinematicChapterPanels timeline={timeline} />
          </div>
        )}

        {showCopy && !showFinale && (
          <div
            className={`relative z-10 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden pointer-events-auto ${copyAlign} ${copyOrder(mode)}`}
          >
            {timeline.visibility.chapterCopy && <CinematicChapterPanels timeline={timeline} />}
            <CinematicChapterSidePanels timeline={timeline} />
          </div>
        )}
      </div>

      {!showFinale && (
        <motion.div
          className="absolute z-20 pointer-events-none will-change-transform"
          style={{
            left: wsLeft,
            top: wsTop,
            width: wsWidth,
            x: "-50%",
            y: "-50%",
            scale: wsScale,
            opacity: wsOpacity,
            filter: collapse > 0 ? `blur(${collapse * 10}px)` : "none",
          }}
        >
          <CinematicWorkspace />
        </motion.div>
      )}

      {collapse > 0.05 && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-[25]"
          style={{
            opacity: collapse,
            background: `radial-gradient(circle at 50% 46%, rgba(34,211,238,${0.15 + collapse * 0.3}) 0%, transparent 45%)`,
          }}
          aria-hidden
        />
      )}
    </div>
  );
}
