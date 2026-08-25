# 分镜预览兜底与 AI 摆位入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让没有 AI 首帧的分镜强制显示 3D 草图，并从分镜卡片进入现有 3D 编辑器调用大模型完成本镜角色与镜头摆位。

**Architecture:** 分镜卡片只负责根据图片可用性选择预览和导航，不直接执行 3D 保存。新增的“AI摆位”按钮通过 `autoPlan=1` 查询参数进入 `DramaBlocking3DPage`，由页面复用现有结构化自动构图、PlayCanvas 应用布局和退出保存链路。

**Tech Stack:** React 19、React Router、TanStack Query、PlayCanvas、TypeScript、Node.js contract tests、pnpm。

---

### Task 1: 锁定分镜预览兜底和入口契约

**Files:**
- Modify: `client/tests/shotVoiceBlockingSketchEntry.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`

- [ ] **Step 1: Write the failing tests**

增加以下契约断言：

```js
test("没有可用 AI 图时强制显示 3D 草图", () => {
  assert.match(source, /hasReadyAiPreview/);
  assert.match(source, /hasBlockingSketch && !hasReadyAiPreview/);
  assert.match(source, /disabled=\{!hasReadyAiPreview\}/);
});

test("分镜卡片提供 AI 摆位并打开自动构图入口", () => {
  assert.match(source, /AI摆位/);
  assert.match(source, /autoPlan=1/);
  assert.match(source, /AiButton/);
});
```

在 3D 页面契约中增加：

```js
test("autoPlan 查询参数会让已有布局重新交给 AI 规划", () => {
  assert.match(pageSource, /searchParams\.get\("autoPlan"\)/);
  assert.match(pageSource, /autoPlanRequested/);
  assert.match(pageSource, /context\.sketch\?\.layout3d/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

运行：

```powershell
pnpm --dir client exec node --test tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dPage.contract.test.js
```

预期：失败，原因是当前分镜组件没有 `hasReadyAiPreview`/“AI摆位”/`autoPlan=1`，3D 页面也没有读取该参数。

### Task 2: 实现分镜预览回退和 AI 摆位入口

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: Implement the preview selection contract**

使用 `keyframe.status === "done" && Boolean(aiPreviewUrl) && !aiPreviewError` 计算 `hasReadyAiPreview`。活动预览遵循：用户选择仍优先；但 AI 图不可用且草图存在时，活动预览必须为 `sketch`。AI 图 Tab 在没有可用 AI 图时禁用，避免空白面板成为默认结果。

- [ ] **Step 2: Add the AI button**

在现有“编辑3D”旁使用 `AiButton` 增加“AI摆位”，点击导航到：

```tsx
navigate(
  `/drama/projects/${encodeURIComponent(props.projectId)}/shots/${encodeURIComponent(shot.id)}/blocking-3d?order=${shot.order}&autoPlan=1`,
)
```

按钮使用现有语义 token 和 focus ring，不新增颜色、图标库或自绘通知。

- [ ] **Step 3: Run the focused tests and verify GREEN**

运行 Task 1 的测试，预期全部通过。

### Task 3: 让 3D 编辑器响应 AI 摆位入口

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`

- [ ] **Step 1: Read the query flag**

从已有 `useSearchParams` 读取 `autoPlan=1`，得到 `autoPlanRequested`。

- [ ] **Step 2: Extend the existing auto-plan trigger**

首次无布局时继续自动构图；当 `autoPlanRequested` 为真时，即使已有 `context.sketch.layout3d` 也调用 `handleAutoPlan`。自动构图完成后仍只调用 `setDirty(true)` 和现有成功状态，不在此处保存。

- [ ] **Step 3: Run page tests**

运行：

```powershell
pnpm --dir client exec node --test tests/dramaBlocking3dPage.contract.test.js
```

预期：全部通过。

### Task 4: 文档与回归验证

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`

- [ ] **Step 1: Update user-facing release surfaces**

在当前日期条目中说明：无 AI 首帧时分镜显示 3D 草图，并可从分镜卡片调用 AI 完成本镜 3D 摆位。

- [ ] **Step 2: Update durable workflow rules**

把分镜预览规则改为“AI 图不可用时优先显示 3D 草图”，并记录 `AI摆位 → 3D 编辑器 → 退出保存` 的边界。

- [ ] **Step 3: Run verification**

运行：

```powershell
pnpm --dir client exec node --test tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dPage.contract.test.js
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
pnpm check:docs-manifest
git diff --check
```

- [ ] **Step 4: Run real-browser acceptance**

在第一镜分镜列表确认：没有 AI 图时预览区域显示 3D 草图；点击“AI摆位”进入本镜 3D 页面，等待 AI 构图完成后显示“有未保存修改”；退出后返回分镜，3D 草图仍可见且页面没有空白预览。

- [ ] **Step 5: Commit, integrate, push, and clean up**

在 worktree 中使用 `git commit -s`，完成 focused verification 后使用项目集成命令合并、推送 `origin/main`，确认本地/远程 SHA 一致，再清理本次 worktree 和分支。
