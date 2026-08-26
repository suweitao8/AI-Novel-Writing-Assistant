const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");
const {
  StoryAssetImageGenerationLock,
  buildStoryAssetImageTargetKey,
} = require("../dist/modules/novel/story-settings/application/StoryAssetImageGenerationLock.js");

test("目标锁键包含项目、资产类型、资产和状态", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetImageGenerationLock.ts");
  assert.match(source, /novelId/);
  assert.match(source, /kind/);
  assert.match(source, /assetId/);
  assert.match(source, /stateId/);
  assert.match(source, /activeLockKey/);
  assert.match(source, /leaseExpiresAt/);
});

test("目标锁需要处理同目标冲突、过期 lease 和释放", () => {
  const source = read("modules/novel/story-settings/application/StoryAssetImageGenerationLock.ts");
  assert.match(source, /status:\s*["']orphaned["']/);
  assert.match(source, /status:\s*["']staging["']/);
  assert.match(source, /updateMany/);
  assert.match(source, /create/);
  assert.match(source, /release|commit/i);
});

test("目标锁键对分隔符保持无歧义", () => {
  const left = buildStoryAssetImageTargetKey({
    novelId: "n1",
    kind: "character",
    assetId: "asset:one",
    stateId: "state",
  });
  const right = buildStoryAssetImageTargetKey({
    novelId: "n1",
    kind: "character",
    assetId: "asset",
    stateId: "one:state",
  });
  assert.notEqual(left, right);
});

test("同一目标只能有一个 lease，不同资产的 initial 可以并行", async () => {
  const records = [];
  const db = {
    storyAssetImageArtifact: {
      findFirst: async ({ where }) => records.find((record) => record.activeLockKey === where.activeLockKey) ?? null,
      updateMany: async ({ where, data }) => {
        const record = records.find((item) => item.id === where.id
          && item.activeLockKey === where.activeLockKey
          && (!where.status || item.status === where.status)
          && (!where.leaseExpiresAt
            || (where.leaseExpiresAt.lte && item.leaseExpiresAt <= where.leaseExpiresAt.lte)
            || (where.leaseExpiresAt.gt && item.leaseExpiresAt > where.leaseExpiresAt.gt)));
        if (!record) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      },
      create: async ({ data }) => {
        if (records.some((record) => record.activeLockKey === data.activeLockKey)) {
          throw new Error("unique activeLockKey");
        }
        const record = {
          ...data,
          activeLockKey: data.activeLockKey ?? null,
          leaseExpiresAt: data.leaseExpiresAt ?? null,
          updatedAt: new Date(),
        };
        records.push(record);
        return record;
      },
    },
  };
  const now = new Date("2026-08-23T10:00:00.000Z");
  const lock = new StoryAssetImageGenerationLock({ db, now: () => now, leaseMs: 60_000 });
  const first = await lock.acquire({ novelId: "n1", kind: "character", assetId: "a1", stateId: "initial" });
  await assert.rejects(
    () => lock.acquire({ novelId: "n1", kind: "character", assetId: "a1", stateId: "initial" }),
    /正在生成|占用/,
  );
  const secondAsset = await lock.acquire({ novelId: "n1", kind: "character", assetId: "a2", stateId: "initial" });
  assert.notEqual(first.artifact.id, secondAsset.artifact.id);
  const renewed = await first.renew();
  assert.equal(renewed.toISOString(), "2026-08-23T10:01:00.000Z");
  await first.release();
  await secondAsset.release();
});

test("只返回仍在有效租约内的 staging 状态图目标，供列表投影生成中", async () => {
  const now = new Date("2026-08-26T08:50:00.000Z");
  const records = [
    {
      assetId: "scene-active",
      stateId: "initial",
      novelId: "n1",
      kind: "scene",
      status: "staging",
      activeLockKey: "active",
      leaseExpiresAt: new Date("2026-08-26T08:55:00.000Z"),
    },
    {
      assetId: "scene-expired",
      stateId: "initial",
      novelId: "n1",
      kind: "scene",
      status: "staging",
      activeLockKey: "expired",
      leaseExpiresAt: new Date("2026-08-26T08:45:00.000Z"),
    },
    {
      assetId: "scene-committed",
      stateId: "initial",
      novelId: "n1",
      kind: "scene",
      status: "committed",
      activeLockKey: null,
      leaseExpiresAt: null,
    },
  ];
  const db = {
    storyAssetImageArtifact: {
      findMany: async () => records.filter((record) => record.status === "staging"
        && record.activeLockKey
        && record.leaseExpiresAt > now),
    },
  };
  const lock = new StoryAssetImageGenerationLock({ db, now: () => now, leaseMs: 60_000 });

  assert.deepEqual(
    await lock.listActiveTargets("n1", "scene"),
    [{ assetId: "scene-active", stateId: "initial" }],
  );
});
