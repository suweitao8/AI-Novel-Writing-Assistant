import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const scale = await import("../src/pages/drama/comicDrama/components/blocking3d/blocking3dScale.ts");
const viewerSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);

test("带身高元数据的布局按当前角色高度等比迁移，旧布局保持原始缩放", () => {
  assert.deepEqual(scale.scaleSavedActorForCurrentHeight([1, 1, 1], 1.8, 0.9), [0.5, 0.5, 0.5]);
  assert.deepEqual(scale.scaleSavedActorForCurrentHeight([1, 1, 1], undefined, 0.9), [1, 1, 1]);
  assert.equal(scale.heightToBlocking3dScale(1.8287), 1);
});

test("viewer 与 blocking 页面传递并保存角色身高基准", () => {
  assert.match(viewerSource, /heightMeters/);
  assert.match(viewerSource, /scaleSavedActorForCurrentHeight/);
  assert.match(viewerSource, /heightMeters: actor\.heightMeters/);
  assert.match(pageSource, /addActor\(actor\.characterName, index, actor\.heightMeters\)/);
});
