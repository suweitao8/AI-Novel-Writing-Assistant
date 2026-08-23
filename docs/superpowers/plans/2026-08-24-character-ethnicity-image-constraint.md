# Asian Character Image Constraint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every human-character image request renders a Chinese/East Asian character by default, including direct prompts, reference-image edits, and retried tasks, without affecting non-character assets or explicit non-human designs.

**Architecture:** Add one shared, marker-based prompt contract and an idempotent append helper in `shared/imagePrompt.ts`. Add the contract to character-specific prompt builders for preview parity, then enforce it again in `server/src/services/image/provider.ts` for both JSON generation and multipart edit requests. Keep the provider guard scoped to `character` and `book_analysis_character` scene types.

**Tech Stack:** TypeScript, Node test runner, pnpm workspace, Prisma-backed image task service, Codex/OpenAI-compatible image provider.

---

### Task 1: Lock the required behavior with failing tests

**Files:**
- Create: `server/tests/characterImageEthnicityPrompt.test.js`
- Read: `shared/imagePrompt.ts`, `server/src/services/image/provider.ts`, `server/src/services/drama/visual/characterStateSheet.ts`, `server/src/services/comic/ComicCharacterImageService.ts`, `server/src/services/image/ImageGenerationService.ts`

- [ ] **Step 1: Write the failing tests**

The test file must assert all of the following:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { CHARACTER_IMAGE_ETHNICITY_CONSTRAINT, appendCharacterImageEthnicityConstraint } = require("@ai-novel/shared/imagePrompt");
const { buildImageGenerationRequestBody } = require("../dist/services/image/provider.js");
const { buildCharacterStateSheetPrompt } = require("../dist/services/drama/visual/characterStateSheet.js");
const { buildCharacterImagePrompt } = require("@ai-novel/shared/imagePrompt");

const providerSource = fs.readFileSync(path.join(__dirname, "../src/services/image/provider.ts"), "utf8");
const comicSource = fs.readFileSync(path.join(__dirname, "../src/services/comic/ComicCharacterImageService.ts"), "utf8");
const imageServiceSource = fs.readFileSync(path.join(__dirname, "../src/services/image/ImageGenerationService.ts"), "utf8");

test("shared ethnicity constraint is non-empty and idempotent", () => {
  assert.match(CHARACTER_IMAGE_ETHNICITY_CONSTRAINT, /中国|Chinese/);
  const once = appendCharacterImageEthnicityConstraint("画一个角色");
  assert.equal(appendCharacterImageEthnicityConstraint(once), once);
});

test("character state and legacy character prompts expose the identity constraint", () => {
  const statePrompt = buildCharacterStateSheetPrompt({
    assetName: "林澈",
    gender: "male",
    ageGroup: "youth",
    appearance: "黑色短发，清瘦",
    stateLabel: "默认",
    stateDescription: "正常状态",
    stateImagePrompt: "干净衣着",
  }, []);
  const legacyPrompt = buildCharacterImagePrompt({
    prompt: "角色立绘",
    character: { name: "林澈", role: "主角", personality: "冷静", background: "现代都市" },
  });
  assert.match(statePrompt, /中国|Chinese|East Asian/);
  assert.match(legacyPrompt, /中国|Chinese|East Asian/);
});

test("provider appends the constraint only to character scene types", () => {
  const base = { provider: "codex", model: "gpt-image-1", prompt: "画一个人物", size: "1024x1024", count: 1 };
  const character = buildImageGenerationRequestBody({ ...base, sceneType: "character" });
  const bookAnalysis = buildImageGenerationRequestBody({ ...base, sceneType: "book_analysis_character" });
  const scene = buildImageGenerationRequestBody({ ...base, sceneType: "chapter_illustration" });
  assert.match(String(character.prompt), /中国|Chinese|East Asian/);
  assert.match(String(bookAnalysis.prompt), /中国|Chinese|East Asian/);
  assert.doesNotMatch(String(scene.prompt), /HUMAN CHARACTER ETHNICITY LOCK/);
});

test("provider protects both JSON and reference-edit paths and character services use the contract", () => {
  assert.equal((providerSource.match(/buildPrompt\(input\.prompt, input\.negativePrompt, input\.sceneType\)/g) ?? []).length, 2);
  assert.match(comicSource, /appendCharacterImageEthnicityConstraint|CHARACTER_IMAGE_ETHNICITY_CONSTRAINT/);
  assert.match(imageServiceSource, /appendCharacterImageEthnicityConstraint/);
});
```

- [ ] **Step 2: Build current shared/server output and run the new test**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/characterImageEthnicityPrompt.test.js
```

Expected: FAIL because the shared marker/helper, provider scene-type append, and builder wiring do not exist yet. Do not modify the assertions to make the current implementation pass.

### Task 2: Add the shared identity contract

**Files:**
- Modify: `shared/imagePrompt.ts`
- Test: `server/tests/characterImageEthnicityPrompt.test.js`

- [ ] **Step 1: Add the shared marker and idempotent helper**

Export `CHARACTER_IMAGE_ETHNICITY_CONSTRAINT` beginning with the exact marker `HUMAN CHARACTER ETHNICITY LOCK (HARD CONSTRAINT)` and state in both English and Chinese that human characters must be Chinese/East Asian, must not default to white/Caucasian/European facial features, and must preserve explicit character data. State that non-human creatures remain non-human. Export `appendCharacterImageEthnicityConstraint(prompt)`; it trims the input, returns the constraint for blank input, and returns the original text unchanged when the marker is already present.

- [ ] **Step 2: Make the legacy character prompt include the contract**

Change `buildCharacterImagePrompt` to pass its assembled blocks through `appendCharacterImageEthnicityConstraint`, so old character tasks and previews include the same prompt contract before provider dispatch.

- [ ] **Step 3: Rebuild and run only the shared/helper tests**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/characterImageEthnicityPrompt.test.js
```

Expected: the helper and legacy prompt assertions pass; builder/provider wiring assertions remain red until the following tasks.

### Task 3: Apply the contract to every character prompt builder

**Files:**
- Modify: `server/src/services/drama/visual/characterStateSheet.ts`
- Modify: `server/src/services/comic/ComicCharacterImageService.ts`
- Modify: `server/src/services/image/ImageGenerationService.ts`
- Modify: `server/src/prompting/prompts/image/image.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Test: `server/tests/characterImageEthnicityPrompt.test.js`

- [ ] **Step 1: Add the shared constraint to the canonical state sheet**

Import the shared constant and include it after the character identity lock in `buildCharacterStateSheetPrompt`. Include it in `buildCharacterStateViewPrompts` common lines as well, so any compatibility preview path uses the same rule.

- [ ] **Step 2: Add the shared constraint to comic sheets, expressions, and custom prompt tuning**

Import the helper/constant. Include the constant in the default sheet and expression prompts. Make `buildTunedSheetPrompt` append the idempotent helper even when `lockAppearance` is false, so a user-supplied custom prompt still displays the hard constraint.

- [ ] **Step 3: Normalize old queued-task prompts at creation**

In `ImageGenerationService.createCharacterTask` and `createBookAnalysisCharacterTask`, wrap both direct and optimized prompt branches with `appendCharacterImageEthnicityConstraint` before persisting the task. This keeps task history, retry previews, and provider input aligned.

- [ ] **Step 4: Protect the AI prompt optimizer from removing the rule**

In `image.character.prompt_optimize@v3`, add a rule that human character output must remain Chinese/East Asian and that the optimizer must not remove the identity constraint; update the registry loader key to the same `@v3` version.

- [ ] **Step 5: Rebuild and run the builder tests**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/characterImageEthnicityPrompt.test.js server/tests/storyAssetStateImage.test.js server/tests/dramaCharacterImage.test.js
```

Expected: all new builder assertions and existing character/state prompt tests pass.

### Task 4: Enforce the contract at the provider boundary

**Files:**
- Modify: `server/src/services/image/provider.ts`
- Test: `server/tests/characterImageEthnicityPrompt.test.js`
- Test: `server/tests/imageProviderRouting.test.js`

- [ ] **Step 1: Make `buildPrompt` scene-type aware**

Change its signature to `(prompt, negativePrompt, sceneType)`. For `character` and `book_analysis_character`, first call `appendCharacterImageEthnicityConstraint(prompt)`; for all other scene types, trim the original prompt unchanged. Append the negative prompt after this step.

- [ ] **Step 2: Use the same effective prompt for JSON and multipart requests**

Pass `input.sceneType` at both `buildImageGenerationRequestBody` and `generateWithFileRef` call sites. Do not add the rule to negative prompts or to scene/prop requests.

- [ ] **Step 3: Run the provider behavior and source contract tests**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/characterImageEthnicityPrompt.test.js server/tests/imageProviderRouting.test.js
```

Expected: 4/4 new tests pass, including JSON request behavior and the two-path provider wiring assertion.

### Task 5: Durable documentation and delivery verification

**Files:**
- Modify: `docs/wiki/workflows/comic-character-asset-pipeline.md` (only if the existing page lacks this durable rule)
- Modify: `docs/wiki/architecture/story-settings-hub.md` (record the same boundary for novel state images)
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the workflow wiki with the stable boundary**

Document in both the comic asset pipeline and story settings hub that all human-character asset prompts use the shared Chinese/East Asian identity contract and that provider enforcement covers direct prompts and retries; keep non-human assets and scene-only generation out of the rule. If either page already contains an equivalent durable rule, leave that page unchanged and record that no wiki edit was necessary.

- [ ] **Step 2: Run final verification**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/characterImageEthnicityPrompt.test.js server/tests/storyAssetStateImage.test.js server/tests/dramaCharacterImage.test.js server/tests/comicCharacterBridge.test.js
node --test server/tests/imageProviderRouting.test.js
pnpm --filter @ai-novel/server typecheck
git diff --check
```

Expected: all listed tests pass, server typecheck exits 0, and `git diff --check` reports no whitespace errors. Reuse the server test/build evidence only if it is tied to the final commit and no server files changed afterward.

- [ ] **Step 3: Commit the implementation unit**

Review `git status --short` and stage only the shared prompt, server prompt/provider changes, tests, wiki/release surfaces, and this plan if it was not already committed. Commit with:

```powershell
git add shared/imagePrompt.ts server/src/services/drama/visual/characterStateSheet.ts server/src/services/comic/ComicCharacterImageService.ts server/src/services/image/ImageGenerationService.ts server/src/services/image/provider.ts server/src/prompting/prompts/image/image.prompts.ts server/src/prompting/registry/promptAssetLoaderEntries.ts server/tests/characterImageEthnicityPrompt.test.js server/tests/imageProviderRouting.test.js docs/wiki/architecture/story-settings-hub.md docs/wiki/workflows/comic-character-asset-pipeline.md docs/releases/release-notes.md README.md
git commit -s -m "feat: enforce Asian character image identity"
```

- [ ] **Step 4: Merge, push, and clean up**

From the main workspace only, verify the branch is fully tested, merge with an explicit non-fast-forward merge, run the prepared-merge guard, execute `git push origin main`, verify `HEAD` equals `origin/main`, preserve unrelated concurrent changes, then remove only this task's clean worktree and delete `codex/character-ethnicity-v1`.
