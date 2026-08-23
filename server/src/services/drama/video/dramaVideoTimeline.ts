export interface DramaTimelineSceneInput {
  id: string;
  kind: "title" | "shot" | "end";
  durationSec: number;
  imagePath?: string;
  title?: string;
  detail?: string;
}

export interface DramaTimelineSubtitleInput {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
}

export interface DramaVideoTimelineScene {
  id: string;
  kind: DramaTimelineSceneInput["kind"];
  startFrame: number;
  durationInFrames: number;
  image?: string;
  title?: string;
  detail?: string;
}

export interface DramaVideoTimelineSubtitle {
  startFrame: number;
  durationInFrames: number;
  text: string;
  speaker?: string;
}

export interface DramaVideoTimeline {
  durationInFrames: number;
  scenes: DramaVideoTimelineScene[];
  subtitles: DramaVideoTimelineSubtitle[];
}

export function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(Math.max(0, seconds) * fps));
}

export function buildDramaVideoTimeline(input: {
  fps: number;
  scenes: DramaTimelineSceneInput[];
  subtitles: DramaTimelineSubtitleInput[];
}): DramaVideoTimeline {
  let cursorFrame = 0;
  const scenes = input.scenes.map((scene) => {
    const durationInFrames = Math.max(1, secondsToFrames(scene.durationSec, input.fps));
    const result: DramaVideoTimelineScene = {
      id: scene.id,
      kind: scene.kind,
      startFrame: cursorFrame,
      durationInFrames,
      image: scene.imagePath,
      title: scene.title,
      detail: scene.detail,
    };
    cursorFrame += durationInFrames;
    return result;
  });

  const subtitles = input.subtitles
    .filter((subtitle) => subtitle.text.trim())
    .map((subtitle) => {
      const startFrame = secondsToFrames(subtitle.startSec, input.fps);
      const endFrame = Math.max(startFrame + 1, secondsToFrames(subtitle.endSec, input.fps));
      return {
        startFrame,
        durationInFrames: endFrame - startFrame,
        text: subtitle.text,
        speaker: subtitle.speaker,
      } satisfies DramaVideoTimelineSubtitle;
    });

  return { durationInFrames: Math.max(1, cursorFrame), scenes, subtitles };
}

