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
const viewerCoreSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts"),
  "utf8",
);
const selectionOutlineSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/blocking3d/blocking3dSelectionOutline.ts"),
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
  assert.match(pageSource, /AI 构图说明/);
  assert.match(pageSource, /镜头预览/);
  assert.match(pageSource, /context\.shot\.action/);
});

test("漫剧只出静态分镜，镜头设计不含运镜与时长", () => {
  assert.doesNotMatch(pageSource, /运镜/);
  assert.doesNotMatch(pageSource, /时长/);
  assert.doesNotMatch(pageSource, /cameraMove/);
  assert.doesNotMatch(pageSource, /context\.shot\.durationSec/);
  const apiSource = fs.readFileSync(
    path.join(process.cwd(), "src/api/media/drama.ts"),
    "utf8",
  );
  assert.doesNotMatch(apiSource, /cameraMove/);
});

test("自动构图或保存期间禁止离开 3D 草图", () => {
  assert.match(pageSource, /aria-label="返回分镜"[^>]*disabled=\{saving \|\| autoPlanning\}/);
});

test("3D 草图 runtime 提供代理模型、静态姿势、相机和导出能力", () => {
  assert.match(viewerCoreSource, /UAL2_Standard\.glb/);
  assert.match(viewerCoreSource, /UAL1_Standard\.glb/);
  assert.match(viewerSource, /setSelectedPose/);
  assert.match(viewerSource, /setCameraState/);
  assert.match(viewerSource, /BLOCKING_SKETCH_CAPTURE_SIZE/);
  assert.match(viewerSource, /setInteractionEnabled/);
  assert.match(viewerSource, /setActorMovementEnabled/);
  assert.match(viewerSource, /capturePng/);
  assert.match(viewerCoreSource, /createBackdropGeometryData/);
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
  assert.match(selectionOutlineSource, /new pc\.OutlineRenderer/);
  assert.match(selectionOutlineSource, /insertOpaque/);
  assert.match(selectionOutlineSource, /frameUpdate/);
  assert.match(selectionOutlineSource, /removeEntity/);
  assert.match(selectionOutlineSource, /destroy/);
  assert.match(viewerSource, /createBlocking3dSelectionOutline/);
  assert.match(viewerSource, /selectionOutline\.setEntity/);
  assert.match(viewerSource, /selectionOutline\.frameUpdate/);
  assert.doesNotMatch(viewerSource, /drawEntitySelectionOutline/);
  assert.match(viewerSource, /selectedActor\(\)/);
  assert.match(scene3dPageSource, /REFERENCE_ACTOR_LABEL/);
});

test("选中外描边为 80% 不透明度的橙色，空间标记与场景摄像机共用同一条外轮廓", () => {
  assert.match(viewerCoreSource, /SELECTION_OUTLINE_COLOR = new pc\.Color\(1, 0\.58, 0, 0\.8\)/);
  assert.match(viewerSource, /markerRuntime\?\.entity \?\? \(cameraSelected \? shotCamera\.body : null\)/);
  // PlayCanvas 默认合成忽略颜色 alpha，描边不透明度必须由替换的合成着色器承载。
  assert.match(selectionOutlineSource, /uOutlineOpacity/);
  assert.match(selectionOutlineSource, /color\.a/);
  assert.match(selectionOutlineSource, /fragmentGLSL: OUTLINE_BLEND_FRAGMENT_GLSL/);
});

test("3D 草图 PNG 捕获期间不包含选中外描边", () => {
  assert.match(viewerSource, /capturePng\(\)[\s\S]*selectionOutline\.setEntity\(null\)/);
  assert.match(viewerSource, /selectionOutline\.frameUpdate\(\)/);
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
  assert.match(scene3dPageSource, /拖动手柄移动物体 · 右键旋转 · 滚轮缩放 · 中键平移/);
});

test("对象树由功能开关门控空间标记并使用世界/参考角色名称", () => {
  assert.match(scene3dPageSource, /label: "世界"/);
  assert.match(scene3dPageSource, /label: "参考角色"/);
  assert.match(scene3dPageSource, /visibleSceneMarkers\.map/);
  assert.match(pageSource, /label: "世界"/);
  assert.match(pageSource, /STORY_SCENE_3D_MARKERS_ENABLED \? context\.scene\.markers\.map/);
  // 空间标记暂关后，占位提示只引导到仍在对象列表中的对象。
  assert.match(pageSource, /STORY_SCENE_3D_MARKERS_ENABLED \? "从上方对象列表选择世界、摄像机、角色或空间标记。" : "从上方对象列表选择世界、摄像机或角色。"/);
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

test("3D 草图编辑器常驻工作室页签，点击先保存再深链回对应页签", () => {
  // 二级（角色/场景/道具/章节/设定，active=章节）+ 三级章节子页签（active=分镜）。
  assert.match(pageSource, /useRegisterPageTabs\(!isMobileViewport && Boolean\(novelId\), \[/);
  assert.match(pageSource, /buildStudioNavStageRow\("storyboard", \(stage\) =>/);
  // 跳转前必须先保存当前摆位；保存失败留在本页。
  assert.match(pageSource, /leaveToStudio[\s\S]*?await saveBeforeExit\(\)[\s\S]*?buildStudioNavigationPath\(/);
});

test("摆位上下文携带来源小说 id，供常驻页签跳回工作室", () => {
  const serviceSource = fs.readFileSync(
    path.join(process.cwd(), "../server/src/services/drama/visual/DramaShotBlockingSketchService.ts"),
    "utf8",
  );
  const apiSource = fs.readFileSync(
    path.join(process.cwd(), "src/api/media/drama.ts"),
    "utf8",
  );
  assert.match(serviceSource, /novelId: string \| null;/);
  assert.match(serviceSource, /return \{ sketch, shot: shotSummary, scene, actors, novelId \};/);
  assert.match(serviceSource, /novelId: null,/);
  assert.match(apiSource, /novelId: string \| null;/);
  assert.match(pageSource, /context\?\.novelId \?\? null/);
});

const gameObjectCardSource = fs.readFileSync(
  path.join(process.cwd(), "src/pages/drama/comicDrama/components/editor3d/inspector/InspectorGameObjectCard.tsx"),
  "utf8",
);

test("属性编辑器对象名称行只显示图标与名字，无卡片包裹和附加说明", () => {
  // 不再渲染 box 包裹、类型徽标（近景/校准道具/角色…）与 metaLine 补充行。
  assert.match(gameObjectCardSource, /data-inspector="game-object"/);
  assert.match(gameObjectCardSource, /aria-label="对象名称"/);
  assert.doesNotMatch(gameObjectCardSource, /kindLabel|metaLine|rounded-lg border|bg-muted\/30 p-2\.5/);
  // 两个 3D 编辑器的调用点都不再传这些附加信息。
  assert.doesNotMatch(pageSource, /kindLabel=|metaLine=|已加入镜头|未加入镜头/);
  assert.doesNotMatch(scene3dPageSource, /kindLabel=|metaLine=|校准道具/);
});
