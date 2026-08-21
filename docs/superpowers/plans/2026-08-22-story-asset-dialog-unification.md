# 故事资产卡片与详情弹窗统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让脚本右侧和设定中心三类故事资产使用同一套卡片与详情弹窗，同时保留各类型专属编辑表单。

**Architecture:** 在 `client/src/components/storyAssets/` 建立故事资产展示层：适配器负责把角色、场景、道具 API 数据转换为统一视图模型，`StoryAssetCard` 负责卡片交互，`StoryAssetDetailDialog` 负责只读详情和操作插槽。脚本侧与设定中心页签继续持有查询、删除、编辑和缓存失效逻辑，只把统一视图交给共用组件。

**Tech Stack:** React 19, TypeScript, Radix/shadcn Dialog, Tailwind semantic tokens, Node test runner, pnpm workspace。

---

### Task 1: 建立展示模型与失败测试

**Files:**
- Create: `client/src/components/storyAssets/storyAssetPresentation.ts`
- Create: `client/tests/storyAssetPresentation.test.mjs`
- Create: `client/tests/storyAssetDialogContracts.test.js`

- [ ] **Step 1: Write the failing pure-model tests**

在 `storyAssetPresentation.test.mjs` 中先测试三类源数据都能转换为统一模型，并验证空字段不会生成展示字段：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryAssetPresentation } from "../src/components/storyAssets/storyAssetPresentation.ts";

test("角色、场景、道具都输出统一卡片模型和详情字段", () => {
  const character = buildStoryAssetPresentation({
    kind: "character",
    asset: { id: "c1", name: "林川", gender: "male", states: [{ id: "s1", label: "初始", description: "青年", imagePrompt: "黑发" }] },
  });
  const scene = buildStoryAssetPresentation({
    kind: "scene",
    asset: { id: "s1", name: "客厅", sceneType: "interior", timeOfDay: "night", weather: null, environmentPrompt: "冷色灯光", states: [] },
  });
  const prop = buildStoryAssetPresentation({
    kind: "prop",
    asset: { id: "p1", name: "怀表", visualPrompt: "铜制外壳", image: { status: "done", url: "/watch.png" }, states: [] },
  });

  assert.deepEqual([character.kind, scene.kind, prop.kind], ["character", "scene", "prop"]);
  assert.equal(character.typeLabel, "角色");
  assert.equal(scene.typeLabel, "场景");
  assert.equal(prop.typeLabel, "道具");
  assert.equal(character.details.some((item) => item.label === "性别" && item.value === "男"), true);
  assert.equal(scene.details.some((item) => item.label === "图片提示词" && item.value === "冷色灯光"), true);
  assert.equal(prop.media?.url, "/watch.png");
});

test("详情字段会过滤空值并保留状态图片与音色信息", () => {
  const view = buildStoryAssetPresentation({
    kind: "character",
    asset: {
      id: "c2", name: "空字段角色", gender: "unknown", states: [{
        id: "s2", label: "受伤", description: "左臂包扎", imagePrompt: "绷带", voicePrompt: "沙哑",
        image: { url: "/hurt.png" },
      }],
    },
  });
  assert.equal(view.details.some((item) => !item.value.trim()), false);
  assert.equal(view.states[0].imageUrl, "/hurt.png");
  assert.equal(view.states[0].voicePrompt, "沙哑");
});
```

- [ ] **Step 2: Add source-contract tests for all entry points**

在 `storyAssetDialogContracts.test.js` 中读取源文件，先锁定目标依赖：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const targets = [
  read("components/storyAssets/StoryAssetCard.tsx"),
  read("components/storyAssets/StoryAssetDetailDialog.tsx"),
  read("pages/drama/comicDrama/components/OutlineSettingsAside.tsx"),
  read("pages/novels/components/storySettings/SettingsCharactersTab.tsx"),
  read("pages/novels/components/storySettings/SettingsScenesTab.tsx"),
  read("pages/novels/components/storySettings/SettingsPropsTab.tsx"),
];

test("四个故事资产入口复用共用卡片和详情弹窗", () => {
  for (const source of targets.slice(2)) {
    assert.match(source, /StoryAssetCard/);
    assert.match(source, /StoryAssetDetailDialog/);
  }
});

test("共用详情弹窗使用 AppDialogContent 并提供统一关闭入口", () => {
  assert.match(targets[1], /AppDialogContent/);
  assert.match(targets[1], /onOpenChange/);
  assert.match(targets[1], /关闭/);
});
```

- [ ] **Step 3: Run the new tests and verify the expected RED state**

Run: `node --experimental-strip-types --test client/tests/storyAssetPresentation.test.mjs client/tests/storyAssetDialogContracts.test.js`

Expected: FAIL because the presentation module and shared components do not exist yet. Fix only test import/setup errors until the failure is specifically caused by the missing feature.

### Task 2: Implement the pure presentation adapter

**Files:**
- Modify: `client/src/components/storyAssets/storyAssetPresentation.ts`

- [ ] **Step 1: Implement the normalized source and view types**

Define `StoryAssetKind`, the union source type imported from `@/api/story/storySettings`, `StoryAssetPresentation`, `StoryAssetDetailItem`, and `StoryAssetStatePresentation`. Keep the adapter free of React and API calls.

- [ ] **Step 2: Implement `buildStoryAssetPresentation`**

Use the kind-specific labels already used by the product (`男/女/其他/未设定`, `室内/室外/自然`, `早上/中午/晚上`, `晴天/阴天/雨天`). Build only non-empty detail items, map `states` to stable state rows, and resolve the prop legacy image only when it has a URL. Do not invent data or move fields between asset kinds.

- [ ] **Step 3: Run the pure tests and verify GREEN**

Run: `node --experimental-strip-types --test client/tests/storyAssetPresentation.test.mjs`

Expected: PASS for all presentation cases.

### Task 3: Implement the shared card and detail dialog

**Files:**
- Create: `client/src/components/storyAssets/StoryAssetCard.tsx`
- Create: `client/src/components/storyAssets/StoryAssetDetailDialog.tsx`
- Create: `client/src/components/storyAssets/index.ts`
- Create: `client/src/components/storyAssets/README.md`

- [ ] **Step 1: Build `StoryAssetCard` from the presentation model**

Props must include `asset`, `compact?`, `onOpen`, and optional `actions`. Use `Card`/`CardContent`, `Badge`, semantic tokens, and `cn()`. Make the title/summary area a keyboard-accessible button; render actions outside that button and stop propagation for action clicks. Use the same type badge and state count in both compact and grid layouts.

- [ ] **Step 2: Build `StoryAssetDetailDialog` from the same presentation model**

Props must include `asset: StoryAssetPresentation | null`, `onOpenChange`, optional `onEdit`, optional `onDelete`, and `deleting`. Use `Dialog` + `AppDialogContent`, with a fixed header/content/footer structure. Render type badges, detail rows, media, and state rows from the normalized model. Put editing/deletion in the footer and always provide a close button. No API calls or `window.confirm` belong in this component.

- [ ] **Step 3: Export the module and document ownership**

Export the card, dialog, presentation types, and adapter from `index.ts`. The README must state that this module covers story setting assets only and intentionally excludes pure image/lightbox and storyboard preview dialogs.

- [ ] **Step 4: Run shared component contract tests and client typecheck**

Run: `node --experimental-strip-types --test client/tests/storyAssetPresentation.test.mjs client/tests/storyAssetDialogContracts.test.js`

Expected: PASS. Then run: `pnpm --filter @ai-novel/client typecheck`.

### Task 4: Migrate the script-side asset panel

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/OutlineSettingsAside.tsx`

- [ ] **Step 1: Remove local card/detail presentation code**

Delete the local `AssetCard`, `DetailRow`, `DetailStates`, and `AssetDetailDialog` implementations. Keep the source merge, usage filtering, search, creation mutation, and delete mutation ownership in this file.

- [ ] **Step 2: Convert source assets through the shared adapter**

Build `StoryAssetPresentation` objects for character, scene, and prop sources. Store the selected presentation object instead of only an id, and pass it to `StoryAssetDetailDialog`.

- [ ] **Step 3: Render `StoryAssetCard` for the compact aside list**

Keep the existing script usage ordering and missing-asset warning cards. Replace only the existing asset list item button with `StoryAssetCard compact`. The delete callback must invalidate story-setting caches and close the detail dialog on success.

- [ ] **Step 4: Run the focused source-contract and existing scene-state tests**

Run: `node --experimental-strip-types --test client/tests/storyAssetDialogContracts.test.js client/tests/sceneStateImageContracts.test.js`.

Expected: PASS.

### Task 5: Migrate the three settings cards without changing their edit forms

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/SettingsCharactersTab.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsScenesTab.tsx`
- Modify: `client/src/pages/novels/components/storySettings/SettingsPropsTab.tsx`

- [ ] **Step 1: Add selected-detail state and shared card imports**

Each tab keeps its existing `editing`/`creating` state and adds a selected asset presentation state. The card click opens the shared detail dialog; the existing pencil action opens the current type-specific edit dialog.

- [ ] **Step 2: Replace each duplicated card markup**

Use `StoryAssetCard` with the corresponding normalized asset. Keep the existing delete button and mutation in `actions`, and stop its click from opening details through the shared card contract.

- [ ] **Step 3: Connect detail edit/delete actions**

The detail edit action closes the detail dialog and calls the existing `openEdit` function. The detail delete action confirms through the page-level mutation handler, then invalidates queries. The shared component must remain API-agnostic.

- [ ] **Step 4: Run the focused contracts and typecheck**

Run: `node --experimental-strip-types --test client/tests/storyAssetDialogContracts.test.js client/tests/storySettingsForms.test.mjs client/tests/sceneStateImageContracts.test.js`.

Expected: PASS. Then run: `pnpm --filter @ai-novel/client typecheck`.

### Task 6: Documentation, release notes, and final verification

**Files:**
- Modify: `docs/wiki/architecture/story-settings-hub.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Document the stable component boundary**

Add a concise architecture note that story-setting asset cards/details are shared, while type-specific edit forms and media/shot previews remain separate.

- [ ] **Step 2: Record the user-visible behavior**

Add a date-based release-note entry and update only the latest visible README update block, describing consistent asset card details and click behavior from the user perspective.

- [ ] **Step 3: Run the full relevant verification**

Run:

```powershell
node --experimental-strip-types --test client/tests/storyAssetPresentation.test.mjs client/tests/storyAssetDialogContracts.test.js client/tests/sceneStateImageContracts.test.js client/tests/storySettingsForms.test.mjs
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
git diff --check
```

Expected: all tests pass, typecheck/build exit 0, and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Review, commit, merge, and clean up**

Review `git diff` and `git status --short` for only this feature, commit with `git commit -s`, run the project release-note check required before merge, merge the verified branch into `main`, push `origin main`, then remove only this worktree and branch. Preserve all pre-existing main-worktree changes.
