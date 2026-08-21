const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DEFAULT_UNIVERSAL_ART_STYLE,
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
  DRAMA_VISUAL_STYLE_PRESETS,
  DRAMA_ERA_STYLE_MARKER_PATTERN,
  extractLastEraStyleMarker,
  matchDramaEraStyle,
  buildKeyframeStylePromptLines,
  buildCharacterStylePromptLines,
  combineStyleAvoidInstructions,
} = require("../dist/services/drama/visual/dramaVisualStyles.js");

// 美术风格两层组合契约（2026-08-21）：通用层=系统级渲染质感基线（不含时代/题材），
// 具体层=题材氛围叠加（内置预设或小说自定义）；首帧图与立绘按 通用→具体 顺序拼提示词。
// 风格指令统一中文书写（用户 2026-08-21 要求，自定义画风与分镜描述本就是中文）。
// 生成侧解析入口在 dramaArtStyleResolver（依赖 DB，不在本测试覆盖）。

test("内置具体风格都是题材叠加层：id 唯一、默认 id 在列、不自带渲染媒介指令", () => {
  const ids = DRAMA_VISUAL_STYLE_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_DRAMA_VISUAL_STYLE_ID));
  // 渲染媒介由通用层决定：具体风格出现媒介词会与 UE5 基线打架（旧版预设的坑）。
  for (const preset of DRAMA_VISUAL_STYLE_PRESETS) {
    assert.ok(
      !/photorealistic|live-action|cel-animation|3D render|anime render|写实3D|真人实拍|赛璐璐|二维动画|动漫渲染/i.test(preset.styleInstructions),
      `${preset.id} 不应包含渲染媒介指令`,
    );
    assert.ok(preset.summary.trim().length > 0, `${preset.id} 缺少面向用户的 summary`);
  }
});

test("通用默认是虚幻引擎质感基线、有中文摘要、且不含时代属性", () => {
  assert.ok(DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions.includes("虚幻引擎"));
  assert.ok(DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions.includes("影视化游戏美术"));
  assert.match(DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions, /电影级.*光/);
  assert.ok(!/末世|民国|仙侠|玄幻|古代|都市|当代/.test(DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions));
  assert.ok(DEFAULT_UNIVERSAL_ART_STYLE.summary.trim().length > 0, "通用画风需要面向 UI 的中文 summary");
});

test("风格指令全部中文化：内置预设与通用层不残留英文指令句", () => {
  // 只拦「成句英文指令」：允许个别的专有名词/数字（如 UE5、8K、1920）。连续五个以上英文单词视为指令句。
  const englishSentence = /[A-Za-z]+[^，。；\n]*[A-Za-z]+[^，。；\n]*[A-Za-z]+[^，。；\n]*[A-Za-z]+[^，。；\n]*[A-Za-z]+/;
  const samples = [
    DEFAULT_UNIVERSAL_ART_STYLE.styleInstructions,
    DEFAULT_UNIVERSAL_ART_STYLE.avoidInstructions,
    ...DRAMA_VISUAL_STYLE_PRESETS.flatMap((preset) => [preset.styleInstructions, preset.avoidInstructions ?? ""]),
  ];
  for (const sample of samples) {
    assert.ok(!englishSentence.test(sample), `风格指令应全中文：${sample.slice(0, 40)}…`);
  }
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
  assert.ok(!lines[0].includes("，，"));
  assert.ok(!lines[0].endsWith("，"));
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

// 脚本画风标记（2026-08-21 用户决定：时代风格可在章节脚本里切换，切换后后面都用新的）
test("脚本画风标记：取最后一条，容忍全角/半角冒号与首尾空格，旧【风格】行不匹配", () => {
  assert.ok(DRAMA_ERA_STYLE_MARKER_PATTERN.test("【画风：末世废土】"));
  assert.ok(DRAMA_ERA_STYLE_MARKER_PATTERN.test("  【画风: 现代都市 】 "));
  assert.ok(!DRAMA_ERA_STYLE_MARKER_PATTERN.test("【风格：写实末日】"));
  const script = [
    "【场景：街道】",
    "分镜：全景，雨夜街口",
    "【画风：现代都市】",
    "旁白：末世前夜。",
    "【画风：末世废土】",
    "分镜：中景，废墟生火",
  ].join("\n");
  assert.equal(extractLastEraStyleMarker(script), "末世废土");
  assert.equal(extractLastEraStyleMarker("没有标记的脚本"), null);
  assert.equal(extractLastEraStyleMarker(null), null);
});

test("时代风格匹配：预设 id、预设 label、自定义风格名都能命中；悬空引用回落 null", () => {
  const customs = [{ label: "末世爆发后", styleInstructions: "城市废墟，植物疯长" }];
  assert.equal(matchDramaEraStyle("post_apocalyptic", customs)?.label, "末世废土");
  assert.equal(matchDramaEraStyle("末世废土", customs)?.label, "末世废土");
  assert.equal(matchDramaEraStyle("末世爆发后", customs)?.label, "末世爆发后");
  assert.equal(matchDramaEraStyle("不存在的风格", customs), null);
  assert.equal(matchDramaEraStyle("", customs), null);
});
