import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as pc from "playcanvas";

import {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  MODEL_PREVIEW_LIGHTING_PROFILE,
  resolveBlocking3dLightingProfile,
} from "../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.ts";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("模型预览 profile 提供环境补光与软阴影配置", () => {
  const profile = resolveBlocking3dLightingProfile(MODEL_PREVIEW_LIGHTING_PROFILE);

  assert.deepEqual(profile.ambientLight, [0.18, 0.18, 0.18]);
  assert.equal(profile.shadowType, pc.SHADOW_PCF5_32F);
  assert.equal(profile.shadowResolution, 2048);
  assert.equal(profile.shadowDistance, 16);
  assert.equal(profile.shadowIntensity, 0.62);
  assert.equal(profile.shadowBias, 0.025);
  assert.equal(profile.normalOffsetBias, 0.02);
});

test("默认 profile 保留动画、分镜和场景的既有光照基线", () => {
  const profile = resolveBlocking3dLightingProfile(DEFAULT_BLOCKING_3D_LIGHTING_PROFILE);

  assert.deepEqual(profile.ambientLight, [0, 0, 0]);
  assert.equal(profile.shadowType, pc.SHADOW_PCF3_32F);
  assert.equal(profile.shadowResolution, 2048);
  assert.equal(profile.shadowDistance, 25);
  assert.equal(profile.shadowIntensity, 1);
  assert.equal(profile.shadowBias, 0.05);
  assert.equal(profile.normalOffsetBias, 0.05);
});

test("模型详情与模型缩略图显式使用模型 profile，其他预览不传入该 profile", () => {
  const modelViewerSource = read("../src/pages/models/modelLibrary3d/modelViewerApp.ts");
  const modelThumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
  const animationSource = read("../src/pages/animations/animationPreviewApp.ts");
  const blockingSource = read("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts");

  assert.match(modelViewerSource, /lightingProfile:\s*["']model-preview["']/);
  assert.match(modelThumbnailSource, /lightingProfile:\s*["']model-preview["']/);
  assert.match(modelThumbnailSource, /model-library:thumbnails:v24/);
  assert.doesNotMatch(animationSource, /lightingProfile:\s*["']model-preview["']/);
  assert.doesNotMatch(blockingSource, /lightingProfile:\s*["']model-preview["']/);
});
