import { useEffect, useState } from "react";
import { getDialogueAutoplayProgress } from "./workspace-autoplay-global";

/**
 * Global session autoplay — never resets on scroll or chapter change.
 * Same clock on landing, signup, and login previews.
 */
export function useWorkspaceAutoplay() {
  const [progress, setProgress] = useState(() => getDialogueAutoplayProgress());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setProgress(getDialogueAutoplayProgress());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return progress;
}
