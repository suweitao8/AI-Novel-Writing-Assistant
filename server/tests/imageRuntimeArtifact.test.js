const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, "..", "src", relativePath), "utf8");

test("图片运行时提供不可变制品生命周期钩子", () => {
  const types = read("services/image/runtime/types.ts");
  const runner = read("services/image/runtime/runner.ts");
  assert.match(types, /beginArtifact/);
  assert.match(types, /commit/);
  assert.match(types, /abort/);
  assert.match(runner, /beginArtifact/);
  assert.match(runner, /artifactSession|artifact/);
  assert.ok(runner.indexOf("beginArtifact") < runner.indexOf("await adapter.saveState(generatingState)"));
  assert.match(runner, /generatingStateSaved/);
  assert.match(runner, /renewalTimer|renew/);
});

test("不可变制品写入使用独占临时文件，旧适配器仍可覆盖固定路径", () => {
  const utils = read("services/image/runtime/utils.ts");
  const runner = read("services/image/runtime/runner.ts");
  assert.match(utils, /exclusive|flag:\s*["']wx["']/i);
  assert.match(runner, /writeImageBytes\([^\n]*exclusive|exclusive[\s\S]*writeImageBytes/);
});
