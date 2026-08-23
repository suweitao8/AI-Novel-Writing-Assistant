const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("旧项目旁白样本导入工具只接受显式音频路径并写入全局设置", () => {
  const scriptPath = path.join(__dirname, "..", "scripts", "import-drama-narrator-voice.cjs");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /--source/);
  assert.match(source, /readFileSync/);
  assert.match(source, /base64/);
  assert.match(source, /createHash\(["']sha256["']\)/);
  assert.match(source, /drama\.globalNarratorVoice/);
  assert.match(source, /AppSetting/);
  assert.doesNotMatch(source, /D:\\Github\\storybook/);
});
