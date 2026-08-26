const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { sceneState3dMarkersPrompt } = require("../dist/prompting/prompts/drama/sceneState3dMarkers.prompts.js");
const registrySource = fs.readFileSync(
  path.join(__dirname, "../src/prompting/registry/promptAssetLoaderEntries.ts"),
  "utf8",
);

const marker = {
  kind: "bed",
  label: "靠墙双人床",
  anchor: "floor",
  position: [1.2, 0.45, 2.4],
  size: [2.2, 0.9, 2],
  yawDeg: 0,
  confidence: 0.9,
  imageRegion: { x: 0.2, y: 0.35, width: 0.2, height: 0.18 },
  evidence: "靠墙的床面和床头结构",
};

test("场景空间标记 Prompt 是已注册的多模态结构化资产", () => {
  assert.equal(sceneState3dMarkersPrompt.id, "drama.scene.state.3d_markers");
  assert.equal(sceneState3dMarkersPrompt.version, "v4");
  assert.match(registrySource, /drama\.scene\.state\.3d_markers@v4/);
  assert.equal(sceneState3dMarkersPrompt.mode, "structured");
  const output = sceneState3dMarkersPrompt.outputSchema.parse({
    markers: [marker],
    analysisNote: "识别到室内主要固定家具。",
  });
  assert.equal(output.markers[0].kind, "bed");
  assert.equal(output.markers[0].position[2], 2.4);
});
test("场景空间标记 Prompt 发送全景图，并要求只识别固定空间物体", () => {
  const messages = sceneState3dMarkersPrompt.render({
    sceneName: "叶城大学宿舍",
    stateLabel: "默认",
    sceneType: "interior",
    environmentJson: JSON.stringify({ projectionCenterHeight: 2, domeRadius: 15 }),
    imageBase64: "aGVsbG8=",
    mimeType: "image/png",
  });
  const text = messages.map((message) => String(message.content)).join("\n");
  assert.match(text, /床|桌|椅/);
  assert.match(text, /固定空间物体|家具/);
  assert.match(text, /不要.*人物|不得.*人物/);
  assert.match(text, /imageRegion/);
  assert.match(text, /紧贴|主体/);
  assert.match(text, /不.*墙面.*深度|不.*深度/);
  assert.match(text, /v=0\.5/);
  assert.match(text, /v=0\.48–0\.52/);
  assert.match(text, /不得.*跨越|不能.*跨越/);
  assert.match(text, /家具|床|桌|椅/);
  assert.equal(messages.at(-1)?.content?.[1]?.type, "image_url");
});

test("场景空间标记 Prompt 不接受缺少图像证据区域的 marker", () => {
  assert.throws(() => sceneState3dMarkersPrompt.outputSchema.parse({
    markers: [{ ...marker, imageRegion: undefined }],
    analysisNote: "缺少证据区域",
  }));
});
