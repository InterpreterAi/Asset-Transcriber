import { useEffect, useRef, useState } from "react";
import { CINEMATIC_MARIA_DIALOGUE } from "../data/cinematic-dialogue";

const TURN_COUNT = CINEMATIC_MARIA_DIALOGUE.length;
/** ~3.8s per turn — product-accurate speak → pause → translate pacing */
const MS_PER_TURN = 3800;
const PAUSE_AT_END_MS = 2200;

/**
 * Auto-plays the Maria demo on a loop. Scroll advances chapters only —
 * conversation timing is independent of scroll position.
 */
export function useWorkspaceAutoplay() {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const cycleMs = TURN_COUNT * MS_PER_TURN + PAUSE_AT_END_MS;
    let raf = 0;

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = (now - startRef.current) % cycleMs;
      if (elapsed < TURN_COUNT * MS_PER_TURN) {
        setProgress(elapsed / MS_PER_TURN);
      } else {
        setProgress(0);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return progress;
}
