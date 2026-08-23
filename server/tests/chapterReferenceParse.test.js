const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serviceSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/planning/application/ChapterReferenceParseService.ts"),
  "utf8",
);

// 参考解析合并契约（2026-08-20 起 reference_draft/reference_extract 合并为
// novel.chapter.reference_parse@v1）：一次调用同时产出 segments（分镜式初稿，
// scene/stateSwitches，画风不进初稿）与 characters/scenes/props/worldview
// （设定建议，角色结构化 gender/ageGroup/physique）。

const { chapterReferenceParsePrompt } = require("../dist/prompting/prompts/novel/chapterReferenceParse.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");
const {
  serializeDraftSegments,
} = require("../dist/modules/novel/planning/application/ChapterReferenceParseService.js");

function makeSegment(overrides = {}) {
  return {
    shot: "中景",
    storyboard: "林川站在窗前看向楼下的街道",
    scene: "卧室",
    speaker: "旁白",
    kind: "narration",
    mood: "",
    text: "夜色里街道空无一人。",
    ...overrides,
  };
}

function makeCharacter(overrides = {}) {
  return {
    name: "林川",
    gender: "male",
    ageGroup: "youth",
    appearance: "高瘦，黑色短发，眉眼锐利，常穿深色夹克，左手腕有一道旧疤。",
    imagePrompt: "青年男性全身像：黑色短发、眉眼锐利、高瘦体型，深色夹克与工装裤，警惕的神态",
    voicePrompt: "偏低的青年男声，语速快，压着情绪说话。",
    ...overrides,
  };
}

// 合并 schema：初稿与提取同层级，segments 必填（8～18），四类设定建议可缺省
// （默认 8 个互不重复的单元——postValidate 有「分镜单元不能重复」守卫）
function makeParsePayload(overrides = {}) {
  return {
    segments: Array.from({ length: 8 }, (_, index) => makeSegment({
      storyboard: `林川站在窗前看向楼下的街道（${index + 1}）`,
      text: `夜色里街道空无一人。（${index + 1}）`,
    })),
    characters: [makeCharacter()],
    scenes: [],
    props: [],
    worldview: [],
    ...overrides,
  };
}

test("prompt 资产为 reference_parse@v16 且注册进 loader registry，旧两项已移除", () => {
  assert.equal(chapterReferenceParsePrompt.version, "v16");
  assert.equal(
    promptAssetLoaderEntries.find((entry) => entry.key.startsWith("novel.chapter.reference_parse")).key,
    "novel.chapter.reference_parse@v16",
  );
  assert.equal(
    promptAssetLoaderEntries.filter((entry) => entry.key.startsWith("novel.chapter.reference_")).length,
    1,
  );
});

test("场景条目输出 sceneType 结构化字段（2026-08-23 用户要求：应用后场景类型不能是空的）", () => {
  const messages = chapterReferenceParsePrompt.render({
    novelTitle: "测试书",
    chapterTitle: "第一章",
    chapterOrder: 1,
    referenceText: "测试文本",
  });
  const systemText = String(messages[0].content);
  // 与 timeOfDay/weather 同一套规则：枚举值 + 原文推断 + 推不出 null。
  assert.match(systemText, /sceneType\/timeOfDay\/weather 是结构化字段/);
  assert.match(systemText, /类型按 interior（室内）\/exterior（室外，如 街道、楼顶、庭院）\/nature（自然风光，如 旷野、森林、海边）输出/);
});

test("道具提取按复用度过滤：通用日常物品不收（2026-08-23 用户要求）", () => {
  const messages = chapterReferenceParsePrompt.render({
    novelTitle: "测试书",
    chapterTitle: "第一章",
    chapterOrder: 1,
    referenceText: "测试文本",
  });
  const systemText = String(messages[0].content);
  // 复用度是硬门槛：只收反复出现/推动关键情节的贯穿性道具；
  // 行李箱/糖果零食/银行卡这类一次性日常物品不建形象，宁缺勿滥。
  assert.match(systemText, /复用度是硬门槛/);
  assert.match(systemText, /行李箱、背包、糖果零食、银行卡\/现金、手机、普通衣物餐具/);
  assert.match(systemText, /本章确实没有就返回空数组/);
});

test("角色长相与穿搭按性格/年龄/身份各自设计，不同角色明显区分（2026-08-23 用户要求）", () => {
  const messages = chapterReferenceParsePrompt.render({
    novelTitle: "测试书",
    chapterTitle: "第一章",
    chapterOrder: 1,
    referenceText: "测试文本",
  });
  const systemText = String(messages[0].content);
  // 长相：按性格/年龄/身份推测，脸给具体特征，好看按戏份伸缩、不许难看、不许全员同一张脸。
  assert.match(systemText, /长相与穿搭按角色各自设计/);
  assert.match(systemText, /禁止都长成同一张标准帅哥\/美女脸/);
  assert.match(systemText, /按角色在原文里表现出的性格、年龄与身份/);
  assert.match(systemText, /好看程度按戏份伸缩/);
  assert.match(systemText, /任何角色都不要难看/);
  // 穿搭：按性格与身份设计有风格的搭配，男女都有路线锚点，全书角色错开。
  assert.match(systemText, /地雷系（黑紫暗色、蕾丝蝴蝶结、厚底鞋、双马尾或挑染）/);
  assert.match(systemText, /乖巧系（浅色连衣裙\/白裙、针织衫、柔顺直发）/);
  assert.match(systemText, /机能、运动、商务通勤、学院、工装、街头、复古/);
  assert.match(systemText, /与本书其他角色错开/);
  assert.match(systemText, /不写「穿着时尚」这类空话/);
});

test("segments 契约：scene 必填、无风格字段（画风不进初稿）、状态切换可缺省", () => {
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(
    makeParsePayload({ segments: [makeSegment({ scene: undefined })] }),
  ));
  const parsed = chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload());
  assert.equal(parsed.segments[0].scene, "卧室");
  assert.deepEqual(parsed.segments[0].stateSwitches, []);
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(
    makeParsePayload({ segments: Array.from({ length: 8 }, (_, index) => index === 0 ? makeSegment({ styleSwitch: "写实末日" }) : makeSegment()) }),
  ));
  const withSwitches = chapterReferenceParsePrompt.outputSchema.parse(
    makeParsePayload({ segments: Array.from({ length: 8 }, (_, index) => index === 0 ? makeSegment({ stateSwitches: [{ name: "林川", state: "重伤" }] }) : makeSegment()) }),
  );
  assert.deepEqual(withSwitches.segments[0].stateSwitches, [{ name: "林川", state: "重伤" }]);
});

test("角色结构化字段：性别枚举、年龄段可空、外貌体型合并一个字段（预填设定表单）", () => {
  const parsed = chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload());
  assert.equal(parsed.characters[0].gender, "male");
  assert.equal(parsed.characters[0].ageGroup, "youth");
  // v2 起体型并入 appearance，physique/personality 不再是输出字段（strict 拒绝）
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    characters: [makeCharacter({ physique: "高瘦" })],
  })));

  // v5 起不再输出 role/身份定位（strict 拒绝）
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    characters: [makeCharacter({ role: "男主" })],
  })));

  // 缺省回落：性别缺省→other、推不出年龄→null（旧提取结构也能并入解析）。
  // v12 起性别只有 male/female/other（怪物等非人与看不出男女的都归 other），unknown 拒绝。
  const legacy = chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    characters: [{
      name: "老周",
      appearance: "微驼背，花白头发，穿洗旧的工装。",
      imagePrompt: "老年男性全身像：花白短发、微驼背，洗旧工装与布鞋。",
      voicePrompt: "沙哑的老年男声，慢悠悠。",
    }],
  }));
  assert.equal(legacy.characters[0].gender, "other");
  assert.equal(legacy.characters[0].ageGroup, null);

  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(
    makeParsePayload({ characters: [makeCharacter({ gender: "男的" })] }),
  ));
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(
    makeParsePayload({ characters: [makeCharacter({ gender: "unknown" })] }),
  ));
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(
    makeParsePayload({ characters: [makeCharacter({ ageGroup: "22岁" })] }),
  ));

  // v6 起场景条目带结构化时间/天气（枚举，缺省 null；非法值 strict 拒绝）；
  // v15 起再带 sceneType（interior/exterior/nature，同规则）。
  const withScene = chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    scenes: [{ name: "废弃地铁站", description: "停运的地下站台，灯管忽明忽暗。", imagePrompt: "昏暗的停运站台，湿滑轨道，闪烁灯管。", sceneType: "interior", timeOfDay: "night", weather: "rainy" }],
  }));
  assert.equal(withScene.scenes[0].sceneType, "interior");
  assert.equal(withScene.scenes[0].timeOfDay, "night");
  assert.equal(withScene.scenes[0].weather, "rainy");
  const sceneDefaults = chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    scenes: [{ name: "客厅", description: "普通居民楼客厅。", imagePrompt: "白天，居民楼客厅。" }],
  }));
  assert.equal(sceneDefaults.scenes[0].sceneType, null);
  assert.equal(sceneDefaults.scenes[0].timeOfDay, null);
  assert.equal(sceneDefaults.scenes[0].weather, null);
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    scenes: [{ name: "海边", description: "清晨的海滩。", imagePrompt: "清晨海滩。", timeOfDay: "清晨" }],
  })));
  assert.throws(() => chapterReferenceParsePrompt.outputSchema.parse(makeParsePayload({
    scenes: [{ name: "海边", description: "清晨的海滩。", imagePrompt: "清晨海滩。", sceneType: "海边" }],
  })));
});

test("postValidate：有场景却零角色判无效、占位内容判无效、分镜单元不能重复", () => {
  assert.throws(() => chapterReferenceParsePrompt.postValidate(makeParsePayload({ characters: [], scenes: [{ name: "仓库", description: "堆放杂物的旧仓库。", imagePrompt: "白天，杂物堆积的旧仓库内部。" }] })), /characters 不能为空/);
  assert.throws(() => chapterReferenceParsePrompt.postValidate(makeParsePayload({
    characters: [makeCharacter({ name: "示例文本", appearance: "示例内容，足够长的一句。" })],
  })), /占位/);
  assert.throws(() => chapterReferenceParsePrompt.postValidate(makeParsePayload({
    segments: Array.from({ length: 8 }, () => makeSegment()),
  })), /分镜单元不能重复/);
});

test("serializeDraftSegments 首单元与换场时输出【场景】行，同场景不重复", () => {
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({ shot: "近景", text: "他握紧了手里的信。" }),
    makeSegment({ scene: "客厅", kind: "dialogue", speaker: "林川", mood: "压抑怒气", text: "你不该回来。" }),
    makeSegment({ scene: "客厅", shot: "特写", text: "茶几上的杯子裂了缝。" }),
  ]);
  const lines = draftText.split("\n");
  assert.equal(lines[0], "【场景：卧室】");
  assert.equal(lines[1], "分镜：中景，林川站在窗前看向楼下的街道");
  assert.equal(lines[2], "旁白：夜色里街道空无一人。");
  assert.ok(draftText.includes("\n\n分镜：近景"));
  assert.equal(draftText.split("【场景：客厅】").length - 1, 1);
  assert.ok(draftText.includes("林川（压抑怒气）：你不该回来。"));
  assert.ok(draftText.includes("\n\n分镜：特写"));
});

test("serializeDraftSegments 无风格字段，不输出【风格】行", () => {
  // 旧结构化结果可能带 styleSwitch：序列化器不认识它，原样忽略不产出标记。
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({ storyboard: "街道上火光冲天", text: "城市在三天内陷落。", styleSwitch: "写实末日" }),
  ]);
  assert.ok(!draftText.includes("【风格"));
});

test("serializeDraftSegments 角色状态切换输出【角色状态】行，同角色同状态不重复", () => {
  const draftText = serializeDraftSegments([
    makeSegment(),
    makeSegment({
      storyboard: "林川被碎石砸中倒地",
      stateSwitches: [{ name: "林川", state: "重伤" }, { name: "苏叶", state: "沾血" }],
      text: "爆炸掀翻了半条街。",
    }),
    makeSegment({ stateSwitches: [{ name: "林川", state: "重伤" }], text: "他撑着墙站起来。" }),
    makeSegment({ stateSwitches: [{ name: "林川", state: "" }], text: "无论如何先离开这里。" }),
  ]);
  assert.ok(draftText.includes("【角色状态：林川：重伤】"));
  assert.ok(draftText.includes("【角色状态：苏叶：沾血】"));
  assert.equal(draftText.split("【角色状态：林川：重伤】").length - 1, 1);
  assert.ok(!draftText.includes("：】"));
});

test("serializeDraftSegments 切换行顺序：场景 → 角色状态 → 分镜；scene 空串不输出场景行", () => {
  const ordered = serializeDraftSegments([
    makeSegment({ scene: "天台", stateSwitches: [{ name: "林川", state: "癫狂" }] }),
  ]);
  const lines = ordered.split("\n");
  assert.equal(lines[0], "【场景：天台】");
  assert.equal(lines[1], "【角色状态：林川：癫狂】");
  assert.ok(lines[2].startsWith("分镜："));

  const emptyScene = serializeDraftSegments([makeSegment({ scene: "" }), makeSegment({ scene: "" })]);
  assert.ok(!emptyScene.includes("【场景"));
  assert.ok(emptyScene.startsWith("分镜："));
});

test("参考解析给模型的角色状态名单会包含缺失数据的初始状态", () => {
  assert.match(serviceSource, /parseStoryAssetStatesJson/);
  assert.match(serviceSource, /normalizeStoryCharacterStates/);
});

test("图片提示词只写纯内容描述：系统指令明确禁止画风/背景/视图/时代氛围词", () => {
  const rendered = chapterReferenceParsePrompt.render({
    chapterTitle: "测试",
    chapterOrder: 1,
    referenceText: "正文",
    existingCharacters: [],
    existingScenes: [],
  });
  const text = rendered.map((message) => String(message.content)).join(" ");
  assert.match(text, /画风、背景、视图、时代氛围一律由系统统一管理/);
  assert.match(text, /纯白背景/);
  assert.match(text, /四视图/);
  assert.match(text, /禁止出现画风\/风格\/渲染类词/);
  assert.match(text, /时代\/画风氛围词/);
});

test("postValidate 出口剥离三类资产图片提示词里的画风/背景/视图/时代氛围词", () => {
  const output = chapterReferenceParsePrompt.postValidate(makeParsePayload({
    characters: [makeCharacter({
      imagePrompt: "全身像，年轻男性大学生，约二十出头，深色短发，眉眼冷硬锐利，穿着洗旧的简单衬衫与深色长裤，写实动漫风格，纯白背景。",
    })],
    scenes: [{ name: "叶城大学宿舍", description: "四人间宿舍。", imagePrompt: "宿舍内部，360度全景，末世废土风格的破败走廊。", timeOfDay: null, weather: null }],
    props: [{ name: "旧军刀", description: "末世前留下的军刀。", imagePrompt: "碳钢刀身带缺口与锈迹，木质刀柄缠旧布条，45度透视。" }],
  }));
  assert.equal(
    output.characters[0].imagePrompt,
    "年轻男性大学生，约二十出头，深色短发，眉眼冷硬锐利，穿着洗旧的简单衬衫与深色长裤",
  );
  assert.ok(!output.scenes[0].imagePrompt.includes("360"));
  assert.ok(!output.scenes[0].imagePrompt.includes("末世"));
  assert.ok(output.scenes[0].imagePrompt.includes("破败走廊"));
  // 内容词不受伤害：来历保留在 description，提示词里的内容短语照常保留。
  assert.ok(output.props[0].imagePrompt.includes("碳钢刀身"));
  assert.ok(!output.props[0].imagePrompt.includes("透视"));
});
