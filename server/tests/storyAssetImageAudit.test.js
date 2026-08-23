const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");
const readRoot = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
const { buildStoryAssetImageAuditReport } = require("../dist/modules/novel/story-settings/application/StoryAssetImageAudit.js");

test("legacy 审计默认 dry-run，备份校验和歧义保护必须存在", () => {
  const source = readSource("modules/novel/story-settings/application/StoryAssetImageAudit.ts");
  assert.match(source, /dryRun|dry-run/i);
  assert.match(source, /backup/i);
  assert.match(source, /ambiguous|歧义/i);
  assert.match(source, /mtime|generatedAt/i);
  assert.match(source, /copyFile|migrate/i);
});

test("legacy 审计输出迁移、歧义和缺失三类动作", () => {
  const source = readSource("modules/novel/story-settings/application/StoryAssetImageAudit.ts");
  assert.match(source, /migrate/);
  assert.match(source, /ambiguous/);
  assert.match(source, /missing/);
  assert.match(source, /stateId/);
});

test("CLI 默认不 apply，apply 必须带 DB 和 storage backup", () => {
  const source = readRoot("scripts/audit-story-asset-images.cjs");
  assert.match(source, /--apply/);
  assert.match(source, /--backup-db/);
  assert.match(source, /--backup-storage/);
  assert.match(source, /dry-run|dryRun/i);
  assert.match(source, /migrationGenerationId/);
  assert.match(source, /migrationArtifactId/);
  assert.match(source, /storageKey/);
  assert.match(source, /EEXIST/);
});

test("同名 initial 只有时间证据唯一匹配时才迁移，其余资产保持 ambiguous", () => {
  const generatedAt = "2026-08-23T09:52:38.685Z";
  const report = buildStoryAssetImageAuditReport({
    now: new Date("2026-08-23T10:00:00.000Z"),
    assets: [
      { novelId: "n1", kind: "character", assetId: "ye-zhu", stateId: "initial", imageStatus: "done", generatedAt: "2026-08-22T19:18:06.509Z" },
      { novelId: "n1", kind: "character", assetId: "bloodhorn", stateId: "initial", imageStatus: "done", generatedAt },
    ],
    legacyFiles: [{
      stateId: "initial",
      filePath: "legacy/initial/image.png",
      extension: "png",
      mimeType: "image/png",
      mtimeMs: Date.parse(generatedAt),
      byteSize: 10,
      sha256: "hash",
    }],
  });
  const bloodhorn = report.actions.find((item) => item.asset.assetId === "bloodhorn");
  const yeZhu = report.actions.find((item) => item.asset.assetId === "ye-zhu");
  assert.equal(bloodhorn.action, "migrate");
  assert.equal(yeZhu.action, "ambiguous");
});

test("只有一个资产也不能凭 stateId 单独迁移 legacy 文件，损坏指针单独报告", () => {
  const report = buildStoryAssetImageAuditReport({
    assets: [
      { novelId: "n1", kind: "character", assetId: "only", stateId: "initial", imageStatus: "done", generatedAt: "2026-08-20T00:00:00.000Z" },
      { novelId: "n1", kind: "character", assetId: "broken", stateId: "ready", imageStatus: "done", artifactId: "artifact-broken", artifactValid: false },
    ],
    legacyFiles: [{
      stateId: "initial",
      filePath: "legacy/initial/image.png",
      extension: "png",
      mimeType: "image/png",
      mtimeMs: Date.parse("2026-08-23T00:00:00.000Z"),
      byteSize: 10,
      sha256: "hash",
    }],
  });
  assert.equal(report.actions.find((item) => item.asset.assetId === "only").action, "ambiguous");
  assert.equal(report.actions.find((item) => item.asset.assetId === "broken").action, "corrupt");
});
