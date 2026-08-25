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
