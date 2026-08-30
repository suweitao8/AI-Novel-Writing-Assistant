# 场景 3D 圆半径统一 Implementation Plan

> **For agentic workers:** 按任务顺序执行；每个生产改动先补失败测试，再实现并复跑定向检查。设计文档已提交，按项目规则直接进入实现，不等待额外确认。

**Goal:** 把场景/HDRI/空间标记/分镜环境的当前语义统一为真实圆半径 `radiusMeters`，兼容历史直径字段而不改变旧场景实际尺度，并保证角色/怪物身高（0.50–10.00 米）在分镜保存链路中完整往返。

**Architecture:** 共享环境归一化器负责旧 `domeRadius`（历史直径）到 `radiusMeters`（真实半径）的唯一转换；新业务对象和持久化输出只使用 `radiusMeters`。blocking3d 几何保持 0.5 基础半径，在 PlayCanvas 实体缩放边界统一使用 `radiusMeters * 2`。视觉 Prompt 只生成新半径，旧视觉字段仅由输入适配器读取。分镜 API schema 显式保留 `heightMeters`，由共享身高边界校验。

**Tech Stack:** React 19、Vite、PlayCanvas 2.21、TypeScript、Zod、Node test、pnpm worktree integration。

---

### Task 1: 锁定共享半径与身高往返契约（TDD）

**Files:**
- Modify: `shared/types/comicDrama.ts`
- Modify: `shared/utils/scene3dEnvironment.ts`
- Modify: `shared/utils/scene3dMarkers.ts`
- Modify: `shared/utils/storyAssetSceneStates.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`
- Modify: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dMarkerService.ts`
- Modify: `server/src/prompting/prompts/drama/sceneState3dEnvironment.prompts.ts`
- Modify: `server/tests/storyScene3dEnvironment.test.mjs`
- Modify: `server/tests/storyScene3dEnvironmentAnalysis.test.mjs`
- Modify: `server/tests/storyScene3dDomeRadiusRangeContract.test.js`
- Modify: `server/tests/dramaShotBlockingSketchContracts.test.mjs`
- Modify: `server/tests/scene3dMarkerProjection.test.js`
- Add/Modify: focused API schema contract test if the existing route test surface requires one

- [x] **Step 1: 写失败测试**：把默认值、边界、视觉分析、marker sourceEnvironment 和分镜环境断言改成 `radiusMeters`；增加旧 `domeRadius` 直径转换测试（15 → 7.5，旧高度保持 2）；增加新序列化不含 `domeRadius` 的断言；增加 5 米角色经过分镜归一化仍保留 `heightMeters` 的回归。
- [x] **Step 2: 运行 RED**：执行 shared/server 定向测试，确认旧实现因字段名、范围和缺少身高 schema 保留而失败。
- [x] **Step 3: 实现共享合同**：将 `StoryScene3DEnvironment`、输入类型、marker 比较和投影环境切换到 `radiusMeters`；设置范围为半径 `2.5–15`、比例 `10%–40%`、默认半径 `7.5`、默认高度 `2`；兼容读取旧字段并在新输出中删除旧字段；视觉估算接受 `radiusMeters`，旧 `domeDiameterMeters` 只在适配器中除二。
- [x] **Step 4: 实现服务端归一化与 API 边界**：分镜布局、场景设置和 marker sourceEnvironment 同时接受新字段与历史字段，但新归一化结果只返回 `radiusMeters`；保留旧布局历史直径输入带并收敛到新半径范围；场景和分镜请求 schema 显式保留 `radiusMeters`、兼容 `domeRadius`，并保留 `heightMeters`（0.5–10）。Prompt schema 与文案改成真实半径。
- [x] **Step 5: 运行 GREEN**：shared build、服务端定向测试和共享身高档案测试通过后再进入客户端。

### Task 2: 统一 blocking3d 几何、运行时与舞台边界（TDD）

**Files:**
- Modify: `shared/utils/blockingStage.ts`
- Modify: `shared/utils/scene3dProjection.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentGeometry.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dProjectionCenterGizmo.ts`
- Modify: `client/src/pages/models/modelLibrary3d/studioBackdrop.ts`
- Modify: `server/tests/blockingStageContract.test.js`
- Modify: `server/tests/scene3dMarkerProjection.test.js`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentGeometry.test.mjs`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [x] **Step 1: 写失败几何/边界测试**：断言世界半径直接等于 `radiusMeters`；断言半径 7.5 时舞台边界为 6.5；断言基础网格仍以 0.5 为本地半径但实体缩放使用 15；断言 seam 世界高度仍等于投射中心高度；断言模型预览传入真实半径后仍得到原有预览尺度。
- [x] **Step 2: 运行 RED**：执行 blockingStage、marker projection、geometry 和静态 HDRI 契约测试，确认当前除二/直径公式使新断言失败。
- [x] **Step 3: 实现真实半径数学**：把 `resolveStoryScene3DWorldRadius` 作为主函数；舞台边界和 marker 投影直接消费半径；几何 `getGroundDomeEdgeHeight` 与 geometry data 接收真实半径，实体缩放统一使用 `radiusMeters * 2`，不在调用方再传直径。
- [x] **Step 4: 清理客户端字段**：viewer、runtime、gizmo、边界环、shadow catcher、模型预览和环境材质调用统一改为 `radiusMeters`；页面/模型预览只在一个明确的 PlayCanvas 缩放边界生成内部直径值。
- [x] **Step 5: 运行 GREEN**：客户端几何/静态契约、服务端边界测试与 client typecheck 通过。

### Task 3: 更新场景编辑页、API 类型与当前文档

**Files:**
- Modify: `client/src/api/media/drama.ts`
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/wiki/product/model-library.md`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/superpowers/specs/2026-08-30-vision-derived-scene-environment-design.md`
- Modify: `docs/superpowers/plans/2026-08-30-vision-derived-scene-environment.md`

- [x] **Step 1: 更新页面契约**：环境控件改为“圆半径”，范围 2.5–15、步进 0.5、显示一位小数；高度比例改为 10%–40%；保存和 marker sourceEnvironment 使用 `radiusMeters`。
- [x] **Step 2: 更新 API 类型和长期文档**：删除当前业务接口中的 `domeRadius`，在文档中明确旧字段只存在于兼容读取；保留历史设计文档的历史叙述，不做无关批量改写；在角色比例 Wiki 中保留并注明 0.50–10.00 米怪物范围及分镜往返保障。
- [x] **Step 3: 执行 release-note 审查**：按 `readme-release-updater` 规则检查 Git 范围，只记录用户可见的“圆半径统一”和“巨型角色比例可保存”行为；内部兼容实现不写成面向用户的文件/字段说明。

### Task 4: 集成自测与交付

**Files:**
- No additional source files unless verification reveals a scoped defect.

- [x] **Step 1: 运行代码级自测**：`git diff --check`；shared build；server build/typecheck；client typecheck/build；共享环境、分镜、marker、geometry、角色身高定向测试；确认没有数据库迁移、reset 或数据删除。
- [ ] **Step 2: 运行 UI smoke**：在隔离浏览器标签访问固定端口 `5174` 的场景 3D 编辑页，确认“圆半径”控件显示、拖动后高度按比例更新、保存后刷新仍为半径语义，控制台无新增错误。若端口由其他活跃 worktree 占用，保留该进程并记录浏览器验证受阻，不切换端口。
- [ ] **Step 3: 自我验收与提交**：逐项对照设计文档检查新写入不含 `domeRadius`、旧读取保持物理尺度、5 米身高完整往返；只暂存本任务文件，使用 `git commit -s`，不绕过 hooks。
- [ ] **Step 4: 合入并推送**：重新读取 `AGENTS.md` Development Workflow；从干净 `main` 运行 `pnpm workflow:integrate codex/scene-circle-radius --push --verify "<focused verification>"`，确认本地 `HEAD` 与 `origin/main` 一致，再清理本 worktree 和分支。
