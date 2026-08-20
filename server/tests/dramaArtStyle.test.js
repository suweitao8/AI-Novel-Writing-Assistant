const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DEFAULT_UNIVERSAL_ART_STYLE,
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
  DRAMA_VISUAL_STYLE_PRESETS,
  buildKeyframeStylePromptLines,
  buildCharacterStylePromptLines,
  combineStyleAvoidInstructions,
} = require("../dist/services/drama/visual/dramaVisualStyles.js");

// 美术风格两层组合契约（2026-08-21）：通用层=系统级渲染质感基线（不含时代/题材），
// 具体层=题材氛围叠加（内置预设或小说自定义）；首帧图与立绘按 通用→具体 顺序拼提示词。
// 生成侧解析入口在 dramaArtStyleResolver（依赖 DB，不在本测试覆盖）。

test("内置具体风格都是题材叠加层：id 唯一、默认 id 在列、不自带渲染媒介指令", () => {
  const ids = DRAMA_VISUAL_STYLE_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_DRAMA_VISUAL_STYLE_ID));
  // 渲染媒介由通用层决定：具体风格出现媒介词会与 UE5 基线打架（旧版预设的坑）。
  for (const preset of DRAMA_VISUAL_STYLE_PRESETS) {
    assert.ok(
      !/photorealistic|live-action image|cel-animation|3D render|anime render/i.test(preset.styleInstructions),
      `${preset.id} 不应包含渲染媒介指令`,
    );
    assert.ok(preset.summary.trim().length > 0, `${preset.id} 缺少面向用户的 summary`);
  }
});

test("通用默认是 UE5 质感基线且不含时代属性", () => {
  assert.ok(DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions.includes("Unreal Engine 5"));
  assert.ok(!/apocalyptic|republican|xianxia|ancient Chinese period|modern-day/i.test(DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions));
});

test("两层组合：首帧图提示词包含通用层与具体层，通用在前、具体在后", () => {
  const specific = DRAMA_VISUAL_STYLE_PRESETS[0];
  const lines = buildKeyframeStylePromptLines(DEFAULT_UNIVERSAL_ART_STYLE, specific);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes(DEFAULT_UNIVERSAL_ART_STYLE.styleTag));
  assert.ok(lines[0].includes(specific.styleTag));
  assert.equal(lines[1], DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions);
  assert.equal(lines[2], specific.styleInstructions);
});

test("无具体风格时只输出通用层（立绘提示词不出现空标签拼接）", () => {
  const lines = buildCharacterStylePromptLines(DEFAULT_UNIVERSAL_ART_STYLE, null);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes(DEFAULT_UNIVERSAL_ART_STYLE.styleTag));
  assert.ok(!lines[0].includes(", ,"));
  assert.ok(!lines[0].endsWith(","));
});

test("negative 禁区合并两层；无具体风格时只有通用层", () => {
  const specific = DRAMA_VISUAL_STYLE_PRESETS.find((preset) => preset.id === "post_apocalyptic");
  const combined = combineStyleAvoidInstructions(DEFAULT_UNIVERSAL_ART_STYLE, specific);
  assert.ok(combined.startsWith(DEFAULT_UNIVERSAL_ART_STYLE.avoidInstructions));
  assert.ok(combined.includes(specific.avoidInstructions));
  assert.equal(
    combineStyleAvoidInstructions(DEFAULT_UNIVERSAL_ART_STYLE, null),
    DEFAULT_UNIVERSAL_ART_STYLE.avoidInstructions,
  );
});

test("自定义具体风格只有中文提示词也能组合（无 tag/avoid 不影响拼接）", () => {
  const custom = { label: "现代诡异", styleInstructions: "雾气浓重，色调诡异压抑" };
  const lines = buildKeyframeStylePromptLines(DEFAULT_UNIVERSAL_ART_STYLE, custom);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].includes("雾气浓重"));
  assert.ok(lines[0].endsWith(DEFAULT_UNIVERSAL_ART_STYLE.styleTag));
});
