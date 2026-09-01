const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");
const { MODEL_LIBRARY_VISIBILITY_KEY_PREFIX } = require("../dist/modules/model-library/application/ModelLibraryVisibilityService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function request(port, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  return { status: response.status, body: await response.json() };
}

test("模型库可见性路由提供读取、隐藏和恢复，并拒绝非法模型 ID", async () => {
  const originals = {
    findMany: prisma.appSetting.findMany,
    upsert: prisma.appSetting.upsert,
    deleteMany: prisma.appSetting.deleteMany,
  };
  const keys = new Set();
  prisma.appSetting.findMany = async () => [...keys].sort().map((key) => ({ key }));
  prisma.appSetting.upsert = async (args) => {
    keys.add(args.where.key);
    return { key: args.where.key, value: "hidden" };
  };
  prisma.appSetting.deleteMany = async (args) => ({ count: keys.delete(args.where.key) ? 1 : 0 });

  const server = http.createServer(createApp());
  const port = await listen(server);
  try {
    assert.deepEqual(await request(port, "/api/model-library/visibility"), {
      status: 200,
      body: { success: true, data: { hiddenModelIds: [] }, message: "模型库可见性已加载。" },
    });

    const hidden = await request(port, "/api/model-library/chair-01/hide", { method: "POST" });
    assert.equal(hidden.status, 200);
    assert.deepEqual(hidden.body.data, { modelId: "chair-01", hidden: true });
    assert.equal(keys.has(`${MODEL_LIBRARY_VISIBILITY_KEY_PREFIX}chair-01`), true);

    const listed = await request(port, "/api/model-library/visibility");
    assert.deepEqual(listed.body.data.hiddenModelIds, ["chair-01"]);

    const invalid = await request(port, "/api/model-library/invalid%2Fid/hide", { method: "POST" });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.success, false);

    const restored = await request(port, "/api/model-library/chair-01/hide", { method: "DELETE" });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.data, { modelId: "chair-01", hidden: false });
    assert.equal(keys.size, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    prisma.appSetting.findMany = originals.findMany;
    prisma.appSetting.upsert = originals.upsert;
    prisma.appSetting.deleteMany = originals.deleteMany;
  }
});
