import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const formSource = read("pages/novels/components/storySettings/assetForms.tsx");
const charactersSource = read("pages/novels/components/storySettings/SettingsCharactersTab.tsx");

test("角色基础资料不再承载外貌、图片或音色输入", () => {
  assert.match(formSource, /CharacterAssetFormState/);
  assert.doesNotMatch(formSource, /name:\s*string;\s*gender:\s*string;\s*ageGroup:\s*string;\s*appearance:/s);
  assert.doesNotMatch(charactersSource, /form\.appearance|form\.facePrompt|form\.voiceTexture/);
});

test("角色编辑器提供初始状态、年龄段继承和简化状态输入", () => {
  assert.match(formSource, /ageGroup/);
  assert.match(formSource, /上一状态/);
  assert.match(formSource, /高级提示词/);
  assert.match(formSource, /初始状态不能删除/);
  assert.match(charactersSource, /states/);
});
