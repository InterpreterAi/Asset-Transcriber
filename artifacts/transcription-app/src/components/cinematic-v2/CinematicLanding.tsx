import { MarketingNav } from "@/components/marketing/MarketingNav";
import { CinematicEnvironment } from "./CinematicEnvironment";
import { CinematicStoryProvider, useCinematicStory } from "./CinematicStoryContext";
import { CinematicCanvas } from "./CinematicCanvas";
import { CINEMATIC_SCROLL_VH } from "./motion/useCinematicTimeline";

function CinematicScrollTrack() {
  const { scrollRef } = useCinematicStory();

  return (
    <div ref={scrollRef} id="cinematic-scroll-track" className="relative" style={{ height: `${CINEMATIC_SCROLL_VH}vh` }}>
      <CinematicCanvas />
      <div id="product" className="sr-only" aria-hidden />
      <div id="solutions" className="sr-only" aria-hidden />
      <div id="enterprise" className="sr-only" aria-hidden />
    </div>
  );
}

/** Cinematic Website v2 — one continuous scroll, workspace-centric. */
export function CinematicLanding() {
  return (
    <CinematicStoryProvider>
      <CinematicEnvironment>
        <MarketingNav premium />
        <CinematicScrollTrack />
      </CinematicEnvironment>
    </CinematicStoryProvider>
  );
}
