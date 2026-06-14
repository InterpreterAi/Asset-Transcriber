import { useEffect, useLayoutEffect, useRef } from "react";
import { useCinematicStory } from "../CinematicStoryContext";
import {
  freezeDialogueAutoplayAtCurrent,
  resetDialogueAutoplayLive,
  unfreezeDialogueAutoplay,
} from "./workspace-autoplay-global";

const PAGE_LIVE_EDGE_PX = 96;
const SCROLL_UP_EPS_PX = 48;

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
 * Landing page: demo runs on load and while scrolling down.
 * Freezes only when the user scrolls **back up** to re-read earlier chapters.
 * Unfreezes at the page bottom or when they scroll down again.
 */
export function useCinematicAutoplayScrollGate(enabled = true): void {
  const { scrollRef } = useCinematicStory();
  const furthestScrollTopRef = useRef(0);
  const isFrozenRef = useRef(false);

  useLayoutEffect(() => {
    if (!enabled) return;

    const track = scrollRef.current;
    const scroller = scrollContainerForTrack(track);
    if (!scroller) return;

    furthestScrollTopRef.current = scroller.scrollTop;
    resetDialogueAutoplayLive();
    isFrozenRef.current = false;

    const update = () => {
      const top = scroller.scrollTop;
      if (top > furthestScrollTopRef.current) {
        furthestScrollTopRef.current = top;
      }

      const atBottom = isScrollerAtLiveEdge(scroller);
      const scrolledUpFromFurthest = top < furthestScrollTopRef.current - SCROLL_UP_EPS_PX;
      const shouldFreeze = scrolledUpFromFurthest && !atBottom;

      if (shouldFreeze && !isFrozenRef.current) {
        freezeDialogueAutoplayAtCurrent();
        isFrozenRef.current = true;
      } else if (!shouldFreeze && isFrozenRef.current) {
        unfreezeDialogueAutoplay();
        isFrozenRef.current = false;
      }
    };

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
      if (isFrozenRef.current) {
        unfreezeDialogueAutoplay();
        isFrozenRef.current = false;
      }
    };
  }, [enabled, scrollRef]);

  useEffect(() => {
    if (!enabled) {
      unfreezeDialogueAutoplay();
    }
  }, [enabled]);
}
