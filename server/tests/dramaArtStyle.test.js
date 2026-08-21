const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DRAMA_ASSET_STYLE_KINDS,
  DEFAULT_DRAMA_ASSET_STYLES,
  DEFAULT_DRAMA_VISUAL_STYLE_ID,
  DRAMA_VISUAL_STYLE_PRESETS,
  DRAMA_ERA_STYLE_MARKER_PATTERN,
  extractLastEraStyleMarker,
  matchDramaEraStyle,
  buildAssetStylePromptLines,
  buildShotStylePromptLines,
  combineAssetStyleAvoidInstructions,
} = require("../dist/services/drama/visual/dramaVisualStyles.js");

// 美术风格分层契约（2026-08-22）：资产层按角色/场景/道具分别提供固定规格与渲染质感，
// 具体层继续提供时代/题材氛围；资产图按 规格→资产画风→具体画风，首帧图只取实际出现的资产类别。
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

test("三类资产默认风格拥有各自固定规格", () => {
  assert.deepEqual(DRAMA_ASSET_STYLE_KINDS, ["character", "scene", "prop"]);
  assert.match(DEFAULT_DRAMA_ASSET_STYLES.character.formatInstructions, /四个视图|四视图/);
  assert.match(DEFAULT_DRAMA_ASSET_STYLES.scene.formatInstructions, /360/);
  assert.match(DEFAULT_DRAMA_ASSET_STYLES.prop.formatInstructions, /45|三点透视/);
  assert.notEqual(
    DEFAULT_DRAMA_ASSET_STYLES.character.avoidInstructions,
    DEFAULT_DRAMA_ASSET_STYLES.scene.avoidInstructions,
  );
  for (const kind of DRAMA_ASSET_STYLE_KINDS) {
    assert.equal(DEFAULT_DRAMA_ASSET_STYLES[kind].kind, kind);
    assert.ok(DEFAULT_DRAMA_ASSET_STYLES[kind].summary.trim().length > 0);
    assert.ok(DEFAULT_DRAMA_ASSET_STYLES[kind].styleInstructions.trim().length > 0);
  }
});

test("风格指令全部中文化：内置预设与三类资产层不残留英文指令句", () => {
  // 只拦「成句英文指令」：允许个别的专有名词/数字（如 UE5、8K、1920）。连续五个以上英文单词视为指令句。
  const englishSentence = /[A-Za-z]+[^，。；\n]*[A-Za-z]+[^，。；\n]*[A-Za-z]+[^，。；\n]*[A-Za-z]+[^，。；\n]*[A-Za-z]+/;
  const samples = [
    ...DRAMA_ASSET_STYLE_KINDS.flatMap((kind) => [
      DEFAULT_DRAMA_ASSET_STYLES[kind].styleInstructions,
      DEFAULT_DRAMA_ASSET_STYLES[kind].avoidInstructions,
    ]),
    ...DRAMA_VISUAL_STYLE_PRESETS.flatMap((preset) => [preset.styleInstructions, preset.avoidInstructions ?? ""]),
  ];
  for (const sample of samples) {
    assert.ok(!englishSentence.test(sample), `风格指令应全中文：${sample.slice(0, 40)}…`);
  }
});

test("资产提示词只拼入自己的格式、正向画风和时代层", () => {
  const specific = DRAMA_VISUAL_STYLE_PRESETS[0];
  const lines = buildAssetStylePromptLines("scene", DEFAULT_DRAMA_ASSET_STYLES.scene, specific);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /360/);
  assert.ok(lines[0].includes(DEFAULT_DRAMA_ASSET_STYLES.scene.styleTag));
  assert.equal(lines[1], DEFAULT_DRAMA_ASSET_STYLES.scene.styleInstructions);
  assert.equal(lines[2], specific.styleInstructions);
  assert.doesNotMatch(lines.join(" "), /四视图|45.*透视/);
});

test("分镜只拼入实际出现的资产类型，不把资产固定规格带进首帧", () => {
  const lines = buildShotStylePromptLines(
    DEFAULT_DRAMA_ASSET_STYLES,
    ["character", "prop"],
    null,
  );
  const joined = lines.join(" ");
  assert.match(joined, /角色/);
  assert.match(joined, /道具/);
  assert.doesNotMatch(joined, /360.*全景/);
  assert.doesNotMatch(joined, /四视图|45.*透视/);
});

test("固定负面约束与自定义正向提示词分离", () => {
  const customCharacter = {
    ...DEFAULT_DRAMA_ASSET_STYLES.character,
    styleInstructions: "自定义角色质感",
  };
  const lines = buildAssetStylePromptLines("character", customCharacter, null);
  assert.match(lines.join(" "), /四视图/);
  assert.match(lines.join(" "), /自定义角色质感/);
  assert.match(combineAssetStyleAvoidInstructions(customCharacter, null), /人体|视图/);
  assert.doesNotMatch(combineAssetStyleAvoidInstructions(DEFAULT_DRAMA_ASSET_STYLES.scene, null), /多肢|人体结构/);
});

test("negative 禁区合并资产层与具体层；无具体风格时只有资产层", () => {
  const specific = DRAMA_VISUAL_STYLE_PRESETS.find((preset) => preset.id === "post_apocalyptic");
  const combined = combineAssetStyleAvoidInstructions(DEFAULT_DRAMA_ASSET_STYLES.character, specific);
  assert.ok(combined.startsWith(DEFAULT_DRAMA_ASSET_STYLES.character.avoidInstructions));
  assert.ok(combined.includes(specific.avoidInstructions));
  assert.equal(
    combineAssetStyleAvoidInstructions(DEFAULT_DRAMA_ASSET_STYLES.character, null),
    DEFAULT_DRAMA_ASSET_STYLES.character.avoidInstructions,
  );
});

test("自定义具体风格只有中文提示词也能组合", () => {
  const custom = { label: "现代诡异", styleInstructions: "雾气浓重，色调诡异压抑" };
  const lines = buildAssetStylePromptLines("prop", DEFAULT_DRAMA_ASSET_STYLES.prop, custom);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].includes("雾气浓重"));
  assert.ok(lines[0].includes(DEFAULT_DRAMA_ASSET_STYLES.prop.styleTag));
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
