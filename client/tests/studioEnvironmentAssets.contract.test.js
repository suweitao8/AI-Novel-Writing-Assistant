import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const runtimeSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts");
const sourceResolver = read("../src/pages/models/modelLibrary3d/studioEnvironmentAssetSource.ts");
const presetsSource = read("../src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts");
const settingsPageSource = read("../src/pages/settings/views/NarratorVoiceSettingsPage.tsx");
const previewPageSource = read("../src/pages/settings/views/StudioEnvironmentPreviewPage.tsx");
const sharedContract = read("../../shared/types/studioEnvironmentAssets.ts");
const apiSettingsSource = read("../src/api/settings.ts");

test("运行时优先使用生成的环境状态全景图，静态 HDR 只作兜底", () => {
  assert.match(runtimeSource, /getStudioEnvironmentSourceUrl/);
  const urlsIndex = runtimeSource.indexOf("const urls = uniqueUrls");
  const overrideIndex = runtimeSource.indexOf("generatedSourceUrl");
  assert.ok(overrideIndex >= 0 && overrideIndex < urlsIndex, "状态图解析必须发生在资源链组装之前");
  assert.match(runtimeSource, /generatedSourceUrl \? \[generatedSourceUrl\] : \[\]/);
  assert.match(runtimeSource, /preset\.sourceUrl/);
});

test("环境源解析器带短缓存且失败回落静态预设", () => {
  assert.match(sourceResolver, /SOURCE_CACHE_TTL_MS/);
  assert.match(sourceResolver, /resolveActiveStudioEnvironmentState/);
  assert.match(sourceResolver, /buildStateImageSrc/);
  assert.match(sourceResolver, /return null;/);
});

test("预设 id 与显示名来自 shared 环境资产契约", () => {
  assert.match(presetsSource, /STUDIO_ENVIRONMENT_IDS/);
  assert.match(presetsSource, /STUDIO_ENVIRONMENT_LABELS/);
  assert.match(sharedContract, /export const STUDIO_ENVIRONMENT_IDS = \["interior", "exterior", "nature"\]/);
  assert.match(sharedContract, /export interface StudioEnvironmentAssetState/);
  assert.match(sharedContract, /resolveActiveStudioEnvironmentState/);
});

test("通用资产页提供状态编辑、生成、终止、失败关闭与设为当前全景", () => {
  assert.match(settingsPageSource, /getStudioEnvironmentAssets/);
  assert.match(settingsPageSource, /saveStudioEnvironmentAsset/);
  assert.match(settingsPageSource, /generateStudioEnvironmentStateImage/);
  assert.match(settingsPageSource, /cancelStudioEnvironmentStateImage/);
  assert.match(settingsPageSource, /dismissStudioEnvironmentStateImageError/);
  assert.match(settingsPageSource, /setActiveStudioEnvironmentState/);
  assert.match(settingsPageSource, /编辑环境/);
  assert.match(settingsPageSource, /设为当前全景/);
  assert.match(settingsPageSource, /环境状态/);
  assert.match(settingsPageSource, /图片提示词/);
  assert.match(settingsPageSource, /参考状态/);
  // 生成期间轮询设置接口，页面外也能跟进结果。
  assert.match(settingsPageSource, /refetchInterval/);
  assert.match(settingsPageSource, /3000/);
});

test("状态图生成请求走设置路由，图片按状态存储", () => {
  assert.match(apiSettingsSource, /\/settings\/environment-assets/);
  assert.match(apiSettingsSource, /states\/\$\{stateId\}\/generate-image/);
});

test("HDRI 3D 预览页经解析器取环境源", () => {
  assert.match(previewPageSource, /getStudioEnvironmentSourceUrl/);
  assert.match(previewPageSource, /generatedSource \?\? getStudioEnvironmentPreset\(presetId\)\.sourceUrl/);
});
