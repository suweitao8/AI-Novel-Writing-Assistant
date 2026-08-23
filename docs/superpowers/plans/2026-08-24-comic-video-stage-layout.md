# 漫剧视频阶段界面整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整理漫剧工作室「视频」页的合成设置、进度、预览和结果信息，移除当前页指向旧视频工作台的入口。

**Architecture:** 保留 `useDramaEpisodeAssembly`、现有 API 和合成控制器不变，只在 `DramaEpisodeAssemblyResultPanel` 内重排展示层；`ComicDramaStudioPage` 只删除当前视频页的旧跳转入口。用契约测试锁定用户可见结构和文案，再用客户端类型检查与真实浏览器验证布局。

**Tech Stack:** React 19, TypeScript, Tailwind CSS tokens, existing shadcn `Card`/`Badge`/`Button`, native checkbox/video controls, Node test runner.

---

### Task 1: Lock the intended video-stage contract

**Files:**
- Modify: `client/tests/storyboardLandscapeTtsContracts.test.js`
- Modify: `client/tests/comicDramaStoryboardFlow.test.js`
- Modify: `client/tests/dramaStaticShotImageContracts.test.js`

- [ ] **Step 1: Add failing assertions**

Assert that the assembly panel contains the user-facing sections and labels `合成设置`, `字幕写入视频`, `片头和片尾`, `视频预览`, and `视频信息`; assert that the preview does not use `max-w-3xl`; assert that the studio page no longer contains `打开视频工作台`.

- [ ] **Step 2: Run the focused contract tests and verify RED**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/storyboardLandscapeTtsContracts.test.js tests/comicDramaStoryboardFlow.test.js tests/dramaStaticShotImageContracts.test.js
```

Expected: failures identify the old labels, constrained preview, and old link.

### Task 2: Reorganize the assembly result panel

**Files:**
- Modify: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`

- [ ] **Step 1: Keep controller behavior unchanged**

Do not change `useDramaEpisodeAssembly`, request payloads, polling, toast messages, progress calculations, or result field names.

- [ ] **Step 2: Replace the flat settings row with explicit setting cards**

Keep both controlled checkboxes bound to `controller.burnSubtitles` and `controller.includeCards`, but render the new labels and descriptions in a responsive `sm:grid-cols-2` section headed `合成设置`. Preserve disabled state while `controller.running`.

- [ ] **Step 3: Split progress, result, and metadata into named sections**

Keep existing progress/error branches, add visible section labels, put the completed video in a full-width `overflow-hidden` wrapper, and replace `mx-auto ... max-w-3xl` with `block aspect-video w-full` (or an equivalent token-based full-width class set). Put duration, shot count, subtitle mode, generated time, download, external-open, and warnings in the dedicated result area.

### Task 3: Remove the misleading current-page link

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`

- [ ] **Step 1: Remove the `video` tab action link**

Delete the `打开视频工作台` branch and its now-unused `Film` import. Keep the `video` tab itself and keep `/drama/projects/:id` untouched for legacy consumers.

- [ ] **Step 2: Run the focused tests and verify GREEN**

Run the command from Task 1 and confirm all targeted contracts pass.

### Task 4: Verify the implementation

**Files:**
- No new production files.

- [ ] **Step 1: Run client typecheck**

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run workspace integrity and diff checks**

```powershell
pnpm check:workspace-integrity
git diff --check
```

- [ ] **Step 3: Verify in the running browser**

Open the existing `http://localhost:5174/drama/studio/cmt0z2mgy0012zsb5d716mkzj`, switch to `视频`, and verify: the old link is absent, the four named sections are visible, the video spans the content width, the two settings remain keyboard-accessible and disabled during assembly, and the completed-video metadata/download actions remain available.

- [ ] **Step 4: Commit the coherent unit**

```powershell
git add client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx client/tests/storyboardLandscapeTtsContracts.test.js client/tests/comicDramaStoryboardFlow.test.js client/tests/dramaStaticShotImageContracts.test.js
git diff --cached --check
git commit -s -m "feat: clarify drama video stage layout"
```

### Task 5: Integrate and push

**Files:**
- No direct edits on `main`.

- [ ] **Step 1: Run the guarded integration from the primary checkout**

```powershell
pnpm workflow:integrate codex/comic-video-layout-v2 --push --verify "pnpm --filter @ai-novel/client exec node --test tests/storyboardLandscapeTtsContracts.test.js tests/comicDramaStoryboardFlow.test.js tests/dramaStaticShotImageContracts.test.js"
```

- [ ] **Step 2: Confirm `main` and `origin/main` match**

Verify `git status --short --branch` is clean, `git rev-parse HEAD` equals `git ls-remote origin refs/heads/main`, and no merge-head or integration lock remains.

- [ ] **Step 3: Remove only this merged worktree and branch**

Verify the task branch is fully merged, then remove `D:\Github\AI-Novel-Writing-Assistant-comic-video-layout-v2`, delete `codex/comic-video-layout-v2`, and run `git worktree prune`.
