import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const formSource = read("pages/novels/components/storySettings/assetForms.tsx");
const charactersSource = read("pages/novels/components/storySettings/SettingsCharactersTab.tsx");
const extractDialogSource = read("pages/drama/comicDrama/components/ExtractApplyDialog.tsx");
const outlineSource = read("pages/drama/comicDrama/components/OutlineSettingsAside.tsx");
const extractStageSource = read("pages/drama/comicDrama/hooks/useReferenceExtractStage.ts");
const apiSource = read("api/story/storySettings.ts");

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

test("三类资产都保留不可删除的初始状态，提取应用使用稳定初始 ID", () => {
  assert.match(formSource, /disabled=\{draft !== null \|\| stateIndex === 0\}/);
  assert.match(formSource, /disabled=\{!draft \|\| selectedStateIndex === 0\}/);
  assert.match(extractStageSource, /id: "initial", label: "初始状态"/);
});

test("多级状态默认音色会沿状态参考链寻找可复用音频", () => {
  assert.match(formSource, /resolveStoryAssetStateAncestors/);
  assert.match(formSource, /resolveStoryAssetStateAncestors\(states, stateId\)/);
  assert.match(apiSource, /StoryAssetStateInput/);
});

test("角色创建入口预填带身份信息的非空初始状态", () => {
  assert.match(formSource, /createStoryCharacterInitialState/);
  assert.match(charactersSource, /createInitialCharacterState\(\{\s*gender:/);
  assert.match(charactersSource, /name:\s*draft\.name/);
  assert.match(extractDialogSource, /name:\s*item\.name/);
  assert.match(outlineSource, /createInitialCharacterState\(\{[\s\S]*name/);
});

test("手动创建保存前会把当前身份写入未编辑的默认初始状态", () => {
  assert.match(charactersSource, /prepareCharacterStatesForSave/);
  assert.match(charactersSource, /isCreating/);
  assert.match(charactersSource, /name:\s*form\.name\.trim\(\)/);
  assert.match(charactersSource, /defaultInitialState\s*=\s*createInitialCharacterState/);
  assert.match(charactersSource, /JSON\.stringify\(states\[0\]\).*JSON\.stringify\(defaultInitialState/s);
});
