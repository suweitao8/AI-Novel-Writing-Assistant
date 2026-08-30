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
const assetFormsSource = read("../src/pages/novels/components/storySettings/assetForms.tsx");
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
  // 环境状态就是场景资产状态：编辑器、归一化与生成契约全部同源。
  assert.match(sharedContract, /export type StudioEnvironmentAssetState = StoryAssetState;/);
  assert.match(sharedContract, /resolveActiveStudioEnvironmentState/);
});

test("环境编辑完全复用场景资产的 AssetStatesEditor 并注入设置域后端", () => {
  assert.match(assetFormsSource, /export interface AssetStatesEditorOps/);
  assert.match(assetFormsSource, /ops\?: AssetStatesEditorOps/);
  // 注入后端在生成/终止/失败关闭/微调四个动作上分支，小说路径保持原样。
  assert.match(assetFormsSource, /if \(ops\) \{\s*return ops\.generateImage\(stateId\);/);
  assert.match(assetFormsSource, /if \(ops\) \{\s*return ops\.cancelImage\(stateId\);/);
  assert.match(assetFormsSource, /ops\?\.renderExtraImageAction\?\.\(selectedState\)/);
  assert.match(settingsPageSource, /AssetStatesEditor/);
  assert.match(settingsPageSource, /normalizeStatesForSave/);
  assert.match(settingsPageSource, /generateStudioEnvironmentStateImage/);
  assert.match(settingsPageSource, /cancelStudioEnvironmentStateImage/);
  assert.match(settingsPageSource, /dismissStudioEnvironmentStateImageError/);
  assert.match(settingsPageSource, /setActiveStudioEnvironmentState/);
  assert.match(settingsPageSource, /tweakStudioEnvironmentStateImagePrompt/);
  assert.match(settingsPageSource, /renderExtraImageAction/);
  assert.match(settingsPageSource, /设为当前全景/);
  assert.match(settingsPageSource, /编辑环境/);
  // 环境列表与场景资产同一套卡片：点卡片进编辑，编辑器内提供同款 3D编辑 按钮。
  assert.match(settingsPageSource, /StoryAssetCard/);
  assert.match(settingsPageSource, /3D编辑/);
  // 环境描述是弹窗级字段，与场景资产的基础字段同级。
  assert.match(settingsPageSource, /环境描述/);
  // 生成期间轮询设置接口，页面外也能跟进结果。
  assert.match(settingsPageSource, /refetchInterval/);
  assert.match(settingsPageSource, /3000/);
});

test("环境接口覆盖资料保存、活跃状态与提示词微调", () => {
  assert.match(apiSettingsSource, /\/settings\/environment-assets/);
  assert.match(apiSettingsSource, /tweak-prompt/);
  assert.match(apiSettingsSource, /eraStyle/);
  // 失败提示清除与小说资产同契约：body 用 error/attemptId 做乐观校验。
  assert.match(apiSettingsSource, /dismiss-image-error/);
  assert.match(apiSettingsSource, /\{ error, \.\.\.\(attemptId \? \{ attemptId \} : \{\}\) \}/);
});

test("HDRI 3D 预览页经解析器取环境源", () => {
  assert.match(previewPageSource, /getStudioEnvironmentSourceUrl/);
  assert.match(previewPageSource, /generatedSource \?\? getStudioEnvironmentPreset\(presetId\)\.sourceUrl/);
});
