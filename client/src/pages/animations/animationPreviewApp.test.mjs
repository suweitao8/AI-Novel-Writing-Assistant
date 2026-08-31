import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// 预览器依赖 playcanvas 与 @/ 路径别名，Node 里不可直接导入；这里的契约
// 断言读取源码，守住「同步构建 → 加载 GLB → 装配动画组件 → 循环播放 →
// 可取消销毁」链路，特别是同一画布同一时刻只能存在一个 PlayCanvas 应用。
const previewSource = readFileSync(
  path.join(import.meta.dirname, "animationPreviewApp.ts"),
  "utf8",
);
const pageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationLibraryPage.tsx"),
  "utf8",
);
const previewPageSource = readFileSync(
  path.join(import.meta.dirname, "AnimationPreviewPage.tsx"),
  "utf8",
);
const studioSource = readFileSync(
  path.join(import.meta.dirname, "animationThumbnailStudio.ts"),
  "utf8",
);
const storageSource = readFileSync(
  path.join(import.meta.dirname, "animationPreviewStorage.ts"),
  "utf8",
);
const blockingCoreSource = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "blocking3dViewerCore.ts",
  ),
  "utf8",
);
const actorMaterialPolicySource = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "materials",
    "actorMaterialPolicy.ts",
  ),
  "utf8",
);
const actorMaterialRuntimeSource = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "materials",
    "actorMaterialRuntime.ts",
  ),
  "utf8",
);
const blockingIndexSource = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "index.ts",
  ),
  "utf8",
);
const modelPageSource = readFileSync(
  path.join(import.meta.dirname, "..", "models", "ModelLibraryPage.tsx"),
  "utf8",
);
const navSource = readFileSync(
  path.join(import.meta.dirname, "..", "..", "config", "dramaFocusNav.ts"),
  "utf8",
);
const catalogSource = readFileSync(
  path.join(import.meta.dirname, "..", "..", "config", "animationLibrary.ts"),
  "utf8",
);
const environmentRuntimeSource = readFileSync(
  path.join(import.meta.dirname, "..", "models", "modelLibrary3d", "studioEnvironmentRuntime.ts"),
  "utf8",
);
const environmentProjectionSource = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "blocking3dEnvironmentProjection.ts",
  ),
  "utf8",
);
const blockingEnvironmentRuntimeSource = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "drama",
    "comicDrama",
    "components",
    "blocking3d",
    "blocking3dEnvironmentRuntime.ts",
  ),
  "utf8",
);

test("预览器同步构建应用，异步加载后装配动画组件并循环播放", () => {
  assert.match(previewSource, /export function openAnimationPreview/);
  assert.match(previewSource, /instantiateRenderEntity/);
  assert.match(previewSource, /addComponent\("anim"/);
  assert.match(previewSource, /anim\.rootBone = model/);
  assert.match(previewSource, /assignAnimation\(clipName, track, 0, 1, true\)/);
  assert.match(previewSource, /baseLayer\?\.play\(clipName\)/);
  assert.match(previewSource, /app\.start\(\)/);
});

test("动画预览使用固定半圆 HDR 环境和共享地面网格", () => {
  assert.match(previewSource, /loadStudioEnvironment/);
  assert.match(previewSource, /buildBlocking3dGroundGridLines/);
  assert.match(previewSource, /LAYERID_SKYBOX/);
  assert.doesNotMatch(previewSource, /GROUND_HALF_SIZE/);
  assert.doesNotMatch(previewSource, /createPlane\(/);
  assert.doesNotMatch(previewSource, /setupStudioLighting\(/);
  assert.match(environmentRuntimeSource, /createBlocking3dEnvironmentRuntime/);
});

test("预览器提供 HDR 场景、帧轴控制和关键帧截图能力", () => {
  assert.match(previewSource, /loadStudioEnvironment\(app/);
  assert.match(previewSource, /initialFrame/);
  assert.match(previewSource, /frameRateHint/);
  assert.match(previewSource, /onFrameChange/);
  assert.match(previewSource, /pause: /);
  assert.match(previewSource, /setFrame: /);
  assert.match(previewSource, /getFrame: /);
  assert.match(previewSource, /getFrameCount: /);
  assert.match(previewSource, /getFrameRate: /);
  assert.match(previewSource, /isPlaying: /);
  assert.match(previewSource, /fitView: /);
  assert.match(previewSource, /resetView: /);
  assert.match(previewSource, /capturePreviewFrame: /);
  assert.match(previewSource, /toDataURL\("image\/jpeg"/);
  assert.doesNotMatch(previewSource, /UAL1_Standard\.glb/);
  assert.match(previewSource, /frameToSeconds/);
  assert.match(previewSource, /secondsToFrame/);
  assert.match(previewSource, /inferAnimationFrameRate/);
  assert.doesNotMatch(previewSource, /initialTimeSeconds|onTimeChange|setTime|getTime|getDuration/);
});

test("手动定位帧直接同步到界面，不被动画层旧时间覆盖", () => {
  assert.match(previewSource, /const notifyFrame = \(frameOverride\?: number\) =>/);
  assert.match(previewSource, /frameOverride \?\? readCurrentFrame\(\)/);
  assert.match(previewSource, /app\.render\(\);[\s\S]*?notifyFrame\(currentFrame\);/);
});

test("动画预览和缩略图复用分镜草图的主体/关节代理材质", () => {
  assert.match(
    actorMaterialPolicySource,
    /export const BLOCKING_3D_BLUE_ACTOR_COLOR = \[0\.24, 0\.52, 0\.82\]/,
  );
  assert.match(actorMaterialPolicySource, /getBlocking3dActorJointColor/);
  assert.match(actorMaterialPolicySource, /M_Joints/);
  assert.match(actorMaterialPolicySource, /M_Neck/);
  assert.match(actorMaterialRuntimeSource, /getBlocking3dActorMaterialRole/);
  assert.match(actorMaterialRuntimeSource, /WeakMap/);
  assert.match(actorMaterialRuntimeSource, /jointMaterial/);
  assert.match(actorMaterialRuntimeSource, /role === "main"/);
  assert.match(blockingCoreSource, /actorMaterialRuntime/);
  assert.match(blockingCoreSource, /BLOCKING_3D_BLUE_ACTOR_COLOR/);
  assert.match(blockingIndexSource, /BLOCKING_3D_BLUE_ACTOR_COLOR/);
  assert.match(blockingIndexSource, /setEntityMaterial/);
  assert.match(
    previewSource,
    /setEntityMaterial\(model, BLOCKING_3D_BLUE_ACTOR_COLOR\)/,
  );
  assert.match(
    studioSource,
    /setEntityMaterial\(model, BLOCKING_3D_BLUE_ACTOR_COLOR\)/,
  );
});

test("动画预览先启动渲染循环，再执行环境加载后的首帧渲染", () => {
  const startIndex = previewSource.indexOf("app.start()");
  const environmentLoadIndex = previewSource.indexOf(
    "const environmentPromise = loadStudioEnvironment(app, undefined, {",
  );
  const initialFrameIndex = previewSource.indexOf("applyFrame(initialFrame)");

  assert.ok(startIndex >= 0, "动画预览必须启动 PlayCanvas 渲染循环");
  assert.ok(
    environmentLoadIndex >= 0 && startIndex < environmentLoadIndex,
    "HDRI 异步加载前必须先启动渲染循环",
  );
  assert.ok(
    initialFrameIndex >= 0 && startIndex < initialFrameIndex,
    "首帧 app.render() 不能发生在 app.start() 之前",
  );
});

test("动画缩略图使用手动帧更新，不保留可在销毁后继续运行的 RAF", () => {
  assert.match(studioSource, /pc\.AppBase\.cancelTick\(app\)/);
  assert.match(studioSource, /app\.update\(1 \/ 60\)/);
  assert.match(studioSource, /lightingProfile:\s*["']model-preview["']/);
  assert.match(studioSource, /instantiateRenderEntity\?\.\(\{ castShadows: true \}\)/);
  assert.doesNotMatch(studioSource, /enableShadowCatcher:\s*false/);
  assert.doesNotMatch(studioSource, /toneMapping\s*=\s*pc\.TONEMAP_ACES/);
  const thumbnailStartIndex = studioSource.indexOf("app.start()");
  const thumbnailEnvironmentIndex = studioSource.indexOf("loadStudioEnvironment(app");
  assert.ok(
    thumbnailStartIndex >= 0 &&
      thumbnailEnvironmentIndex >= 0 &&
      thumbnailStartIndex < thumbnailEnvironmentIndex,
    "缩略图必须在异步加载 HDRI 前启动 PlayCanvas 生命周期",
  );
  assert.match(
    environmentRuntimeSource,
    /enableShadowCatcher:\s*options\.enableShadowCatcher/,
  );
});

test("动画卡片缩略图只保留角色、HDRI 和投影阴影，不绘制编辑器网格", () => {
  assert.doesNotMatch(studioSource, /buildBlocking3dGroundGridLines/);
  assert.doesNotMatch(studioSource, /drawBlocking3dGroundGrid/);
  assert.match(studioSource, /lightingProfile:\s*["']model-preview["']/);
  assert.match(studioSource, /instantiateRenderEntity\?\.\(\{ castShadows: true \}\)/);
});

test("材质变更后不继续使用旧颜色的截图缓存", () => {
  assert.match(storageSource, /animation-library:keyframes:v3/);
  assert.match(studioSource, /animation-library:thumbnails:v12/);
  assert.doesNotMatch(studioSource, /animation-library:thumbnails:v11/);
  assert.doesNotMatch(studioSource, /animation-library:thumbnails:v10/);
});

test("打开预览页恢复关键帧时先激活动作再写入帧", () => {
  assert.match(previewSource, /const initialFrame =\s*[\s\S]*?options\.initialFrame/);
  assert.match(
    previewSource,
    /baseLayer\?\.play\(activeClipName\)[\s\S]*applyFrame\(initialFrame\)/,
  );
  assert.match(
    previewSource,
    /baseLayer\?\.play\(activeClipName\)[\s\S]*pause\(\)[\s\S]*applyFrame\(initialFrame\)/,
  );
});

test("初始化预览帧前暂停动画层，让首帧立即写入骨骼", () => {
  const restoreBlock = previewSource.match(
    /anim\.baseLayer\?\.play\(activeClipName\);([\s\S]*?)applyFrame\(initialFrame\);/,
  )?.[1];
  assert.ok(restoreBlock, "应有独立的初始动作帧恢复流程");
  assert.match(
    restoreBlock,
    /pause\(\)/,
    "写入初始帧前必须先暂停动画层，触发 PlayCanvas 的同步骨骼求值",
  );
});

test("加载中也可同步取消：cancel 销毁应用，避免双应用共享 WebGL 上下文", () => {
  assert.match(previewSource, /cancel: \(\) =>/);
  assert.match(previewSource, /cleanup\(\)/);
  assert.match(
    previewSource,
    /if \(destroyed\) throw new Error\("预览已关闭。"\)/,
  );
  assert.match(
    previewSource,
    /if \(destroyed\) \{[\s\S]*?app\.assets\.remove\(assetResult\.value\)[\s\S]*?environmentResult\.value\.destroy\(\)/,
  );
  // 完整预览页 effect 清理必须调用 cancel（而不是等加载完成后销毁）
  assert.match(previewPageSource, /handle\.cancel\(\)/);
});

test("预览器销毁时释放资产与上下文，不残留 WebGL 画布", () => {
  assert.match(previewSource, /app\.assets\.remove\(asset\)/);
  assert.match(previewSource, /app\.destroy\(\)/);
  assert.match(previewSource, /resizeObserver\.disconnect\(\)/);
});

test("缩略图生成器装配动作片段并摆到代表帧后抓图，缓存进 localStorage", () => {
  assert.match(studioSource, /export function ensureAnimationThumbnail/);
  assert.match(studioSource, /export function getAnimationThumbnail/);
  assert.match(studioSource, /export function subscribeAnimationThumbnails/);
  assert.match(studioSource, /animation-library:thumbnails:v12/);
  assert.match(studioSource, /preserveDrawingBuffer: true/);
  assert.match(studioSource, /addComponent\("anim"/);
  assert.match(studioSource, /anim\.rootBone = model/);
  assert.match(
    studioSource,
    /assignAnimation\(entry\.clipName, track, 0, 1, true\)/,
  );
  assert.match(studioSource, /activeStateCurrentTime = /);
  assert.match(studioSource, /getDefaultAnimationFrame/);
  assert.match(studioSource, /inferAnimationFrameRate/);
  assert.match(studioSource, /frameToSeconds/);
  assert.match(studioSource, /anim\.playing = false/);
  assert.match(studioSource, /pause\?\.\(\)/);
  assert.doesNotMatch(studioSource, /durationSeconds \* 0\.4/);
  assert.match(
    studioSource,
    /asset = await loadAsset\(app, ANIMATION_LIBRARY_FILE_URL, "container"\)/,
  );
  assert.match(studioSource, /app\.assets\.remove\(asset\)/);
  assert.doesNotMatch(
    studioSource,
    /render\(entry\)[\s\S]*?loadAsset\(app, entry\.fileUrl/,
  );
  assert.match(studioSource, /model\?\.destroy\(\)/);
  assert.match(studioSource, /studioEnvironment\.destroy\(\)/);
  assert.match(studioSource, /app\.destroy\(\)/);
});

test("缩略图工作室初始化失败后会清空失败 Promise，允许后续请求重试", () => {
  assert.match(studioSource, /studioPromise = null/);
  assert.match(studioSource, /if \(!processing\)\s+void processQueue\(\)/);
});

test("HDR 环境和可视穹顶完成后预览器才报告就绪", () => {
  assert.match(
    previewSource,
    /const environmentPromise = loadStudioEnvironment\(app, undefined, \{[\s\S]*lightingProfile:\s*["']model-preview["']/,
  );
  assert.match(previewSource, /Promise\.allSettled\(\[\s*assetPromise,\s*environmentPromise/);
  assert.match(previewSource, /studioEnvironment = environmentResult\.value/);
  assert.match(previewSource, /studioEnvironment\.hasVisibleBackdrop/);
});

test("HDRI 穹顶先等待并行 shader 完成，再允许首帧显示", () => {
  assert.match(environmentProjectionSource, /export async function waitForProjectedHdriShader/);
  assert.match(environmentProjectionSource, /getShaderInstance\(/);
  assert.match(environmentProjectionSource, /isLinked\(/);
  assert.match(environmentProjectionSource, /window\.setTimeout/);
  assert.match(blockingEnvironmentRuntimeSource, /environmentBackdrop\.enabled = false/);
  assert.match(blockingEnvironmentRuntimeSource, /await waitForProjectedHdriShader/);
  assert.match(
    blockingEnvironmentRuntimeSource,
    /if \(!shaderReady\)[\s\S]*?clearEnvironmentLighting\(\)[\s\S]*?clearEnvironmentVisuals\(\)/,
  );
  assert.match(blockingEnvironmentRuntimeSource, /environmentBackdrop\.enabled = true/);
});

test("缩略图工作室初始化失败时释放已创建的 PlayCanvas 应用", () => {
  assert.match(
    studioSource,
    /try \{[\s\S]*?loadStudioEnvironment\(app[\s\S]*?catch \(error\)[\s\S]*?app\.destroy\(\)/,
  );
});

test("动画库是入口页：分类页签 + 动画卡片（预览图 + 名字）+ 完整预览页", () => {
  assert.match(pageSource, /data-animation-page/);
  assert.match(pageSource, /data-animation-category-table/);
  assert.match(pageSource, /data-animation-group-filter/);
  assert.match(pageSource, /ANIMATION_LIBRARY_GROUPS/);
  assert.match(pageSource, /data-animation-classification-filter/);
  assert.match(pageSource, /data-animation-scope-filter/);
  assert.match(pageSource, /data-animation-detail-filters/);
  assert.match(pageSource, /PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /data-animation-pagination/);
  assert.match(pageSource, /data-animation-pack-filter/);
  assert.match(pageSource, /SelectControl/);
  assert.match(pageSource, /filterAnimationLibraryEntries/);
  assert.match(pageSource, /data-animation-grid/);
  assert.match(pageSource, /data-animation-card/);
  assert.match(pageSource, /ensureAnimationThumbnail\(entry\)/);
  assert.match(pageSource, /getAnimationThumbnail\(entry\.id\)/);
  assert.match(pageSource, /getAnimationFrameCount/);
  assert.match(pageSource, /帧/);
  assert.doesNotMatch(pageSource, /秒/);
  assert.match(pageSource, /subscribeAnimationThumbnails/);
  assert.match(pageSource, /alt=\{`\$\{entry\.name\} 预览`\}/);
  assert.match(pageSource, /Link/);
  assert.match(pageSource, /to=\{`\/animations\/\$\{entry\.id\}`\}/);
  assert.doesNotMatch(pageSource, /Dialog/);
  // 卡片网格取代旧表格：页面不再渲染 <table>
  assert.doesNotMatch(pageSource, /<table/);
});

test("动画预览页包含 3D 画布、帧轴、播放控制和关键帧操作", () => {
  assert.match(previewPageSource, /useParams/);
  assert.match(previewPageSource, /openAnimationPreview\(/);
  assert.match(previewPageSource, /data-animation-preview-page/);
  assert.match(previewPageSource, /data-animation-preview-canvas/);
  assert.match(previewPageSource, /type="range"/);
  assert.match(previewPageSource, /setFrame\(/);
  assert.match(previewPageSource, /step="1"/);
  assert.match(previewPageSource, /当前帧/);
  assert.match(previewPageSource, /getAnimationFrameCount/);
  assert.match(previewPageSource, /getAnimationThumbnail/);
  assert.match(previewPageSource, /getDefaultAnimationFrame/);
  assert.doesNotMatch(previewPageSource, /formatTime|timeSeconds/);
  assert.doesNotMatch(previewPageSource, /秒/);
  assert.match(previewPageSource, /capturePreviewFrame\(/);
  assert.match(previewPageSource, /setAnimationKeyframe\(/);
  assert.match(previewPageSource, /clearAnimationKeyframe\(/);
  assert.match(previewPageSource, /fitView\(/);
  assert.match(previewPageSource, /resetView\(/);
  assert.match(previewPageSource, /handle\.cancel\(\)/);
});

test("顶部导航在模型与系统之间提供动画入口，模型页不再内嵌动画", () => {
  const items = navSource.indexOf('to: "/animations", label: "动画"');
  const models = navSource.indexOf('to: "/models", label: "模型"');
  const settings = navSource.indexOf('to: "/settings", label: "系统"');
  assert.ok(items > models && items < settings, "动画入口应位于模型与系统之间");
  assert.doesNotMatch(
    modelPageSource,
    /AnimationTable|data-animation-table|openAnimationPreview/,
  );
});

test("动画目录来源与片段名保持 Cine57 重定向产物命名", () => {
  assert.match(catalogSource, /ANIMATION_LIBRARY_SOURCE = "Cine57"/);
  assert.match(catalogSource, /makeLegacyEntry\("idle-stand"[\s\S]*?"A_INP_Idle"/);
  assert.match(catalogSource, /makeLegacyEntry\("walk-forward"[\s\S]*?"A_INP_WalkFwd_Loop"/);
  assert.match(catalogSource, /makeLegacyEntry\("chair-loop"[\s\S]*?"A_chair_loop01"/);
  assert.match(catalogSource, /sourceLabel: entry\.groupLabel/);
});
