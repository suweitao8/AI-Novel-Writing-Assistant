import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "src/pages/novels/components/storySettings/assetForms.tsx"),
  "utf8",
);

test("角色、场景、道具共用放大的左状态列表右详情布局", () => {
  assert.match(source, /flex flex-col items-stretch gap-4 lg:flex-row lg:items-start/);
  assert.match(source, /self-start overflow-y-auto rounded-lg border border-border\/60 bg-muted\/20 p-2 lg:w-72 lg:shrink-0/);
  assert.match(source, /min-w-0 flex-1 space-y-3 rounded-lg/);
  assert.match(source, /stateImageAspect = kind === "scene" \? "aspect-\[2\/1\]" : "aspect-video"/);
  assert.match(source, /flex min-h-28 items-center justify-center/);
  assert.doesNotMatch(source, /aspect-\[3\/2\] max-h-\[28rem\] w-full/);
  assert.match(source, /fit="natural"/);
  assert.match(source, /className="w-full rounded-lg border-0"/);
  assert.match(source, /className="flex flex-wrap items-center gap-2" role="group" aria-label="状态图片操作"/);
  assert.doesNotMatch(source, /<div className="flex justify-end pt-2" role="group" aria-label="场景 3D 操作">/);
  assert.doesNotMatch(source, /<div className="space-y-3 rounded-lg border border-border\/70 p-3">/);
});

test("首个状态统一显示为默认，不保留旧的初始形象名称", () => {
  assert.match(source, /function getAssetStateLabel\(/);
  assert.match(source, /初始形象/);
  assert.match(source, /return "默认"/);
});

test("状态图地址携带生成时间，重新生成后不会命中旧缓存", () => {
  assert.match(source, /import \{ buildStateImageSrc \} from "@\/components\/storyAssets"/);
  assert.match(source, /generatedAt/);
  assert.match(source, /buildStateImageSrc\(state\.image\.url, state\.image\.generatedAt\)/);
  assert.match(source, /buildStateImageSrc\(selectedState\.image\.url, selectedState\.image\.generatedAt\)/);
});

test("状态详情图片使用独立的大图预览入口", () => {
  assert.match(source, /import .*LightboxImage.*from "@\/components\/common\/LightboxImage"/);
  assert.match(source, /<LightboxImage/);
  assert.match(source, /fit="natural"/);
});

test("状态详情按图片、状态资料、音色分区，不重复显示可见状态标签", () => {
  const imageSection = source.indexOf('aria-label="状态图片"');
  const assetSettingsSection = source.indexOf('aria-label="状态资料"');
  const voiceSection = source.indexOf('aria-label="状态音色"');
  assert.ok(imageSection >= 0);
  assert.ok(assetSettingsSection > imageSection);
  assert.ok(voiceSection > assetSettingsSection);
  assert.doesNotMatch(source, /statusLabel|voiceStatusLabel/);
  assert.doesNotMatch(source, /图片：\{statusLabel\}/);
  assert.doesNotMatch(source, /图：\{state\.image\?\.status/);
  assert.doesNotMatch(source, /音：\{state\.voice\?\.status/);
  assert.doesNotMatch(source, /暂无状态图/);
  assert.doesNotMatch(source, /高级提示词/);
  assert.match(source, /音色提示词/);
  assert.match(source, />取消</);
});

test("状态资料把状态名和时代风格并列，并让场景短字段按两列排列", () => {
  const assetSettingsLabel = source.indexOf('aria-label="状态资料"');
  const voiceSection = source.indexOf('aria-label="状态音色"');
  assert.ok(assetSettingsLabel >= 0);
  const assetSettingsStart = source.lastIndexOf("<section", assetSettingsLabel);
  const assetSettings = source.slice(assetSettingsStart, voiceSection >= 0 ? voiceSection : undefined);
  assert.match(assetSettings, /md:grid-cols-2/);
  assert.match(assetSettings, /状态名[\s\S]*时代风格/);
  assert.match(assetSettings, /grid grid-cols-2 gap-2 md:col-span-2/);
  assert.doesNotMatch(assetSettings, /grid grid-cols-3/);
});
