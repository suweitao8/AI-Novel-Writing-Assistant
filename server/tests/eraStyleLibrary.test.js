const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 全局时代画风库（eraStyleLibrary，2026-08-22 用户要求：时代画风从每本书的设定移到
// 全局统一管理——内置预设 + 全局自定义，小说/漫剧项目只引用名字）。
// 存储形状、内置重名拒绝、路由注册与 visual-styles 合并的契约锁定。

const {
  DRAMA_ERA_STYLE_SETTING_KEY,
  normalizeDramaEraStyleLibrary,
  parseDramaEraStylePayload,
  getDramaEraStyleCustoms,
  saveDramaEraStyleLibrary,
} = require("../dist/services/drama/visual/eraStyleLibrary.js");
const { resolveDramaArtStyleContext } = require("../dist/services/drama/visual/dramaArtStyleResolver.js");
const { prisma } = require("../dist/db/prisma.js");

const dramaRoutesSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/drama/http/dramaRoutes.ts"),
  "utf8",
);
const resolverSource = fs.readFileSync(
  path.join(__dirname, "../src/services/drama/visual/dramaArtStyleResolver.ts"),
  "utf8",
);

test("解析损坏负载回落为空清单；正常清单去空白与截断", () => {
  assert.deepEqual(parseDramaEraStylePayload("损坏"), []);
  assert.deepEqual(parseDramaEraStylePayload(null), []);
  assert.deepEqual(parseDramaEraStylePayload(JSON.stringify([{ label: "末世爆发后", prompt: "城市废墟" }])), [
    { label: "末世爆发后", prompt: "城市废墟" },
  ]);
  // 空 label / 空 prompt 的条目丢弃，不进入匹配命名空间。
  assert.deepEqual(parseDramaEraStylePayload(JSON.stringify([{ label: "", prompt: "x" }, { label: "y" }, 42])), []);
});

test("保存整份清单：去重、限量、拒绝与内置时代画风重名", () => {
  assert.deepEqual(
    normalizeDramaEraStyleLibrary([
      { label: " 末世爆发后 ", prompt: " 城市废墟 " },
      { label: "末世爆发后", prompt: "重复条目" },
      { label: "没有提示词", prompt: "  " },
    ]),
    [{ label: "末世爆发后", prompt: "城市废墟" }],
  );
  // 内置预设的 label 与 id 都不能被自定义占用。
  assert.throws(() => normalizeDramaEraStyleLibrary([{ label: "现代都市", prompt: "x" }]), /内置时代画风/);
  assert.throws(() => normalizeDramaEraStyleLibrary([{ label: "realistic", prompt: "x" }]), /内置时代画风/);
});

test("get/save 走 AppSetting drama.eraStyles（全量替换语义）", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalUpsert = prisma.appSetting.upsert;
  let storedValue = null;
  try {
    prisma.appSetting.findUnique = async ({ where }) => {
      assert.equal(where.key, DRAMA_ERA_STYLE_SETTING_KEY);
      return storedValue ? { key: where.key, value: storedValue } : null;
    };
    prisma.appSetting.upsert = async ({ where, create, update }) => {
      assert.equal(where.key, DRAMA_ERA_STYLE_SETTING_KEY);
      storedValue = update.value;
      return { key: where.key, value: storedValue };
    };

    assert.deepEqual(await getDramaEraStyleCustoms(), []);
    const saved = await saveDramaEraStyleLibrary([{ label: "末世爆发后", prompt: "城市废墟" }]);
    assert.deepEqual(saved, [{ label: "末世爆发后", prompt: "城市废墟" }]);
    assert.deepEqual(await getDramaEraStyleCustoms(), saved);
    // 再保存一份不同清单 = 全量替换。
    await saveDramaEraStyleLibrary([]);
    assert.deepEqual(await getDramaEraStyleCustoms(), []);
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.appSetting.upsert = originalUpsert;
  }
});

test("解析器匹配清单 = 全局自定义 + 旧的书内自定义（同名时全局优先）", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalWorldFindUnique = prisma.novelSettingsWorld.findUnique;
  const originalChapterFindMany = prisma.chapter.findMany;
  try {
    prisma.appSetting.findUnique = async ({ where }) => {
      if (where.key === DRAMA_ERA_STYLE_SETTING_KEY) {
        return {
          key: where.key,
          value: JSON.stringify([
            { label: "末世爆发后", prompt: "全局版：城市废墟" },
            { label: "全局独有", prompt: "雾气浓重" },
          ]),
        };
      }
      return null;
    };
    prisma.novelSettingsWorld.findUnique = async () => ({
      artStylesJson: JSON.stringify([
        { label: "末世爆发后", prompt: "旧书内版" },
        { label: "书内遗留", prompt: "植物疯长" },
      ]),
      defaultArtStyle: null,
    });
    prisma.chapter.findMany = async () => [];

    // 全局自定义可直接被状态图选中。
    const globalContext = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "全局独有",
    });
    assert.equal(globalContext.specific?.label, "全局独有");
    assert.equal(globalContext.specific?.styleInstructions, "雾气浓重");

    // 同名冲突：全局版覆盖旧书内版。
    const conflictContext = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "末世爆发后",
    });
    assert.equal(conflictContext.specific?.styleInstructions, "全局版：城市废墟");

    // 旧书内自定义（管理入口已移除）保留只读兼容，仍可被引用匹配。
    const legacyContext = await resolveDramaArtStyleContext({
      sourceRef: "novel-1",
      pinnedStyle: "书内遗留",
    });
    assert.equal(legacyContext.specific?.styleInstructions, "植物疯长");
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.novelSettingsWorld.findUnique = originalWorldFindUnique;
    prisma.chapter.findMany = originalChapterFindMany;
  }
});

test("路由契约：/drama/era-styles GET+PUT 注册，visual-styles 合并全局自定义", () => {
  assert.match(dramaRoutesSource, /router\.get\("\/era-styles"/);
  assert.match(dramaRoutesSource, /router\.put\("\/era-styles"/);
  assert.match(dramaRoutesSource, /saveDramaEraStyleLibrary/);
  // GET /visual-styles 并入全局自定义（id=label、styleFamily=custom），全部下拉共用这一个来源。
  assert.match(dramaRoutesSource, /router\.get\("\/visual-styles", async/);
  assert.match(dramaRoutesSource, /styleFamily: "custom" as const/);
  // 项目画风校验放行全局自定义风格名（不只内置预设 id）。
  assert.match(dramaRoutesSource, /customs\.some\(\(style\) => style\.label === normalized\)/);
  // 解析器从全局库读自定义（loadEraStyleRecord 合并旧书内数据）。
  assert.match(resolverSource, /getDramaEraStyleCustoms/);
  assert.match(resolverSource, /loadEraStyleRecord/);
});
