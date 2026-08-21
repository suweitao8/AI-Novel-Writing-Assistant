# 角色四视图与统一状态资产 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让漫剧 Studio 的角色状态生成稳定产出固定四视图设计稿，让场景图只包含纯环境，并让三类资产状态使用紧凑统一的左右详情编辑器。

**Architecture:** 角色状态走专用四视图应用服务：四个 view prompt 通过现有图片 provider 生成，使用 Sharp 按固定 1536×1024 版式合成后再写入现有 statesJson 状态机。场景和道具继续使用统一 runtime；场景 prompt 增加纯环境契约。前端只改共用 `AssetStatesEditor` 的布局，不拆分三套重复组件。

**Tech Stack:** TypeScript, React 19, Tailwind CSS semantic tokens, Vitest/Node tests, Sharp, existing image runtime and local Grok Build bridge.

---

### Task 1: Lock the four-view contract and composition helpers

**Files:**
- Create: `server/src/services/drama/visual/characterStateSheet.ts`
- Test: `server/tests/characterStateSheet.test.js`

- [ ] **Step 1: Write the failing tests**

Add tests for the exported view contract, prompts and compositor:

```js
test("builds four character state view prompts in stable order", () => {
  const prompts = buildCharacterStateViewPrompts({
    assetName: "叶晨",
    gender: "male",
    ageGroup: "youth",
    appearance: "精瘦，深色短发",
    stateLabel: "初始形象",
    stateDescription: "穿洗旧衬衫和深色长裤",
    stateImagePrompt: "青年男性大学生",
    styleLines: ["写实动漫风格"],
  });
  expect(prompts.map((item) => item.id)).toEqual(["front_portrait", "front_full_body", "side_full_body", "back_full_body"]);
  expect(prompts.every((item) => item.prompt.includes("纯白或浅灰色摄影棚背景"))).toBe(true);
  expect(prompts.every((item) => item.prompt.includes("同一个角色"))).toBe(true);
});

test("character sheet template has one portrait slot and three full-body slots", () => {
  expect(CHARACTER_STATE_SHEET_TEMPLATE.size).toEqual({ width: 1536, height: 1024 });
  expect(CHARACTER_STATE_SHEET_TEMPLATE.slots.map((slot) => slot.id)).toEqual([
    "front_portrait", "front_full_body", "side_full_body", "back_full_body",
  ]);
  expect(CHARACTER_STATE_SHEET_TEMPLATE.slots.reduce((sum, slot) => sum + slot.width, 0)).toBe(1536);
});

test("composes four view files into a 1536x1024 png", async () => {
  const fixture = await createSolidViewFixtures();
  const outputPath = path.join(tmpDir, "sheet.png");
  await composeCharacterStateSheet({ viewPaths: fixture, outputPath });
  await expect(sharp(outputPath).metadata()).resolves.toMatchObject({ width: 1536, height: 1024, format: "png" });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/server exec vitest run tests/characterStateSheet.test.js
```

Expected: FAIL because the contract and compositor module do not exist yet.

- [ ] **Step 3: Implement the minimal contract and compositor**

Implement `CHARACTER_STATE_VIEW_SPECS`, `CHARACTER_STATE_SHEET_TEMPLATE`, `buildCharacterStateViewPrompts`, and `composeCharacterStateSheet`. Use Sharp to place the first view in the 512px portrait slot and the remaining views in three 341/342px full-body slots on a white canvas. Use `fit: "contain"` with a white background for each slot, and add no labels or generated text.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Vitest command. Expected: all compositor and prompt contract tests pass.

- [ ] **Step 5: Commit the coherent helper unit**

```powershell
git add server/src/services/drama/visual/characterStateSheet.ts server/tests/characterStateSheet.test.js
git commit -m "feat: add deterministic character four-view sheet composer"
```

### Task 2: Route character state generation through four view composition

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts:170-203,333-409`
- Create: `server/src/services/image/runtime/compositeRunner.ts`
- Modify: `server/src/services/image/runtime/index.ts`
- Test: `server/tests/storyAssetStateImage.test.js`

- [ ] **Step 1: Add failing service tests**

Add tests that mock the provider boundary and assert character generation requests the four view prompts in order, writes one final state image, and never stores a partial result. Keep existing scene and prop tests unchanged and add the scene/prop prompt assertions from Task 3.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

```powershell
pnpm --filter @ai-novel/server exec vitest run tests/storyAssetStateImage.test.js
```

Expected: the existing single-prompt character behavior fails the four-view request assertions.

- [ ] **Step 3: Implement a composite runtime path**

Add a focused runtime function that mirrors `runImageGeneration` state handling: resolve provider/model, archive the current state, write `generating`, call a supplied `generateView` callback for each view, compose the result, save the final PNG through the adapter, clean old extensions, then write `done`. On any view/provider/compositor error, remove temporary files and write `error` without exposing a partial URL.

In `StoryAssetStateImageService.generateStateImage`, branch only `kind === "character"` to this path. Pass the resolved reference path to every view when one exists. Save the final prompt as the ordered four-view prompt summary and keep the resolved provider in the persisted state. Scene and prop continue using the existing single-image runtime.

- [ ] **Step 4: Run focused tests and verify green**

```powershell
pnpm --filter @ai-novel/server exec vitest run tests/characterStateSheet.test.js tests/storyAssetStateImage.test.js
```

Expected: all tests pass, including error cleanup and stale-error clearing.

- [ ] **Step 5: Commit the backend character pipeline**

```powershell
git add server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/src/services/image/runtime/compositeRunner.ts server/src/services/image/runtime/index.ts server/tests/storyAssetStateImage.test.js
git commit -m "feat: generate character states as four-view sheets"
```

### Task 3: Enforce pure scene references

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts:50-117`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts:170-203`
- Test: `server/tests/storyAssetImage.test.js`

- [ ] **Step 1: Write failing prompt tests**

Assert that the scene base prompt and scene state prompt both contain explicit prohibitions for people, characters, animals, monsters, creatures and background crowds, and do not contain the old permissive phrase allowing tiny background figures.

- [ ] **Step 2: Run the tests and verify the old prompt fails**

```powershell
pnpm --filter @ai-novel/server exec vitest run tests/storyAssetImage.test.js tests/storyAssetStateImage.test.js
```

Expected: FAIL because the current prompt says `NO characters or only tiny background figures` and the state prompt has no scene-specific prohibition.

- [ ] **Step 3: Implement the scene-only prompt contract**

Replace the permissive scene line with strict empty-environment language. Add a scene-specific line to `buildStateImagePrompt` that treats living subjects mentioned in narrative context as off-screen history and allows only environmental traces. Add the same words to the negative prompt assembled by `generateStateImage`.

- [ ] **Step 4: Run focused tests and commit**

```powershell
pnpm --filter @ai-novel/server exec vitest run tests/storyAssetImage.test.js tests/storyAssetStateImage.test.js
git add server/src/modules/novel/story-settings/application/StoryAssetImageService.ts server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/tests/storyAssetImage.test.js server/tests/storyAssetStateImage.test.js
git commit -m "fix: keep generated scene references free of living subjects"
```

### Task 4: Make all state editors compact and visually consistent

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/assetForms.tsx:294-531`
- Test: `client/tests/storyAssetStatesEditor.test.js`

- [ ] **Step 1: Add failing UI contract tests**

Render `AssetStatesEditor` for character, scene and prop states and assert all three use the shared list/detail grid, the root grid has `items-start`, the empty image panel uses a compact minimum height instead of `aspect-video`, and the state list exposes keyboard-activatable buttons with pressed state.

- [ ] **Step 2: Run the UI test and verify the layout assertions fail**

```powershell
pnpm --filter @ai-novel/client exec vitest run tests/storyAssetStatesEditor.test.js
```

Expected: FAIL against the current stretched grid and `aspect-video` empty panel.

- [ ] **Step 3: Implement the compact shared layout**

Use semantic token classes and `cn()`: add `items-start` to the list/detail grid; constrain the list with a scrollable max height; change the image wrapper to `min-h-28` for empty state and use `aspect-[3/2] max-h-64` only for completed design images; set the left list panel to `self-start`; keep all AI actions on `AiButton`; preserve button `aria-pressed`, labels, loading and retry states.

- [ ] **Step 4: Run client typecheck and focused UI test**

```powershell
pnpm --filter @ai-novel/client exec vitest run tests/storyAssetStatesEditor.test.js
pnpm --filter @ai-novel/client typecheck
```

- [ ] **Step 5: Commit the UI unit**

```powershell
git add client/src/pages/novels/components/storySettings/assetForms.tsx client/tests/storyAssetStatesEditor.test.js
git commit -m "fix: unify compact asset state editor layout"
```

### Task 5: Documentation, real generation and release verification

**Files:**
- Modify: `docs/wiki/architecture/story-settings-hub.md`
- Modify: `docs/wiki/architecture/grok-build-provider.md`
- Modify: `docs/wiki/workflows/image-generation-confirmation-runtime.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Document the durable rules**

Record that character state sheets are locally composed from four view outputs, Grok Build receives text only, reference-image states use the compatible provider, and scene references prohibit living subjects. Record the compact state-editor layout as the single shared UI boundary.

- [ ] **Step 2: Run focused regression checks**

```powershell
pnpm --filter @ai-novel/server build
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/server exec vitest run tests/characterStateSheet.test.js tests/storyAssetStateImage.test.js tests/storyAssetImage.test.js tests/imageRuntimeState.test.js tests/imageProviderRouting.test.js
```

- [ ] **Step 3: Restart only the project API if required and generate real assets**

Keep fixed ports 3100/5174/18764/18767. Generate the current novel's 叶晨 initial state, 末世血角兽猎场 scene and 洁白银行卡 prop through their official endpoints. Inspect the resulting files with Sharp and visually inspect the role sheet and scene image; verify the role sheet is 1536×1024 with four occupied slots and the scene contains no living subject.

- [ ] **Step 4: Verify the browser workflow**

Reload the Studio, open each asset editor, select the state from the left list, confirm the right detail panel is compact, generate buttons show loading/disabled state, and failed generation leaves a retryable error.

- [ ] **Step 5: Commit documentation and release surfaces**

Run `git status --short`, inspect the complete diff, stage only the intended files, and commit:

```powershell
git add docs/wiki/architecture/story-settings-hub.md docs/wiki/architecture/grok-build-provider.md docs/wiki/workflows/image-generation-confirmation-runtime.md docs/releases/release-notes.md README.md
git commit -m "docs: record four-view and pure-scene asset contracts"
```

- [ ] **Step 6: Merge, push and clean up**

After verification, merge the branch into the main workspace, run `git push origin main`, then remove this exact worktree and delete `codex/character-asset-polish`. Preserve the pre-existing `server/backups/` directory.
