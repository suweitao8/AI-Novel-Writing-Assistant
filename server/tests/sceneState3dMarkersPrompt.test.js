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
  approxDistanceMeters: 3,
  evidence: "靠墙的床面和床头结构",
};

test("场景空间标记 Prompt 是已注册的多模态结构化资产", () => {
  assert.equal(sceneState3dMarkersPrompt.id, "drama.scene.state.3d_markers");
  assert.equal(sceneState3dMarkersPrompt.version, "v10");
  assert.match(registrySource, /drama\.scene\.state\.3d_markers@v10/);
  assert.equal(sceneState3dMarkersPrompt.mode, "structured");
  const output = sceneState3dMarkersPrompt.outputSchema.parse({
    markers: [marker],
    analysisNote: "识别到室内主要固定家具。",
  });
  assert.equal(output.markers[0].kind, "bed");
  assert.equal(
    sceneState3dMarkersPrompt.outputSchema.safeParse({
      markers: [{ ...marker, kind: "floor" }],
    }).success,
    false,
    "可行走地面不是视觉模型的输出类别",
  );
  assert.equal(
    sceneState3dMarkersPrompt.outputSchema.safeParse({
      markers: [{ ...marker, approxDistanceMeters: undefined }],
    }).success,
    false,
    "粗估距离是必填字段，用于同方位物体的前后排序",
  );
  assert.equal(output.markers[0].position[2], 2.4);
});
test("场景空间标记 Prompt 发送全景图，并要求只识别固定空间物体", () => {
  const messages = sceneState3dMarkersPrompt.render({
    sceneName: "叶城大学宿舍",
    stateLabel: "默认",
    sceneType: "interior",
    environmentJson: JSON.stringify({ projectionCenterHeight: 2, domeRadius: 15, panoramaHorizonV: 0.58 }),
    imageBase64: "aGVsbG8=",
    mimeType: "image/png",
  });
  const text = messages.map((message) => String(message.content)).join("\n");
  assert.match(text, /床|桌|椅/);
  assert.match(text, /固定空间物体|家具/);
  assert.match(text, /不要.*人物|不得.*人物/);
  assert.match(text, /imageRegion/);
  assert.match(text, /紧贴|主体/);
  // v10：高度一律是使用高度——椅子算座面、床算床垫面，靠背不计入 size.y。
  assert.match(text, /「使用高度」/);
  assert.match(text, /椅子只算座面到地面的高度/);
  assert.match(text, /不含床头板和靠背|靠背、扶手、床头板的高度计入 size\.y/);
  assert.match(text, /钳制在使用面范围/);
  // v9：穷尽式覆盖 + 同方位前后排序字段。
  assert.match(text, /穷尽式覆盖/);
  assert.match(text, /宁可多标不可漏标/);
  assert.match(text, /approxDistanceMeters/);
  assert.match(text, /前后顺序/);
  assert.match(text, /完整覆盖物体的可见主体/);
  // v8：服务端不再做图像测距，标记长方体统一贴到半球内表面，门窗完整贴住球面。
  assert.match(text, /贴到全景半球内表面/);
  assert.match(text, /门窗完全贴住球面/);
  assert.doesNotMatch(text, /反算物体深度/);
  // v7：全图覆盖召回——上下半区都要检查，不能只标某一高度带。
  assert.match(text, /上下两半都要逐一检查/);
  assert.match(text, /从左到右.*分段扫描/);
  assert.match(JSON.stringify(messages), /panoramaHorizonV.*0\.58/);
  assert.doesNotMatch(text, /安全带|不得跨越|不能跨越/);
  assert.match(text, /不要输出地面、地板、可行走范围或房间轮廓类的标记/);
  assert.equal(messages.at(-1)?.content?.[1]?.type, "image_url");
});

test("同名实例经后处理补序号而不是丢弃", () => {
  const output = sceneState3dMarkersPrompt.postValidate({
    markers: [
      { ...marker },
      { ...marker },
      { ...marker },
    ],
  });
  assert.deepEqual(output.markers.map((item) => item.label), ["靠墙双人床", "靠墙双人床2", "靠墙双人床3"]);
});

test("场景空间标记 Prompt 不接受缺少图像证据区域的 marker", () => {
  assert.throws(() => sceneState3dMarkersPrompt.outputSchema.parse({
    markers: [{ ...marker, imageRegion: undefined }],
    analysisNote: "缺少证据区域",
  }));
});
