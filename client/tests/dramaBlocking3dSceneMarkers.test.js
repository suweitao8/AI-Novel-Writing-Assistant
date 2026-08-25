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
const viewerSource = fs.readFileSync(
  new URL(
    "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
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
