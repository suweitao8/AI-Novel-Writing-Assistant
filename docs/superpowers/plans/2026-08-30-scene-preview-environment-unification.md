# 场景预览 HDR 半圆环境统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模型、动画及其缩略图都使用漫剧同源的固定半圆 HDR 投影环境、统一的 2m/15m 默认设置和统一地面网格。

**Architecture:** 以 `blocking3d` 的 `createBlocking3dEnvironmentRuntime` 为唯一 HDR 环境实现，在模型预览目录提供薄适配层，单次加载的纹理同时生成可见投影 cubemap 和环境光 atlas。将漫剧查看器现有的网格构建/绘制抽为 `blocking3d` 环境 overlay，所有实时预览和离屏缩略图调用同一实现；模型直径变化只重建环境几何和 uniform。

**Tech Stack:** React 19, TypeScript, PlayCanvas, Node `node:test`, Vite。

---

### Task 1: 写统一环境的红灯回归契约

**Files:**
- Create: `client/tests/scenePreviewEnvironmentUnification.contract.test.js`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`
- Modify: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] **Step 1: 写会失败的断言**

在新契约测试中读取实际源码并断言：统一适配层导出默认 `domeRadius: 15`、`projectionCenterHeight: 2`、`panoramaHorizonV: 0.5`；内部调用 `createBlocking3dEnvironmentRuntime`；模型和动画路径使用 `buildBlocking3dGroundGridLines`；模型运行时不再并行调用 `upgradeStudioEnvironment` 与 `attachStudioBackdrop`。在动画测试中增加 `createStudioEnvironmentRuntime`、`loadStudioEnvironment` 和移除旧固定平面/固定 `-3..3` 网格的断言；在模型测试中把三套预设的默认直径断言改为统一 `15`，并断言直径偏好版本/默认回退保持 5–30 范围。

- [ ] **Step 2: 运行红灯测试**

Run: `pnpm --filter @ai-novel/client exec node --test tests/scenePreviewEnvironmentUnification.contract.test.js src/pages/animations/animationPreviewApp.test.mjs tests/modelStudioEnvironment.contract.test.js`

Expected: FAIL，失败原因必须是统一适配层/网格构建入口尚未存在或现有动画固定平面契约仍存在，而不是测试语法错误。

### Task 2: 抽出漫剧环境网格的唯一实现

**Files:**
- Create: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentOverlay.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/index.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentOverlay.test.mjs`

- [ ] **Step 1: 写纯函数测试**

测试 `buildBlocking3dGroundGridLines(environmentSettings)` 在默认环境下生成对称的 1m 网格，主线每 5m 使用漫剧现有颜色，端点不超过 `domeWorldRadius * GROUND_DOME_FLAT_RADIUS`；测试直径改变时网格边界同步改变，不再固定为 10m。

- [ ] **Step 2: 运行纯函数红灯测试**

Run: `pnpm --filter @ai-novel/client exec node --test src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentOverlay.test.mjs`

Expected: FAIL because the overlay module and builder do not yet exist。

- [ ] **Step 3: 实现 overlay 模块**

让模块导出 `Blocking3dGroundGridLine`、`buildBlocking3dGroundGridLines(environmentSettings)` 和 `drawBlocking3dGroundGrid(app, lines)`。用 `resolveStoryScene3DDomeWorldRadius` 与 `GROUND_DOME_FLAT_RADIUS` 求可用平面半径；按 1m 递增生成两组交叉线，5m 倍数使用现有主网格颜色，其余使用现有次网格颜色，Y 保持 `0.005`。不在模块中创建 entity 或绑定相机。

- [ ] **Step 4: 让漫剧查看器改用 overlay**

删除 `blocking3dViewerApp.ts` 内固定 `-10..10` 的 `gridLines` 构建；在环境参数初始化和设置变化处重建共享网格，在 update 中调用共享绘制函数。保留漫剧的 stage/dome 边界圈和投射中心 gizmo，它们不是本次统一的地面网格。

- [ ] **Step 5: 运行 overlay 绿灯测试**

Run: `pnpm --filter @ai-novel/client exec node --test src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentOverlay.test.mjs src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentGeometry.test.mjs`

Expected: PASS。

### Task 3: 合并模型 HDR 可见背景与环境光生命周期

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/studioEnvironmentPresets.ts`
- Modify: `client/src/pages/models/modelLibrary3d/studioEnvironmentRuntime.ts`
- Modify: `client/src/pages/models/modelLibrary3d/studioBackdrop.ts`
- Modify: `client/src/pages/models/modelLibrary3d/studioLighting.ts`
- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`

- [ ] **Step 1: 统一预设默认值**

把三套预设的默认 `diameterMeters` 都设为 `15`、`projectionCenterHeightMeters` 都设为 `2`；增加由漫剧 `DEFAULT_BLOCKING_3D_ENVIRONMENT`/`normalizeEnvironmentSettings` 产生设置的适配函数，保证模型 UI 的直径仍被 5–30 限制，内部字段 `domeRadius` 明确表示完整直径。

- [ ] **Step 2: 用单次资产加载装配环境**

重写 `studioEnvironmentRuntime.ts` 的 `loadStudioEnvironment`：按预设 HDR、旧版 panorama、内置棚拍 HDR 顺序加载一个 `pc.Asset`；创建 blocking3d 环境 runtime 并调用一次 `load(url, settings)`，让同一个纹理负责 `envAtlas` 与可见 cubemap；加载成功后返回 `settings`、`applySettings`、`rebuildEnvironmentBackdropMesh`、`destroy` 和 `hasVisibleBackdrop`。任何旧请求或销毁状态都不得接管新状态。

- [ ] **Step 3: 删除重复路径**

让 `studioBackdrop.ts` 与 `studioLighting.ts` 不再作为模型环境装配入口；保留必要的旧导出/资源常量以避免无关调用方断裂，但不能再让 `loadStudioEnvironment` 并行调用 `upgradeStudioEnvironment` 和 `attachStudioBackdrop`。

- [ ] **Step 4: 让模型直径调节原地生效**

在 `modelViewerApp.ts` 记录规范化环境设置和共享网格；切换预设时替换 HDR，直径变化时更新 `domeRadius`/派生投射高度、调用 runtime 的 `applySettings` 与几何重建，并重建网格，不重新加载 HDR。相机继续移除 `SKYBOX` 层；update 中绘制共享网格；销毁时释放网格、环境和事件监听。

- [ ] **Step 5: 运行模型契约测试**

Run: `pnpm --filter @ai-novel/client exec node --test tests/modelStudioEnvironment.contract.test.js tests/scenePreviewEnvironmentUnification.contract.test.js`

Expected: PASS，且不再出现“双加载可见穹顶/环境光”或模型预设默认值分裂的断言失败。

### Task 4: 统一动画实时预览和两类缩略图

**Files:**
- Modify: `client/src/pages/animations/animationPreviewApp.ts`
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts`
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`
- Modify: `client/tests/modelStudioEnvironment.contract.test.js`

- [ ] **Step 1: 替换动画实时预览地面**

删除 `animationPreviewApp.ts` 的 `GROUND_HALF_SIZE`、平面 material/entity 和 `-3..3` 网格循环；创建相机后移除 SKYBOX 层，调用统一 `loadStudioEnvironment` 使用默认室内 HDR 与 15m/2m 设置，update 中调用共享网格绘制。保留模型加载、动作循环、相机 orbit、取消和销毁语义。

- [ ] **Step 2: 替换动画缩略图地面**

在 `animationThumbnailStudio.ts` 删除 `anim-thumb-ground` 以及本地网格数组，使用默认环境句柄的设置生成共享网格，抓图前绘制共享网格。缩略图离屏 canvas 继续固定尺寸、`autoRender=false` 和双帧稳定策略。

- [ ] **Step 3: 统一模型缩略图环境**

在 `thumbnailStudio.ts` 接入共享网格绘制和统一环境设置；使用环境句柄提供的 15m/2m 默认值，不自行创建地面。保持模型材质、取景、缓存和 idle destroy 行为。

- [ ] **Step 4: 运行动画/缩略图契约测试**

Run: `pnpm --filter @ai-novel/client exec node --test src/pages/animations/animationPreviewApp.test.mjs tests/modelStudioEnvironment.contract.test.js tests/scenePreviewEnvironmentUnification.contract.test.js`

Expected: PASS，动画实时路径与两个缩略图路径都只出现统一环境入口，不再出现固定平面或分裂网格逻辑。

### Task 5: 文档与用户可见更新

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Create or modify: `docs/wiki/architecture/scene-preview-environment.md`

- [ ] **Step 1: 更新用户可见发布说明**

在当前日期的 release notes 中说明模型和动画预览统一使用固定 HDR 半圆场景、投射中心/半球直径默认值和地面网格；刷新 README 的“最新更新”只保留最新日期块和历史记录链接。

- [ ] **Step 2: 写稳定架构知识**

记录漫剧 `blocking3d` 是场景 HDR 投影的唯一实现、`domeRadius` 表示完整直径、env atlas 只负责光照、相机必须移除 SKYBOX、网格是独立编辑器 overlay，以及模型直径变化不应重复加载 HDR。

- [ ] **Step 3: 检查文档一致性**

Run: `pnpm check:docs-manifest`

Expected: PASS；文档不描述文件改动清单，而是描述用户行为和长期边界。

### Task 6: 全量自测与浏览器验收

**Files:**
- Test only; no additional source files.

- [ ] **Step 1: 运行客户端类型检查**

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: exit code 0。

- [ ] **Step 2: 运行相关客户端测试**

Run: `pnpm --filter @ai-novel/client exec node --test tests/scenePreviewEnvironmentUnification.contract.test.js tests/modelStudioEnvironment.contract.test.js src/pages/animations/animationPreviewApp.test.mjs src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentOverlay.test.mjs src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentGeometry.test.mjs`

Expected: all tests pass with zero failures。

- [ ] **Step 3: 用隔离浏览器标签检查实际页面**

在不接触用户现有标签的隔离 tab 中打开 `http://127.0.0.1:5174/models` 和 `http://127.0.0.1:5174/animations`，进入可用模型/动画预览；旋转相机，确认 HDR 背景保持世界固定、地面为半圆穹顶并显示统一网格。若本地数据库没有可用条目，至少验证页面加载、canvas 初始化和控制台/网络错误，并明确记录无法完成的 3D 路径。

- [ ] **Step 4: 做差异自审**

Run: `git diff --check; git status --short; git diff --stat`

逐条核对设计文档目标，确认没有把模型直径解释成半径、没有残留动画平面地面、没有重复 HDR 加载、没有在主工作树产生改动。

