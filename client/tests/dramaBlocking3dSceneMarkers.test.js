import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const markerSource = fs.readFileSync(
  new URL(
    "../src/pages/drama/comicDrama/components/blocking3d/blocking3dSceneMarkers.ts",
    import.meta.url,
  ),
  "utf8",
);
const viewerSource = [
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts",
  "../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts",
].map((p) => fs.readFileSync(new URL(p, import.meta.url), "utf8")).join(String.fromCharCode(10));
const gizmoSource = fs.readFileSync(
  new URL(
    "../src/pages/drama/comicDrama/components/blocking3d/blocking3dProjectionCenterGizmo.ts",
    import.meta.url,
  ),
  "utf8",
);

test("PlayCanvas 空间标记使用半透明盒体、语义颜色和轮廓", () => {
  assert.match(markerSource, /type: "box"/);
  assert.match(markerSource, /material\.opacity/);
  assert.match(markerSource, /drawSceneMarkerOutlines/);
  assert.match(markerSource, /app\.drawLine/);
});

test("viewer 支持空间标记射线选择、聚焦和运行时更新", () => {
  assert.match(viewerSource, /pickSceneMarker/);
  assert.match(viewerSource, /focusMarker/);
  assert.match(viewerSource, /setSceneMarkers/);
  assert.match(viewerSource, /onMarkerSelection/);
});

test("空间标记 cube 挂在世界节点下，与 HDRI 背景同一父对象", () => {
  assert.match(viewerSource, /new pc\.Entity\("blocking3d-world"\)/);
  assert.match(
    viewerSource,
    /createSceneMarkerRuntime\(app, marker, marker\.id === selectedMarkerId, worldEntity\)/,
  );
  assert.match(viewerSource, /worldEntity\.addChild\(environmentBackdrop\)/);
  assert.match(markerSource, /parent\?: pc\.Entity/);
  assert.match(markerSource, /\(parent \?\? app\.root\)\.addChild\(entity\)/);
});

test("共享 viewer 显示不遮挡原图的投射中心线框和高度线，并随环境设置更新", () => {
  assert.doesNotMatch(gizmoSource, /type: "box"/);
  assert.match(gizmoSource, /GIZMO_SIZE_RATIO = 0\.007/);
  assert.match(gizmoSource, /new pc\.Color\(0\.2, 0\.9, 1, 1\)/);
  assert.match(gizmoSource, /projectionCenterHeight/);
  assert.match(gizmoSource, /app\.drawLine/);
  assert.match(gizmoSource, /false\);/);
  assert.match(viewerSource, /createProjectionCenterGizmo/);
  assert.match(viewerSource, /updateProjectionCenterGizmo/);
  assert.match(viewerSource, /drawProjectionCenterGizmo/);
  assert.match(viewerSource, /destroyProjectionCenterGizmo/);
});
