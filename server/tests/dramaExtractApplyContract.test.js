const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
const stage = read("client/src/pages/drama/comicDrama/hooks/useReferenceExtractStage.ts");
const tab = read("client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx");
const dialog = read("client/src/pages/drama/comicDrama/components/ExtractApplyDialog.tsx");
const assetForms = read("client/src/pages/novels/components/storySettings/assetForms.tsx");

// 2026-08-23 用户实测两个问题（漫剧「提取」应用链路）：
// ① 末世书从提取应用新建的角色（血角兽）时代风格落「现代都市」——创建路径没写 eraStyle，
//    生成时兜底现代都市。修复：应用创建的新状态预填本书当前生效时代风格（getDramaEraStyle
//    同一条链：脚本【画风】标记 > 小说默认 > 内置默认），弹窗可见可改、落库再兜底一次。
// ② 世界观条目应用后不亮「已存在」——existingNames 只覆盖角色/场景/道具。修复：世界观按
//    关键设定条目标题比对亮徽标；同名条目重复应用改为更新内容，不再报错拦人。
// 契约全部在客户端源码上锁定（服务端对提取应用无对应结构化端点）。
test("新建资产预填本书时代风格：eraStyle 查询 + 三条创建路径兜底", () => {
  assert.match(stage, /getDramaEraStyle\(input\.novelId\)/);
  assert.match(stage, /const defaultEraStyle = eraStyleQuery\.data\?\.data\?\.label\?\.trim\(\) \|\| null/);
  const createPathsWithDefault = stage.match(/withDefaultEraStyle\(form\.states\)/g) ?? [];
  assert.equal(createPathsWithDefault.length, 3);
  // 更新路径（existingId 分支）不得改写已有资产的时代风格。
  assert.match(stage, /states: normalizeStatesForSave\(form\.states\),/);
});

test("弹窗预填：新建议初始状态带本书时代风格，且工厂函数透传 eraStyle", () => {
  assert.match(dialog, /defaultEraStyle\?: string \| null/);
  assert.match(dialog, /const eraStylePatch = props\.defaultEraStyle\?\.trim\(\) \? \{ eraStyle: props\.defaultEraStyle\.trim\(\) \} : \{\}/);
  // 三个初始状态工厂必须透传 eraStyle（旧工厂是固定字段对象，多传会被静默丢掉）。
  const factoryForward = assetForms.match(/\.\.\.\(input\.eraStyle\?\.trim\(\) \? \{ eraStyle: input\.eraStyle\.trim\(\) \} : \{\}\)/g) ?? [];
  assert.equal(factoryForward.length, 3);
});

test("世界观已存在徽标：existingNames 覆盖世界观，卡片判断不再写死 false", () => {
  assert.match(stage, /worldview: new Set\(worldKeySettings\.map\(\(entry\) => entry\.title\.trim\(\)\)\)/);
  assert.match(stage, /queryKey: queryKeys\.novels\.storySettingsWorld\(input\.novelId\)/);
  assert.doesNotMatch(tab, /group === "worldview"[\s\S]{0,80}return false/);
  assert.match(tab, /stage\.existingNames\[group\]\.has\(name\.trim\(\)\)/);
});

test("世界观同名条目应用改为更新内容，不再抛「不能重复创建」", () => {
  assert.match(stage, /const matchIndex = existingSettings\.findIndex\(\(entry\) => entry\.title\.trim\(\) === title\)/);
  assert.match(stage, /existingSettings\.map\(\(entry, index\) => \(index === matchIndex \? \{ title, content \} : entry\)\)/);
  assert.doesNotMatch(stage, /已有同名世界观条目，不能重复创建/);
});
