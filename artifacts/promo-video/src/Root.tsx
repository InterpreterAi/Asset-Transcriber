import {Composition} from "remotion";
import {PromoVertical} from "./PromoVertical";

export const Root = () => {
  return (
    <Composition
      id="PromoVertical"
      component={PromoVertical}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={{
        screenVideo: "screen_record.mov",
        voiceoverAudio: "voiceover.mp3",
        musicAudio: null,
      }}
    />
  );
};
