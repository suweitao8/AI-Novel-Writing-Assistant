# 漫剧 3D 对象面板与选中反馈实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task.

**Goal:** 将场景 3D 编辑和分镜 3D 草图的右侧工作区收敛为 Unity 风格的对象树与固定滚动属性面板，并为可移动角色增加位置/旋转/大小和外轮廓选中反馈。

**Architecture:** 保持现有 `Drama3DEditorShell`、`Drama3DObjectPanel` 和 PlayCanvas viewer 边界。对象树只负责对象选择，属性面板承载对象操作；选中外轮廓抽取到 blocking3d 组件中，以世界 AABB 作为跨角色代理和比例参照的统一视觉反馈。

**Tech Stack:** React 19、Tailwind semantic tokens、shadcn Card/Button、lucide-react、PlayCanvas、Node contract tests、TypeScript/Vite。

---

### Task 1: 写对象面板和选中反馈契约测试

**Files:**
- Modify: `client/tests/drama3dEditorWorkbench.contract.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`

- [ ] **Step 1: 写目标断言**

断言对象面板没有 `meta`/`trailing` 视觉渲染，两个页面和共享 shell 使用「属性面板」，shell 采用固定对象区 + 剩余属性区的 grid track；分镜属性包含 `位置`、`旋转`、`大小`，viewer 接入选中外轮廓模块。

- [ ] **Step 2: 运行测试确认 RED**

运行：`pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/dramaBlocking3dPage.contract.test.js`

预期：由于当前仍有 meta、旧标题、缺少大小字段和外轮廓模块，新增断言失败。

### Task 2: 收敛对象树和属性面板布局

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx`
- Modify: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DEditorShell.tsx`
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`

- [ ] **Step 1: 对象项只保留图标和名称**

删除 `Drama3DObjectItem` 的 `meta`/`trailing` 展示和类型字段；将分镜角色移除按钮放入角色属性面板。

- [ ] **Step 2: 固定属性区域并统一命名**

给对象 Card 和属性 Card 增加 `h-full`，将右侧 grid 调整为对象区有明确上限、属性区 `minmax(0, 1fr)`，属性内容保留 `overflow-y-auto`；所有标题和 aria label 改为「属性面板」。

- [ ] **Step 3: 补齐可移动角色变换信息**

在分镜选中角色的 `<dl>` 中显示 `selectedTransform.position`、`selectedTransform.yawDeg` 和 `selectedTransform.scale`，大小沿用 `formatVec3`，不改变保存或 viewer API。

### Task 3: 实现 3D 选中外轮廓

**Files:**
- Create: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dSelectionOutline.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`

- [ ] **Step 1: 提取世界 AABB 外轮廓绘制函数**

遍历实体渲染组件的 mesh instance，合并 `aabb.center/halfExtents`，生成带小 padding 的 8 个世界角点和 12 条边；空实体直接跳过。

- [ ] **Step 2: 每帧绘制当前角色外轮廓**

在 viewer 的 update 渲染循环中，对 `selectedActor()` 调用外轮廓函数；销毁流程继续由 PlayCanvas app 统一清理，外轮廓只使用 immediate draw line，不加入导出布局。

- [ ] **Step 3: 保留既有圆环和标记线框**

地面圆环继续提供脚下定位，marker 继续使用自身颜色和选中透明度；选择 actor/marker/root 时三者状态仍通过现有 listener 同步。

### Task 4: 验证、文档和交付

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 运行聚焦测试和类型检查**

运行契约测试、`pnpm typecheck`、`pnpm --filter @ai-novel/client build` 和 `pnpm check:docs-manifest`，确认无失败。

- [ ] **Step 2: 记录长期规则和用户可见更新**

在 3D 工作流 wiki 中记录对象树/属性面板/选中反馈边界；按 release updater 规则更新 2026-08-26 的发布说明和 README 最新更新。

- [ ] **Step 3: 提交并集成**

使用 `git commit -s` 提交；从干净 main 运行 `pnpm workflow:integrate codex/scene-object-panel-polish --verify "pnpm typecheck" --push`，确认 `HEAD == origin/main` 后清理本 worktree。
