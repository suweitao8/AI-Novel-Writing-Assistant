const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DRAMA_ASSET_ART_STYLE_SETTING_KEY,
  getDramaAssetArtStyleOverrides,
  normalizeDramaAssetStyleKind,
  parseDramaAssetArtStylePayload,
  normalizeDramaAssetStylePrompt,
  saveDramaAssetArtStyle,
} = require("../dist/services/settings/DramaAssetArtStyleSettingsService.js");
const { resolveDramaArtStyleContext } = require("../dist/services/drama/visual/dramaArtStyleResolver.js");
const { prisma } = require("../dist/db/prisma.js");
const fs = require("node:fs");
const path = require("node:path");

const settingsRoutesSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/settings/http/settingsRoutes.ts"),
  "utf8",
);

test("只接受三个资产类别", () => {
  assert.equal(normalizeDramaAssetStyleKind("character"), "character");
  assert.equal(normalizeDramaAssetStyleKind("scene"), "scene");
  assert.equal(normalizeDramaAssetStyleKind("prop"), "prop");
  assert.equal(normalizeDramaAssetStyleKind("universal"), null);
  assert.equal(normalizeDramaAssetStyleKind(" CHARACTER "), "character");
  assert.equal(normalizeDramaAssetStyleKind(null), null);
});

test("损坏配置回落为空的三类覆盖", () => {
  assert.deepEqual(parseDramaAssetArtStylePayload("损坏"), {
    characterPrompt: "",
    scenePrompt: "",
    propPrompt: "",
  });
  assert.deepEqual(parseDramaAssetArtStylePayload(JSON.stringify({ characterPrompt: "角色质感" })), {
    characterPrompt: "角色质感",
    scenePrompt: "",
    propPrompt: "",
  });
});

test("历史三维游戏内置值归一化为新的写实默认值", () => {
  assert.deepEqual(
    parseDramaAssetArtStylePayload(JSON.stringify({
      characterPrompt: "影视化三维游戏美术质感：旧角色默认",
      scenePrompt: "影视化三维场景美术质感：旧场景默认",
      propPrompt: "影视化三维道具美术质感：旧道具默认",
    })),
    {
      characterPrompt: "",
      scenePrompt: "",
      propPrompt: "",
    },
  );
});

test("生图解析器不会继续使用历史三维资产默认值", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalWorldFindUnique = prisma.novelSettingsWorld.findUnique;
  const originalChapterFindMany = prisma.chapter.findMany;
  try {
    prisma.appSetting.findUnique = async ({ where }) => {
      if (where.key !== DRAMA_ASSET_ART_STYLE_SETTING_KEY) {
        return null;
      }
      return {
        key: where.key,
        value: JSON.stringify({
          characterPrompt: "影视化三维游戏美术质感：旧角色默认",
          scenePrompt: "影视化三维场景美术质感：旧场景默认",
          propPrompt: "影视化三维道具美术质感：旧道具默认",
        }),
      };
    };
    prisma.novelSettingsWorld.findUnique = async () => null;
    prisma.chapter.findMany = async () => [];

    const context = await resolveDramaArtStyleContext({});
    assert.match(context.assets.character.styleInstructions, /写实影视化角色资产质感/);
    assert.match(context.assets.scene.styleInstructions, /写实影视化场景质感/);
    assert.match(context.assets.prop.styleInstructions, /写实影视化道具质感/);
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.novelSettingsWorld.findUnique = originalWorldFindUnique;
    prisma.chapter.findMany = originalChapterFindMany;
  }
});

test("每类提示词独立限制为 2000 字符", () => {
  assert.equal(normalizeDramaAssetStylePrompt("  角色质感  "), "角色质感");
  assert.equal(normalizeDramaAssetStylePrompt("x".repeat(2100)).length, 2000);
  assert.equal(normalizeDramaAssetStylePrompt(42), "");
});

test("保存单个类别时保留另外两类覆盖", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalUpsert = prisma.appSetting.upsert;
  let storedValue = JSON.stringify({
    characterPrompt: "角色自定义",
    scenePrompt: "",
    propPrompt: "道具自定义",
  });
  try {
    prisma.appSetting.findUnique = async ({ where }) => {
      assert.equal(where.key, DRAMA_ASSET_ART_STYLE_SETTING_KEY);
      return { key: where.key, value: storedValue };
    };
    prisma.appSetting.upsert = async ({ where, create, update }) => {
      assert.equal(where.key, DRAMA_ASSET_ART_STYLE_SETTING_KEY);
      assert.equal(create.key, DRAMA_ASSET_ART_STYLE_SETTING_KEY);
      storedValue = update.value;
      return { key: where.key, value: storedValue };
    };

    const result = await saveDramaAssetArtStyle("scene", { prompt: "  场景自定义  " });
    assert.deepEqual(result, {
      characterPrompt: "角色自定义",
      scenePrompt: "场景自定义",
      propPrompt: "道具自定义",
    });
    assert.deepEqual(await getDramaAssetArtStyleOverrides(), result);
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.appSetting.upsert = originalUpsert;
  }
});

test("设置路由只暴露三类资产画风接口", () => {
  assert.match(settingsRoutesSource, /\/drama-asset-styles/);
  assert.doesNotMatch(settingsRoutesSource, /\/universal-art-style/);
  assert.match(settingsRoutesSource, /getDramaAssetArtStyleOverrides/);
  assert.match(settingsRoutesSource, /saveDramaAssetArtStyle/);
});

test("解析器按类别读取新的覆盖，不读取历史单一画风", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalWorldFindUnique = prisma.novelSettingsWorld.findUnique;
  const originalChapterFindMany = prisma.chapter.findMany;
  try {
    prisma.appSetting.findUnique = async ({ where }) => {
      // 解析器除资产画风覆盖外还会查全局时代画风库（drama.eraStyles），按 key 分发。
      if (where.key !== DRAMA_ASSET_ART_STYLE_SETTING_KEY) {
        return null;
      }
      return {
        key: where.key,
        value: JSON.stringify({ characterPrompt: "角色自定义", scenePrompt: "", propPrompt: "道具自定义" }),
      };
    };
    prisma.novelSettingsWorld.findUnique = async () => null;
    prisma.chapter.findMany = async () => [];

    const context = await resolveDramaArtStyleContext({});
    assert.equal(context.assets.character.styleInstructions, "角色自定义");
    assert.match(context.assets.scene.styleInstructions, /写实影视化场景/);
    assert.equal(context.assets.prop.styleInstructions, "道具自定义");
    assert.equal(context.specific, null);
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.novelSettingsWorld.findUnique = originalWorldFindUnique;
    prisma.chapter.findMany = originalChapterFindMany;
  }
});

// 状态自选时代风格（2026-08-22 用户要求）：双穿/时代推进的书同一资产在不同时代各有一套状态，
// 状态的 eraStyle 是用户显式选择，解析时直接采用（跳过剧情判定与全局链）。
function mockEraStyleChain() {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalWorldFindUnique = prisma.novelSettingsWorld.findUnique;
  const originalChapterFindMany = prisma.chapter.findMany;
  prisma.appSetting.findUnique = async () => null;
  prisma.novelSettingsWorld.findUnique = async () => ({
    artStylesJson: JSON.stringify([{ label: "末世爆发后", prompt: "城市废墟，植物疯长" }]),
    defaultArtStyle: "末世废土",
  });
  prisma.chapter.findMany = async () => [
    { order: 1, expectation: "【画风：末世废土】\n旁白：城市已成废墟。" },
  ];
  return () => {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.novelSettingsWorld.findUnique = originalWorldFindUnique;
    prisma.chapter.findMany = originalChapterFindMany;
  };
}

test("pinnedStyle 命中可选风格时直接采用，不再按剧情判定", async () => {
  const restore = mockEraStyleChain();
  try {
    let judgeCalled = false;
    const context = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "现代都市",
      scriptJudge: { target: "叶竹 · 初始状态 状态图", scriptExcerpt: "大学宿舍的日常清晨" },
      judgeFn: async () => {
        judgeCalled = true;
        return null;
      },
    });
    assert.equal(context.specific?.label, "现代都市");
    assert.equal(judgeCalled, false);

    // 自定义风格名同样可被状态选中。
    const customContext = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "末世爆发后",
    });
    assert.equal(customContext.specific?.label, "末世爆发后");
  } finally {
    restore();
  }
});

test("pinnedStyle 悬空引用（风格已删）时回落常规链，不阻断生成", async () => {
  const restore = mockEraStyleChain();
  try {
    const context = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "已被删除的风格",
      scriptJudge: { target: "叶竹 · 初始状态 状态图", scriptExcerpt: "城市已成废墟" },
      judgeFn: async () => null,
    });
    assert.equal(context.specific?.label, "末世废土");
  } finally {
    restore();
  }
});

test("pinnedMissFallbackStyle：悬空引用固定回落兜底风格，不再看脚本标记/小说默认", async () => {
  // 状态图（2026-08-22 用户要求彻底隔离）：设定处的时代风格（脚本【画风】标记、小说默认）
  // 不影响状态图——eraStyle 悬空时直接回落调用方给的兜底（内置现代都市）。
  const restore = mockEraStyleChain();
  try {
    const context = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "已被删除的风格",
      pinnedMissFallbackStyle: "现代都市",
      scriptJudge: { target: "叶竹 · 初始状态 状态图", scriptExcerpt: "城市已成废墟" },
      judgeFn: async () => null,
    });
    assert.equal(context.specific?.label, "现代都市");
  } finally {
    restore();
  }
});
