const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (relativePath) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("场景资产和分镜接口统一接受 5 到 30 的半球直径", () => {
  const storySettingsRoutes = read("src/modules/novel/story-settings/http/storySettingsRoutes.ts");
  const dramaRoutes = read("src/modules/drama/http/dramaRoutes.ts");

  assert.equal((storySettingsRoutes.match(/domeRadius: z\.number\(\)\.min\(5\)\.max\(30\)/g) ?? []).length, 3);
  assert.match(dramaRoutes, /domeRadius: z\.number\(\)\.min\(5\)\.max\(30\)/);
});
