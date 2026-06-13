import { MarketingNav } from "@/components/marketing/MarketingNav";
import { CinematicEnvironment } from "./CinematicEnvironment";
import { CinematicStoryProvider, useCinematicStory } from "./CinematicStoryContext";
import { CinematicWorkspaceStage } from "./chapters/CinematicWorkspaceStage";
import { Chapter03InterpreterAI } from "./chapters/Chapter03InterpreterAI";
import { Chapter04Languages } from "./chapters/Chapter04Languages";
import { Chapter05UseCases } from "./chapters/Chapter05UseCases";
import { Chapter06Trust } from "./chapters/Chapter06Trust";
import { Chapter07Scale } from "./chapters/Chapter07Scale";
import { Chapter08Pricing } from "./chapters/Chapter08Pricing";
import { Chapter09Finale } from "./chapters/Chapter09Finale";

function CinematicScrollBody() {
  const { scrollRef } = useCinematicStory();

  return (
    <div ref={scrollRef}>
      <CinematicWorkspaceStage />
      <Chapter03InterpreterAI />
      <Chapter04Languages />
      <Chapter05UseCases />
      <Chapter06Trust />
      <Chapter07Scale />
      <Chapter08Pricing />
      <Chapter09Finale />
    </div>
  );
}

/** Cinematic Website v2 — single-scroll product story. */
export function CinematicLanding() {
  return (
    <CinematicStoryProvider>
      <CinematicEnvironment>
        <MarketingNav premium />
        <CinematicScrollBody />
      </CinematicEnvironment>
    </CinematicStoryProvider>
  );
}
