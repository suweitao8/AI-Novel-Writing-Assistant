const test = require("node:test");
const assert = require("node:assert/strict");

// 脚本文档（Chapter.expectation ↔ 条目列表）双向转换契约：
// 列表视图编辑后回写文本，再解析必须得到同样的条目；canonical 文本序列化必须逐字稳定。

const {
  parseScriptItems,
  serializeScriptItems,
  roundTripScriptItems,
  SCRIPT_SHOT_TYPES,
} = require("@ai-novel/shared/utils/scriptDocument");

const CANONICAL_DRAFT = [
  "【场景：卧室】",
  "分镜：中景，林川站在窗前看向楼下的街道",
  "旁白：夜色里街道空无一人。",
  "",
  "分镜：近景，他握紧了手里的信",
  "林川（压抑怒气）：你不该回来。",
  "",
  "【场景：客厅】",
  "【角色状态：林川：重伤】",
  "分镜：特写，茶几上的杯子裂了缝",
  "苏叶（急切）：你的伤还在流血！",
].join("\n");

// 场景状态标记（2026-08-23）：场景切换行下的状态面板写入，标记该场景用哪个状态出图。
// 与【角色状态】同构；旧版本解析器把它当未知【…】文本保留，不丢内容。
const SCENE_STATE_DRAFT = [
  "【场景：客厅】",
  "【场景状态：客厅：夜晚】",
  "【角色状态：林川：重伤】",
  "分镜：中景，林川扶着墙走进客厅",
  "林川（虚弱）：没事。",
].join("\n");

test("sceneState 标记：parse/serialize/roundtrip", () => {
  const items = parseScriptItems(SCENE_STATE_DRAFT);
  assert.deepEqual(items[0], { kind: "scene", scene: "客厅" });
  assert.deepEqual(items[1], { kind: "sceneState", scene: "客厅", state: "夜晚" });
  assert.deepEqual(items[2], { kind: "state", name: "林川", state: "重伤" });
  const serialized = serializeScriptItems(items);
  assert.match(serialized, /【场景状态：客厅：夜晚】/);
  assert.deepEqual(roundTripScriptItems(SCENE_STATE_DRAFT), items);
  // 场景状态标记不是【场景】行：【场景：…】正则不得吃掉【场景状态：…】。
  assert.equal(parseScriptItems("【场景状态：客厅：夜晚】")[0].kind, "sceneState");
});

test("parse：标记行/分镜行/台词行/神态括注全部拆出", () => {
  const items = parseScriptItems(CANONICAL_DRAFT);
  assert.deepEqual(items[0], { kind: "scene", scene: "卧室" });
  assert.deepEqual(items[1], { kind: "shot", shot: "中景", storyboard: "林川站在窗前看向楼下的街道" });
  assert.deepEqual(items[2], { kind: "line", speaker: "旁白", mood: "", text: "夜色里街道空无一人。" });
  assert.deepEqual(items[3], { kind: "shot", shot: "近景", storyboard: "他握紧了手里的信" });
  assert.deepEqual(items[4], { kind: "line", speaker: "林川", mood: "压抑怒气", text: "你不该回来。" });
  assert.deepEqual(items[5], { kind: "scene", scene: "客厅" });
  assert.deepEqual(items[6], { kind: "state", name: "林川", state: "重伤" });
  assert.deepEqual(items[8], { kind: "line", speaker: "苏叶", mood: "急切", text: "你的伤还在流血！" });
});

test("serialize：canonical 文本往返逐字稳定（幂等）", () => {
  const once = serializeScriptItems(parseScriptItems(CANONICAL_DRAFT));
  assert.equal(once, CANONICAL_DRAFT);
  const twice = serializeScriptItems(parseScriptItems(once));
  assert.equal(twice, once);
});

test("parse 容错：分镜画面含逗号、旧【风格】行与自由文本原样保留", () => {
  const legacy = [
    "【风格：写实末日】",
    "分镜：全景，雨夜，街道积水映着火光",
    "一句不认识格式的自由文本",
    "纯文本第二行",
  ].join("\n");
  const items = parseScriptItems(legacy);
  // 画风标记已废弃：当普通文本保留，不丢内容
  assert.deepEqual(items[0], { kind: "text", text: "【风格：写实末日】" });
  // 景别只吃第一个逗号，画面里的逗号保留
  assert.deepEqual(items[1], { kind: "shot", shot: "全景", storyboard: "雨夜，街道积水映着火光" });
  assert.deepEqual(items[2], { kind: "text", text: "一句不认识格式的自由文本" });
  assert.deepEqual(items[3], { kind: "text", text: "纯文本第二行" });
  // 往返一致：text 条目照原样写回
  const round = serializeScriptItems(roundTripScriptItems(legacy));
  assert.equal(round, legacy);
});

test("serialize：空 speaker 的台词降级为纯文本行，空条目被丢弃", () => {
  const text = serializeScriptItems([
    { kind: "scene", scene: "天台" },
    { kind: "line", speaker: "", mood: "", text: "没有说话人的行" },
    { kind: "line", speaker: "旁白", mood: "", text: "" },
    { kind: "text", text: "   " },
  ]);
  assert.equal(text, "【场景：天台】\n没有说话人的行");
});

// 画风标记（2026-08-21 用户决定：时代风格可在章节脚本里切换，标记对后续内容生效）
test("画风标记行：parse 拆出 style 条目，serialize 往返逐字稳定", () => {
  const draft = [
    "【场景：街道】",
    "分镜：全景，现代都市的雨夜街口",
    "旁白：末世来临前的最后一个雨季。",
    "",
    "【画风：末世废土】",
    "【场景：废墟营地】",
    "分镜：中景，他在锈蚀的栏杆边生火",
    "旁白：三年后，城市只剩尘土。",
  ].join("\n");
  const items = parseScriptItems(draft);
  assert.deepEqual(items[3], { kind: "style", style: "末世废土" });
  assert.equal(serializeScriptItems(parseScriptItems(draft)), draft);
  assert.deepEqual(roundTripScriptItems(draft), items);
});

test("画风标记：多个标记共存，格式容错（全角/半角冒号、首尾空格）", () => {
  const items = parseScriptItems("  【画风: 现代都市 】 ");
  assert.deepEqual(items[0], { kind: "style", style: "现代都市" });
});

test("景别枚举与解析一致", () => {
  assert.deepEqual([...SCRIPT_SHOT_TYPES], ["大远景", "远景", "全景", "中景", "近景", "特写"]);
  for (const shotType of SCRIPT_SHOT_TYPES) {
    const items = parseScriptItems(`分镜：${shotType}，画面`);
    assert.equal(items[0].kind, "shot");
    assert.equal(items[0].shot, shotType);
  }
});
