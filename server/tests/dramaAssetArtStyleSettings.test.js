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
const { prisma } = require("../dist/db/prisma.js");

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
