# 动画库搜索提交与来源行布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让动画库搜索在来源筛选同一行的右侧显示，并通过“搜索”按钮或回车提交，移除搜索框旁的数量文本。

**Architecture:** `AnimationLibraryPage` 保留 `searchInput` 作为输入草稿、`search` 作为已提交条件，使用原生 `<form onSubmit>` 统一鼠标与键盘提交路径。桌面端来源页签占据左侧空间，搜索表单右对齐；小屏端表单换行并占满宽度。沿用现有 `Input`、shadcn `Button`、语义 token 和分页/空状态逻辑。

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui `Input`/`Button`, Node test runner, Codex 内置浏览器。

---

### Task 1: Lock the submitted-search contract with a failing test

**Files:**
- Modify: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`
- Test source: `client/src/pages/animations/AnimationLibraryPage.tsx`

- [x] **Step 1: Add assertions for the user-facing contract**

Add a test that requires the page source to contain:

```js
test("动画搜索通过按钮或回车提交，并与来源筛选同排", () => {
  assert.match(pageSource, /<form[\s\S]*onSubmit/);
  assert.match(pageSource, /type="submit"/);
  assert.match(pageSource, /搜索/);
  assert.match(pageSource, /data-animation-group-filter-row[\s\S]*data-animation-search/);
  assert.doesNotMatch(pageSource, /entries\.length\s*}\s*\/\s*\{scopedEntries\.length/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setSearch\(searchInput\.trim\(\)\), 250\)/);
});
```

- [x] **Step 2: Run the focused test and verify the expected red failure**

Run:

```powershell
node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
```

Expected: the existing page fails because the search is not a form, the search form is not in the source row, the `150 / 150` count still exists, and the debounce effect still exists.

### Task 2: Implement the minimal submitted-search layout

**Files:**
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx`

- [x] **Step 1: Replace debounce submission with explicit form submission**

Remove the `useEffect` that calls `setSearch` after 250ms. Import `type FormEvent` alongside the existing React hooks, then add this handler next to the state and use it as the search form submit handler:

```tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";

const submitSearch = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  setSearch(searchInput.trim());
  setPage(1);
};
```

Change the page-reset effect dependency from `searchInput` to `search`, so typing alone does not change the result page.

- [x] **Step 2: Move the search form into the source row**

Remove the standalone `data-animation-search` section and its `{entries.length} / {scopedEntries.length}` text. Add this form after the source `Tabs` inside `data-animation-group-filter-row`:

```tsx
<form
  className="flex w-full shrink-0 items-center gap-1.5 md:ml-auto md:w-auto"
  aria-label="搜索动画"
  data-animation-search
  onSubmit={submitSearch}
>
  <label htmlFor="animation-library-search" className="relative min-w-0 flex-1 md:w-64">
    <Search
      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <Input
      id="animation-library-search"
      aria-label="搜索动画"
      value={searchInput}
      onChange={(event) => setSearchInput(event.target.value)}
      placeholder="搜索名称、片段名、套装或分类"
      className="h-8 pl-8 text-xs"
    />
  </label>
  <Button type="submit" size="sm" className="h-8 shrink-0 gap-1 px-2.5 text-xs">
    <Search className="h-3.5 w-3.5" aria-hidden="true" />
    搜索
  </Button>
  {hasActiveFilters ? (
    <button
      type="button"
      onClick={resetFilters}
      className="shrink-0 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-accent"
      data-animation-reset-filters
    >
      清除筛选
    </button>
  ) : null}
</form>
```

Import `Button` from `@/components/ui/button`. Keep `Search` for the input decoration and button icon; the existing `Search` icon import remains valid.

- [x] **Step 3: Align the source row responsively**

Change the source row class to `flex flex-wrap items-center gap-2` and give the source `Tabs` `min-w-0 flex-1`. Keep its `TabsList` horizontal scrolling. The form is `w-full` below the `md` breakpoint and `md:w-auto` on desktop, so the source tabs and search form share one row when space allows and do not overflow on narrow screens.

- [x] **Step 4: Keep reset semantics consistent with draft and applied search**

Keep `resetFilters` clearing both `setSearchInput("")` and `setSearch("")`. Keep `hasActiveFilters` including `searchInput.trim().length > 0`, so a typed-but-not-submitted draft can still be cleared explicitly.

### Task 3: Run focused checks and self-accept against the requirement

**Files:**
- Verify: `client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs`
- Verify: `client/src/pages/animations/AnimationLibraryPage.tsx`

- [x] **Step 1: Run the focused page contract tests**

Run:

```powershell
node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
```

Expected: all tests pass with zero failures.

- [x] **Step 2: Run client typecheck**

Run:

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: TypeScript exits with code 0 and no diagnostics.

- [x] **Step 3: Inspect the diff and verify every acceptance condition**

Run:

```powershell
git diff --check
git diff -- client/src/pages/animations/AnimationLibraryPage.tsx client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
```

Confirm the diff has: no standalone search section, no `150 / 150` result text, a submit button and form handler, source-row placement, draft/applied search separation, and no changes to asset filtering or card rendering.

### Task 4: Update user-facing documentation and run browser smoke

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/product/model-library.md`

- [x] **Step 1: Record the visible search workflow**

Add one concise bullet under the existing `2026-08-31` sections of README and release notes stating that animation search is submitted by the search button or Enter, is placed beside source filters, and no longer shows the separate result-count label. Update the durable model-library rule to document submitted search and the responsive source-row layout.

- [ ] **Step 2: Run the browser smoke path in the Codex in-app browser**

On `http://127.0.0.1:5174/animations`:

1. Confirm the search form is on the right side of the 来源 row and the standalone `150 / 150` label is absent.
2. Fill `进食`, confirm results do not change before submission, click `搜索`, and confirm the result list changes and returns to page 1.
3. Fill a different term, press Enter, and confirm the same submission path works.
4. Click a 来源 tab and confirm it still filters immediately.
5. Clear the search and submit an unmatched term to confirm the existing empty state remains visible; use `清除筛选` to restore the list.
6. Temporarily use a narrow viewport and confirm the source tabs remain horizontally scrollable while the search form wraps without horizontal page overflow.
7. Read console logs and confirm there are no new errors.

- [ ] **Step 3: Run the final verification and prepare delivery**

Run:

```powershell
pnpm check:docs-manifest
git diff --check
git status --short
```

Then commit the coherent implementation with `git commit -s`, integrate it into `main` with the repository workflow, push `origin main`, and verify local and remote commit hashes match.
