import { motion } from "framer-motion";
import { useCinematicStory } from "./CinematicStoryContext";
import { useCinematicTimeline } from "./motion/useCinematicTimeline";
import { CinematicWorkspace } from "./workspace/CinematicWorkspace";
import { CinematicNetwork } from "./visuals/CinematicNetwork";
import { CinematicStreamLayer } from "./visuals/CinematicStreamLayer";
import { CinematicChapterOverlays } from "./visuals/CinematicChapterOverlays";

/** Single sticky stage — workspace + network morph as one object. */
export function CinematicCanvas() {
  const { scrollYProgress } = useCinematicStory();
  const { timeline, workspaceScale, workspaceOpacity } = useCinematicTimeline(scrollYProgress);
  const collapse = timeline.finaleCollapse;

  return (
    <div className="sticky top-16 h-[calc(100vh-4rem)] w-full overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <CinematicNetwork timeline={timeline} />
        <CinematicStreamLayer timeline={timeline} />

        <motion.div
          className="relative w-full max-w-6xl px-3 sm:px-6 flex items-center justify-center will-change-transform z-10"
          style={{
            scale: workspaceScale,
            opacity: workspaceOpacity,
            x: `${timeline.workspaceX}%`,
            y: timeline.workspaceY + collapse * 80,
            filter:
              collapse > 0
                ? `blur(${collapse * 14}px) brightness(${1 - collapse * 0.35})`
                : "none",
          }}
        >
          <CinematicWorkspace />
        </motion.div>

        <CinematicChapterOverlays timeline={timeline} />
      </div>

      {collapse > 0.05 && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-[25]"
          style={{
            opacity: collapse,
            background: `radial-gradient(circle at 50% 46%, rgba(34,211,238,${0.12 + collapse * 0.35}) 0%, rgba(34,211,238,${collapse * 0.08}) 28%, transparent ${48 - collapse * 12}%)`,
          }}
          aria-hidden
        />
      )}

      {timeline.logoReveal > 0.02 && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-[28]"
          style={{
            opacity: timeline.logoReveal * 0.6,
            background: "radial-gradient(circle at 50% 42%, rgba(34,211,238,0.25) 0%, transparent 42%)",
          }}
          aria-hidden
        />
      )}
    </div>
  );
}
