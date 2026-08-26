const assert = require("node:assert/strict");
const test = require("node:test");

test("分镜按当前角色状态优先使用人工身高", () => {
  const service = require("../dist/services/drama/visual/CharacterHeightProfileService.js");
  const profile = {
    schemaVersion: 1,
    heightMeters: 1.92,
    confidence: 0.86,
    rationale: "AI",
    source: "ai",
    inputFingerprint: "sha256:character",
    generatedAt: "2026-08-26T00:00:00.000Z",
  };

  assert.deepEqual(
    service.resolveCharacterHeightForState({ heightMeters: 1.75 }, profile),
    { heightMeters: 1.75, heightSource: "manual" },
  );
  assert.deepEqual(
    service.resolveCharacterHeightForState({}, profile),
    { heightMeters: 1.92, heightSource: "ai", heightConfidence: 0.86 },
  );
  assert.deepEqual(
    service.resolveCharacterHeightForState({}, null),
    { heightMeters: 1.8, heightSource: "legacy" },
  );
});

test("blocking actor把当前状态身高传给3D比例计算", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src/services/drama/visual/DramaShotBlockingSketchService.ts"),
    "utf8",
  );
  assert.match(source, /resolveCharacterHeightForState/);
  assert.match(source, /activeState/);
});
