import { createContext, useContext, useRef, type ReactNode } from "react";
import { useScroll } from "framer-motion";
import type { MotionValue } from "framer-motion";

type CinematicStoryContextValue = {
  scrollRef: React.RefObject<HTMLDivElement>;
  scrollYProgress: MotionValue<number>;
};

const CinematicStoryContext = createContext<CinematicStoryContextValue | null>(null);

export function CinematicStoryProvider({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ["start start", "end end"],
  });

  return (
    <CinematicStoryContext.Provider value={{ scrollRef, scrollYProgress }}>
      {children}
    </CinematicStoryContext.Provider>
  );
}

export function useCinematicStory() {
  const ctx = useContext(CinematicStoryContext);
  if (!ctx) throw new Error("useCinematicStory must be used within CinematicStoryProvider");
  return ctx;
}
