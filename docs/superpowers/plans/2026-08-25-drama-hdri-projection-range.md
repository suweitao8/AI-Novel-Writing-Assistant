# 漫剧 3D 草图 HDRI 参数范围 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将投射中心高度放宽到 `0.6–10`、半球直径放宽到 `20–100`，并让页面、服务端和普通场景图投影计算保持一致。

**Architecture:** 保留现有 `layout3d.environment` 四字段和 `domeRadius` JSON 字段，避免旧快照迁移；当前基础网格半径为 0.5，因此 `domeRadius` 的用户可见值对应半球直径。投射中心仍是世界 `(0, projectionCenterHeight, 0)`，只调整范围，不恢复 UV repeat 或改变实体位置。

**Tech Stack:** React 19、Vite、PlayCanvas 2.21、TypeScript、Zod、Node test。

---

### Task 1: 先锁定新的范围契约

**Files:**
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Modify: `server/tests/dramaShotBlockingSketchContracts.test.mjs`

- [x] **Step 1: 扩展失败测试**：页面断言必须包含投射中心高度 `min="0.6" max="10"`、半球直径 `min="20" max="100"`；服务端越界表覆盖高度 `0.5/10.1` 和直径 `19/100.1`；viewer 源码契约断言同步出现新边界且不出现旧密度字段。
- [x] **Step 2: 运行定向测试确认 RED**：分别运行客户端静态契约、页面契约和服务端契约，已确认它们因旧 `0.6–2`、`24–96` 范围失败。

### Task 2: 同步运行时和服务端边界

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`

- [x] **Step 1: 修改 viewer 归一化**：把 `projectionCenterHeight` clamp 改为 `0.6–10`，把 `domeRadius` clamp 改为 `20–100`；默认值继续为 `1` 和 `48`。
- [x] **Step 2: 修改服务端契约**：将 `BLOCKING_SKETCH_3D_ENVIRONMENT_LIMITS` 和 `blockingSketch3dEnvironmentSchema` 使用同样的 `0.6–10`、`20–100` 边界，保持旧字段名和四字段输出。
- [x] **Step 3: 运行定向测试确认 GREEN**：客户端静态/页面契约和服务端契约全部通过，并确认旧 `groundTextureScale` 仍被忽略。

### Task 3: 更新控件和长期文档

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/superpowers/specs/2026-08-24-drama-hdri-projection-center-design.md`
- Modify: `docs/superpowers/specs/2026-08-24-drama-hdri-backdrop-clarity-design.md`
- Modify: `docs/superpowers/plans/2026-08-24-drama-hdri-projection-center.md`
- Modify: `docs/superpowers/plans/2026-08-24-drama-hdri-backdrop-clarity.md`

- [x] **Step 1: 更新 range 控件**：投射中心高度使用 `0.6–10`、`step="0.1"`；半球控件文案改为“半球直径”，使用 `20–100`、`step="1"`；保留 ARIA label、受控状态和 `setEnvironmentSettings`。
- [x] **Step 2: 更新文档范围**：把用户可见说明和 HDRI 设计规则中的旧范围改为新范围，明确 `domeRadius` 是兼容字段、界面语义是半球直径，并保留无 repeat 的投影规则。

### Task 4: 验证并交付

**Files:**
- No additional source files.

- [x] **Step 1: 运行验证**：执行客户端/服务端定向测试、`pnpm typecheck` 和 `pnpm build`，确认全部退出码为 0。
- [x] **Step 2: 固定端口页面回归**：在 5174 的 3D 草图页面确认两个 range 显示新边界、场景正常渲染、控制台无新增错误；API 3100 健康检查返回成功。
- [x] **Step 3: 提交并合入**：检查 diff 和状态，使用 `git commit -s`，从干净 `main` 运行 `pnpm workflow:integrate codex/drama-projection-range --push --verify "pnpm build"`，核对本地与 `origin/main` SHA 相同并清理本次 worktree。
