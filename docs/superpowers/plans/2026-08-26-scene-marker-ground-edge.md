# 空间标记地面物品边缘落点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让带有图片区域证据的桌子、椅子、床等 `floor` 空间标记保持图片水平位置，并稳定落在当前半球可用地面外圈，而不是集中在球体中心。

**Architecture:** 服务端 `projectStoryScene3dMarkerPosition` 负责把 equirectangular `imageRegion` 反算为世界坐标；水平经度仍由区域中心决定。floor 标记优先使用向下射线的地面交点，当前固定 50% 合同导致射线向上或近似水平时，使用 `maxRadius` 外圈作为确定性地面深度；wall/ceiling 和手工/无区域标记保持现有策略。

**Tech Stack:** TypeScript, shared package, Node.js `node:test`, pnpm workspace, PlayCanvas client runtime.

---

### Task 1: Lock the regression at the shared projection boundary

**Files:**
- Modify: `server/tests/scene3dMarkerProjection.test.js`
- Test: `shared/dist/utils/scene3dProjection.js` after shared build

- [x] **Step 1: Add the failing floor-edge test**

Add a floor marker whose image region ends at `v=0.46` and whose model position is near the origin. Assert that the projected horizontal radius equals the supplied `maxRadius`, while its direction still follows the image region center.

- [x] **Step 2: Run the focused test before implementation**

Run `pnpm --filter @ai-novel/shared build` followed by `node --test server/tests/scene3dMarkerProjection.test.js`.

Expected: the new test fails because the current upward floor ray falls back to the `0.58` depth hint instead of the outer radius.

- [x] **Step 3: Add coverage for the preserved behavior**

Keep/add assertions that a downward floor ray still projects to the ground intersection and clamps to `maxRadius`, that wall markers preserve image direction and orientation, and that manual or regionless markers keep their original coordinates.

### Task 2: Implement deterministic ground-edge projection

**Files:**
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dMarkers.ts`
- Test: `server/tests/scene3dMarkerProjection.test.js`

- [x] **Step 1: Replace the floor fallback depth source**

In `projectStoryScene3dMarkerPosition`, use `safeMaxRadius` as the floor fallback whenever `downward <= 0.08` or the computed ground intersection is not finite. Continue to clamp valid intersections to `[0.25, safeMaxRadius]`.

- [x] **Step 2: Run the focused projection tests**

Run `node --test server/tests/scene3dMarkerProjection.test.js`.

Expected: all projection tests pass, including the new edge regression.

- [x] **Step 3: Verify service normalization consumes the corrected projection**

Run `node --test server/tests/sceneState3dMarkerService.test.js server/tests/sceneSemanticMarkers.test.js` and confirm generated floor markers retain image-region direction and receive the corrected outer radius.

### Task 3: Complete contracts, documentation, and verification

**Files:**
- Modify: `server/tests/sceneState3dMarkerService.test.js` if service-level coverage needs a concrete floor case
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` only if the latest update needs a user-visible summary

- [x] **Step 1: Add durable documentation**

Document that furniture constrained above the fixed panorama horizon cannot provide a downward ground ray, so floor markers use the available ground outer radius while preserving image longitude; manual and regionless legacy markers remain untouched.

- [ ] **Step 2: Run focused and package verification**

Run the focused server marker suite, `pnpm --filter @ai-novel/shared build`, `pnpm --filter @ai-novel/server typecheck`, `pnpm --filter @ai-novel/server build`, `pnpm --filter @ai-novel/client typecheck`, and `pnpm --filter @ai-novel/client build`.

- [ ] **Step 3: Perform real-page acceptance**

Use the running local studio page to re-run space recognition for a scene state with fixed furniture, then inspect the generated marker positions in the 3D preview. Confirm a table/chair is near the dome edge, its horizontal side matches the source image, and no manual marker moves.

- [ ] **Step 4: Commit the coherent change**

Run `git diff --check`, stage only the design/plan, projection, tests, and documentation files, then commit with `git commit -s -m "fix: place floor markers at panorama ground edge"` on the isolated branch.

### Task 4: Integrate and close the loop

**Files:**
- No additional source files; use the repository integration workflow.

- [ ] **Step 1: Verify the main checkout is clean**

Run `pnpm check:workspace-integrity` from `D:\Github\AI-Novel-Writing-Assistant`.

- [ ] **Step 2: Integrate and push explicitly**

Run `pnpm workflow:integrate codex/shared-scene-marker-ground-edge --verify "pnpm typecheck" --push` from `main`.

- [ ] **Step 3: Verify and clean up**

Confirm `git status --short` is empty, `git rev-parse HEAD` equals `git rev-parse origin/main`, then run `pnpm workflow:cleanup codex/shared-scene-marker-ground-edge` and `git worktree prune`.
