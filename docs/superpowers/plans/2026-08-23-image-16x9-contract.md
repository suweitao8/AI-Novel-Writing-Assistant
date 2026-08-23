# Image 16:9 Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every non-panorama asset and storyboard image use a strict 16:9 generation size while preserving 2:1 scene panoramas and 720p/1080p video profiles.

**Architecture:** Keep `server/src/services/image/imageSpecs.ts` as the single source of image dimensions. Change only the character-sheet and generic character/prop asset specs from 3:2 to the existing 16:9 `1536x864` size; preserve the existing `scenePanorama=2048x1024` and `dramaKeyframe=1536x864`. Contract tests will assert the complete matrix and existing generation services will continue consuming the constants.

**Tech Stack:** TypeScript, Node test runner, Prisma-backed services, Markdown architecture wiki/release notes.

---

### Task 1: Lock the desired image-size matrix with a failing test

**Files:**
- Modify: `server/tests/imageSpecsContract.test.js`
- Test source: `server/src/services/image/imageSpecs.ts`

- [ ] **Step 1: Replace the 3:2 expectations with the required matrix and add aspect-ratio assertions.**

The test must assert `characterSheet`, `characterAsset`, and `dramaKeyframe` are `1536x864`, `scenePanorama` is `2048x1024`, and every non-panorama spec is 16:9.

- [ ] **Step 2: Run the focused test and verify it fails against the current 1536x1024 implementation.**

Run: `node --test server/tests/imageSpecsContract.test.js`

Expected: FAIL on the current `characterSheet` and `characterAsset` values.

### Task 2: Implement the single-source 16:9 asset contract

**Files:**
- Modify: `server/src/services/image/imageSpecs.ts`
- Modify: `server/tests/imageSpecsContract.test.js`
- Inspect: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- Inspect: `server/src/services/drama/DramaCharacterImageService.ts`
- Inspect: `server/src/services/drama/visual/DramaShotKeyframeService.ts`

- [ ] **Step 1: Change `IMAGE_SPECS.characterSheet` and `IMAGE_SPECS.characterAsset` to `1536x864`.**

Leave `scenePanorama` at `2048x1024` and `dramaKeyframe` at `1536x864`; do not add service-local dimensions.

- [ ] **Step 2: Run the focused test and verify it passes.**

Run: `node --test server/tests/imageSpecsContract.test.js`

Expected: PASS with all image-size contract assertions.

- [ ] **Step 3: Run the related image-routing and drama-contract tests.**

Run: `node --test server/tests/imageProviderRouting.test.js server/tests/dramaLandscapeTtsContracts.test.js server/tests/dramaPipelineContract.test.js`

Expected: PASS with no provider-routing or storyboard-size regressions.

### Task 3: Synchronize durable documentation and user-facing notes

**Files:**
- Modify: `docs/wiki/architecture/image-generation-specs.md`
- Modify: `docs/wiki/architecture/visual-style-presets.md`
- Modify: `docs/wiki/architecture/story-settings-hub.md`
- Modify: `docs/wiki/workflows/comic-drama-workflow.md`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: Update the architecture matrix and stale 3:2 statements.**

Document 1536x864 for role sheets, character/prop assets, and storyboard keyframes; document only scene panoramas as 2048x1024 2:1. Clarify that existing images are not automatically re-generated.

- [ ] **Step 2: Add one concise user-facing release-note/README bullet.**

Describe the visible behavior as unified 16:9 character, prop, and storyboard images with 2:1 reserved for scene panoramas; do not mention internal file names or migration mechanics in user-facing copy.

### Task 4: Verify the merged implementation

**Files:**
- Verify: all files above

- [ ] **Step 1: Run formatting and focused tests.**

Run: `git diff --check` and the tests from Tasks 1-2.

- [ ] **Step 2: Run service build/type checks.**

Run: `pnpm --filter @ai-novel/shared build`, `pnpm --filter @ai-novel/server build`, and `pnpm --filter @ai-novel/video typecheck`.

- [ ] **Step 3: Inspect the final diff and commit only this contract change.**

Use an isolated `codex/image-16x9-contract` branch, sign the commit with `git commit -s`, and leave unrelated main-worktree changes untouched.
