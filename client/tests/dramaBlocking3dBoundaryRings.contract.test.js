import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const viewerSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts", import.meta.url),
  "utf8",
);

test("3D 视口常驻绘制半球边缘与舞台余量两条参考圈", () => {
  assert.match(viewerSource, /resolveStoryScene3DDomeWorldRadius/);
  assert.match(viewerSource, /resolveStoryScene3DActorStageRadius/);
  assert.match(viewerSource, /domeBoundaryLines/);
  assert.match(viewerSource, /stageBoundaryLines/);
  assert.match(viewerSource, /rebuildBoundaryRings\(\)/);
});
