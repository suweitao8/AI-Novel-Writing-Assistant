const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("系统设置路由暴露旁白读取、描述保存和试听生成入口", () => {
  const routes = fs.readFileSync(path.join(__dirname, "..", "src/modules/settings/http/settingsRoutes.ts"), "utf8");
  assert.match(routes, /router\.get\("\/narrator-voice"/);
  assert.match(routes, /router\.patch\(\s*"\/narrator-voice"/);
  assert.match(routes, /router\.post\(\s*"\/narrator-voice\/design"/);
  assert.match(routes, /globalNarratorVoiceSettingsService/);
});
