const test = require("node:test");
const assert = require("node:assert/strict");

// 参考提取 v5：角色结构化 gender/ageGroup/physique 契约——
// 解析出的建议必须能直接预填设定表单，性别/年龄段/体型不再只混在外貌一句话里。

const { chapterReferenceExtractPrompt } = require("../dist/prompting/prompts/novel/chapterReferenceExtract.prompts.js");
const { promptAssetLoaderEntries } = require("../dist/prompting/registry/promptAssetLoaderEntries.js");

function makeCharacter(overrides = {}) {
  return {
    name: "林川",
    role: "男主",
    gender: "male",
    ageGroup: "youth",
    physique: "高瘦",
    appearance: "黑色短发，眉眼锐利，常穿深色夹克，左手腕有一道旧疤。",
    personality: "外冷内热，遇事先扛。",
    imagePrompt: "青年男性全身像：黑色短发、眉眼锐利、高瘦体型，深色夹克与工装裤，警惕的神态",
    voicePrompt: "偏低的青年男声，语速快，压着情绪说话。",
    ...overrides,
  };
}

test("prompt 资产为 v5 且注册进 loader registry", () => {
  assert.equal(chapterReferenceExtractPrompt.version, "v5");
  assert.equal(
    promptAssetLoaderEntries.find((entry) => entry.key.startsWith("novel.chapter.reference_extract")).key,
    "novel.chapter.reference_extract@v5",
  );
});

test("角色结构化字段：性别枚举、年龄段可空、体型短词", () => {
  const parsed = chapterReferenceExtractPrompt.outputSchema.parse({
    characters: [makeCharacter()],
    scenes: [],
    props: [],
    worldview: [],
  });
  assert.equal(parsed.characters[0].gender, "male");
  assert.equal(parsed.characters[0].ageGroup, "youth");
  assert.equal(parsed.characters[0].physique, "高瘦");

  // 缺省回落：看不出性别→unknown、推不出年龄→null、体型→空串（v4 旧结构也能解析）
  const legacy = chapterReferenceExtractPrompt.outputSchema.parse({
    characters: [{
      name: "老周",
      role: "配角",
      appearance: "花白头发，穿洗旧的工装。",
      personality: "絮叨但可靠。",
      imagePrompt: "老年男性全身像：花白短发、微驼背，洗旧工装与布鞋。",
      voicePrompt: "沙哑的老年男声，慢悠悠。",
    }],
    scenes: [],
    props: [],
    worldview: [],
  });
  assert.equal(legacy.characters[0].gender, "unknown");
  assert.equal(legacy.characters[0].ageGroup, null);
  assert.equal(legacy.characters[0].physique, "");

  assert.throws(() => chapterReferenceExtractPrompt.outputSchema.parse({
    characters: [makeCharacter({ gender: "男的" })],
    scenes: [],
    props: [],
    worldview: [],
  }));
  assert.throws(() => chapterReferenceExtractPrompt.outputSchema.parse({
    characters: [makeCharacter({ ageGroup: "22岁" })],
    scenes: [],
    props: [],
    worldview: [],
  }));
});

test("postValidate：有场景却零角色判无效，占位内容判无效", () => {
  assert.throws(() => chapterReferenceExtractPrompt.postValidate({
    characters: [],
    scenes: [{ name: "仓库", description: "堆放杂物的旧仓库。", imagePrompt: "白天，杂物堆积的旧仓库内部。" }],
    props: [],
    worldview: [],
  }), /characters 不能为空/);
  assert.throws(() => chapterReferenceExtractPrompt.postValidate({
    characters: [makeCharacter({ name: "示例文本", appearance: "示例内容，足够长的一句。" })],
    scenes: [],
    props: [],
    worldview: [],
  }), /占位/);
});
