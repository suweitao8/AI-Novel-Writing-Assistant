import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const editorSource = read("../src/pages/models/ModelEditorPage.tsx");
const viewerSource = read("../src/pages/models/modelLibrary3d/modelViewerApp.ts");
const geometrySource = read("../src/pages/models/modelLibrary3d/modelGeometryStats.ts");
const systemEnvironmentSource = read("../src/pages/settings/views/StudioEnvironmentPreviewPage.tsx");

test("模型详情显示实时几何信息和只读包围盒", () => {
  assert.match(editorSource, /geometryStats/);
  assert.match(editorSource, /顶点数量/);
  assert.match(editorSource, />长<\/dt>/);
  assert.match(editorSource, />宽<\/dt>/);
  assert.match(editorSource, />高<\/dt>/);
  assert.match(viewerSource, /collectModelGeometryStats/);
  assert.match(viewerSource, /drawWireAlignedBox/);
  assert.match(viewerSource, /geometryStats/);
  assert.match(viewerSource, /getNumVertices/);
  assert.match(geometrySource, /countedVertexBuffers/);
});

test("模型详情不暴露环境参数和模型变换路径", () => {
  assert.doesNotMatch(editorSource, /半球直径|STUDIO_ENVIRONMENT_DIAMETER_LIMITS|setEnvironmentDiameter/);
  assert.doesNotMatch(editorSource, /InspectorTransformSection|TransformToolToolbar|onTransformLive|onTransformCommit/);
  assert.doesNotMatch(viewerSource, /createBlocking3dTransformGizmo|setTransformTool|getTransformTool|setTransform\s*\(/);
  assert.doesNotMatch(viewerSource, /onTransformLive|onTransformCommit/);
  assert.match(editorSource, /getStudioEnvironmentDiameterPreference/);
  assert.match(editorSource, /environmentDiameterMeters:/);
});

test("通用资产 HDRI 预览页仍是环境参数的编辑入口", () => {
  assert.match(systemEnvironmentSource, /STUDIO_ENVIRONMENT_DIAMETER_LIMITS/);
  assert.match(systemEnvironmentSource, /setEnvironmentSettings/);
  assert.match(systemEnvironmentSource, /handleEnvironmentDiameterChange/);
});

test("模型包围盒默认隐藏，并可通过复选框切换为灰色线框", () => {
  assert.match(editorSource, /data-model-bounds-toggle/);
  assert.match(editorSource, /type="checkbox"/);
  assert.match(editorSource, /显示包围盒/);
  assert.match(editorSource, /setBoundsVisible/);
  assert.match(viewerSource, /let boundsVisible = options\.showBounds \?\? false/);
  assert.match(viewerSource, /setBoundsVisible: \(visible: boolean\) => void/);
  assert.match(viewerSource, /setBoundsVisible\(visible\)/);
  assert.match(viewerSource, /if \(boundsVisible && modelDisplayBoundsMin && modelDisplayBoundsMax\)/);
  assert.match(viewerSource, /const MODEL_BOUNDS_COLOR = new pc\.Color\(0\.68, 0\.68, 0\.68, 0\.9\)/);
  assert.doesNotMatch(viewerSource, /new pc\.Color\(0\.27, 0\.74, 0\.96/);
});
