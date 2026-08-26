import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const editor = readFileSync(new URL("../src/pages/novels/components/storySettings/assetForms.tsx", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../src/components/storyAssets/storyAssetPresentation.ts", import.meta.url), "utf8");

test("角色状态编辑器提供米制身高输入和范围校验", () => {
  assert.match(editor, /身高（米）/);
  assert.match(editor, /type="number"/);
  assert.match(editor, /min=\{STORY_ASSET_CHARACTER_HEIGHT_MIN_METERS\}/);
  assert.match(editor, /max=\{STORY_ASSET_CHARACTER_HEIGHT_MAX_METERS\}/);
  assert.match(editor, /step="0\.01"/);
  assert.match(editor, /heightMeters/);
});

test("角色状态资料位于大图之后，编辑字段保持在图片下方", () => {
  const settingsIndex = editor.indexOf('aria-label="状态资料"');
  const imageIndex = editor.indexOf('aria-label="状态图片"');
  assert.ok(settingsIndex >= 0, "状态资料区必须存在");
  assert.ok(imageIndex >= 0, "状态图片区必须存在");
  assert.ok(imageIndex < settingsIndex, "状态资料区应放在大图之后");
});

test("角色资产卡片区分手动身高与 AI 估算", () => {
  assert.match(presentation, /heightMeters/);
  assert.match(presentation, /手动设定/);
});
