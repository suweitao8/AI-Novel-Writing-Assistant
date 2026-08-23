# 故事资产卡片预览裁切 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为角色、场景、道具的统一资产卡片增加稳定的默认状态方形预览，并按资产类型显示正确的裁切区域。

**Architecture:** 展示适配层从默认状态解析预览 URL 和裁切模式；`StoryAssetPreview` 负责方形容器、角色四视图左上格裁切、场景/道具居中裁切、缺图与加载失败占位；`StoryAssetCard` 只负责左图右信息的统一卡片布局。保持状态图片 API、数据库和完整图详情预览不变。

**Tech Stack:** React 19、TypeScript、Tailwind CSS v3、lucide-react、Node.js `node:test` 契约测试、pnpm。

---

### Task 1: Lock the preview contract with failing tests

**Files:**
- Modify: `client/tests/storyAssetPresentation.test.mjs`
- Modify: `client/tests/scriptAssetPreviewContracts.test.js`
- Create: `client/tests/storyAssetPreviewContracts.test.js`

- [ ] **Step 1: Extend the presentation fixture assertions**

Update the existing story asset test so the prop fixture expects the new preview source instead of the unused `media` field, and add a character fixture whose second state is labeled `默认` to prove label-based default selection:

```js
assert.deepEqual(prop.preview, {
  url: "/watch.png",
  alt: "怀表默认状态预览",
  mode: "center-square",
});

const characterWithDefaultLater = buildStoryAssetPresentation({
  kind: "character",
  asset: {
    id: "c-default",
    name: "默认优先角色",
    gender: "female",
    states: [
      { id: "hurt", label: "受伤", description: "受伤", imagePrompt: "伤痕", image: { url: "/hurt.png" } },
      { id: "default", label: "默认", description: "基础形象", imagePrompt: "基础形象", image: { url: "/default.png", generatedAt: "2026-08-23T12:00:00.000Z" } },
    ],
  },
});
assert.deepEqual(characterWithDefaultLater.preview, {
  url: "/default.png?v=2026-08-23T12%3A00%3A00.000Z",
  alt: "默认优先角色默认状态预览",
  mode: "character-top-left-grid",
});
```

- [ ] **Step 2: Replace the old script-card contract**

Change `client/tests/scriptAssetPreviewContracts.test.js` so it asserts the new shared component path instead of the temporary `showDefaultStateImage` branch:

```js
test("script asset aside uses the shared square preview card", () => {
  const asideSource = read("pages/drama/comicDrama/components/OutlineSettingsAside.tsx");
  const scriptSource = read("pages/drama/comicDrama/components/ScriptTab.tsx");
  const cardSource = read("components/storyAssets/StoryAssetCard.tsx");

  assert.doesNotMatch(asideSource, /showDefaultStateImage/);
  assert.match(scriptSource, /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(cardSource, /StoryAssetPreview/);
  assert.match(cardSource, /asset\.preview/);
  assert.match(cardSource, /aspect-square/);
});
```

- [ ] **Step 3: Add component-level source contracts**

Create `client/tests/storyAssetPreviewContracts.test.js` with assertions for the user-visible crop and fallback rules:

```js
test("story asset preview keeps the three crop modes and fallback states", () => {
  const presentation = read("components/storyAssets/storyAssetPresentation.ts");
  const preview = read("components/storyAssets/StoryAssetPreview.tsx");

  assert.match(presentation, /character-top-left-grid/);
  assert.match(presentation, /center-square/);
  assert.match(presentation, /label\.trim\(\) === "默认"/);
  assert.match(preview, /w-\[400%\]/);
  assert.match(preview, /h-\[200%\]/);
  assert.match(preview, /object-center/);
  assert.match(preview, /暂无预览图/);
  assert.match(preview, /onError/);
});
```

- [ ] **Step 4: Run the focused tests and verify they fail for the missing contract**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyAssetPresentation.test.mjs tests/scriptAssetPreviewContracts.test.js tests/storyAssetPreviewContracts.test.js
```

Expected: FAIL because `preview`/`StoryAssetPreview` do not exist yet and the old `showDefaultStateImage` branch is still present. Do not implement production code until this red result is observed.

### Task 2: Add the shared preview source model and crop component

**Files:**
- Modify: `client/src/components/storyAssets/storyAssetPresentation.ts`
- Create: `client/src/components/storyAssets/StoryAssetPreview.tsx`
- Modify: `client/src/components/storyAssets/index.ts`
- Modify: `client/src/components/storyAssets/README.md`

- [ ] **Step 1: Add the typed preview source and default-state resolver**

Replace the unused `media` field with:

```ts
export type StoryAssetPreviewMode = "character-top-left-grid" | "center-square";

export interface StoryAssetPreviewSource {
  url: string;
  alt: string;
  mode: StoryAssetPreviewMode;
}
```

Add a helper that first finds `label.trim() === "默认"`, then falls back to `states[0]`, and a helper that returns `null` when the selected state has no `imageUrl`. Build the mode from the asset kind (`character-top-left-grid` for characters, `center-square` for scenes and props). Each asset builder must map its states once, use the resolved default state for summaries/badges where applicable, and attach `preview` to the returned model.

- [ ] **Step 2: Implement `StoryAssetPreview` with complete display states**

The component must accept `preview: StoryAssetPreviewSource | null` and an optional `className`. Its normal wrapper is `relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/25`. For the character mode, use an overflow-hidden square viewport and an absolutely positioned image sized `w-[400%] h-[200%] max-w-none object-fill` at the top-left so the four-column/two-row board selects the upper-left cell. For scene/prop mode, use `h-full w-full object-cover object-center`. For both modes set `loading="lazy"`, `decoding="async"`, and a meaningful `alt`.

Track `onError` in local state and render the same fallback for no URL or failed load:

```tsx
<div role="img" aria-label={preview?.alt ?? "暂无预览图"} className={...}>
  <ImageOff aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
  <span className="text-xs text-muted-foreground">暂无预览图</span>
</div>
```

Reset the error state when `preview?.url` changes. Do not add a new interactive element or notification for image loading errors.

- [ ] **Step 3: Export the new component and types**

Export `StoryAssetPreview`, `StoryAssetPreviewProps`, `StoryAssetPreviewMode`, and `StoryAssetPreviewSource` through `client/src/components/storyAssets/index.ts`. Update the directory README so it documents that the presentation model owns the default-state preview source and the preview component owns crop/fallback behavior.

- [ ] **Step 4: Run the presentation and component contracts**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyAssetPresentation.test.mjs tests/scriptAssetPreviewContracts.test.js tests/storyAssetPreviewContracts.test.js
```

Expected: the model and preview contracts pass; the card contract may still fail until Task 3 removes the old branch.

### Task 3: Make every shared asset card use the left-square layout

**Files:**
- Modify: `client/src/components/storyAssets/StoryAssetCard.tsx`
- Modify: `client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx`
- Modify: `client/tests/scriptAssetPreviewContracts.test.js`

- [ ] **Step 1: Remove the temporary `showDefaultStateImage` API**

Delete the prop and its conditional `aspect-video` image-only branch. The card should always render one semantic button containing a left `StoryAssetPreview` and a right information column. Use `cn()` for the compact sizing: regular cards use a larger square (`w-28 sm:w-36`), compact script cards use `w-24`; both keep `shrink-0` and `aspect-square`.

- [ ] **Step 2: Preserve the information and action behavior**

Keep type/name, summary, badges, state count, `onOpen`, focus ring, and the actions wrapper with `stopPropagation`. The preview and information area should both be inside the same button so clicking the image opens the existing detail/editor entry point. Keep actions outside the button to avoid nested interactive elements.

- [ ] **Step 3: Remove the obsolete caller flag**

In `OutlineSettingsAside.tsx`, keep `compact` and `onOpen` but remove `showDefaultStateImage`. Do not change the existing script sidebar width or asset filtering.

- [ ] **Step 4: Run the focused test suite and typecheck**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyAssetPresentation.test.mjs tests/scriptAssetPreviewContracts.test.js tests/storyAssetPreviewContracts.test.js
pnpm --filter @ai-novel/client typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

### Task 4: Record durable contract and user-visible release notes

**Files:**
- Modify: `docs/wiki/architecture/story-settings-hub.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Add the durable wiki rule**

Document the stable boundary under a dedicated architecture subsection: all story asset cards use the default-state image; character cards use the top-left view-board cell; scene/prop cards use a centered square; missing/failed images retain a square placeholder; full image details remain in the editor. Explain that this is a display projection and does not create persisted thumbnails.

- [ ] **Step 2: Run the release-note updater check**

Before the user-visible commit, run the `readme-release-updater` workflow: inspect `git status`, `git diff`, and staged diff; keep the existing `### 2026-08-23` block and add a user-facing bullet describing consistent square previews in the story asset cards. Refresh `README.md` so its `## 最新更新` contains only the latest date block and the release-notes link.

- [ ] **Step 3: Check the documentation diff**

Run:

```powershell
git diff --check
git diff -- docs/wiki/architecture/story-settings-hub.md docs/releases/release-notes.md README.md
```

Expected: no whitespace errors and only durable architecture/user-facing wording, with no file paths, test names, or implementation narration in release surfaces.

### Task 5: Final focused verification and commit

**Files:** all files from Tasks 1–4.

- [ ] **Step 1: Run the complete client test suite**

Run:

```powershell
pnpm --filter @ai-novel/client test
```

Expected: exit code 0 with all client tests passing.

- [ ] **Step 2: Run the client build/typecheck and diff checks**

Run:

```powershell
pnpm --filter @ai-novel/client build
git diff --check
git status --short
```

Expected: client build exits 0, diff check is clean, and status contains only the intended implementation, test, wiki, release-note, and README files.

- [ ] **Step 3: Commit the coherent implementation**

After reviewing the staged scope and verification output, commit with:

```powershell
git add -- client/src/components/storyAssets client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx client/tests/storyAssetPresentation.test.mjs client/tests/scriptAssetPreviewContracts.test.js client/tests/storyAssetPreviewContracts.test.js docs/wiki/architecture/story-settings-hub.md docs/releases/release-notes.md README.md
git commit -s -m "feat: unify story asset square previews"
```

Do not push the worktree branch; integration back to `main` follows the repository workflow after focused verification.

