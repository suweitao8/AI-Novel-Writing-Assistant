import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { DramaEpisodeVideoProps, DramaVideoScene, DramaVideoSubtitle } from "./types";

export const DramaEpisodeVideo: React.FC<DramaEpisodeVideoProps> = (props) => (
  <AbsoluteFill style={{ backgroundColor: props.backgroundColor }}>
    {props.scenes.map((scene) => (
      <Sequence
        key={scene.id}
        from={scene.startFrame}
        durationInFrames={scene.durationInFrames}
        name={scene.id}
      >
        <SceneLayer scene={scene} />
      </Sequence>
    ))}
    {props.showSubtitles ? <SubtitleLayer subtitles={props.subtitles} /> : null}
  </AbsoluteFill>
);

function SceneLayer({ scene }: { scene: DramaVideoScene }) {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      {scene.image ? (
        <Img
          src={staticFile(scene.image)}
          style={{ width, height, objectFit: "cover", position: "absolute" }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: width * 0.08,
          background: scene.image
            ? "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.62))"
            : "linear-gradient(135deg, #101418, #28313a)",
        }}
      >
        {!scene.image ? (
          <div style={{ color: "#f4f4f5", textAlign: "center", fontFamily: "Arial, sans-serif" }}>
            <div style={{ fontSize: Math.max(30, Math.round(width * 0.035)), fontWeight: 700 }}>
              {scene.title ?? (scene.kind === "end" ? "敬请期待" : "暂无画面")}
            </div>
            {scene.detail ? (
              <div style={{ marginTop: 18, fontSize: Math.max(18, Math.round(width * 0.018)), opacity: 0.76 }}>
                {scene.detail}
              </div>
            ) : null}
          </div>
        ) : null}
        {scene.kind === "title" && scene.image ? (
          <div style={{ color: "#fff", fontSize: Math.max(28, Math.round(width * 0.03)), fontWeight: 700 }}>
            {scene.title}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function SubtitleLayer({ subtitles }: { subtitles: DramaVideoSubtitle[] }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const active = subtitles.find((subtitle) =>
    frame >= subtitle.startFrame && frame < subtitle.startFrame + subtitle.durationInFrames,
  );
  if (!active) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", justifyContent: "flex-end", alignItems: "center", padding: `0 ${width * 0.08}px ${height * 0.1}px` }}>
      <div
        style={{
          maxWidth: width * 0.82,
          padding: "12px 24px",
          borderRadius: 14,
          backgroundColor: "rgba(0, 0, 0, 0.68)",
          color: "#fff",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
          fontSize: Math.max(24, Math.round(width * 0.025)),
          lineHeight: 1.45,
          textShadow: "0 2px 8px rgba(0,0,0,0.85)",
        }}
      >
        {active.speaker ? <span style={{ color: "#ffd580", marginRight: 10 }}>{active.speaker}：</span> : null}
        {active.text}
      </div>
    </AbsoluteFill>
  );
}
