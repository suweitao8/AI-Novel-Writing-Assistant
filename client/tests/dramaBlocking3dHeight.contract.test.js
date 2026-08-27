import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const scale = await import("../src/pages/drama/comicDrama/components/blocking3d/blocking3dScale.ts");
const viewerSource = [
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts",
].map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join(String.fromCharCode(10));
const pageSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);

test("带身高元数据的布局按当前角色高度等比迁移，旧布局保持原始缩放", () => {
  assert.deepEqual(scale.scaleSavedActorForCurrentHeight([1, 1, 1], 1.8, 0.9), [0.5, 0.5, 0.5]);
  assert.deepEqual(scale.scaleSavedActorForCurrentHeight([1, 1, 1], undefined, 0.9), [1, 1, 1]);
  assert.equal(scale.heightToBlocking3dScale(1.8287), 1);
});

test("3D blocking 身高支持 0.50 到 10.00 米并保持 5 米怪物比例", () => {
  assert.equal(scale.BLOCKING_3D_HEIGHT_MIN_METERS, 0.5);
  assert.equal(scale.BLOCKING_3D_HEIGHT_MAX_METERS, 10);
  assert.equal(scale.normalizeBlocking3dHeight(5), 5);
  assert.equal(scale.normalizeBlocking3dHeight(0.1), 0.5);
  assert.equal(scale.normalizeBlocking3dHeight(20), 10);
});

test("viewer 与 blocking 页面传递并保存角色身高基准", () => {
  assert.match(viewerSource, /heightMeters/);
  assert.match(viewerSource, /scaleSavedActorForCurrentHeight/);
  assert.match(viewerSource, /heightMeters: actor\.heightMeters/);
  assert.match(pageSource, /addActor\(actor\.characterName, index, actor\.heightMeters\)/);
});

test("3D 草图不提供角色大小调整入口并显示角色身高", () => {
  assert.doesNotMatch(viewerSource, /scaleSelected/);
  assert.doesNotMatch(pageSource, /scaleSelected/);
  assert.doesNotMatch(pageSource, /aria-label="缩小角色"/);
  assert.doesNotMatch(pageSource, /aria-label="放大角色"/);
  assert.doesNotMatch(pageSource, /<dt>缩放<\/dt>/);
  assert.match(pageSource, /heightMeters[\s\S]{0,160}toFixed\(1\)/);
});
