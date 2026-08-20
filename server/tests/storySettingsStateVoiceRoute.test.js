const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routeSource = fs.readFileSync(
  path.join(__dirname, "../src/modules/novel/story-settings/http/storySettingsRoutes.ts"),
  "utf8",
);

test("角色状态音色路由固定使用角色状态资源并允许两种模式", () => {
  assert.match(routeSource, /characters\/:characterId\/states\/:stateId\/generate-voice/);
  assert.match(routeSource, /storyAssetStateVoiceService\.generateStateVoice/);
  assert.match(routeSource, /z\.enum\(\["reuse_previous", "generate_new"\]\)/);
});

test("角色状态保存契约保留 voice 字段，避免编辑角色时丢失试听", () => {
  assert.match(routeSource, /const assetStateVoiceSchema = z\.object/);
  assert.match(routeSource, /voice: assetStateVoiceSchema\.optional\(\)/);
});
