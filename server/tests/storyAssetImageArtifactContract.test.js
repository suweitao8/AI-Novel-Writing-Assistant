const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(repo, relativePath), "utf8");

test("故事资产状态图片支持当前制品指针", () => {
  const types = read("shared/types/novelReferenceExtraction.ts");
  assert.match(types, /interface StoryAssetStateImage[\s\S]*?artifactId\?:\s*string/);
  assert.match(types, /isStoryAssetStateImageRecord[\s\S]*?isNullableString\(value\.artifactId\)/);
});

for (const schemaPath of ["server/src/prisma/schema.prisma", "server/src/prisma/schema.sqlite.prisma"]) {
  test(`${schemaPath} declares immutable story asset image artifacts`, () => {
    const schema = read(schemaPath);
    assert.match(schema, /storyAssetImageArtifacts\s+StoryAssetImageArtifact\[\]/);
    assert.match(schema, /model StoryAssetImageArtifact\s*\{/);
    assert.match(schema, /storageKey\s+String\s+@unique/);
    assert.match(schema, /activeLockKey\s+String\?\s+@unique/);
    assert.match(schema, /@@index\(\[novelId, kind, assetId, stateId\]\)/);
  });
}

for (const migrationRoot of ["server/src/prisma/migrations", "server/src/prisma/migrations.sqlite"]) {
  test(`${migrationRoot} has a non-destructive artifact migration`, () => {
    const migrationDirs = fs.readdirSync(path.join(repo, migrationRoot));
    const migrationDir = migrationDirs.find((entry) => entry.includes("story_asset_image_artifacts"));
    assert.ok(migrationDir, `missing story_asset_image_artifacts migration in ${migrationRoot}`);
    const sql = read(path.join(migrationRoot, migrationDir, "migration.sql"));
    assert.match(sql, /CREATE TABLE[\s\S]*StoryAssetImageArtifact/);
    assert.match(sql, /storageKey/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/i);
  });
}
