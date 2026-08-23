const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
const sharedTypes = read("shared/types/novelReferenceExtraction.ts");
const assetForms = read("client/src/pages/novels/components/storySettings/assetForms.tsx");
const extractStage = read("client/src/pages/drama/comicDrama/hooks/useReferenceExtractStage.ts");
const scriptTab = read("client/src/pages/drama/comicDrama/components/ScriptTab.tsx");

// 2026-08-23 用户要求：资产首状态统一叫「默认」（原「初始状态/初始形象」），存量数据就地归一；
// 脚本「场景切换」行下加状态面板（场景状态 + 出场角色形象状态，下拉切换写标记行，
// 未写标记沿用上一次使用的状态）。核心不变量（首状态不可删/不可引用）按 index===0 /
// id==="initial" 判断，与 label 文案无关——本契约防止 label 改名回归或标记写入走样。
test("首状态统一叫「默认」：工厂默认值与客户端写入点不再产出旧名", () => {
  assert.match(sharedTypes, /label: input\.label\?\.trim\(\) \|\| "默认"/);
  assert.match(sharedTypes, /label: "默认",/);
  assert.match(assetForms, /label: "默认",/);
  assert.equal((extractStage.match(/label: "默认"/g) ?? []).length, 3);
});

test("存量归一：normalize 把首状态的「初始状态/初始形象」就地改成「默认」", () => {
  assert.match(sharedTypes, /LEGACY_INITIAL_STATE_LABELS = new Set\(\["初始状态", "初始形象"\]\)/);
  assert.match(sharedTypes, /index === 0 && LEGACY_INITIAL_STATE_LABELS\.has\(label\.trim\(\)\) \? "默认" : label\.trim\(\)/);
});

test("显示徽标：首状态（含存量旧名）显示「默认」", () => {
  assert.match(assetForms, /label === "默认" \|\| label === "初始形象" \|\| label === "初始状态"/);
  assert.match(assetForms, /return "默认";/);
});

test("脚本场景状态面板：面板数据推导 + 标记写入 + 【场景状态】行渲染", () => {
  // 面板：场景状态与出场角色的生效状态（标记 sticky，无标记回落资产默认状态）。
  assert.match(scriptTab, /sceneState: runningSceneState\.get\(current\.sceneName\) \?\? null/);
  assert.match(scriptTab, /state: runningCharState\.get\(name\) \?\? null/);
  // 切换写入：段内最后一个对应标记改值，没有就在场景行后插入。
  assert.match(scriptTab, /\{ kind: "sceneState" as const, scene: panel\.sceneName, state: nextState \}/);
  assert.match(scriptTab, /\{ kind: "state" as const, name: target\.name, state: nextState \}/);
  // 标记行有自己的渲染分支（不落纯文本行）。
  assert.match(scriptTab, /item\.kind === "sceneState" \? \(\s*<SceneStateRow/);
});
