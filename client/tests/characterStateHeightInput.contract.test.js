import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const editor = readFileSync(new URL("../src/pages/novels/components/storySettings/assetForms.tsx", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../src/components/storyAssets/storyAssetPresentation.ts", import.meta.url), "utf8");

test("角色状态编辑器提供米制身高输入和范围校验", () => {
  assert.match(editor, /身高（米）/);
  assert.match(editor, /type="number"/);
  assert.match(editor, /min="0\.7"/);
  assert.match(editor, /max="2\.4"/);
  assert.match(editor, /step="0\.01"/);
  assert.match(editor, /heightMeters/);
});

test("角色资产卡片区分手动身高与 AI 估算", () => {
  assert.match(presentation, /heightMeters/);
  assert.match(presentation, /手动设定/);
});
