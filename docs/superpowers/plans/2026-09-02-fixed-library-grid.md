# 模型库与动画库固定网格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模型库与动画库在任意桌面窗口宽度下都保持每行 10 个、每页 5 行的稳定浏览节奏。

**Architecture:** 保留两页现有的筛选、当前页切片、缩略图和分页控件，只把模型分页从容器测量改为固定 50 条，并把两页的 Tailwind 网格列数锁定为 `grid-cols-10`。模型页的动态页大小 hook 和对应纯函数测试删除，避免未来再次根据窗口尺寸改变页大小。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + Node.js `node:test` + Vite 本地浏览器自测。

---

### Task 1: 锁定固定网格与分页合同

**Files:**
- Modify: `client/src/pages/models/modelLibraryPagination.test.mjs`
- Modify: `client/tests/modelThumbnailPerformance.contract.test.js`
- Modify: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`

- [x] **Step 1: 将模型分页行为测试改为固定 50 条。**

把模型分页断言改为 `MODEL_LIBRARY_PAGE_SIZE === 50`，用 51 条数据验证第一页有 50 条、第二页有 1 条，并删除依赖可用高度、列数和最大行数的测试。

- [x] **Step 2: 将模型页面合同改为固定网格。**

断言模型页使用 `MODEL_LIBRARY_PAGE_SIZE` 切片和 `grid grid-cols-10 gap-2`，不再读取动态页大小 hook；保留当前页挂载、缩略图视口门控和分页控件断言。

- [x] **Step 3: 将动画页面合同改为固定 10 列。**

断言动画页保留 50 条分页，但网格类名必须是 `grid grid-cols-10 gap-2`，不再允许 `grid-cols-2`、`sm:grid-cols-3` 或 `lg:grid-cols-4` 这样的响应式列数。

- [x] **Step 4: 运行合同测试并确认旧实现按预期失败。**

运行：

```text
pnpm exec node --test client/src/pages/models/modelLibraryPagination.test.mjs client/src/pages/models/ModelLibraryPage.test.mjs client/tests/modelThumbnailPerformance.contract.test.js client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs
```

预期：模型页固定 50 条和移除动态 hook的断言失败，证明测试捕获了当前行为；动画固定列数断言也会因响应式类名失败。

### Task 2: 实现固定 10 列 × 5 行

**Files:**
- Modify: `client/src/pages/models/modelLibraryPagination.ts`
- Modify: `client/src/pages/models/ModelLibraryPage.tsx`
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx`
- Delete: `client/src/pages/models/hooks/useModelLibraryPageSize.ts`

- [x] **Step 1: 固定模型分页常量并删除动态计算。**

将 `MODEL_LIBRARY_PAGE_SIZE` 改为 50，保留 `getModelLibraryPage` 的页码边界保护，删除 `ModelLibraryPageSizeMetrics`、`MODEL_LIBRARY_MAX_PAGE_ROWS` 和 `getModelLibraryPageSize`。

- [x] **Step 2: 让模型页直接使用固定页大小。**

移除 `useModelLibraryPageSize` 的 import 和调用，调用 `getModelLibraryPage(entries, page, MODEL_LIBRARY_PAGE_SIZE)`，并把模型网格类名固定为 `grid grid-cols-10 gap-2`。筛选重置、越界收敛和缩略图取消逻辑保持不变。

- [x] **Step 3: 让动画页固定 10 列。**

保留 `PAGE_SIZE = 50` 和当前页切片，删除响应式列数类，仅保留 `grid grid-cols-10 gap-2`。

- [x] **Step 4: 运行测试并确认绿灯。**

重复 Task 1 的合同测试，并运行：

```text
pnpm --filter @ai-novel/client typecheck
```

预期所有合同测试通过，客户端类型检查退出码为 0。

### Task 3: 文档、浏览器回归与交付

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-02-fixed-library-grid-design.md`
- Modify: `docs/superpowers/plans/2026-09-02-fixed-library-grid.md`

- [x] **Step 1: 记录稳定的布局契约。**

在模型库 wiki 中说明模型与动画资产入口统一采用 10 列、5 行、50 条/页；在 release notes 和 README 最新更新中用用户视角说明分页和网格在窗口尺寸变化时保持稳定。

- [x] **Step 2: 运行全量相关检查。**

运行模型/动画相关合同测试、`pnpm --filter @ai-novel/client typecheck`、`pnpm check:docs-manifest`，并执行 `git diff --check`。

- [x] **Step 3: 浏览器验证宽窄视口。**

在内置浏览器打开模型页和动画页，分别检查宽桌面与窄桌面视口：网格计算列数为 10，过滤后当前页最多 50 个卡片，分页切换仍正确，控制台无错误且网络无 4xx/5xx。

- [x] **Step 4: 自验、签名提交、合并推送并清理。**

确认差异只包含固定网格实现、测试和文档；使用 `git commit -s` 提交，在干净的 `main` 上通过 `pnpm workflow:integrate codex/fixed-library-grid --push --verify "pnpm test:model-library"` 集成，随后清理本工作树和分支，并确认 `main == origin/main`。
