# 漫剧 3D 草图投射中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用固定世界中心的投射中心高度替代地面 UV repeat，让普通场景图地面呈现 HDRIBackdrop 式的投射收缩效果。

**Architecture:** viewer 保留四个环境参数，其中 `projectionCenterHeight` 表示世界投射点 `(0, height, 0)`。普通 16:9 场景图的独立下半球在生成几何时按该投射点计算单次 UV，天空和地面实体都固定在世界原点并使用统一半球直径；2:1 等距 HDRI 继续走完整半球。服务端归一化和前端类型移除历史 `groundTextureScale`，旧 JSON 中该未知字段被忽略。

**Tech Stack:** React 19、Vite、PlayCanvas 2.21、TypeScript、Zod、Node test。

---

### Task 1: 锁定投射中心契约并移除密度字段

**Files:**
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Modify: `server/tests/dramaShotBlockingSketchContracts.test.mjs`
- Modify: `client/src/api/media/drama.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`

- [x] **Step 1: 写失败契约测试**：把页面断言从“地面贴图密度”改为“投射中心高度”；断言 viewer 保留 `projectionCenterHeight`，不再出现 `groundTextureScale`、`Math.floor` 或 `createGroundDomeGeometry(environmentSettings.groundTextureScale)`；把服务端旧快照期望改为四字段环境对象，并增加带历史密度字段时归一化后不再返回该字段。
- [x] **Step 2: 运行定向测试确认 RED**：运行客户端静态/页面契约和服务端契约测试，确认旧实现分别因密度字段、旧 UI 和旧归一化结果失败。
- [x] **Step 3: 移除契约字段**：从客户端/服务端环境接口、默认值、归一化和 HTTP schema 中删除 `groundTextureScale`；保留 `projectionCenterHeight` 的 0.6–10 边界，并让 Zod 继续接受旧 JSON 后丢弃未知密度字段。
- [x] **Step 4: 运行定向契约测试确认 GREEN**：确认旧环境对象和历史密度字段都归一化为四字段，越界高度仍被拒绝。

### Task 2: 用投射中心生成普通场景图地面 UV

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [x] **Step 1: 写投射几何失败断言**：断言地面几何接收 `projectionCenterHeight` 和 `domeRadius`，按投射中心计算水平角/俯视角，纹理地址仍为单次采样；断言 `environmentDome` 和 `environmentGround` 的 Y 缩放不再读取 `projectionCenterHeight`。
- [x] **Step 2: 运行静态测试确认 RED**：确认当前几何仍使用 UV repeat 和半球 Y 缩放，新增断言失败。
- [x] **Step 3: 实现最小投射公式**：在地面网格生成阶段把每个顶点换算为世界坐标，使用固定投射中心 `(0, projectionCenterHeight, 0)` 计算方向；U 使用方向方位角并归一化到 `[0,1]`，V 使用向下俯视角映射到源图 `[0.5,1]`，不使用 `Math.floor`、repeat 或超过源图范围的 UV。
- [x] **Step 4: 接入运行时更新**：创建普通场景图地面时用当前投射中心高度生成网格；环境参数变化或加载布局时重建地面网格；统一天空/地面实体的半球尺度为 `domeRadius`，保持世界原点位置。
- [x] **Step 5: 运行客户端定向测试和类型检查**：普通场景图、2:1 HDRI、固定世界位置和投射中心契约均通过，workspace typecheck 也通过。

### Task 3: 调整右侧控件和持久化说明

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/superpowers/specs/2026-08-24-drama-hdri-backdrop-clarity-design.md`
- Modify: `docs/superpowers/plans/2026-08-24-drama-hdri-backdrop-clarity.md`

- [x] **Step 1: 替换控件**：移除“地面贴图密度” range，现有“投影高度”改名为“投射中心高度”，aria-label 改为 `HDRI 投射中心高度`，继续显示 0.6–10 数值；半球控件以“半球直径”显示 20–100，二者都通过 `setEnvironmentSettings` 受控更新。
- [x] **Step 2: 更新长期文档**：把 release/README/wiki/旧设计计划中的 density repeat 描述改为固定世界中心的投射中心高度，并说明普通场景图地面只做单次投射。
- [x] **Step 3: 运行客户端构建和服务端类型检查**：workspace typecheck、客户端 build 和服务端定向契约测试均通过。

### Task 4: 真实页面回归与交付

**Files:**
- No additional source files.

- [ ] **Step 1: 刷新固定端口服务**：保持 API 3100、client 5174；打开当前镜头的干净 3D 草图页面，读取投射中心高度控件和截图。
- [ ] **Step 2: 验证视觉与交互**：确认地面没有 repeat 拼贴、调节投射中心高度后中心采样关系改变、投射中心 X/Z 固定且地面不随相机移动；读取控制台确认无新增错误。
- [ ] **Step 3: 检查 diff 并提交**：确认只包含该修正，使用 `git commit -s`。
- [ ] **Step 4: 合入并推送**：从干净 `main` 使用 `pnpm workflow:integrate codex/drama-projection-center --push --verify "pnpm build"`，确认本地/远程 SHA 一致并清理本次 worktree。
