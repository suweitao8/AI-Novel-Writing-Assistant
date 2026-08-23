# 提取资产卡片预览统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“当前 · 提取”页的角色、场景、道具卡片使用与脚本和资产页一致的左侧方形预览，同时保留提取页现有的信息与编辑交互。

**Architecture:** 保持 `ReferenceExtractTab` 作为提取卡片的业务容器，不直接复用完整 `StoryAssetCard`。已有资产通过 `buildStoryAssetPresentation` 得到默认状态预览源，再交给共享的 `StoryAssetPreview` 渲染；没有图片的提取建议显示同一套占位，世界观继续保留图标。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Node `node:test` 契约测试、现有 `storyAssets` 展示组件。

---

### Task 1: Add the extraction-preview contract test

**Files:**
- Create: `client/tests/referenceExtractPreviewContracts.test.js`
- Read: `client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx`
- Read: `client/src/components/storyAssets/StoryAssetPreview.tsx`
- Read: `client/src/components/storyAssets/storyAssetPresentation.ts`

- [ ] **Step 1: Write the failing source-contract test**

Create a source-level contract test so the extraction page cannot silently return to its old icon/8×8-thumbnail implementation:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("提取资产卡使用共享方形预览并保留世界观图标", () => {
  const source = read("pages/drama/comicDrama/components/ReferenceExtractTab.tsx");

  assert.match(source, /StoryAssetPreview/);
  assert.match(source, /buildStoryAssetPresentation/);
  assert.match(source, /existingPreviewFor/);
  assert.match(source, /<StoryAssetPreview/);
  assert.match(source, /w-20/);
  assert.match(source, /shrink-0/);
  assert.match(source, /GROUP_ICONS\[group\]/);
  assert.doesNotMatch(source, /buildStateImageSrc/);
  assert.doesNotMatch(source, /h-8 w-8/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the current implementation**

Run from `client/`:

```bash
node --experimental-strip-types --test tests/referenceExtractPreviewContracts.test.js
```

Expected: FAIL because `ReferenceExtractTab.tsx` currently does not import or render `StoryAssetPreview`, does not use `buildStoryAssetPresentation`, and still contains the `h-8 w-8` thumbnail path.

### Task 2: Replace extraction thumbnails with the shared preview

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx:1-130`

- [ ] **Step 1: Replace the extraction preview data path**

Update the imports to use the shared presentation and preview components:

```tsx
import {
  buildStoryAssetPresentation,
  StoryAssetPreview,
} from "@/components/storyAssets";
```

Keep `StoryAssetSource` for the existing-asset dialog source. Remove `buildStateImageSrc` and delete `existingThumbFor`; the extraction page must not choose the first completed state image itself.

Add this helper next to `existingSourceFor`:

```tsx
  const existingPreviewFor = (group: ExtractGroup, name: string) => {
    if (group === "characters") {
      const source = stage.existingAssets.characters.find((candidate) => candidate.name.trim() === name.trim());
      return source ? buildStoryAssetPresentation({ kind: "character", asset: source }).preview : null;
    }
    if (group === "scenes") {
      const source = stage.existingAssets.scenes.find((candidate) => candidate.name.trim() === name.trim());
      return source ? buildStoryAssetPresentation({ kind: "scene", asset: source }).preview : null;
    }
    if (group === "props") {
      const source = stage.existingAssets.props.find((candidate) => candidate.name.trim() === name.trim());
      return source ? buildStoryAssetPresentation({ kind: "prop", asset: source }).preview : null;
    }
    return null;
  };
```

This keeps source selection aligned with the edit dialog while delegating default-state selection, `generatedAt` cache busting, asset-specific crop mode, and empty-image behavior to the existing shared presentation layer.

- [ ] **Step 2: Change the card skeleton to left-preview/right-information**

Inside `items.map`, replace `existingImage` with:

```tsx
            const existingPreview = existing ? existingPreviewFor(group, item.name) : null;
```

Change the card button classes to include a horizontal layout:

```tsx
                className={cn(
                  "flex min-w-0 items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                  existing
                    ? "border-border/70 bg-muted/30"
                    : "border-border/70 bg-background hover:border-primary/40",
                )}
```

Replace the old icon/image `span` and the following body span with this structure:

```tsx
                {group === "worldview" ? (
                  <span aria-hidden="true" className="mt-1 shrink-0 text-base">{GROUP_ICONS[group]}</span>
                ) : (
                  <StoryAssetPreview preview={existingPreview} className="w-20 shrink-0 sm:w-24" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">{item.name}</span>
                    {group === "characters" && character?.role ? (
                      <Badge variant="outline" className="shrink-0">{character.role}</Badge>
                    ) : null}
                    {existing ? (
                      <Badge className="shrink-0 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400">
                        已存在
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{body}</span>
                </span>
```

The `worldview` branch preserves its current icon while all image-capable asset groups always render the shared square preview, including its fallback when a new suggestion has no image yet. Keep the existing `onClick`, key, badges, dialog props, and mutation behavior unchanged.

- [ ] **Step 3: Run the focused contract tests and typecheck**

Run from `client/`:

```bash
node --experimental-strip-types --test tests/referenceExtractPreviewContracts.test.js tests/storyAssetPreviewContracts.test.js tests/storyAssetPresentation.test.mjs tests/scriptAssetPreviewContracts.test.js
pnpm typecheck
```

Expected: all four focused contract files pass and the client TypeScript check exits with code 0.

### Task 3: Verify the integrated presentation and commit the feature

**Files:**
- Verify: `client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx`
- Verify: `client/tests/referenceExtractPreviewContracts.test.js`
- Verify: `client/src/components/storyAssets/StoryAssetPreview.tsx`
- Verify: `client/src/components/storyAssets/storyAssetPresentation.ts`
- Update: `docs/releases/release-notes.md`
- Update: `README.md` (only the `## 最新更新` block)

- [ ] **Step 1: Run the client test suite and diff checks**

Run from the repository root:

```bash
pnpm --filter @ai-novel/client test
git diff --check
```

Expected: client tests pass; `git diff --check` produces no output. If unrelated pre-existing failures appear, record their exact test names and error text without changing unrelated files.

- [ ] **Step 2: Perform browser visual acceptance on the running app**

On `http://localhost:5174/drama/studio/cmt0z2mgy0012zsb5d716mkzj`, open “当前 · 提取” and check:

1. Character, scene, and prop cards have a square preview at the far left.
2. An existing character uses the same four-view left-column crop as the script/asset cards.
3. An existing scene or prop uses the same centered square crop as the script/asset cards.
4. A new suggestion without an image keeps the square “暂无预览图” placeholder instead of the type emoji.
5. Worldview entries retain the globe icon.
6. Clicking any card still opens the same application/edit dialog, and the name, role badge, “已存在” badge, and extraction description remain visible.

The browser check is visual/read-only and does not create, update, or delete project data.

- [ ] **Step 3: Review the final diff and commit the feature**

Before staging the user-visible UI change, use the `readme-release-updater` skill to inspect the Git scope. Record the extraction-card preview improvement in the current date block of `docs/releases/release-notes.md` and refresh `README.md` so its `## 最新更新` block contains only the newest date block and links to the full release notes. Keep both entries user-facing; do not mention component names, test names, or implementation mechanics.

Run:

```bash
git status --short
git diff -- client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx client/tests/referenceExtractPreviewContracts.test.js docs/releases/release-notes.md README.md
git add client/src/pages/drama/comicDrama/components/ReferenceExtractTab.tsx client/tests/referenceExtractPreviewContracts.test.js docs/releases/release-notes.md README.md
git commit -s -m "feat: unify extracted asset previews"
```

Expected: only the extraction tab, its focused contract test, and the required user-facing release-note surfaces are staged for this feature; the signed commit succeeds. The earlier plan/spec commit is documentation-only and intentionally does not update release notes.
