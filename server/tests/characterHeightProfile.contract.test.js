const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("双 Prisma schema 为两类角色保留身高档案字段", () => {
  for (const file of ["src/prisma/schema.prisma", "src/prisma/schema.sqlite.prisma"]) {
    const source = read(path.join("server", file));
    assert.match(source, /model Character[\s\S]*heightProfileJson\s+String\?/);
    assert.match(source, /model DramaCharacter[\s\S]*heightProfileJson\s+String\?/);
  }
});

test("身高档案迁移只新增两列", () => {
  for (const file of [
    "server/src/prisma/migrations/20260826100000_character_height_profile/migration.sql",
    "server/src/prisma/migrations.sqlite/20260826100000_character_height_profile/migration.sql",
  ]) {
    const source = read(file);
    assert.match(source, /ADD COLUMN ["`]?heightProfileJson["`]? TEXT/i);
    assert.equal((source.match(/ADD COLUMN/gi) ?? []).length, 2);
  }
});

test("身高档案接受 0.50 到 10.00 米边界并支持 5 米怪物", () => {
  const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");
  assert.equal(service.CHARACTER_HEIGHT_MIN_METERS, 0.5);
  assert.equal(service.CHARACTER_HEIGHT_MAX_METERS, 10);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({
    schemaVersion: 1,
    heightMeters: 0.5,
    confidence: 0,
    rationale: "边界",
    source: "ai",
    inputFingerprint: "sha256:a",
    generatedAt: "2026-08-26T00:00:00.000Z",
  })).heightMeters, 0.5);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({
    schemaVersion: 1,
    heightMeters: 5,
    confidence: 1,
    rationale: "怪物身高",
    source: "ai",
    inputFingerprint: "sha256:b",
    generatedAt: "2026-08-26T00:00:00.000Z",
  })).heightMeters, 5);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({
    schemaVersion: 1,
    heightMeters: 10,
    confidence: 1,
    rationale: "边界",
    source: "ai",
    inputFingerprint: "sha256:c",
    generatedAt: "2026-08-26T00:00:00.000Z",
  })).heightMeters, 10);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({ heightMeters: 0.49 })), null);
  assert.equal(service.parseCharacterHeightProfile(JSON.stringify({ heightMeters: 10.01 })), null);
  assert.equal(service.parseCharacterHeightProfile("not-json"), null);
});

test("同一角色输入产生稳定指纹，代理模型按 1.8287 米原生高度换算", () => {
  const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");
  const input = {
    name: "小满",
    role: "学生",
    gender: "female",
    ageGroup: "child",
    physique: "娇小",
    appearance: "",
  };
  assert.equal(
    service.buildCharacterHeightInputFingerprint(input),
    service.buildCharacterHeightInputFingerprint({ ...input }),
  );
  assert.equal(service.heightToProxyScale(1.8287), 1);
  assert.ok(service.heightToProxyScale(0.5) < service.heightToProxyScale(1.8));
});

test("身高估算 Prompt schema 接受 5 米怪物并拒绝范围外输出", () => {
  const prompt = require("../dist/prompting/prompts/novel/characterHeightEstimate.prompts.js").characterHeightEstimatePrompt;
  assert.equal(prompt.outputSchema.parse({
    heightMeters: 5,
    confidence: 0.92,
    rationale: "巨型怪物",
  }).heightMeters, 5);
  assert.throws(() => prompt.outputSchema.parse({
    heightMeters: 10.01,
    confidence: 0.92,
    rationale: "越界",
  }));
});

test("fallback 档案明确标记来源且固定兼容高度", () => {
  const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");
  const profile = service.createFallbackCharacterHeightProfile("sha256:f");
  assert.equal(profile.source, "fallback");
  assert.equal(profile.heightMeters, 1.8);
});

test("设定中心只读投影保留身高摘要而不暴露完整档案", () => {
  const projection = require("../dist/modules/novel/story-settings/application/StorySettingsProjection.js");
  const projected = projection.projectCharacter({
    id: "character-1",
    name: "小满",
    role: "学生",
    gender: "female",
    ageGroup: "child",
    physique: "娇小",
    attireStyle: null,
    facePrompt: null,
    voiceTexture: null,
    personality: "谨慎",
    appearance: "个子很小",
    background: null,
    heightProfileJson: JSON.stringify({
      schemaVersion: 1,
      heightMeters: 0.9,
      confidence: 0.88,
      rationale: "儿童且体型娇小",
      source: "ai",
      inputFingerprint: "sha256:character-1",
      generatedAt: "2026-08-26T00:00:00.000Z",
    }),
    statesJson: null,
    aliasesJson: null,
    updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  }, "novel-1");
  assert.deepEqual(projected.heightProfile, {
    heightMeters: 0.9,
    confidence: 0.88,
    source: "ai",
  });
  assert.equal("rationale" in projected.heightProfile, false);
});

test("身高推断通过 Prompt Registry 注册", () => {
  const registrySource = read("server/src/prompting/registry/promptAssetLoaderEntries.ts");
  const promptSource = read("server/src/prompting/prompts/novel/characterHeightEstimate.prompts.ts");
  assert.match(registrySource, /novel\.character\.heightEstimate@v1/);
  assert.match(registrySource, /characterHeightEstimatePrompt/);
  assert.match(promptSource, /只输出符合 schema 的 JSON/);
  assert.match(promptSource, /年龄段、体型、外貌/);
});
