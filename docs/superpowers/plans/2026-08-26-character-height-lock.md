# 3D Character Height Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove manual character-size changes from 3D blocking while keeping inferred character height visible and preserving automatic height-based proportions.

**Architecture:** Keep `heightMeters` and internal layout `scale` as system-owned data. Remove the viewer's public `scaleSelected` mutation and the page buttons that call it. Show the height baseline in the blocking character list and selected-character metadata, while the existing asset presentation remains the read-only source of truth for character height.

**Tech Stack:** React 19, TypeScript, PlayCanvas, Tailwind semantic tokens, Node test runner, pnpm workspace, Git worktrees.

---

### Task 1: Add the regression contract for locked size

**Files:**
- Modify: `client/tests/dramaBlocking3dHeight.contract.test.js`

- [ ] **Step 1: Extend the test before production changes**

  Assert that the blocking page does not contain the manual shrink/expand controls or `scaleSelected`, while the viewer still contains height-based scaling and the page passes `actor.heightMeters` through.

- [ ] **Step 2: Run the focused test and verify the expected red failure**

  Run: `node --experimental-strip-types --test client/tests/dramaBlocking3dHeight.contract.test.js`

  Expected: the existing height assertions pass and the new locked-size assertion fails because the current page still exposes the buttons and method.

### Task 2: Remove manual scale mutation from the 3D viewer

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`

- [ ] **Step 1: Remove `scaleSelected` from the viewer interface and implementation**

  Keep actor creation, height-based proxy scale, layout import/export, movement, rotation and camera behavior unchanged. Do not remove the internal layout `scale` field because old snapshots and system-generated layouts still use it.

- [ ] **Step 2: Run the focused contract test**

  Run: `node --experimental-strip-types --test client/tests/dramaBlocking3dHeight.contract.test.js`

  Expected: the viewer-side locked-size assertion is green; page-side assertions remain red until Task 3.

### Task 3: Remove page controls and show the height baseline

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Test: `client/tests/dramaBlocking3dHeight.contract.test.js`

- [ ] **Step 1: Remove shrink/expand buttons and the scale readout**

  Preserve position/rotation controls and camera wheel zoom. Replace the selected actor's scale row with a read-only height row based on the selected context actor.

- [ ] **Step 2: Show each actor's approximate height in the “本镜角色” list**

  Use existing semantic Tailwind tokens and keyboard-accessible buttons. Missing height must render a neutral `—` value without blocking actor selection.

- [ ] **Step 3: Run the focused contract test and client typecheck**

  Run: `node --experimental-strip-types --test client/tests/dramaBlocking3dHeight.contract.test.js client/tests/storyAssetPresentationHeight.contract.test.js`

  Run: `pnpm --filter @ai-novel/client typecheck`

  Expected: all focused tests and the client typecheck pass.

### Task 4: Document the user-visible behavior and durable boundary

**Files:**
- Modify: `docs/wiki/architecture/character-height-proportion.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the architecture rule**

  State that role height is system-owned and 3D blocking cannot manually mutate the actor's overall size; distinguish camera zoom and position changes from model scale.

- [ ] **Step 2: Update user-facing release surfaces**

  Add one date-merged user-facing entry describing locked character proportions and visible height information.

### Task 5: Run the full focused verification and commit

**Files:**
- Test: `server/tests/characterHeightProfile.contract.test.js`
- Test: `server/tests/dramaShotBlockingAutoPlanService.test.js`

- [ ] **Step 1: Run shared/server builds and focused server tests**

  Run: `pnpm --filter @ai-novel/shared build`

  Run: `pnpm --filter @ai-novel/server prisma:generate`

  Run: `pnpm --filter @ai-novel/server build`

  Run: `node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/characterHeightProfile.contract.test.js`

- [ ] **Step 2: Run client tests and typecheck again after documentation changes**

  Run: `pnpm --filter @ai-novel/client typecheck`

  Run: `node --experimental-strip-types --test client/tests/dramaBlocking3dHeight.contract.test.js client/tests/storyAssetPresentationHeight.contract.test.js`

- [ ] **Step 3: Review the staged scope and commit**

  Run `git diff --cached --check`, stage only the feature files, and commit with `git commit -s`.

### Task 6: Integrate and close the delivery loop

- [ ] **Step 1: Run the project integration command from clean `main`**

  Use `pnpm workflow:integrate codex/character-height-lock --verify "pnpm --filter @ai-novel/server prisma:generate && pnpm --filter @ai-novel/shared build && pnpm --filter @ai-novel/server build && pnpm --filter @ai-novel/client typecheck && node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/characterHeightProfile.contract.test.js && node --experimental-strip-types --test client/tests/dramaBlocking3dHeight.contract.test.js client/tests/storyAssetPresentationHeight.contract.test.js" --push`.

- [ ] **Step 2: Verify `HEAD == origin/main`, clean status, and no remaining feature worktree**

  Run `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and `git worktree list --porcelain`.

- [ ] **Step 3: Remove the merged worktree and local branch**

  Use `pnpm workflow:cleanup codex/character-height-lock` only after the integration succeeds.
