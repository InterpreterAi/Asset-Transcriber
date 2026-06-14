import { useEffect, useLayoutEffect, useState } from "react";
import { useCinematicStory } from "../CinematicStoryContext";
import {
  freezeDialogueAutoplayAtCurrent,
  unfreezeDialogueAutoplay,
} from "./workspace-autoplay-global";

const PAGE_LIVE_EDGE_PX = 96;

function scrollContainerForTrack(track: HTMLElement | null): HTMLElement | null {
  let node = track?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      if (node.scrollHeight > node.clientHeight + 2) return node;
    }
    node = node.parentElement;
  }
  return document.getElementById("app-scroll");
}

function isScrollerAtLiveEdge(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= PAGE_LIVE_EDGE_PX;
}

/**
 * Landing page only: freeze workspace demo when the user scrolls up (reading history).
 * At the bottom of the page, resume live autoplay like the real session workspace.
 */
export function useCinematicPageLiveEdge(): boolean {
  const { scrollRef } = useCinematicStory();
  const [atLiveEdge, setAtLiveEdge] = useState(true);

  useLayoutEffect(() => {
    const track = scrollRef.current;
    const scroller = scrollContainerForTrack(track);
    if (!scroller) return;

    const update = () => setAtLiveEdge(isScrollerAtLiveEdge(scroller));
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    if (track) ro.observe(track);

    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [scrollRef]);

  return atLiveEdge;
}

export function useCinematicAutoplayScrollGate(enabled = true): void {
  const atLiveEdge = useCinematicPageLiveEdge();

  useEffect(() => {
    if (!enabled) {
      unfreezeDialogueAutoplay();
      return;
    }
    if (atLiveEdge) {
      unfreezeDialogueAutoplay();
    } else {
      freezeDialogueAutoplayAtCurrent();
    }
  }, [enabled, atLiveEdge]);

  useEffect(() => {
    if (!enabled) return;
    return () => unfreezeDialogueAutoplay();
  }, [enabled]);
}
