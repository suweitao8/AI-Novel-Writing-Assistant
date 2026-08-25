import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaBlocking3DPage.tsx", import.meta.url),
  "utf8",
);
const scene3dPageSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/DramaScene3DPage.tsx", import.meta.url),
  "utf8",
);
const viewerSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts", import.meta.url),
  "utf8",
);
const environmentGeometrySource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentGeometry.ts", import.meta.url),
  "utf8",
);
const environmentSource = `${viewerSource}\n${environmentGeometrySource}`;

test("3D 草图只显示静态姿势控制，不提供动态播放入口", () => {
  assert.match(pageSource, /静态姿势/);
  assert.doesNotMatch(pageSource, /播放动作|暂停动作|selectedActionPlaying|setSelectedActionPlaying/);
  assert.match(viewerSource, /actionPlaying: false/);
  assert.match(viewerSource, /layer\.pause\(\)/);
  assert.match(viewerSource, /anim\.playing = false/);
});

test("场景状态图作为半球 HDRI 环境，不再作为后置背景平面", () => {
  assert.match(viewerSource, /createUpperDomeGeometry/);
  assert.match(viewerSource, /pc\.CULLFACE_FRONT/);
  assert.match(viewerSource, /environmentDome/);
  assert.match(viewerSource, /environmentUrl/);
  assert.doesNotMatch(viewerSource, /createPlane\(app, "blocking3d-background"/);
});

test("场景 3D 编辑器使用当前状态图作为 HDRI 背景", () => {
  assert.match(scene3dPageSource, /function resolveSceneEnvironmentUrl[\s\S]*state\?\.image\?\.url\?\.trim\(\)/);
  assert.doesNotMatch(scene3dPageSource, /state\?\.image\?\.status === "done"/);
  assert.match(scene3dPageSource, /createBlocking3dViewer\(\{[\s\S]*environmentUrl,[\s\S]*onStatus: setStatus/);
});

test("HDRI 半球负责弧形地面，纯色地面只在没有 HDRI 时显示", () => {
  assert.match(viewerSource, /ground\.enabled = false/);
  assert.match(viewerSource, /ground\.enabled = true/);
});

test("HDRI 环境固定在世界坐标，旋转相机不会搬动地面", () => {
  assert.match(viewerSource, /environmentWorldPosition/);
  assert.doesNotMatch(viewerSource, /environmentDome\.setPosition\(cameraPosition\.x, 0, cameraPosition\.z\)/);
  assert.doesNotMatch(viewerSource, /environmentGround\.setPosition\(cameraPosition\.x, 0, cameraPosition\.z\)/);
  assert.doesNotMatch(viewerSource, /syncEnvironmentDomePosition\(\);/);
});

test("普通场景图和 2:1 全景图都使用带贴图的上下半球", () => {
  assert.match(viewerSource, /createUpperDomeGeometry/);
  assert.match(viewerSource, /createGroundDomeGeometry/);
  assert.match(viewerSource, /environmentGround/);
  assert.match(viewerSource, /pc\.CULLFACE_FRONT/);
  assert.match(viewerSource, /texture\.mipmaps = false/);
  assert.doesNotMatch(viewerSource, /environmentGround = createPlane/);
  assert.doesNotMatch(viewerSource, /GROUND_PROJECTION_SOURCE_ASPECT|isEquirectangular|groundProjection/);
});

test("HDRI 环境只提供投射中心高度和半球直径，旋转与亮度固定", () => {
  assert.match(viewerSource, /projectionCenterHeight: 2/);
  assert.match(viewerSource, /domeRadius: 15/);
  assert.match(viewerSource, /projectionCenterHeight/);
  assert.match(viewerSource, /domeRadius/);
  assert.match(viewerSource, /projectionCenterHeight[^\n]*1, 10/);
  assert.match(viewerSource, /domeRadius[^\n]*10, 50/);
  assert.match(viewerSource, /yawDeg/);
  assert.match(viewerSource, /yawDeg: 0/);
  assert.match(viewerSource, /intensity: 1/);
  assert.match(viewerSource, /texture\.anisotropy/);
  assert.match(viewerSource, /material\.emissiveIntensity/);
  assert.match(viewerSource, /getEnvironmentSettings/);
  assert.match(viewerSource, /setEnvironmentSettings/);
});

test("普通场景图地面使用连续半球曲面，不通过 UV repeat 缩放", () => {
  assert.match(environmentSource, /projectionCenterHeight/);
  assert.match(environmentSource, /createGroundDomeGeometryData\s*\(/);
  assert.match(environmentSource, /groundDomeEdgeHeight/);
  assert.match(environmentSource, /function projectGroundTextureUv/);
  assert.match(environmentSource, /const domeScale = domeRadius \* GEOMETRY_RADIUS/);
  assert.match(environmentSource, /worldX = x \* domeScale/);
  assert.match(environmentSource, /Math\.atan2/);
  assert.match(environmentSource, /const edgeDownAngle/);
  assert.match(environmentSource, /downAngle - edgeDownAngle/);
  assert.doesNotMatch(environmentSource, /Math\.max\(projectionCenterHeight - worldY, 0\)/);
  assert.doesNotMatch(environmentSource, /x \* x \+ z \* z < 0\.95 \* 0\.95/);
  assert.match(environmentSource, /ADDRESS_CLAMP_TO_EDGE/);
  assert.doesNotMatch(environmentSource, /groundTextureScale/);
  assert.doesNotMatch(environmentSource, /Math\.floor\(/);
  assert.doesNotMatch(environmentSource, /domeRadius \* environmentSettings\.projectionCenterHeight/);
  assert.match(environmentSource, /environmentGround/);
});

test("半球极点使用精确坐标和经度 UV，避免退化三角面拉伸纹理", () => {
  assert.match(viewerSource, /const rawSinTheta = Math\.sin\(theta\)/);
  assert.match(viewerSource, /const isPole = Math\.abs\(rawSinTheta\) < 1e-8/);
  assert.match(viewerSource, /const sinTheta = isPole \? 0 : rawSinTheta/);
  assert.match(viewerSource, /const poleU = 1 - lon \/ longitudeBands/);
  assert.match(viewerSource, /uvs\.push\(isPole \? poleU : u, v\)/);
});

test("半球极点保留每个经度的 UV，避免极点三角扇跨纹理拉伸", () => {
  assert.match(viewerSource, /const poleU = 1 - lon \/ longitudeBands/);
  assert.match(viewerSource, /uvs\.push\(isPole \? poleU : u, v\)/);
  assert.doesNotMatch(viewerSource, /uvs\.push\(isPole \? 0\.5 : u, v\)/);
});

test("下半球在投射中心附近使用有限平底，避免尖点三角面拉伸", () => {
  assert.match(environmentGeometrySource, /const GROUND_DOME_FLAT_RADIUS = 0\.95/);
  assert.match(environmentGeometrySource, /const GROUND_DOME_RIM_BANDS/);
  assert.match(environmentGeometrySource, /function createGroundDomeGeometryData/);
  assert.match(environmentGeometrySource, /const centerIndex = addVertex/);
  assert.match(environmentGeometrySource, /1 - lon \/ LONGITUDE_BANDS/);
  assert.match(environmentGeometrySource, /seamU/);
});

test("中键平移使用摄像机屏幕坐标，角色光照完全来自 HDRI 环境", () => {
  assert.match(viewerSource, /const screenRight = new pc\.Vec3\(Math\.cos\(azimuth\)/);
  assert.match(viewerSource, /const screenUp/);
  assert.match(viewerSource, /panCamera/);
  assert.doesNotMatch(viewerSource, /moveCamera\(-dx \* 0\.01, dy \* 0\.01, 0\)/);
  assert.match(viewerSource, /pc\.EnvLighting\.generateLightingSource/);
  assert.match(viewerSource, /pc\.EnvLighting\.generateAtlas/);
  assert.match(viewerSource, /app\.scene\.envAtlas/);
  assert.match(viewerSource, /pc\.TEXTUREPROJECTION_EQUIRECT/);
  assert.match(viewerSource, /app\.scene\.ambientLight/);
  assert.doesNotMatch(viewerSource, /type: "directional"/);
  assert.doesNotMatch(viewerSource, /type: "omni"/);
  assert.doesNotMatch(viewerSource, /estimateHdriLightDirection|getImageData|setFromDirections\(pc\.Vec3\.DOWN/);
});

test("选中角色使用绿色标记，场景参照角色支持锁定位置移动", () => {
  assert.match(viewerSource, /new pc\.Color\(0\.16, 0\.9, 0\.34\)/);
  assert.match(viewerSource, /setActorMovementEnabled/);
  assert.match(viewerSource, /let actorMovementEnabled = true/);
  assert.match(viewerSource, /mode: hit && selectedLabel === hit && actorMovementEnabled \? "actor"/);
  assert.match(scene3dPageSource, /nextViewer\.setActorMovementEnabled\(false\)/);
  assert.match(scene3dPageSource, /参照角色固定 · 右键旋转 · 滚轮缩放 · 中键平移/);
  assert.doesNotMatch(scene3dPageSource, /左键拖参照角色/);
});

test("代理角色按 1.8 米实际高度校准", () => {
  assert.match(viewerSource, /ACTOR_REFERENCE_HEIGHT_METERS = 1\.8/);
  assert.match(viewerSource, /ACTOR_PROXY_NATIVE_HEIGHT_METERS = 1\.8287/);
  assert.match(viewerSource, /ACTOR_REFERENCE_SCALE/);
  assert.match(viewerSource, /root\.setLocalScale\(ACTOR_REFERENCE_SCALE/);
});
