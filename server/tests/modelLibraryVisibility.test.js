const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MODEL_LIBRARY_VISIBILITY_KEY_PREFIX,
  ModelLibraryVisibilityService,
} = require("../dist/modules/model-library/application/ModelLibraryVisibilityService.js");

function createStore(initialKeys = []) {
  const records = new Set(initialKeys);
  const calls = { findMany: [], upsert: [], deleteMany: [] };
  return {
    records,
    calls,
    findMany: async (args) => {
      calls.findMany.push(args);
      return [...records].sort().map((key) => ({ key, value: "hidden" }));
    },
    upsert: async (args) => {
      calls.upsert.push(args);
      records.add(args.where.key);
      return { key: args.where.key, value: args.create.value };
    },
    deleteMany: async (args) => {
      calls.deleteMany.push(args);
      const deleted = records.delete(args.where.key);
      return { count: deleted ? 1 : 0 };
    },
  };
}

test("模型可见性按模型 ID 独立保存，读取不会合并覆盖其他条目", async () => {
  const store = createStore([
    `${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}chair-01`,
    `${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}table-modern`,
    "unrelated-setting",
  ]);
  const service = new ModelLibraryVisibilityService(store);

  assert.deepEqual(await service.listHiddenModelIds(), ["chair-01", "table-modern"]);
  await service.hideModel("lamp-01");
  await service.hideModel("chair-01");

  assert.equal(store.records.has(`${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}lamp-01`), true);
  assert.equal(store.records.has(`${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}chair-01`), true);
  assert.equal(store.calls.upsert.length, 2);
  assert.deepEqual(store.calls.upsert[0], {
    where: { key: `${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}lamp-01` },
    update: { value: "hidden" },
    create: { key: `${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}lamp-01`, value: "hidden" },
  });
});

test("隐藏和恢复是幂等操作，恢复只删除目标模型的状态", async () => {
  const store = createStore([`${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}chair-01`]);
  const service = new ModelLibraryVisibilityService(store);

  assert.deepEqual(await service.restoreModel("missing-model"), { modelId: "missing-model", hidden: false });
  assert.deepEqual(await service.restoreModel("chair-01"), { modelId: "chair-01", hidden: false });
  assert.deepEqual(await service.restoreModel("chair-01"), { modelId: "chair-01", hidden: false });
  assert.equal(store.records.has(`${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}chair-01`), false);
  assert.equal(store.calls.deleteMany.length, 3);
});

test("模型可见性服务拒绝路径和超长 ID，不把用户输入当作文件路径", async () => {
  const service = new ModelLibraryVisibilityService(createStore());

  await assert.rejects(() => service.hideModel("../secret.glb"), /模型 ID 不合法/);
  await assert.rejects(() => service.restoreModel("a".repeat(121)), /模型 ID 不合法/);
});
