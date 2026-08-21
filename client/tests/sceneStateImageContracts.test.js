import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const scenesSource = read("pages/novels/components/storySettings/SettingsScenesTab.tsx");
const outlineSource = read("pages/drama/comicDrama/components/OutlineSettingsAside.tsx");

test("场景编辑器只通过状态编辑器展示和生成状态图片", () => {
  assert.doesNotMatch(scenesSource, /generateStorySceneImage/);
  assert.doesNotMatch(scenesSource, /360° 全景参考图/);
  assert.match(scenesSource, /<AssetStatesEditor[\s\S]*kind="scene"/);
});

test("大纲侧场景详情只展示场景状态图片", () => {
  assert.doesNotMatch(outlineSource, /scene\.image\?\.url/);
  assert.doesNotMatch(outlineSource, /全景图/);
  assert.match(outlineSource, /<DetailStates states=\{scene\.states\}/);
});
