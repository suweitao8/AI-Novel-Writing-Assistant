# 漫剧工作台分镜与视频页签布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将漫剧工作台的整集合成结果集中到「视频」页签，并把分镜批量操作放到当前页签上层的 Tab 操作栏。

**Architecture:** `ShotVoiceListPanel` 继续拥有分镜查询、批量任务和合成 controller，通过 React portal 把三个按钮渲染到 `ComicDramaStudioPage` 提供的上层操作槽。`DramaEpisodeAssemblyResultPanel` 只由视频页的 `VideoSection` 承载，分镜页不再渲染任何整集合成结果。

**Tech Stack:** React 19、React DOM `createPortal`、Radix/shadcn Tabs、Tailwind semantic tokens、Node built-in test runner、TypeScript。

---

### Task 1: Add failing UI contracts

**Files:**
- Modify: `client/tests/storyboardLandscapeTtsContracts.test.js`
- Modify: `client/tests/comicDramaStoryboardFlow.test.js`
- Modify: `client/tests/dramaShotBatchFeedback.test.js` only if the new toolbar contract needs a focused assertion

- [ ] **Step 1: Replace the old duplicate-result expectation**

Change the existing assertion that requires `DramaEpisodeAssemblyResultPanel` in `ShotVoiceListPanel` to require the opposite: the list source must not render that result panel, while `DramaEpisodeAssemblyPanel.tsx` must still export and render it.

- [ ] **Step 2: Add the requested tab and toolbar contracts**

Add assertions that the page source contains `video: "视频"`, passes a `toolbarTarget` to `ShotVoiceListPanel`, and defines the storyboard action slot. Assert the panel uses `createPortal`, receives `toolbarTarget`, renders the three existing operations, renders the literal `生成分镜` without the old count interpolation, and no longer imports or renders `DramaEpisodeAssemblyResultPanel`.

- [ ] **Step 3: Run the focused contracts and verify the expected RED state**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/storyboardLandscapeTtsContracts.test.js tests/comicDramaStoryboardFlow.test.js
```

Expected: the new assertions fail because the current code still renders the result panel in `ShotVoiceListPanel`, labels the tab `成片`, and keeps the toolbar inside the list.

### Task 2: Move the result boundary and upper toolbar

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [ ] **Step 1: Add a parent-owned toolbar target**

In `ComicDramaStudioPage`, add a state value of type `HTMLDivElement | null` for the storyboard toolbar target. Attach it only to the current-tab action slot, pass it as `toolbarTarget` to `ShotVoiceListPanel`, and keep the existing reference/script/video actions unchanged.

- [ ] **Step 2: Render the three storyboard actions through the target**

In `ShotVoiceListPanel`, import `createPortal`, add `toolbarTarget` to props, and portal the existing batch keyframe, batch TTS, and `DramaEpisodeAssemblyButton` controls when a storyboard exists. Preserve their existing busy/pending/disabled conditions and toast callbacks. Remove the old internal toolbar wrapper so the list body begins with status/progress content.

- [ ] **Step 3: Simplify the first action label**

Change the batch keyframe button to render only the text `生成分镜`; remove the missing-count interpolation and the leading `ImageIcon`. Keep the loading/disabled behavior and the per-shot `ImageIcon` placeholder because that icon still communicates an image-generation empty state inside a shot row.

- [ ] **Step 4: Remove the duplicate result panel and rename the page tab**

Remove the `DramaEpisodeAssemblyResultPanel` import and the bottom result-panel render from `ShotVoiceListPanel`. Change the page tab label to `视频` and the top action link to `打开视频工作台`. Keep `VideoSection` and its `DramaEpisodeAssemblyPanel` as the single result owner.

### Task 3: Verify behavior and presentation

**Files:**
- Verify: `client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx`
- Verify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Verify: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`

- [ ] **Step 1: Run the focused contracts**

Run the focused command from Task 1 and require zero failures.

- [ ] **Step 2: Run client typecheck**

Run:

```powershell
pnpm --filter @ai-novel/client typecheck
```

Require exit code 0. If the repository baseline still lacks generated shared artifacts, record the exact pre-existing failure and run a narrower TypeScript check only if it can prove the changed files.

- [ ] **Step 3: Inspect the live workbench**

Use the existing local workbench at `http://localhost:5174/drama/studio/cmt0z2mgy0012zsb5d716mkzj` without restarting the shared services. Verify the `视频` tab, the three upper-row buttons, absence of the video player on `分镜`, and presence of the video player/result controls on `视频`.

- [ ] **Step 4: Commit the coherent UI unit**

Run:

```powershell
git add client/src/pages/drama/comicDrama/ComicDramaStudioPage.tsx client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/tests/storyboardLandscapeTtsContracts.test.js client/tests/comicDramaStoryboardFlow.test.js docs/superpowers/specs/2026-08-24-comic-drama-video-tab-layout-design.md docs/superpowers/plans/2026-08-24-comic-drama-video-tab-layout.md
git commit -s -m "feat: separate drama video tab content"
```

### Task 4: Controlled delivery

- [ ] **Step 1: Verify the task worktree is clean and the main workspace is untouched**

Run `git status --short --branch` in both worktrees and `git worktree list --porcelain` from the primary checkout. Leave all other active worktrees unchanged.

- [ ] **Step 2: Integrate and push through the guarded entry point**

From the primary checkout run:

```powershell
pnpm workflow:integrate codex/comic-drama-video-tab --push --verify "pnpm --filter @ai-novel/client exec node --test tests/storyboardLandscapeTtsContracts.test.js tests/comicDramaStoryboardFlow.test.js"
```

- [ ] **Step 3: Verify final refs and remove only this worktree**

Confirm `main` is clean, local `main` equals `origin/main`, the integration lock and `MERGE_HEAD` are absent, and the new task branch is merged. Remove only `D:\Github\AI-Novel-Writing-Assistant-comic-drama-video-tab` and its local branch after those checks.
