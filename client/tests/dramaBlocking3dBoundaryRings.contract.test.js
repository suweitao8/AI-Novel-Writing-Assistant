import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const viewerSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts", import.meta.url),
  "utf8",
);

test("3D 视口常驻绘制半球地面边界与舞台余量两条参考圈", () => {
  assert.match(viewerSource, /resolveStoryScene3DDomeWorldRadius/);
  assert.match(viewerSource, /resolveStoryScene3DActorStageRadius/);
  assert.match(viewerSource, /domeBoundaryLines/);
  assert.match(viewerSource, /stageBoundaryLines/);
  assert.match(viewerSource, /rebuildBoundaryRings\(\)/);
});

test("半球边界圈画在平坦地面外沿，不能落在向上卷起的圆弧上", () => {
  // 地面网格最外 5% 是接回半球的 rim 弧面，参考圈必须乘
  // GROUND_DOME_FLAT_RADIUS 收进平坦区域。
  const geometrySource = readFileSync(
    new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentGeometry.ts", import.meta.url),
    "utf8",
  );
  assert.match(geometrySource, /GROUND_DOME_FLAT_RADIUS = 0\.95/);
  assert.match(
    viewerSource,
    /resolveStoryScene3DDomeWorldRadius\(environmentSettings\) \* GROUND_DOME_FLAT_RADIUS/,
  );
});
