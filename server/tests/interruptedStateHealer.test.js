const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  healInterruptedImageGenerationStates,
} = require("../dist/services/image/runtime/interruptedStateHealer.js");
const { prisma } = require("../dist/db/prisma.js");

// 启动自愈覆盖设定中心外观状态图（2026-08-23）：Character/NovelScene/NovelProp 的
// statesJson 是状态数组、每个状态有自己的 image 状态机——生成中服务重载会让状态
// 永远停在 generating，前端一直「生成中」且没有重试入口。

const HEALED_MODELS = [
  "comicCharacter",
  "comicScene",
  "comicPanel",
  "comicCharacterAsset",
  "dramaCharacter",
  "dramaShot",
  "character",
  "novelScene",
  "novelProp",
];

function patchPramaModels(rowsByModel) {
  const originals = new Map();
  const updates = [];
  for (const model of HEALED_MODELS) {
    originals.set(model, { findMany: prisma[model].findMany, update: prisma[model].update });
    prisma[model].findMany = async () => rowsByModel[model] ?? [];
    prisma[model].update = async (args) => {
      updates.push({ model, ...args });
      return {};
    };
  }
  return { originals, updates };
}

function restorePrismaModels(originals) {
  for (const [model, fns] of originals.entries()) {
    prisma[model].findMany = fns.findMany;
    prisma[model].update = fns.update;
  }
}

test("启动自愈把状态数组里卡住的 generating 状态图改写为 error，其余状态原样保留", async () => {
  const stuckRaw = JSON.stringify([
    { id: "state-1", label: "初始形象", image: { status: "generating", provider: "codex", version: 2 } },
    { id: "state-2", label: "受伤", image: { status: "done", url: "/api/novels/n/settings/state-images/state-2" } },
    { id: "state-3", label: "无图状态" },
  ]);
  const { originals, updates } = patchPramaModels({
    character: [{ id: "char-1", statesJson: stuckRaw }],
  });
  try {
    await healInterruptedImageGenerationStates();
  } finally {
    restorePrismaModels(originals);
  }

  const characterUpdates = updates.filter((item) => item.model === "character");
  assert.equal(characterUpdates.length, 1);
  assert.equal(characterUpdates[0].where.id, "char-1");
  const healedStates = JSON.parse(characterUpdates[0].data.statesJson);
  assert.equal(healedStates[0].image.status, "error");
  assert.match(healedStates[0].image.error, /服务重启中断/);
  // 未卡住的状态与无图状态必须逐字段保留（状态图 URL 是分镜参考链的锚点，不能丢）。
  assert.deepEqual(healedStates[1], JSON.parse(stuckRaw)[1]);
  assert.deepEqual(healedStates[2], { id: "state-3", label: "无图状态" });
  // 其他表没有卡住记录时不做任何写回。
  assert.equal(updates.filter((item) => item.model !== "character").length, 0);
});

test("statesJson 解析失败的脏数据不会被自愈改写", async () => {
  const { originals, updates } = patchPramaModels({
    novelProp: [{ id: "prop-1", statesJson: "not-a-json{{{," }],
  });
  try {
    await healInterruptedImageGenerationStates();
  } finally {
    restorePrismaModels(originals);
  }
  assert.equal(updates.length, 0);
});
