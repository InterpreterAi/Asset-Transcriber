import { motion } from "framer-motion";
import { useCinematicStory } from "./CinematicStoryContext";
import { useCinematicTimeline } from "./motion/useCinematicTimeline";
import { CinematicWorkspace } from "./workspace/CinematicWorkspace";
import { CinematicNetwork } from "./visuals/CinematicNetwork";
import { CinematicTranslationStreams } from "./visuals/CinematicTranslationStreams";
import { CinematicChapterOverlays } from "./visuals/CinematicChapterOverlays";

export function CinematicCanvas() {
  const { scrollYProgress } = useCinematicStory();
  const { timeline, workspaceScale, workspaceOpacity } = useCinematicTimeline(scrollYProgress);
  const collapse = timeline.finaleCollapse;

  return (
    <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        {timeline.visibility.network && <CinematicNetwork timeline={timeline} />}
        <CinematicTranslationStreams timeline={timeline} />

        {timeline.visibility.workspace && (
          <motion.div
            className="relative w-full max-w-6xl px-3 sm:px-6 flex items-center justify-center will-change-transform z-10"
            style={{
              scale: workspaceScale,
              opacity: workspaceOpacity,
              x: `${timeline.workspaceX}%`,
              y: timeline.workspaceY,
              filter: collapse > 0 ? `blur(${collapse * 12}px)` : "none",
            }}
          >
            <CinematicWorkspace />
          </motion.div>
        )}

        <CinematicChapterOverlays timeline={timeline} />
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
