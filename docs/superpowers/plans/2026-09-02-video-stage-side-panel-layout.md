# 视频阶段三栏预览布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将漫剧视频阶段重排为桌面端“左信息栏—中央视频—右信息栏”，提高中央横屏播放器的可用高度，并保持现有合成流程不变。

**Architecture:** 继续由 `DramaEpisodeAssemblyResultPanel` 负责视频阶段的状态投影。将现有设置/进度/错误块与已完成成片信息拆成三栏布局的语义区域：中央列只承载播放器或无结果标题，左右列承载控制和信息；在 `xl` 断点以下使用单列顺序。所有业务状态、按钮回调、查询和链接复用现有 controller，不增加新的状态层。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 3, shadcn Card/Badge/Button, Node `node:test` source contract tests, Vite client.

---

### Task 1: Add the failing layout contract

**Files:**
- Modify: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.test.mjs`

- [ ] **Step 1: Write the failing test**

Extend the existing “成片置顶” contract with structural assertions for the requested layout:

```js
assert.match(panelSource, /data-testid="video-stage-layout"/);
assert.match(panelSource, /xl:grid-cols-\[minmax\(13rem/);
assert.match(panelSource, /data-testid="video-stage-player"/);
assert.match(panelSource, /data-testid="video-stage-left-rail"/);
assert.match(panelSource, /data-testid="video-stage-right-rail"/);
assert.match(panelSource, /max-h-\[calc\(100dvh-/);
assert.doesNotMatch(panelSource, /max-w-\[124vh\]/);
```

The test intentionally describes the stable layout contract instead of asserting implementation-only wrapper names. Existing checks for the video source, metadata labels, download links, and state ordering remain in place.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/drama/components/DramaEpisodeAssemblyPanel.test.mjs
```

Expected: FAIL because the current panel has no three-column layout test ids, keeps `max-w-[124vh]`, and does not expose separate left/right rails.

### Task 2: Implement the three-column video stage

**Files:**
- Modify: `client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx`

- [ ] **Step 1: Move reusable state blocks into named rail sections**

Keep the existing `settingsSection`, `overviewSection`, progress, error, warning, and assembled metadata JSX, but place them in layout regions with explicit semantics:

```tsx
<div
  data-testid="video-stage-layout"
  className="grid items-start gap-4 p-2 sm:p-3 xl:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.85fr)_minmax(15rem,0.9fr)]"
>
  <aside data-testid="video-stage-left-rail" className="min-w-0 space-y-4">
    {settingsSection}
    {controller.running ? progressSection : null}
    {errorSection}
    {warningSection}
  </aside>
  <section data-testid="video-stage-player" className="min-w-0">
    {videoReady && assembled ? <video ... /> : emptyResultSection}
  </section>
  <aside data-testid="video-stage-right-rail" className="min-w-0 space-y-4">
    {videoReady && assembled ? assembledInfoSection : overviewSection}
  </aside>
</div>
```

Do not duplicate any controller condition or move mutation calls; use the existing `DramaEpisodeAssemblyButton` and state values. When a completed video exists, the central section must contain the only video element and the right rail must contain duration/specification/download links.

- [ ] **Step 2: Increase the central preview area without distorting the video**

Use a central wrapper that can grow with the viewport and keep a 16:9 ratio:

```tsx
<div className="flex min-h-[clamp(22rem,58vh,42rem)] items-center justify-center rounded-2xl border border-border/70 bg-muted/20 p-2 sm:p-3">
  <video
    controls
    preload="metadata"
    src={assembled.videoUrl}
    className="block aspect-video max-h-[calc(100dvh-10rem)] w-full overflow-hidden rounded-xl object-contain"
  />
</div>
```

The old `max-w-[124vh]` class must be removed. `min-h` gives the center column meaningful height when side rails are short; `max-h` prevents the application viewport from becoming unusable. Do not add fixed colors or a second player.

- [ ] **Step 3: Add the responsive single-column order**

At widths below `xl`, the grid becomes one column by default. Render the central player first, then left-rail controls/status, then right-rail overview/metadata. Use `xl:contents` only if necessary to preserve that order; otherwise keep each rail as a normal grid item and set explicit `order-*` utilities. Ensure no class introduces horizontal scrolling.

- [ ] **Step 4: Keep no-result and running/error states usable**

The no-result title and render profile remain visible in the central region. Settings, progress, warnings, and errors remain in the left rail; overview remains in the right rail when there is no completed video. The button remains adjacent to “合成设置” and keeps its existing disabled/loading/done labels.

- [ ] **Step 5: Run the focused contract test**

Run the command from Task 1 again.

Expected: PASS, including all existing completed-video download and state assertions.

### Task 3: Verify the client and document the user-visible change

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` only if the existing “最新更新” block requires the new date entry

- [ ] **Step 1: Run client typecheck**

Run:

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Run the client build**

Run:

```powershell
pnpm --filter @ai-novel/client build
```

Expected: exit code 0 and a completed Vite bundle.

- [ ] **Step 3: Run built-in browser smoke checks**

Start or reuse only the worktree’s provisioned lane from `server/.env` (API `3196`, web `5200`), then use the Codex built-in browser to visit the video tab for a real drama project. Check:

1. At desktop width, the video is centered between visible left and right information rails and is taller than the previous constrained presentation.
2. Native play/pause and seek controls remain usable; the right-rail download and new-window links remain present when a completed video exists.
3. At a narrow viewport, the video appears before the rails, there is no horizontal page overflow, and the synthesis button/state feedback remains reachable.
4. Browser console has no new errors and failed network requests are absent apart from expected media/API data conditions.

Capture one desktop and one narrow-layout screenshot as evidence.

- [ ] **Step 4: Update release notes**

Add one concise entry under the current date describing the three-column video preview layout and responsive fallback. Do not add implementation commentary to user-facing copy.

- [ ] **Step 5: Self-accept against the design**

Review the diff and confirm: the center is dedicated to video, side rails carry useful information, player height is increased through responsive constraints, all four assembly states remain represented, and no server/API/database files changed.

- [ ] **Step 6: Commit the implementation unit**

```powershell
git add client/src/pages/drama/components/DramaEpisodeAssemblyPanel.tsx client/src/pages/drama/components/DramaEpisodeAssemblyPanel.test.mjs docs/releases/release-notes.md README.md
git commit -s -m "feat: reorganize drama video preview stage"
```

Only include `README.md` when it was actually updated.
