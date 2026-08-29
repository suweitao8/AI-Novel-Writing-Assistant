import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVisionStoryScene3dEnvironment,
  shouldAutoAnalyzeStoryScene3dEnvironment,
} from "../dist/modules/novel/story-settings/application/StoryScene3dEnvironment.js";
import {
  buildStoryScene3dImageFingerprint,
  isStoryScene3dEnvironmentAnalysisCurrent,
} from "../dist/modules/novel/story-settings/application/StoryScene3dEnvironmentAnalysisService.js";
import { sceneState3dEnvironmentPrompt } from "../dist/prompting/prompts/drama/sceneState3dEnvironment.prompts.js";

test("视觉估算会保存半球直径、投射中心和图片指纹", () => {
  const result = normalizeVisionStoryScene3dEnvironment({
    domeDiameterMeters: 18.4,
    projectionCenterHeightMeters: 2.2,
    panoramaHorizonV: 0.51,
    confidence: 0.9,
    evidence: "地面延展到画面下半区，门高提供尺度参照。",
    sourceImageArtifactId: "artifact-1",
    sourceImageGeneratedAt: "2026-08-30T00:00:00.000Z",
    sourceImageUrl: "/uploads/scene-1.png",
  });

  assert.equal(result.environment.domeRadius, 18.4);
  assert.equal(result.environment.projectionCenterHeight, 2.2);
  assert.equal(result.environment.panoramaHorizonV, 0.51);
  assert.equal(result.analysis.source, "vision");
  assert.equal(result.analysis.confidence, 0.9);
  assert.equal(result.analysis.sourceImageArtifactId, "artifact-1");
  assert.equal(result.analysis.sourceImageGeneratedAt, "2026-08-30T00:00:00.000Z");
  assert.equal(result.analysis.sourceImageUrl, "/uploads/scene-1.png");
  assert.equal(result.analysis.fallbackUsed, false);
});

test("视觉估算缺少可信尺度时回落到 15 米直径和 2 米中心", () => {
  const result = normalizeVisionStoryScene3dEnvironment({
    confidence: 0.2,
    sourceImageArtifactId: "artifact-low-confidence",
  });

  assert.equal(result.environment.domeRadius, 15);
  assert.equal(result.environment.projectionCenterHeight, 2);
  assert.equal(result.environment.projectionCenterHeightRatio, 2 / 15);
  assert.equal(result.environment.panoramaHorizonV, 0.5);
  assert.equal(result.analysis.source, "fallback");
  assert.equal(result.analysis.fallbackUsed, true);
  assert.equal(result.analysis.sourceImageArtifactId, "artifact-low-confidence");
});

test("视觉估算会把越界数值裁剪到 3D 环境合同范围", () => {
  const result = normalizeVisionStoryScene3dEnvironment({
    domeDiameterMeters: 42,
    projectionCenterHeightMeters: 9,
    panoramaHorizonV: 0.9,
    confidence: 0.8,
  });

  assert.equal(result.environment.domeRadius, 30);
  assert.equal(result.environment.projectionCenterHeight, 6);
  assert.equal(result.environment.projectionCenterHeightRatio, 0.2);
  assert.equal(result.environment.panoramaHorizonV, 0.55);
  assert.equal(result.analysis.source, "vision");
});

test("视觉模型没有返回地平线时保留 50% 默认分界线", () => {
  const result = normalizeVisionStoryScene3dEnvironment({
    domeDiameterMeters: 15,
    projectionCenterHeightMeters: 2,
    panoramaHorizonV: null,
    confidence: 0.8,
  });

  assert.equal(result.environment.panoramaHorizonV, 0.5);
});

test("环境视觉分析提示词要求识别 2:1 全景图的地平线和尺度证据", () => {
  const messages = sceneState3dEnvironmentPrompt.render({
    sceneName: "荒原",
    stateLabel: "默认",
    imageBase64: "aGVsbG8=",
    mimeType: "image/jpeg",
  }, { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });
  const systemText = String(messages[0]?.content ?? "");
  const humanContent = messages[1]?.content;
  assert.match(systemText, /2:1/);
  assert.match(systemText, /50%|0\.5/);
  assert.match(systemText, /尺度/);
  assert.ok(Array.isArray(humanContent));
  assert.equal(humanContent.some((part) => part?.type === "image_url"), true);
});

test("图片指纹只在当前分析对应同一张状态图时命中", () => {
  const image = {
    artifactId: "artifact-1",
    generatedAt: "2026-08-30T00:00:00.000Z",
    url: "/uploads/scene-1.png",
  };
  const analysis = normalizeVisionStoryScene3dEnvironment({
    domeDiameterMeters: 15,
    projectionCenterHeightMeters: 2,
    confidence: 0.8,
    sourceImageArtifactId: image.artifactId,
    sourceImageGeneratedAt: image.generatedAt,
    sourceImageUrl: image.url,
  }).analysis;

  assert.equal(buildStoryScene3dImageFingerprint(image), "artifact-1|2026-08-30T00:00:00.000Z|/uploads/scene-1.png");
  assert.equal(isStoryScene3dEnvironmentAnalysisCurrent(analysis, image), true);
  assert.equal(isStoryScene3dEnvironmentAnalysisCurrent(analysis, { ...image, generatedAt: "changed" }), false);
});

test("自动分析闸门只允许未定制且图片未命中的场景", () => {
  const image = { artifactId: "artifact-1", generatedAt: "2026-08-30T00:00:00.000Z", url: "/scene.png" };
  const currentAnalysis = normalizeVisionStoryScene3dEnvironment({
    domeDiameterMeters: 15,
    projectionCenterHeightMeters: 2,
    confidence: 0.8,
    sourceImageArtifactId: image.artifactId,
    sourceImageGeneratedAt: image.generatedAt,
    sourceImageUrl: image.url,
  }).analysis;
  assert.equal(shouldAutoAnalyzeStoryScene3dEnvironment({ analysis: currentAnalysis, customized: false }, image), false);
  assert.equal(shouldAutoAnalyzeStoryScene3dEnvironment({ analysis: currentAnalysis, customized: true }, { ...image, generatedAt: "new" }), false);
  assert.equal(shouldAutoAnalyzeStoryScene3dEnvironment({ analysis: currentAnalysis, customized: false }, { ...image, generatedAt: "new" }), true);
});
