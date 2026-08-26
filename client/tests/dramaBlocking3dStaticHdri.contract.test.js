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
const environmentProjectionSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts", import.meta.url),
  "utf8",
);
const environmentLightingSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.ts", import.meta.url),
  "utf8",
);
const environmentKeyLightSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentKeyLight.ts", import.meta.url),
  "utf8",
);
const scaleSource = readFileSync(
  new URL("../src/pages/drama/comicDrama/components/blocking3d/blocking3dScale.ts", import.meta.url),
  "utf8",
);
const environmentSource = `${viewerSource}\n${environmentGeometrySource}\n${environmentProjectionSource}`;

test("3D 草图只显示静态姿势控制，不提供动态播放入口", () => {
  assert.match(pageSource, /静态姿势/);
  assert.doesNotMatch(pageSource, /播放动作|暂停动作|selectedActionPlaying|setSelectedActionPlaying/);
  assert.match(viewerSource, /actionPlaying: false/);
  assert.match(viewerSource, /layer\.pause\(\)/);
  assert.match(viewerSource, /anim\.playing = false/);
});

test("场景状态图作为半球 HDRI 环境，不再作为后置背景平面", () => {
  assert.match(viewerSource, /createBackdropGeometry/);
  assert.match(environmentProjectionSource, /material\.cull = pc\.CULLFACE_FRONT/);
  assert.match(viewerSource, /environmentBackdrop/);
  assert.match(viewerSource, /environmentUrl/);
  assert.doesNotMatch(viewerSource, /createPlane\(app, "blocking3d-background"/);
});

test("场景 3D 编辑器使用当前状态图作为 HDRI 背景", () => {
  assert.match(scene3dPageSource, /function resolveSceneEnvironmentUrl[\s\S]*state\?\.image\?\.url\?\.trim\(\)/);
  assert.doesNotMatch(scene3dPageSource, /state\?\.image\?\.status === "done"/);
  assert.match(scene3dPageSource, /createBlocking3dViewer\(\{[\s\S]*environmentUrl,/);
  assert.doesNotMatch(scene3dPageSource, /onStatus: setStatus/);
});

test("HDRI 半球负责弧形地面，纯色地面只在没有 HDRI 时显示", () => {
  assert.match(viewerSource, /ground\.enabled = false/);
  assert.match(viewerSource, /ground\.enabled = true/);
});

test("HDRI 环境固定在世界坐标，旋转相机不会搬动地面", () => {
  assert.match(viewerSource, /environmentWorldPosition/);
  assert.doesNotMatch(viewerSource, /environmentBackdrop\.setPosition\(cameraPosition\.x, 0, cameraPosition\.z\)/);
  assert.doesNotMatch(viewerSource, /syncEnvironmentDomePosition\(\);/);
});

test("有限 HDRI 半球不应触发 PlayCanvas 内置无限天空盒", () => {
  assert.match(viewerSource, /cameraComponent\.layers = cameraComponent\.layers\.filter/);
  assert.match(viewerSource, /layerId !== pc\.LAYERID_SKYBOX/);
  assert.match(viewerSource, /layers: \[pc\.LAYERID_WORLD\]/);
  assert.doesNotMatch(viewerSource, /layers: \[pc\.LAYERID_SKYBOX\]/);
});

test("切换或销毁 HDRI 时释放纹理和投影材质", () => {
  assert.match(viewerSource, /environmentAsset\.unload\(\)/);
  assert.match(viewerSource, /environmentMaterial\?\.destroy\(\)/);
  assert.match(viewerSource, /environmentBackdropMeshInstance\?\.mesh\?\.destroy\(\)/);
  assert.match(viewerSource, /let environmentRequestId = 0/);
  assert.match(viewerSource, /isCurrentEnvironmentRequest/);
  assert.match(viewerSource, /discardEnvironmentAsset\(asset\)/);
});

test("普通场景图和 2:1 全景图都使用带贴图的上下半球", () => {
  assert.match(viewerSource, /createBackdropGeometry/);
  assert.match(environmentGeometrySource, /createBackdropGeometryData/);
  assert.match(viewerSource, /createProjectedHdriMaterial/);
  assert.match(viewerSource, /environmentBackdrop/);
  assert.match(environmentProjectionSource, /material\.cull = pc\.CULLFACE_FRONT/);
  assert.match(viewerSource, /texture\.mipmaps = false/);
  assert.doesNotMatch(viewerSource, /environmentBackdrop = createPlane/);
  assert.match(environmentProjectionSource, /uniform samplerCube uEnvironmentMap/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap/);
});

test("HDRI 显示面先把等距全景重投影为立方体，避免 2D 首尾缝和地面中心漩涡", () => {
  assert.match(viewerSource, /let environmentProjectionCube: pc\.Texture \| null = null/);
  assert.match(viewerSource, /pc\.reprojectTexture\(/);
  assert.match(viewerSource, /numSamples: 1/);
  assert.match(viewerSource, /seamPixels: 1/);
  assert.match(viewerSource, /environmentProjectionCube\?\.destroy\(\)/);
  assert.match(environmentProjectionSource, /uniform samplerCube uEnvironmentMap/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap, projectedDirection\)/);
  assert.doesNotMatch(environmentProjectionSource, /uniform sampler2D uEnvironmentMap/);
  assert.doesNotMatch(environmentProjectionSource, /texture2D\(uEnvironmentMap/);
});

test("连续 EnviroDome 共用投影材质，并沿用标准材质的颜色空间输出", () => {
  assert.match(viewerSource, /let environmentMaterial: pc\.ShaderMaterial \| null = null/);
  assert.doesNotMatch(viewerSource, /environmentGroundMaterial/);
  assert.match(viewerSource, /const material = createProjectedHdriMaterial\(projectionCube, environmentSettings\)/);
  assert.match(viewerSource, /const meshInstance = new pc\.MeshInstance\(mesh, material\)/);
  assert.match(viewerSource, /environmentBackdropMeshInstance = meshInstance/);
  assert.match(environmentProjectionSource, /function createProjectedHdriMaterial/);
  assert.match(environmentProjectionSource, /#include "gammaPS"/);
  assert.match(environmentProjectionSource, /decodeGamma\(rawColor\)/);
  assert.match(environmentProjectionSource, /gammaCorrectOutput\(toneMap\(linearColor\)\)/);
  assert.match(environmentProjectionSource, /vec3 projectionDirection = normalize\(projectionToSurface\)/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap, projectedDirection\)/);
  assert.doesNotMatch(environmentProjectionSource, /edgeDownAngle/);
});

test("HDRI 环境提供投射中心、高度、半球直径和可调地面分界", () => {
  assert.match(viewerSource, /projectionCenterHeight: 1\.7/);
  assert.match(viewerSource, /domeRadius: 10/);
  assert.match(viewerSource, /STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V/);
  assert.match(viewerSource, /panoramaHorizonV: STORY_SCENE_3D_DEFAULT_PANORAMA_HORIZON_V/);
  assert.match(viewerSource, /projectionCenterHeight/);
  assert.match(viewerSource, /domeRadius/);
  assert.match(viewerSource, /projectionCenterHeight[^\n]*0\.5, 2/);
  assert.match(viewerSource, /domeRadius[^\n]*5, 20/);
  assert.match(viewerSource, /panoramaHorizonV[^\n]*0\.45, 0\.55/);
  assert.match(viewerSource, /yawDeg/);
  assert.match(viewerSource, /yawDeg: 0/);
  assert.match(viewerSource, /intensity: 1/);
  assert.match(viewerSource, /texture\.anisotropy/);
  assert.match(viewerSource, /updateProjectedHdriMaterial/);
  assert.match(viewerSource, /getEnvironmentSettings/);
  assert.match(viewerSource, /setEnvironmentSettings/);
});

test("普通场景图地面使用连续半球曲面，并由投影材质按世界坐标采样", () => {
  assert.match(environmentSource, /projectionCenterHeight/);
  assert.match(environmentSource, /createBackdropGeometryData\s*\(/);
  assert.match(environmentSource, /const edgeHeight/);
  assert.match(environmentProjectionSource, /projectionToSurface/);
  assert.match(environmentProjectionSource, /projectionDirection/);
  assert.match(environmentProjectionSource, /uProjectionCenterHeight/);
  assert.match(environmentProjectionSource, /uPanoramaHorizonV/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap, projectedDirection\)/);
  assert.doesNotMatch(environmentSource, /Math\.max\(projectionCenterHeight - worldY, 0\)/);
  assert.doesNotMatch(environmentSource, /x \* x \+ z \* z < 0\.95 \* 0\.95/);
  assert.match(environmentSource, /ADDRESS_REPEAT/);
  assert.doesNotMatch(environmentSource, /groundTextureScale/);
  assert.doesNotMatch(environmentSource, /Math\.floor\(/);
  assert.doesNotMatch(environmentSource, /domeRadius \* environmentSettings\.projectionCenterHeight/);
  assert.doesNotMatch(environmentGeometrySource, /projectGroundTextureUv|seamU/);
  assert.match(environmentSource, /environmentBackdrop/);
});

test("半球极点使用精确坐标，避免退化三角面拉伸纹理", () => {
  assert.match(environmentGeometrySource, /const rawSinTheta = Math\.sin\(theta\)/);
  assert.match(environmentGeometrySource, /const isPole = Math\.abs\(rawSinTheta\) < 1e-8/);
  assert.match(environmentGeometrySource, /const sinTheta = isPole \? 0 : rawSinTheta/);
});

test("半球极点坐标精确收敛，投影材质在极点使用固定经度", () => {
  assert.match(environmentGeometrySource, /addUpperRing/);
  assert.match(environmentGeometrySource, /isPole/);
  assert.match(environmentProjectionSource, /uniform samplerCube uEnvironmentMap/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap/);
});

test("下半球在投射中心附近使用有限平底，避免尖点三角面拉伸", () => {
  assert.match(environmentGeometrySource, /const GROUND_DOME_FLAT_RADIUS = 0\.95/);
  assert.match(environmentGeometrySource, /const GROUND_DOME_RIM_BANDS/);
  assert.match(environmentGeometrySource, /function createGroundDomeGeometryData/);
  assert.match(environmentGeometrySource, /const centerIndex = addVertex/);
  assert.match(environmentGeometrySource, /Texture projection is intentionally not encoded in the vertex/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap, projectedDirection\)/);
});

test("HDRI EnviroDome 使用一份连续网格，避免上下 MeshInstance 的交界光栅缝", () => {
  assert.match(environmentGeometrySource, /export function createBackdropGeometryData/);
  assert.match(environmentGeometrySource, /UPPER_DOME_LATITUDE_BANDS/);
  assert.match(environmentGeometrySource, /projectionCenterHeight \* 2/);
  assert.match(viewerSource, /createBackdropGeometryData\(/);
  assert.match(viewerSource, /let environmentBackdrop: pc\.Entity \| null = null/);
  assert.match(viewerSource, /environmentBackdrop\.addComponent\("render"/);
  assert.doesNotMatch(viewerSource, /environmentDome|environmentGround/);
});

test("HDRI 投影使用投射中心方向采样同一份立方体，不在地平线切换两套 V 映射", () => {
  assert.match(environmentProjectionSource, /vec3 projectionDirection = normalize\(projectionToSurface\)/);
  assert.match(environmentProjectionSource, /textureCube\(uEnvironmentMap, projectedDirection\)/);
  assert.match(environmentProjectionSource, /sourceLatitude/);
  assert.doesNotMatch(environmentProjectionSource, /edgeDownAngle/);
  assert.doesNotMatch(environmentProjectionSource, /if \(vWorldPosition\.y >= edgeHeight\)/);
});

test("HDRI 等距投影数学在地平线、两极和经度循环处连续", async () => {
  const { projectEquirectangularDirection } = await import(
    "../src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts",
  );
  const horizon = projectEquirectangularDirection([1, 0, 0]);
  const opposite = projectEquirectangularDirection([-1, 0, 0]);
  const top = projectEquirectangularDirection([0, 1, 0]);
  const bottom = projectEquirectangularDirection([0, -1, 0]);
  const scaled = projectEquirectangularDirection([10, 0, 0]);
  const shifted = projectEquirectangularDirection([1, 0, 0], 0.58);

  assert.equal(horizon.v, 0.5);
  assert.equal(top.v, 0);
  assert.equal(bottom.v, 1);
  assert.ok(horizon.u >= 0 && horizon.u <= 1);
  assert.ok(opposite.u >= 0 && opposite.u <= 1);
  assert.deepEqual(scaled, horizon, "投影只由方向决定，与距离无关");
  assert.equal(shifted.v, 0.58, "全景地面分界应改变采样 V 坐标");
  assert.equal(projectEquirectangularDirection([0, 1, 0]).u, 0.5, "上极点使用固定经度");
  assert.equal(projectEquirectangularDirection([0, -1, 0]).u, 0.5, "下极点使用固定经度");
});

test("中键平移使用摄像机屏幕坐标，角色光照由 HDRI 环境和亮部方向光共同提供", () => {
  assert.match(viewerSource, /const screenRight = new pc\.Vec3\(Math\.cos\(azimuth\)/);
  assert.match(viewerSource, /const screenUp/);
  assert.match(viewerSource, /panCamera/);
  assert.doesNotMatch(viewerSource, /moveCamera\(-dx \* 0\.01, dy \* 0\.01, 0\)/);
  assert.match(viewerSource, /pc\.EnvLighting\.generateLightingSource/);
  assert.match(viewerSource, /pc\.EnvLighting\.generateAtlas/);
  assert.match(viewerSource, /app\.scene\.envAtlas/);
  assert.match(viewerSource, /pc\.TEXTUREPROJECTION_EQUIRECT/);
  assert.match(viewerSource, /app\.scene\.ambientLight/);
  assert.match(viewerSource, /const environmentKeyLight = createHdriKeyLight\(\)/);
  assert.match(viewerSource, /applyHdriKeyLight\(environmentKeyLight, texture\)/);
  assert.match(environmentKeyLightSource, /new pc\.Entity\("blocking3d-hdri-key-light"\)/);
  assert.match(environmentKeyLightSource, /type: "directional"/);
  assert.match(environmentKeyLightSource, /estimateHdriLightFromTexture\(texture\)/);
  assert.match(environmentKeyLightSource, /setFromDirections\(pc\.Vec3\.UP, sourceDirection\)/);
  assert.match(environmentLightingSource, /export function estimateHdriLightFromPixels/);
  assert.match(environmentLightingSource, /export function estimateHdriLightFromTexture/);
  assert.doesNotMatch(`${viewerSource}\n${environmentKeyLightSource}`, /type: "omni"/);
  assert.doesNotMatch(viewerSource, /fixed|固定.*补光/);
});

test("HDRI 派生方向光只在 viewer 生命周期内存在，并在清理时关闭", () => {
  assert.match(viewerSource, /const clearEnvironmentKeyLight = \(\) =>/);
  assert.match(environmentKeyLightSource, /entity\.enabled = false/);
  assert.match(environmentKeyLightSource, /export function clearHdriKeyLight/);
  assert.match(viewerSource, /clearEnvironmentKeyLight\(\);/);
  assert.match(viewerSource, /environmentKeyLight\.destroy\(\)/);
});

test("参考角色材质显式使用 HDRI 环境光", () => {
  assert.match(viewerSource, /material\.useLighting = true/);
  assert.match(viewerSource, /material\.useSkybox = true/);
  assert.match(viewerSource, /pc\.EnvLighting\.generateLightingSource/);
  assert.match(viewerSource, /app\.scene\.envAtlas = environmentAtlas/);
});

test("选中角色使用外轮廓反馈，场景参照角色支持锁定位置移动", () => {
  assert.match(viewerSource, /createBlocking3dSelectionOutline/);
  assert.doesNotMatch(viewerSource, /selectionRing|SELECTION_RING_OPACITY|createSelectionRingGeometryData/);
  assert.doesNotMatch(viewerSource, /type: "cylinder"/);
  assert.match(viewerSource, /setActorMovementEnabled/);
  assert.match(viewerSource, /let actorMovementEnabled = true/);
  assert.match(viewerSource, /mode: hit && selectedLabel === hit && actorMovementEnabled \? "actor"/);
  assert.match(scene3dPageSource, /nextViewer\.setActorMovementEnabled\(false\)/);
  assert.match(scene3dPageSource, /参考角色固定 · 右键旋转 · 滚轮缩放 · 中键平移/);
  assert.doesNotMatch(scene3dPageSource, /左键拖参照角色/);
});

test("场景编辑参考角色固定为 1.7 米并放在世界中心", () => {
  assert.match(scene3dPageSource, /REFERENCE_ACTOR_HEIGHT_METERS = 1\.7/);
  assert.match(scene3dPageSource, /参考角色（约1\.7m）/);
  assert.match(scene3dPageSource, /addActor\(REFERENCE_ACTOR_LABEL, 0, REFERENCE_ACTOR_HEIGHT_METERS, \[0, 0, 0\]\)/);
  assert.match(viewerSource, /initialPosition/);
});

test("代理角色按 1.8 米实际高度校准", () => {
  assert.match(scaleSource, /DEFAULT_BLOCKING_3D_HEIGHT_METERS = 1\.8/);
  assert.match(viewerSource, /heightToBlocking3dScale/);
  assert.match(viewerSource, /root\.setLocalScale\(proxyScale, proxyScale, proxyScale\)/);
});
