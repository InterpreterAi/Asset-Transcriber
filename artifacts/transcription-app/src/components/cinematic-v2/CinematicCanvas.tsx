import { motion } from "framer-motion";
import { useCinematicStory } from "./CinematicStoryContext";
import { useCinematicTimeline } from "./motion/useCinematicTimeline";
import { WORKSPACE_MAX_W, type ChapterLayoutMode } from "./motion/cinematic-layout";
import { CinematicWorkspace } from "./workspace/CinematicWorkspace";
import { CinematicNetwork } from "./visuals/CinematicNetwork";
import { CinematicTranslationStreams } from "./visuals/CinematicTranslationStreams";
import { CinematicPrivacyPaths } from "./visuals/CinematicPrivacyPaths";
import { CinematicChapterPanels, CinematicChapterSidePanels } from "./visuals/CinematicChapterPanels";

const GRID: Record<ChapterLayoutMode, string> = {
  "stack-copy-top": "grid-rows-[minmax(0,38%)_minmax(0,62%)] grid-cols-1",
  "stack-copy-bottom": "grid-rows-[minmax(0,58%)_minmax(0,42%)] grid-cols-1",
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

function workspaceOrder(mode: ChapterLayoutMode): string {
  if (mode === "stack-copy-top") return "order-2";
  if (mode === "stack-copy-bottom") return "order-1";
  if (mode === "split-copy-left") return "order-2 lg:order-2";
  if (mode === "split-copy-right") return "order-1 lg:order-1";
  return "order-2";
}

export function CinematicCanvas() {
  const { scrollYProgress } = useCinematicStory();
  const { timeline, workspaceScale, workspaceOpacity } = useCinematicTimeline(scrollYProgress);
  const mode = timeline.layoutMode;
  const collapse = timeline.finaleCollapse;
  const maxW = WORKSPACE_MAX_W[timeline.workspaceMaxWidth];
  const showFinale = mode === "finale" || timeline.logoReveal > 0.01;
  const showCopy = timeline.visibility.chapterCopy || timeline.visibility.testimonials;
  const showWorkspace = timeline.visibility.workspace && !showFinale;

  const copyAlign =
    timeline.chapterId === "interpreterai"
      ? "justify-start pt-1"
      : "justify-center";

  return (
    <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0">
        {timeline.visibility.network && <CinematicNetwork timeline={timeline} />}
        {timeline.visibility.privacyPaths && <CinematicPrivacyPaths timeline={timeline} />}
        <CinematicTranslationStreams timeline={timeline} />
      </div>

      <div className={`relative z-10 h-full w-full grid ${GRID[mode]} gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4`}>
        {showFinale && (
          <div className="col-span-full row-span-full flex items-center justify-center pointer-events-auto">
            <CinematicChapterPanels timeline={timeline} />
          </div>
        )}

        {showCopy && !showFinale && (
          <div
            className={`flex flex-col min-h-0 overflow-y-auto overflow-x-hidden pointer-events-auto ${copyAlign} ${copyOrder(mode)}`}
          >
            {timeline.visibility.chapterCopy && <CinematicChapterPanels timeline={timeline} />}
            <CinematicChapterSidePanels timeline={timeline} />
          </div>
        )}

        {showWorkspace && (
          <motion.div
            className={`flex items-center justify-center min-h-0 ${workspaceOrder(mode)}`}
            style={{
              scale: workspaceScale,
              opacity: workspaceOpacity,
              filter: collapse > 0 ? `blur(${collapse * 12}px)` : "none",
            }}
          >
            <div className={`w-full ${maxW} mx-auto`}>
              <CinematicWorkspace />
            </div>
          </motion.div>
        )}
      </div>

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
