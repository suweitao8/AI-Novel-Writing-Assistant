const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/modules/drama/http/dramaRoutes.ts"),
  "utf8",
);

test("分镜摆位草图提供读取、保存、上传、确认和图片预览路由", () => {
  assert.match(source, /DramaShotBlockingSketchService/);
  assert.match(source, /projects\/:id\/shots\/:shotId\/blocking-sketch"/);
  assert.match(source, /projects\/:id\/shots\/:shotId\/blocking-sketch\/image"/);
  assert.match(source, /projects\/:id\/shots\/:shotId\/blocking-sketch\/confirm"/);
  assert.match(source, /shot-images\/:shotId\/blocking-sketch"/);
});

test("草图元数据通过 Zod 校验，PNG 图片使用原始请求流上传", () => {
  assert.match(source, /blockingSketchDataSchema/);
  assert.match(source, /blockingSketchSaveSchema/);
  assert.match(source, /for await \(const chunk of req\)/);
  assert.match(source, /uploadSketchPng/);
  assert.match(source, /confirmSketch/);
});

test("草图路由显式校验 PlayCanvas 3D 快照", () => {
  assert.match(source, /blockingSketch3dLayoutSchema/);
  assert.match(source, /layout3d: blockingSketch3dLayoutSchema\.optional\(\)/);
  assert.match(source, /blockingSketch3dPoseSchema/);
});
