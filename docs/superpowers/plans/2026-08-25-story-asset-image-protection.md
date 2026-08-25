# Story Asset Image Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make character, scene, and prop state images recoverable and non-destructive when a regeneration fails, a stale task returns late, or the current immutable artifact is missing.

**Architecture:** Keep the existing owner-scoped immutable artifact model. Add a small story-settings recovery policy that preserves the latest readable pointer during error writes and orders same-owner committed artifacts for recovery. Make the HTTP resolver try the current artifact, then older committed artifacts for the exact novel/kind/asset/state, then the owner-scoped pre-artifact file; never use the shared bare-state directory.

**Tech Stack:** TypeScript, Prisma, Node test runner, pnpm workspace.

---

### Task 1: Define the recovery policy with failing tests

**Files:**
- Create: `server/src/modules/novel/story-settings/application/StoryAssetImageRecoveryPolicy.ts`
- Create: `server/tests/storyAssetImageRecoveryPolicy.test.js`

- [x] **Step 1: Write tests for failure-pointer preservation and artifact ordering.**

  Test that an error result retains the current `artifactId`, URL, and generation timestamp when the current state already has a readable pointer, while a pointerless failed state remains pointerless. Test that the current artifact is attempted first and older candidates remain available in descending database order.

- [x] **Step 2: Run the focused test and verify the expected module/exports failure.**

  Run from the worktree:

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/storyAssetImageRecoveryPolicy.test.js
  ```

  Expected result: FAIL because the new recovery policy module does not exist yet.

- [x] **Step 3: Implement the minimal policy functions.**

  Export `preserveReadableStoryAssetImagePointer(current, attempted)` and `prioritizeStoryAssetImageArtifacts(currentArtifactId, candidates)`. The first function only preserves pointer fields from the current state for an error result; the second puts the current pointer first and keeps the remaining candidates in their supplied newest-first order.

- [x] **Step 4: Run the focused test and verify it passes.**

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/storyAssetImageRecoveryPolicy.test.js
  ```

### Task 2: Prevent stale failure writes from replacing the readable pointer

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts:466-631`
- Modify: `server/tests/storyAssetImageRecoveryPolicy.test.js`

- [x] **Step 1: Add a regression assertion that the state patch uses the recovery policy on error.**
- [x] **Step 2: Run the focused test and confirm it fails against the current direct `pruneStateImage(image)` patch.**
- [x] **Step 3: Apply `preserveReadableStoryAssetImagePointer` inside the shared state patch path for character, scene, and prop images.**

  Successful/generating writes continue to use the attempted state. Error writes merge only the current readable pointer fields, so a slow or stale task cannot roll back a newer committed image or remove a valid legacy URL.

- [x] **Step 4: Run the recovery policy and existing CAS tests.**

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/storyAssetImageRecoveryPolicy.test.js server/tests/storyAssetStateCas.test.js
  ```

### Task 3: Recover from a missing current artifact without crossing asset ownership

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts:985-1044`
- Modify: `server/tests/storyAssetImageCollisionRegression.test.js`
- Modify: `server/tests/storyAssetImageArtifactStore.test.js`

- [x] **Step 1: Add a regression contract for same-owner artifact fallback.**

  Assert that the resolver queries committed candidates for the exact `(novelId, kind, assetId, stateId)` target, tries the current artifact before older committed generations, and falls back only to the owner-scoped legacy directory. Assert that `legacyStateImageDir(stateId)` remains absent from the normal resolver.

- [x] **Step 2: Run the focused contract tests and verify the new recovery contract fails.**
- [x] **Step 3: Refactor artifact verification into a private helper and implement fallback ordering.**

  Query all committed artifacts for the exact target ordered newest first, prioritize the current `artifactId`, verify each file's exact owner-scoped storage key, MIME, hash, and byte size, skip malformed candidates, then try the scoped legacy directory. Never scan or guess from `story-state-images/<stateId>`.

- [x] **Step 4: Run the focused artifact, collision, and recovery tests.**

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/storyAssetImageRecoveryPolicy.test.js server/tests/storyAssetImageCollisionRegression.test.js server/tests/storyAssetImageArtifactStore.test.js
  ```

### Task 4: Document and verify the protection boundary

**Files:**
- Modify: `docs/wiki/architecture/story-asset-image-storage.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [x] **Step 1: Update the wiki with the failure-preservation and same-owner recovery rules.**
- [x] **Step 2: Add a user-facing release note describing that failed regeneration keeps the last usable preview and missing current artifacts recover from the same asset's committed history.**
- [x] **Step 3: Refresh the README latest-update block according to the release-note workflow.**
- [x] **Step 4: Keep state references, storyboard references, and 3D scene previews on a retained URL pointer even when the latest generation status is `error` or `generating`.**
- [x] **Step 5: Run the focused tests, server typecheck, client typecheck, and final Git/worktree checks.**

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/storyAssetImageRecoveryPolicy.test.js server/tests/storyAssetImageCollisionRegression.test.js server/tests/storyAssetImageArtifactStore.test.js server/tests/storyAssetStateCas.test.js
  pnpm --filter @ai-novel/server typecheck
  pnpm --filter @ai-novel/client typecheck
  git status --short
  git worktree list --porcelain
  ```

### Task 5: Deliver through the protected integration workflow

- [x] **Step 1: Review the scoped diff and confirm no database, generated image, secret, or unrelated worktree files are included.**
- [ ] **Step 2: Commit the completed branch with `git commit -s`.**
- [ ] **Step 3: From the clean main workspace run `pnpm workflow:integrate codex/story-asset-image-protection --push --verify "pnpm --filter @ai-novel/server typecheck"`.**
- [ ] **Step 4: Verify `main` equals `origin/main`, the integrated worktree is removed, and unrelated worktrees remain untouched.**
