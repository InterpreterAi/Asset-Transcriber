import { useEffect, useState } from "react";
import {
  getDialogueAutoplayProgress,
  isDialogueAutoplayFrozen,
} from "./workspace-autoplay-global";

/**
 * Global session autoplay — shared across landing, signup, and login previews.
 * Freeze/unfreeze is controlled by {@link useCinematicAutoplayScrollGate} on the landing page.
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

export function useWorkspaceAutoplayLive(): boolean {
  const [live, setLive] = useState(() => !isDialogueAutoplayFrozen());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setLive(!isDialogueAutoplayFrozen());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return live;
}
