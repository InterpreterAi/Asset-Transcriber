import { useTransform, motion } from "framer-motion";
import { useCinematicStory } from "./CinematicStoryContext";
import { useCinematicTimeline } from "./motion/useCinematicTimeline";
import { useCinematicAutoplayScrollGate } from "./motion/useCinematicAutoplayScrollGate";
import { copyPaneLeft, interpolateWorkspaceMotion } from "./motion/cinematic-workspace-motion";
import { CinematicWorkspace } from "./workspace/CinematicWorkspace";
import { CinematicNetwork } from "./visuals/CinematicNetwork";
import { CinematicTranslationStreams } from "./visuals/CinematicTranslationStreams";
import { CinematicPrivacyPaths } from "./visuals/CinematicPrivacyPaths";
import { CinematicChapterPanels, CinematicChapterSidePanels } from "./visuals/CinematicChapterPanels";

export function CinematicCanvas() {
  const { scrollYProgress } = useCinematicStory();
  useCinematicAutoplayScrollGate(true);
  const { timeline } = useCinematicTimeline(scrollYProgress);
  const collapse = timeline.finaleCollapse;
  const showFinale = timeline.chapterId === "finale" || timeline.logoReveal > 0.01;
  const showCopy = timeline.visibility.chapterCopy || timeline.visibility.testimonials;

  const wsLeft = useTransform(scrollYProgress, (p) => `${interpolateWorkspaceMotion(p).left}%`);
  const copyLeft = useTransform(scrollYProgress, (p) => `${copyPaneLeft(interpolateWorkspaceMotion(p).left)}%`);
  const wsOpacity = useTransform(scrollYProgress, (p) => interpolateWorkspaceMotion(p).opacity);

  const copyAlign =
    timeline.chapterId === "interpreterai" ? "justify-start" : "justify-center";

  return (
    <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0">
        {timeline.visibility.network && <CinematicNetwork timeline={timeline} />}
        {timeline.visibility.privacyPaths && <CinematicPrivacyPaths timeline={timeline} />}
        <CinematicTranslationStreams timeline={timeline} />
      </div>

      {showFinale ? (
        <div className="relative z-30 h-full flex items-center justify-center pointer-events-auto px-4">
          <CinematicChapterPanels timeline={timeline} />
        </div>
      ) : (
        <>
          {showCopy && (
            <motion.div
              className={`absolute top-0 h-full w-1/2 z-30 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden pointer-events-auto px-3 sm:px-5 py-4 sm:py-5 ${copyAlign}`}
              style={{ left: copyLeft }}
            >
              {timeline.visibility.chapterCopy && <CinematicChapterPanels timeline={timeline} />}
              <CinematicChapterSidePanels timeline={timeline} />
            </motion.div>
          )}

          <motion.div
            className="absolute top-0 h-full w-1/2 z-10 flex items-center justify-center px-2 sm:px-4"
            style={{
              left: wsLeft,
              opacity: wsOpacity,
              filter: collapse > 0 ? `blur(${collapse * 8}px)` : "none",
            }}
          >
            <div className="w-full max-w-2xl mx-auto">
              <CinematicWorkspace />
            </div>
          </motion.div>
        </>
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
