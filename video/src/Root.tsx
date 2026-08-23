import type { FC } from "react";
import { Composition } from "remotion";
import { DramaEpisodeVideo } from "./DramaEpisodeVideo";
import type { DramaEpisodeVideoProps } from "./types";

const defaultProps: DramaEpisodeVideoProps = {
  durationInFrames: 24 * 10,
  width: 1280,
  height: 720,
  fps: 24,
  backgroundColor: "#101418",
  scenes: [],
  subtitles: [],
  showSubtitles: true,
};

export const RemotionRoot: FC = () => (
  <Composition
    id="DramaEpisodeVideo"
    component={DramaEpisodeVideo as unknown as FC<Record<string, unknown>>}
    defaultProps={defaultProps}
    fps={defaultProps.fps}
    durationInFrames={defaultProps.durationInFrames}
    width={defaultProps.width}
    height={defaultProps.height}
    calculateMetadata={({ props }) => {
      const next = props as unknown as DramaEpisodeVideoProps;
      return {
        durationInFrames: Math.max(1, Math.round(next.durationInFrames ?? defaultProps.durationInFrames)),
        fps: next.fps ?? defaultProps.fps,
        width: next.width ?? defaultProps.width,
        height: next.height ?? defaultProps.height,
        props: { ...defaultProps, ...next },
      };
    }}
  />
);
