// 空白小说契约测试：细纲推理 prompt 注册与校验、卷规划剧情契约块、路由接线与简易模式写守卫。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SERVER_ROOT = path.join(__dirname, "..");
const {
  listRegisteredPromptAssets,
} = require("../dist/prompting/registry.js");
const {
  novelOutlineExpandPrompt,
} = require("../dist/prompting/prompts/novel/outlineExpand.prompts.js");
const {
  buildUserChapterOutlineContractText,
} = require("../dist/prompting/prompts/novel/volume/shared.js");
const {
  buildVolumeChapterListContextBlocks,
} = require("../dist/prompting/prompts/novel/volume/contextBlocks.js");

function minimalVolumePlan() {
  return {
    id: "v1",
    sortOrder: 1,
    title: "第一卷",
    summary: "开篇卷。",
    openingHook: "捞起潜艇",
    mainPromise: "深海秘密逐步揭开。",
    primaryPressureSource: "打捞公司",
    coreSellingPoint: "治愈+悬疑",
    escalationMode: "层层深入",
    protagonistChange: "从独居到并肩",
    midVolumeRisk: "氧气耗尽",
    climax: "找到科考队遗迹",
    payoffType: "真相+羁绊",
    nextVolumeHook: "更深的信号",
    openPayoffs: [],
    chapters: [],
  };
}

function minimalVolumeNovel(overrides = {}) {
  return {
    title: "深海修理铺",
    description: null,
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: null,
    estimatedChapterCount: null,
    narrativePov: null,
    pacePreference: null,
    emotionIntensity: null,
    genre: null,
    characters: [],
    ...overrides,
  };
}

test("novel.outline.expand is registered in the prompt registry", () => {
  const keys = listRegisteredPromptAssets().map((asset) => `${asset.id}@${asset.version}`);
  assert.ok(keys.includes("novel.outline.expand@v1"), "novel.outline.expand@v1 必须注册在 Prompt Registry");
});

test("outline expand postValidate enforces contiguous orders and chapter count", () => {
  const input = { novelTitle: "测试书" };
  const valid = {
    premise: "主角在深海修理铺捡到一艘会说话的潜艇并揭开失踪科考队的真相。",
    suggestedChapterCount: 3,
    chapters: [
      { order: 1, title: "捞起潜艇", synopsis: "林川捞起一艘旧潜艇。", keyEvents: ["捞起潜艇"], characterNames: [], sceneNames: [] },
      { order: 2, title: "潜艇开口", synopsis: "潜艇开始说话并请求帮助。", keyEvents: ["潜艇苏醒"], characterNames: [], sceneNames: [] },
      { order: 3, title: "旧日记录", synopsis: "林川发现科考队的记录。", keyEvents: ["发现记录"], characterNames: [], sceneNames: [] },
    ],
    notes: [],
  };
  assert.deepEqual(novelOutlineExpandPrompt.postValidate(valid, input), valid);

  const duplicated = { ...valid, chapters: [valid.chapters[0], valid.chapters[0], valid.chapters[2]] };
  assert.throws(() => novelOutlineExpandPrompt.postValidate(duplicated, input), /章序不能重复/);

  const gapped = { ...valid, chapters: [valid.chapters[0], { ...valid.chapters[1], order: 3 }, { ...valid.chapters[2], order: 5 }] };
  assert.throws(() => novelOutlineExpandPrompt.postValidate(gapped, input), /连续编号/);

  const wrongCount = { ...valid, chapters: valid.chapters.slice(0, 2) };
  assert.throws(
    () => novelOutlineExpandPrompt.postValidate(wrongCount, { ...input, targetChapterCount: 3 }),
    /期望 3 章/,
  );
});

test("outline expand postValidate rejects characters outside the settings snapshot", () => {
  const input = {
    novelTitle: "测试书",
    settingsSnapshot: {
      characters: ["林川（修理师）"],
      scenes: [],
      props: [],
    },
  };
  const draft = {
    premise: "主角在深海修理铺捡到一艘会说话的潜艇并揭开失踪科考队的真相。",
    suggestedChapterCount: 3,
    chapters: [
      { order: 1, title: "捞起潜艇", synopsis: "林川捞起一艘旧潜艇。", keyEvents: [], characterNames: ["林川"], sceneNames: [] },
      { order: 2, title: "陌生人登门", synopsis: "一个陌生女人来到修理铺。", keyEvents: [], characterNames: ["苏晚"], sceneNames: [] },
      { order: 3, title: "旧日记录", synopsis: "林川发现科考队的记录。", keyEvents: [], characterNames: [], sceneNames: [] },
    ],
    notes: [],
  };
  assert.throws(() => novelOutlineExpandPrompt.postValidate(draft, input), /不在设定中心的角色列表中/);
});

test("volume chapter list context includes the user outline contract when confirmed", () => {
  const chapters = [
    { order: 1, title: "捞起潜艇", synopsis: "林川捞起一艘旧潜艇，听到舱内传来声音。", keyEvents: ["捞起潜艇"], characterNames: ["林川"], sceneNames: [] },
    { order: 2, title: "潜艇开口", synopsis: "潜艇苏醒并请求林川帮忙。", keyEvents: ["潜艇苏醒"], characterNames: [], sceneNames: [] },
    { order: 3, title: "旧日记录", synopsis: "林川发现失踪科考队的记录。", keyEvents: ["发现记录"], characterNames: [], sceneNames: [] },
  ];
  const novel = minimalVolumeNovel({
    outline: "退休修理师捞起一艘会说话的旧潜艇。",
    userChapterOutlineJson: JSON.stringify({
      schemaVersion: 1,
      premise: "深海修理铺的秘密。",
      chapters,
      confirmedAt: "2026-08-19T00:00:00.000Z",
    }),
  });
  const contractText = buildUserChapterOutlineContractText(novel);
  assert.match(contractText, /chapter 1 "捞起潜艇"/);
  assert.match(contractText, /user outline note/);

  const blocks = buildVolumeChapterListContextBlocks({
    novel,
    workspace: { volumes: [], beatSheets: [] },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: minimalVolumePlan(),
    targetBeatSheet: { volumeId: "v1", beats: [] },
    targetBeat: {
      key: "opening",
      label: "开卷抓手",
      title: "捞起潜艇",
      summary: "主角捞起会说话的旧潜艇。",
      chapterSpanHint: "第 1-3 章",
      mustDeliver: ["潜艇苏醒", "第一次合作"],
      chapterCount: 3,
    },
    targetBeatChapterCount: 3,
    targetChapterStartOrder: 1,
    targetChapterEndOrder: 3,
    nextAvailableChapterOrder: 4,
  });
  const contractBlock = blocks.find((block) => block.id === "user_outline_contract");
  assert.ok(contractBlock, "章节列表上下文必须包含 user_outline_contract 块");
  assert.equal(contractBlock.priority, 99);

  const emptyBlocks = buildVolumeChapterListContextBlocks({
    novel: minimalVolumeNovel(),
    workspace: { volumes: [], beatSheets: [] },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: minimalVolumePlan(),
    targetBeatSheet: { volumeId: "v1", beats: [] },
    targetBeat: {
      key: "opening",
      label: "开卷抓手",
      title: "开篇",
      summary: "主角捞起会说话的旧潜艇。",
      chapterSpanHint: "第 1-3 章",
      mustDeliver: [],
      chapterCount: 3,
    },
    targetBeatChapterCount: 3,
    targetChapterStartOrder: 1,
    targetChapterEndOrder: 3,
    nextAvailableChapterOrder: 4,
  });
  assert.equal(
    emptyBlocks.find((block) => block.id === "user_outline_contract"),
    undefined,
    "没有确认细纲时不产生契约块",
  );
});

test("novel outline routes are wired into the novel router", () => {
  const source = fs.readFileSync(
    path.join(SERVER_ROOT, "src/modules/novel/http/novelRouteRegistration.ts"),
    "utf8",
  );
  assert.match(source, /registerNovelOutlineRoutes\(router\)/);
  const routesSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src/modules/novel/planning/http/novelOutlineRoutes.ts"),
    "utf8",
  );
  assert.match(routesSource, /"\/:id\/outline"/);
  assert.match(routesSource, /"\/:id\/outline\/expand"/);
  assert.match(routesSource, /"\/:id\/outline\/chapters"/);
});
