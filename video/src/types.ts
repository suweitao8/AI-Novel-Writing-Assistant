export type DramaVideoSceneKind = "title" | "shot" | "end";

export interface DramaVideoScene {
  id: string;
  kind: DramaVideoSceneKind;
  startFrame: number;
  durationInFrames: number;
  image?: string;
  title?: string;
  detail?: string;
}

export interface DramaVideoSubtitle {
  startFrame: number;
  durationInFrames: number;
  text: string;
  speaker?: string;
}

export interface DramaEpisodeVideoProps {
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  scenes: DramaVideoScene[];
  subtitles: DramaVideoSubtitle[];
  showSubtitles: boolean;
}
