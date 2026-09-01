# 动画来源分类与筛选栏布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在动画入口增加“全部 / 虚幻动画 / 网站内置动画”来源分类，并按模型库模式让来源筛选与右侧搜索栏在桌面端同排、空间不足时自然换行。

**Architecture:** 动画目录继续由 `AnimationLibraryEntry.source` 作为来源事实；在配置层增加独立的来源筛选选项和交集过滤条件，页面层同时维护来源、用途、动作分类和已提交搜索。筛选栏拆成来源+搜索首行和用途+动作分类次行，复用现有 `Tabs`、`SelectControl`、`Input`、`Button` 与语义 Tailwind token。

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, shadcn Tabs, Node test runner。

---

### Task 1: 锁定来源数据和交集过滤行为

**Files:**
- Modify: `client/src/config/animationLibraryTaxonomy.test.mjs`
- Modify: `client/src/config/animationLibrary.ts:12-24,346-357,558-583`

- [ ] **Step 1: Write the failing tests**

在 `animationLibraryTaxonomy.test.mjs` 的 import 中加入 `ANIMATION_LIBRARY_SOURCES`，并追加以下测试，先要求来源选项和 `source` 过滤合同存在：

```js
test("动画库提供两类用户可理解的来源分类，并支持来源交集筛选", () => {
  assert.deepEqual(
    ANIMATION_LIBRARY_SOURCES.map(({ id, label }) => ({ id, label })),
    [
      { id: "all", label: "全部" },
      { id: "unreal", label: "虚幻动画" },
      { id: "legacy", label: "网站内置动画" },
    ],
  );

  const unreal = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { source: "unreal" });
  const legacy = filterAnimationLibraryEntries(ANIMATION_LIBRARY, { source: "legacy" });
  assert.ok(unreal.length > 0);
  assert.ok(legacy.length > 0);
  assert.ok(unreal.every((entry) => entry.source === "unreal"));
  assert.ok(legacy.every((entry) => entry.source === "legacy"));

  const target = unreal.find((entry) => entry.actionType !== "idle");
  assert.ok(target);
  const intersection = filterAnimationLibraryEntries(ANIMATION_LIBRARY, {
    source: "unreal",
    actionType: target.actionType,
    query: target.clipName,
  });
  assert.deepEqual(intersection.map((entry) => entry.id), [target.id]);
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/config/animationLibraryTaxonomy.test.mjs
```

Expected: FAIL because `ANIMATION_LIBRARY_SOURCES` is not exported and `source` is not yet part of `AnimationLibraryFilters`.

- [ ] **Step 3: Implement the minimal configuration change**

Add `ANIMATION_LIBRARY_SOURCES` immediately after `ANIMATION_LIBRARY_SCOPES`, add `source?: AnimationLibrarySource | "all"` to `AnimationLibraryFilters`, destructure `source = "all"` in `filterAnimationLibraryEntries`, and add this predicate before the existing scope predicate:

```ts
(source === "all" || entry.source === source) &&
```

Do not change `ANIMATION_LIBRARY_GROUPS`, pack data, or the legacy/Unreal entry construction.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same command. Expected: PASS for the taxonomy test file with zero failures.

- [ ] **Step 5: Commit the data-contract unit**

```powershell
git add client/src/config/animationLibrary.ts client/src/config/animationLibraryTaxonomy.test.mjs
git commit -s -m "feat: add animation source filters"
```

### Task 2: Add page-level regression tests for the new taxonomy layout

**Files:**
- Modify: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`

- [ ] **Step 1: Replace stale page assertions with source-layout assertions**

Keep the existing card, pagination, and search-submission assertions. Update the first taxonomy test to require `ANIMATION_LIBRARY_SOURCES`, `AnimationLibrarySourceFilterId`, the `source` state defaulting to `all`, `data-animation-source-filter`, `sourceOption.id`, and `虚幻动画` / `网站内置动画`. Require that the page contains separate `data-animation-scope-filter` and `data-animation-action-filter` blocks, and remove assertions that require the old single-row structure.

Add this focused layout contract test:

```js
test("来源与搜索占据首行，用途和动作分类位于后续筛选行", () => {
  assert.match(pageSource, /data-animation-filter-controls/);
  assert.match(pageSource, /data-animation-source-filter/);
  assert.match(pageSource, /data-animation-search/);
  assert.match(pageSource, /sm:ml-auto/);
  assert.match(pageSource, /data-animation-detail-filters/);
  assert.match(pageSource, /data-animation-scope-filter/);
  assert.match(pageSource, /data-animation-action-filter/);
  assert.match(pageSource, /setSource\\("all"\\)/);
  assert.match(pageSource, /setScope\\("all"\\)/);
  assert.match(pageSource, /data-animation-source-filter[\\s\\S]*?TabsList className="[^"]*flex-wrap/);
});
```

- [ ] **Step 2: Run the page test and verify it fails for the old page**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/animations/animationLibraryPageTaxonomy.test.mjs
```

Expected: FAIL on the missing source state/config/layout markers, while failures identify only the intended old page contract.

- [ ] **Step 3: Commit the red tests**

```powershell
git add client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
git commit -s -m "test: define animation source taxonomy layout"
```

### Task 3: Implement source state, counts, and reset semantics

**Files:**
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx:1-165`

- [ ] **Step 1: Add the source filter type and state**

Import `ANIMATION_LIBRARY_SOURCES` and `type AnimationLibrarySourceFilterId`. Initialize `source` to `"all"`, and initialize `scope` to `"all"`. Keep `scopedEntries` filtered only by `scope` and submitted `query` so its source counts remain comparable; include `source` in the final `entries` filter and its dependency array.

- [ ] **Step 2: Compute source counts and make source changes deterministic**

Compute counts from the current use/search scope with `countBy(scopedEntries, (entry) => entry.source)`. On source change, set the source, reset `actionType` to `"all"`, reset `page` to `1`, and leave the independently selected use scope unchanged. On scope change, reset action type and page as before. Reset both filters to `source="all"`, `scope="all"`, action type `"all"`, and empty submitted search.

- [ ] **Step 3: Run typecheck before touching JSX**

Run:

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: the page compiles after the state/config changes; any JSX contract failures are handled in Task 4.

### Task 4: Implement the two-row responsive filter bar

**Files:**
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx:150-270`

- [ ] **Step 1: Render source tabs in the first row**

Create a first-row flex container with `data-animation-filter-controls`. Add a `data-animation-source-filter` group using label “来源” and the existing `Tabs` primitives. Render `ANIMATION_LIBRARY_SOURCES` with counts and `data-animation-source={sourceOption.id}`. Use `TabsList` classes that permit wrapping (`flex-wrap`, `min-w-0`, `max-w-full`) and do not use horizontal overflow for the source controls.

- [ ] **Step 2: Keep search on the first row’s right side**

Keep the existing controlled form, Enter handler, submit button, reset action, and accessible labels. Give the form `w-full shrink-0 sm:ml-auto sm:w-auto` with a bounded desktop width so it remains a distinct right-side block. The source group may shrink and wrap, but the form may not be pushed out of the filter card.

- [ ] **Step 3: Move usage and action classification into a second row**

Add `data-animation-detail-filters` as a separate wrapping flex row. Render the existing usage Tabs under `data-animation-scope-filter` and the action `SelectControl` under `data-animation-action-filter`; remove the old nested placement that made both compete with the search form in the first row. Continue hiding action options that have no entries in the current source/use/search scope.

- [ ] **Step 4: Run page tests and typecheck**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/animations/animationLibraryPageTaxonomy.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Expected: page taxonomy tests PASS and client typecheck exits 0.

- [ ] **Step 5: Commit the UI behavior**

```powershell
git add client/src/pages/animations/AnimationLibraryPage.tsx
git commit -s -m "feat: organize animation filters by source"
```

### Task 5: Update user-facing documentation for the visible behavior

**Files:**
- Modify: `README.md` under `## 最新更新` and the `### 2026-09-01` block
- Modify: `docs/releases/release-notes.md` under `### 2026-09-01`

- [ ] **Step 1: Run the release-note scope check**

Inspect `git status --short`, `git diff HEAD~1`, and the staged diff. Confirm the change is user-visible because it adds source categories and changes the filter layout.

- [ ] **Step 2: Add a concise user-facing release note**

Add one bullet to both surfaces: animation browsing now separates “虚幻动画” and “网站内置动画” in one source category row, keeps use/action filters on a following row, and lets the right-side search remain usable when controls wrap. Do not mention implementation file names, test names, or commit history.

- [ ] **Step 3: Commit documentation**

```powershell
git add README.md docs/releases/release-notes.md
git commit -s -m "docs: describe animation source categories"
```

### Task 6: Run the full self-test gate and integrate

**Files:**
- Verify all changed files and the worktree state.

- [ ] **Step 1: Run focused config/page tests and client typecheck together**

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/config/animationLibrary.test.mjs src/config/animationLibraryTaxonomy.test.mjs src/pages/animations/animationLibraryPageTaxonomy.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Expected: all selected Node tests pass and TypeScript exits 0.

- [ ] **Step 2: Run built-in browser smoke test**

Against `http://127.0.0.1:5174/animations` in the Codex in-app browser:

1. Confirm the first row exposes `来源`, `全部`, `虚幻动画`, `网站内置动画`, and the search textbox/button on the right.
2. Click `虚幻动画`; confirm visible cards and count all have Unreal entries.
3. Click `网站内置动画`; confirm cards change to the 46 legacy entries and the page remains usable.
4. Switch to `分镜可用`, choose an action type, and confirm the result count/page reset remains coherent.
5. Submit a search by button and by Enter, then clear filters.
6. Capture desktop and narrow-width screenshots, inspect for clipped controls or horizontal overflow, and read tab console logs; expected 0 application errors.

- [ ] **Step 3: Self-review the diff against the design spec**

Run `git diff main...HEAD --check` and `git status --short`. Confirm no generated artifacts, secrets, unrelated concurrent changes, or stale source-group tabs were included.

- [ ] **Step 4: Integrate, push, and clean up from the clean main checkout**

From `D:/Github/AI-Novel-Writing-Assistant`, after confirming it remains clean and no other integration is in progress, run:

```powershell
pnpm workflow:integrate codex/animation-source-taxonomy-layout --push --verify "pnpm --filter @ai-novel/client typecheck"
pnpm workflow:cleanup D:/Github/AI-Novel-Writing-Assistant-animation-source-taxonomy-layout
pnpm check:workspace-integrity
git status --short --branch
git log -1 --oneline --decorate
git ls-remote origin refs/heads/main
```

Expected: the signed branch and merge commit are integrated into `main`, `origin/main` points to the same final commit, the session worktree is removed, and the main checkout is clean.

