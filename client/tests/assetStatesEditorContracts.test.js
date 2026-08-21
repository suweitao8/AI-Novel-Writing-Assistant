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
  assert.match(source, /grid items-start gap-4 lg:grid-cols/);
  assert.match(source, /self-start min-w-0 max-h-\[32rem\] overflow-y-auto/);
  assert.match(source, /self-start min-w-0 rounded-lg/);
  assert.match(source, /aspect-\[3\/2\] max-h-\[28rem\] w-full/);
  assert.match(source, /flex min-h-28 items-center justify-center/);
  assert.doesNotMatch(source, /className="aspect-video w-full object-cover"/);
});

test("状态图地址携带生成时间，重新生成后不会命中旧缓存", () => {
  assert.match(source, /function buildStateImageSrc\(/);
  assert.match(source, /generatedAt/);
  assert.match(source, /buildStateImageSrc\(state\.image\.url, state\.image\.generatedAt\)/);
  assert.match(source, /buildStateImageSrc\(selectedState\.image\.url, selectedState\.image\.generatedAt\)/);
});

test("状态详情图片使用独立的大图预览入口", () => {
  assert.match(source, /import .*LightboxImage.*from "@\/components\/common\/LightboxImage"/);
  assert.match(source, /<LightboxImage/);
  assert.match(source, /fit="contain"/);
});

test("状态详情按图片、图片设定、音色分区，不重复显示可见状态标签", () => {
  const imageSection = source.indexOf('aria-label="状态图片"');
  const imageSettingsSection = source.indexOf('aria-label="图片设定"');
  const voiceSection = source.indexOf('aria-label="状态音色"');
  assert.ok(imageSection >= 0);
  assert.ok(imageSettingsSection > imageSection);
  assert.ok(voiceSection > imageSettingsSection);
  assert.doesNotMatch(source, /statusLabel|voiceStatusLabel/);
  assert.doesNotMatch(source, /图片：\{statusLabel\}/);
  assert.doesNotMatch(source, /图：\{state\.image\?\.status/);
  assert.doesNotMatch(source, /音：\{state\.voice\?\.status/);
  assert.doesNotMatch(source, /暂无状态图/);
  assert.doesNotMatch(source, /高级提示词/);
  assert.match(source, /音色提示词/);
});
