const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
const dialog = read("client/src/pages/novels/components/storySettings/StoryAssetEditDialog.tsx");
const charactersTab = read("client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx");
const scenesTab = read("client/src/pages/novels/components/storySettings/SettingsScenesTab.tsx");
const propsTab = read("client/src/pages/novels/components/storySettings/SettingsPropsTab.tsx");
const aside = read("client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx");

// 2026-08-23 用户要求：所有入口打开的资产弹窗都是同一个可编辑可保存的界面。
// 设定中心三个资产页签与漫剧脚本页右侧列表共用 StoryAssetEditDialog；
// 只读预览弹窗（StoryAssetDetailDialog）退役删除，防止两条详情界面再次分叉。
test("共享编辑弹窗承载三类资产的新建/编辑/AI 草稿/状态编辑器", () => {
  assert.match(dialog, /updateStorySettingsCharacter/);
  assert.match(dialog, /updateStorySettingsScene/);
  assert.match(dialog, /updateStorySettingsProp/);
  assert.match(dialog, /createStorySettingsCharacter/);
  assert.match(dialog, /generateStoryEntityDraft/);
  assert.match(dialog, /<AssetStatesEditor/);
  assert.match(dialog, /asset=\{asset \? \{ novelId, assetId: asset\.id \} : undefined\}/);
});

test("三个设定页签渲染共享弹窗，不再内联各自的新建/编辑弹窗", () => {
  const tabs = [
    [charactersTab, "character"],
    [scenesTab, "scene"],
    [propsTab, "prop"],
  ];
  for (const [tab, kind] of tabs) {
    assert.match(tab, new RegExp(`<StoryAssetEditDialog[\\s\\S]*?kind="${kind}"`));
    assert.doesNotMatch(tab, /<AppDialogContent/);
  }
});

test("脚本页右侧列表打开同一个编辑弹窗；只读详情弹窗已删除", () => {
  assert.match(aside, /<StoryAssetEditDialog/);
  assert.doesNotMatch(aside, /StoryAssetDetailDialog/);
  assert.equal(
    fs.existsSync(path.join(__dirname, "..", "..", "client/src/components/storyAssets/StoryAssetDetailDialog.tsx")),
    false,
  );
  assert.doesNotMatch(read("client/src/components/storyAssets/index.ts"), /StoryAssetDetailDialog/);
});
