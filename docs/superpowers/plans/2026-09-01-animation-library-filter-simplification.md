# 动画库筛选收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将动画库入口的四套并列筛选收敛为用途、单一大类和搜索，降低首屏认知负担，同时保持动画数据与下游过滤契约兼容。

**Architecture:** 只修改 `AnimationLibraryPage.tsx` 的入口状态和渲染层，使用已有 `ANIMATION_LIBRARY_GROUPS` 作为大类选项和 `SelectControl` 作为键盘可用控件。配置层继续保留细分类、动作、姿态、武器字段及过滤函数，以保证分镜和详情页的兼容性。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS、现有 `SelectControl`/`Tabs`/`Input`/`Button` 组件、Node test runner。

---

### Task 1: Lock the simplified entry-page contract

**Files:**
- Modify: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`
- Test: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`

- [ ] **Step 1: Replace the old four-filter assertions with the target contract.**

  Keep assertions for `PAGE_SIZE`, the three usage tabs, `data-animation-scope-filter`, one `data-animation-category-filter`, `SelectControl`, the search form, submit button, and reset control. Add negative assertions for `data-animation-group-filter-row`, `data-animation-classification-filter`, `data-animation-detail-filters`, `data-animation-pack-filter`, `data-animation-action-filter`, `data-animation-posture-filter`, and `data-animation-weapon-filter`.

- [ ] **Step 2: Run the focused test and verify the expected red failure.**

  Run:

  ```powershell
  node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
  ```

  Expected: FAIL because the current page still contains the source row, fine-classification rail, and four detail selectors.

### Task 2: Implement one visible animation category selector

**Files:**
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx:1-480`

- [ ] **Step 1: Reduce imports and state to scope, group, search, and pagination.**

  Remove UI-only imports and state for `packId`, `actionType`, `classificationId`, `posture`, and `weaponType`. Keep `ANIMATION_LIBRARY_GROUPS`, `ANIMATION_LIBRARY_SCOPES`, `filterAnimationLibraryEntries`, `SelectControl`, `Tabs`, `Input`, and `Button`.

- [ ] **Step 2: Compute counts and entries using only the visible filters.**

  Build `groupCounts` from entries filtered by `scope` and submitted `search`, keep only groups with a count, and compute `entries` with `{ scope, groupId, query: search }`. Reset the group when the current scope/search no longer contains it. Keep pagination and empty-state behavior unchanged.

- [ ] **Step 3: Replace the four-row filter panel with a compact control row.**

  Keep usage tabs. Render one labeled `SelectControl` with `data-animation-category-filter`, an `全部分类` option, and visible group options labeled with their counts. Place the existing search form in the same flex-wrapping region. Use semantic tokens and `cn()` for conditional classes; do not add new colors or dependencies.

- [ ] **Step 4: Keep reset and keyboard behavior complete.**

  Reset scope to `storyboard`, group to `all`, search input and submitted search to empty, and page to 1. Keep the form submit handler so Enter and the search button use the same path. Preserve the accessible labels and the existing no-result section.

- [ ] **Step 5: Run the focused page test and verify green.**

  Run:

  ```powershell
  node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
  ```

  Expected: all page-contract tests pass and no removed filter marker is present in the source.

### Task 3: Update durable user-facing documentation

**Files:**
- Modify: `README.md` (latest update entry)
- Modify: `docs/releases/release-notes.md` (current date entry)
- Modify: `docs/wiki/product/model-library.md` or another animation-library wiki page only if the current rule describes the old four-filter entry UI

- [ ] **Step 1: Record the simplified animation-library entry from the user perspective.**

  Describe the entry as usage tabs plus one category selector and search. Do not mention implementation files, migration steps, or test names.

- [ ] **Step 2: Check documentation scope and avoid changelog duplication.**

  Keep README limited to the newest update block and keep the full user-facing history in the release notes file. If the wiki has no durable rule about the old UI, leave it unchanged and state that no wiki update was needed.

### Task 4: Verify behavior and visual layout

**Files:**
- Test: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`
- Test: `client/src/config/animationLibraryTaxonomy.test.mjs`
- Test: `client/src/config/animationLibraryContent.test.mjs`

- [ ] **Step 1: Run animation-focused tests and client typecheck.**

  ```powershell
  node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs client/src/config/animationLibraryTaxonomy.test.mjs client/src/config/animationLibraryContent.test.mjs
  pnpm --filter @ai-novel/client typecheck
  ```

- [ ] **Step 2: Run the browser smoke path.**

  Open `/animations` in the built-in browser. Verify the page shows usage tabs, one category selector, search, and cards; select a category and confirm the result count/cards update; submit a search with Enter; use “清除筛选”; confirm no console errors or failed requests. Check a narrow viewport for wrapping without a second filter rail.

- [ ] **Step 3: Review the diff against the design.**

  Confirm only the intended page, contract test, documentation, and release surfaces changed; keep all taxonomy data and filtering API fields intact.

### Task 5: Commit and integrate

**Files:**
- Modify: only files listed in Tasks 1-4

- [ ] **Step 1: Run `git diff --check` and inspect staged scope.**
- [ ] **Step 2: Commit the isolated branch with `git commit -s`.**
- [ ] **Step 3: Run the repository integration command with the focused page test.**

  ```powershell
  pnpm workflow:integrate codex/animation-library-filter-simplification --push --verify "node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs"
  ```

- [ ] **Step 4: Clean the merged worktree and verify `main`/`origin/main`, fixed ports, and preserved concurrent worktrees.**
