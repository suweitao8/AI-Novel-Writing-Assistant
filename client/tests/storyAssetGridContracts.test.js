import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) => readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

const card = read("components/storyAssets/StoryAssetCard.tsx");
const settingsTabs = [
  read("pages/novels/components/storySettings/SettingsCharactersTab.tsx"),
  read("pages/novels/components/storySettings/SettingsScenesTab.tsx"),
  read("pages/novels/components/storySettings/SettingsPropsTab.tsx"),
];

test("角色、场景、道具资产页在桌面端使用五列响应式栅格", () => {
  for (const source of settingsTabs) {
    assert.match(source, /grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5/);
  }
});

test("资产主卡片突出图片、名称和状态，compact 侧栏只留图片名称与状态数概要", () => {
  assert.match(card, /compact\s*\?\s*"flex min-w-0 flex-1 items-stretch gap-3 rounded-md text-left/);
  assert.match(card, /compact \? "w-24 shrink-0" : "w-full"/);
  assert.match(card, /: "w-full"/);
  assert.match(card, /stateLabel/);
  assert.match(card, /stateCountLabel/);
  assert.match(card, /AssetImageStatusBadge/);
  // 侧栏 compact 卡不再展示角色描述段落，信息行以状态数开头。
  assert.doesNotMatch(card, /asset\.summary/);
  assert.doesNotMatch(card, /line-clamp-2 text-xs leading-5 text-muted-foreground/);
  assert.match(
    card,
    /<Badge variant="secondary" className="text-\[11px\]">\{stateCountLabel\}<\/Badge>[\s\S]*?asset\.badges\.map/,
  );
  assert.match(card, /aria-label=\{`查看\$\{asset\.typeLabel\}「\$\{asset\.name\}」详情`\}/);
});
