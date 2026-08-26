import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const pageSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/DramaBlocking3DPage.tsx"),
  "utf8",
);
const scene3dPageSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/DramaScene3DPage.tsx"),
  "utf8",
);
const viewerSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts"),
  "utf8",
);
const mathSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts"),
  "utf8",
);
const entrySource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/ShotVoiceListPanel.tsx"),
  "utf8",
);

test("3D 摆位页面保存快照并继续上传 PNG 参考图", () => {
  assert.match(pageSource, /createBlocking3dViewer/);
  assert.match(pageSource, /layout3d/);
  assert.match(pageSource, /uploadDramaShotBlockingSketchPng/);
  assert.match(pageSource, /confirmDramaShotBlockingSketch/);
  assert.match(pageSource, /setInteractionEnabled\(false\)/);
  assert.match(pageSource, /queryKeys\.drama\.project/);
  assert.match(pageSource, /autoPlanDramaShotBlockingSketch/);
  assert.match(pageSource, /<AiButton/);
  assert.match(pageSource, /context\.sketch\?\.layout3d/);
  assert.match(mathSource, /prone/);
});

test("分镜 3D 操作不会自动保存，只在退出前保存并返回分镜", () => {
  assert.doesNotMatch(pageSource, /saveTimerRef/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => \{[\s\S]*saveSketch/);
  assert.match(pageSource, /await saveBeforeExit\(\)/);
  assert.match(pageSource, /saveBeforeExit\(\)[\s\S]*navigate\(-1\)/);
  assert.match(pageSource, /refetchQueries|refetchType/);
  assert.doesNotMatch(pageSource, /自动保存/);
  assert.doesNotMatch(pageSource, /当前 3D 草图还有未保存修改，确定离开吗/);
  assert.doesNotMatch(pageSource, /保存草图|确认草图/);
});

test("AI 自动构图只留下未保存修改，不在构图完成后立即保存", () => {
  assert.match(pageSource, /setDirty\(true\)/);
  assert.match(pageSource, /toast\.success\("AI 已完成本镜构图。"/);
  assert.doesNotMatch(pageSource, /setStatus\("AI 构图完成，正在自动保存"\)/);
  assert.doesNotMatch(pageSource, /await handleAutoSave\(\)/);
});

test("打开编辑器不会因缺少布局或查询参数自动调用 AI", () => {
  assert.doesNotMatch(pageSource, /searchParams\.get\("autoPlan"\)/);
  assert.doesNotMatch(pageSource, /autoPlanRequested/);
  assert.doesNotMatch(pageSource, /shouldAutoPlan/);
});

test("编辑器按钮调用自动构图并把镜头设计说明留在未保存状态", () => {
  assert.match(pageSource, /autoPlanDramaShotBlockingSketch/);
  assert.match(pageSource, /viewer\.loadLayout\(result\.data\.layout\)/);
  assert.match(pageSource, /compositionNote/);
  assert.match(pageSource, /toast\.success\("AI 已完成本镜构图。"/);
  assert.doesNotMatch(pageSource, /autoPlan=1/);
});

test("编辑器显示当前镜头与 AI 镜头设计面板", () => {
  assert.match(pageSource, /<Card/);
  assert.match(pageSource, /镜头设计/);
  assert.match(pageSource, /景别/);
  assert.match(pageSource, /运镜/);
  assert.match(pageSource, /时长/);
  assert.match(pageSource, /AI 构图说明/);
  assert.match(pageSource, /镜头预览/);
  assert.match(pageSource, /context\.shot\.action/);
});

test("自动构图或保存期间禁止离开 3D 草图", () => {
  assert.match(pageSource, /aria-label="返回分镜"[^>]*disabled=\{saving \|\| autoPlanning\}/);
});

test("3D 草图 runtime 提供代理模型、静态姿势、相机和导出能力", () => {
  assert.match(viewerSource, /UAL2_Standard\.glb/);
  assert.match(viewerSource, /UAL1_Standard\.glb/);
  assert.match(viewerSource, /setSelectedPose/);
  assert.match(viewerSource, /setCameraState/);
  assert.match(viewerSource, /BLOCKING_SKETCH_CAPTURE_SIZE/);
  assert.match(viewerSource, /setInteractionEnabled/);
  assert.match(viewerSource, /setActorMovementEnabled/);
  assert.match(viewerSource, /capturePng/);
  assert.match(viewerSource, /createBackdropGeometryData/);
  assert.match(viewerSource, /setEnvironment/);
  assert.doesNotMatch(viewerSource, /setSelectedActionPlaying|getSelectedActionPlaying/);
  assert.doesNotMatch(viewerSource, /blocking3d-background/);
});

test("3D 草图支持选中角色实时改色并把颜色纳入布局快照", () => {
  assert.match(pageSource, /type="color"/);
  assert.match(pageSource, /模型颜色/);
  assert.match(viewerSource, /setSelectedColor/);
  assert.match(viewerSource, /getSelectedColor/);
  assert.match(viewerSource, /color: \[\.\.\.actor\.color\]/);
  assert.match(viewerSource, /saved\.color/);
  assert.match(viewerSource, /setEntityMaterial\(actor\.animEntity, actor\.color/);
});

test("选中角色和参考角色使用 3D 外轮廓反馈", () => {
  assert.match(viewerSource, /drawEntitySelectionOutline/);
  assert.match(viewerSource, /selectedActor\(\)/);
  assert.match(scene3dPageSource, /REFERENCE_ACTOR_LABEL/);
});

test("选中角色保留外轮廓但移除脚下圆盘", () => {
  assert.match(viewerSource, /drawEntitySelectionOutline/);
  assert.doesNotMatch(viewerSource, /selectionRing|SELECTION_RING_OPACITY|createSelectionRingGeometryData/);
});

test("分镜列表只进入独立 3D 草图，不再保留 2D 草图入口", () => {
  assert.match(entrySource, /blocking-3d\?order=/);
  assert.match(entrySource, /3D 草图/);
  assert.doesNotMatch(entrySource, /2D 草图|ShotBlockingSketchDialog/);
});

test("分镜 3D 草图从场景资产继承 HDRI 参数，不再单独编辑", () => {
  assert.match(pageSource, /context\.scene\.environment/);
  assert.match(pageSource, /environment: context\.scene\.environment/);
  assert.doesNotMatch(pageSource, /HDRI 环境|投射中心高度|半球直径|setEnvironmentSettings/);
  assert.doesNotMatch(pageSource, /type=\"range\"/);
});

test("场景 3D 编辑页只允许相机交互，参考角色固定在 1.7 米", () => {
  assert.match(scene3dPageSource, /REFERENCE_ACTOR_LABEL = "参考角色（约1\.7m）"/);
  assert.match(scene3dPageSource, /nextViewer\.addActor\(REFERENCE_ACTOR_LABEL, 0, REFERENCE_ACTOR_HEIGHT_METERS/);
  assert.match(scene3dPageSource, /nextViewer\.setActorMovementEnabled\(false\)/);
  assert.match(scene3dPageSource, /参考角色固定 · 右键旋转 · 滚轮缩放 · 中键平移/);
});

test("对象树保留全部空间标记并使用世界/参考角色名称", () => {
  assert.match(scene3dPageSource, /label: "世界"/);
  assert.match(scene3dPageSource, /label: "参考角色"/);
  assert.match(scene3dPageSource, /visibleSceneMarkers\.map/);
  assert.match(pageSource, /label: "世界"/);
  assert.match(pageSource, /context\.scene\.markers\.map/);
  assert.match(pageSource, /从上方对象列表选择世界、角色或空间标记/);
});

test("场景编辑和 3D 草图编辑都只在退出时提交最新修改", () => {
  assert.doesNotMatch(scene3dPageSource, /saveTimerRef/);
  assert.doesNotMatch(scene3dPageSource, /setTimeout\(\(\) => \{[\s\S]*saveScene/);
  assert.match(scene3dPageSource, /await saveBeforeExit\(\)/);
  assert.match(scene3dPageSource, /saveBeforeExit\(\)[\s\S]*navigate\(returnPath/);
  assert.doesNotMatch(pageSource, /saveTimerRef/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => \{[\s\S]*saveSketch/);
  assert.match(pageSource, /await saveBeforeExit\(\)/);
  assert.match(pageSource, /saveBeforeExit\(\)[\s\S]*navigate\(-1\)/);
});
