import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useMotionValue, type MotionValue } from "framer-motion";

type CinematicStoryContextValue = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  scrollYProgress: MotionValue<number>;
};

const CinematicStoryContext = createContext<CinematicStoryContextValue | null>(null);

/** Prefer the outermost scroll container that actually has scrollable overflow. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  let best: HTMLElement | null = null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      if (node.scrollHeight > node.clientHeight + 2) {
        best = node;
      }
    }
    node = node.parentElement;
  }
  if (best) return best;

  const app = document.getElementById("app-scroll");
  if (app) return app;

  return document.documentElement;
}

export function CinematicStoryProvider({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollYProgress = useMotionValue(0);

  useLayoutEffect(() => {
    const target = scrollRef.current;
    if (!target) return;

    const container = findScrollParent(target);
    if (!container) return;

    const update = () => {
      const max = target.offsetHeight - container.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, container.scrollTop / max)) : 0;
      scrollYProgress.set(p);
    };

    update();
    container.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const ro = new ResizeObserver(update);
    ro.observe(target);
    ro.observe(container);

    return () => {
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [scrollYProgress]);

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

/** Scroll the app shell to a 0..1 progress point (for previews/tests). */
export function scrollCinematicToProgress(progress: number) {
  const track = document.getElementById("cinematic-scroll-track");
  const container = track ? findScrollParent(track) : null;
  const scroller = container ?? document.documentElement;
  const max = scroller.scrollHeight - (container?.clientHeight ?? window.innerHeight);
  scroller.scrollTop = Math.max(0, max * progress);
}
