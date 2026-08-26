# Scene Marker Placement and Size Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI-generated scene marker boxes align with their panorama evidence by using deterministic image-region projection and semantic size calibration for floor, wall, and ceiling objects.

**Architecture:** Keep persistence and validation in `StoryScene3dMarkers.ts`, but move all pure projection and size math into the shared `scene3dProjection.ts` module. The shared function returns position, calibrated size, and yaw together; the server normalizer applies it only to AI markers with an image region, while manual and coordinate-only legacy markers retain their existing geometry.

**Tech Stack:** TypeScript, Node test runner, pnpm workspaces, Zod prompt schema, PlayCanvas consumer, Markdown project wiki/release notes.

---

### Task 1: Lock the desired geometry with failing tests

**Files:**
- Modify: `server/tests/scene3dMarkerProjection.test.js`
- Modify: `server/tests/sceneSemanticMarkers.test.js`
- Modify: `server/tests/sceneState3dMarkerService.test.js`
- Modify: `server/tests/sceneState3dMarkersPrompt.test.js`

- [ ] **Step 1: Add the wall-depth regression test.**

Replace the old assertion that a wall marker preserves a near-center radius with a test that constructs an AI window at `[0, 1, 0]`, supplies a right-side `imageRegion`, and asserts:

```js
const projected = projectStoryScene3dMarkerFromImageRegion(
  marker({
    kind: "window",
    label: "北墙窗户",
    position: [0, 1.2, 0],
    size: [1, 1, 0.1],
    imageRegion: { x: 0.78, y: 0.34, width: 0.06, height: 0.18 },
  }),
  environment,
  6,
);
assert.ok(Math.abs(Math.hypot(projected.position[0], projected.position[2]) - 6) < 1e-9);
assert.ok(projected.position[0] > 0 && projected.position[2] < 0);
assert.ok(projected.yawDeg > 90);
```

- [ ] **Step 2: Add image-region size calibration tests for bed, table, and chair.**

Call the same projection function with the same environment and three structured kinds. Assert that every result stays within the category ranges, that the result differs from intentionally extreme input sizes, and that a wider image region produces a wider calibrated footprint:

```js
const narrow = projectStoryScene3dMarkerFromImageRegion(
  marker({ kind: "chair", anchor: "floor", size: [0.05, 30, 30], imageRegion: { x: 0.44, y: 0.32, width: 0.04, height: 0.12 } }),
  environment,
  6,
);
const wide = projectStoryScene3dMarkerFromImageRegion(
  marker({ kind: "chair", anchor: "floor", size: [30, 0.05, 0.05], imageRegion: { x: 0.34, y: 0.32, width: 0.16, height: 0.2 } }),
  environment,
  6,
);
assert.ok(narrow.size[0] >= 0.35 && narrow.size[0] <= 1);
assert.ok(narrow.size[1] >= 0.75 && narrow.size[1] <= 1.5);
assert.ok(narrow.size[2] >= 0.35 && narrow.size[2] <= 1);
assert.ok(wide.size[0] > narrow.size[0]);
```

Add equivalent range assertions for `bed` and `table`, plus a repeated projection assertion covering both `position` and `size` so normalization cannot compound its own calibration.

- [ ] **Step 3: Extend service and Prompt contract tests.**

In `sceneSemanticMarkers.test.js` and `sceneState3dMarkerService.test.js`, assert that a near-origin wall marker is stored at the supplied `maxRadius`, a floor marker has `position[1] === size[1] / 2`, and manual/regionless markers preserve their input size and position. In `sceneState3dMarkersPrompt.test.js`, change the expected Prompt version to `v4` and assert that the rendered instructions describe a tight visible image box and that `position.x/z` is not the authoritative wall depth.

- [ ] **Step 4: Run the focused tests and confirm they fail for the old implementation.**

Run from the worktree root after rebuilding shared/server:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/scene3dMarkerProjection.test.js server/tests/sceneSemanticMarkers.test.js server/tests/sceneState3dMarkerService.test.js server/tests/sceneState3dMarkersPrompt.test.js
```

Expected: the new wall-radius, calibrated-size, and Prompt-version assertions fail while the existing compatibility assertions remain understandable. Do not change production code until the failing behavior is observed.

### Task 2: Centralize projection and implement deterministic size calibration

**Files:**
- Modify: `shared/utils/scene3dProjection.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dMarkers.ts`

- [ ] **Step 1: Define the shared semantic size policy.**

Add an exported, typed table keyed by `StoryScene3DMarkerKind`, with per-axis `[min, max]` ranges, image-span coverage factors, and a floor depth ratio. Include explicit policies for `bed`, `table`, `chair`, `sofa`, `desk`, `cabinet`, `shelf`, `door`, `window`, `counter`, `stair`, and `other`; keep every range inside the server’s existing `0.05–30m` bounds. Do not inspect `label` or scene text.

- [ ] **Step 2: Replace the shared provisional projection with the complete pure projection.**

Change `StoryScene3dMarkerProjection` to return `position`, `size`, and `yawDeg`, and accept `projectionCenterHeight` in the environment. Implement these deterministic branches:

```ts
if (marker.source === "manual" || !marker.imageRegion) {
  return { position: originalPosition, size: originalSize, yawDeg: originalYaw };
}

const ray = resolveProjectionRay(marker.imageRegion, marker.anchor, environment);
const horizontalRadius = marker.anchor === "floor"
  ? resolveGroundRadius(ray, environment.projectionCenterHeight, safeMaxRadius)
  : safeMaxRadius;
const calibratedSize = calibrateMarkerSize(marker, ray, horizontalRadius, safeMaxRadius);

if (marker.anchor === "floor") {
  return {
    position: [unitX * horizontalRadius, calibratedSize[1] / 2, unitZ * horizontalRadius],
    size: calibratedSize,
    yawDeg: originalYaw,
  };
}

const rayDistance = horizontalRadius / Math.max(horizontalLength, 0.08);
return {
  position: [unitX * horizontalRadius, clamp(environment.projectionCenterHeight + ray[1] * rayDistance, calibratedSize[1] / 2, 30), unitZ * horizontalRadius],
  size: calibratedSize,
  yawDeg: direction.azimuthDeg,
};
```

Use the existing fixed `STORY_SCENE_3D_PANORAMA_HORIZON_V` for vertical rays. Estimate image spans with `2 * radius * sin(Math.PI * width)` and `2 * rayDistance * sin(Math.PI * height / 2)`, then apply the category factor/range table. The formula must use only normalized region, environment, kind, and stable sanitized depth/thickness input so a second normalization returns the same result.

- [ ] **Step 3: Make the server delegate to shared math.**

Remove the server-local `resolveProjectionRay` and `resolveDepthHint` implementations. Import the shared projection function, keep `projectStoryScene3dMarkerPosition` as a compatibility wrapper returning `.position`, and in `normalizeMarker` assign all three projected fields:

```ts
const projected = projectStoryScene3dMarkerFromImageRegion(marker, environment, maxRadius);
marker.position = projected.position;
marker.size = projected.size;
marker.yawDeg = projected.yawDeg;
```

Leave common validation, ID normalization, source-environment handling, and coordinate-only/manual compatibility in the server module.

- [ ] **Step 4: Build and run the focused tests.**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/scene3dMarkerProjection.test.js server/tests/sceneSemanticMarkers.test.js server/tests/sceneState3dMarkerService.test.js
```

Expected: all projection, size, service, environment, legacy, and idempotence tests pass.

- [ ] **Step 5: Commit the projection implementation.**

After `git diff --check` and a status review showing only Task 1/2 files, create a signed commit:

```powershell
git add shared/utils/scene3dProjection.ts server/src/modules/novel/story-settings/application/StoryScene3dMarkers.ts server/tests/scene3dMarkerProjection.test.js server/tests/sceneSemanticMarkers.test.js server/tests/sceneState3dMarkerService.test.js
git commit -s -m "fix: calibrate scene marker placement and size"
```

### Task 3: Align the multimodal Prompt and durable workflow documentation

**Files:**
- Modify: `server/src/prompting/prompts/drama/sceneState3dMarkers.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Modify: `server/tests/sceneState3dMarkersPrompt.test.js`
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`

- [ ] **Step 1: Version and clarify the Prompt.**

Change the Prompt asset version from `v3` to `v4`. Add direct instructions that `imageRegion` must tightly contain the visible body of each fixed object, `position.x/z` is only a legacy rough field and must not be used to force wall depth, and `size` is an approximate hint that the service will reconcile with the visible region and structured kind. Keep the fixed `v=0.5` and no-keyword behavior intact.

Update the matching loader key in `promptAssetLoaderEntries.ts` from `drama.scene.state.3d_markers@v3` to `drama.scene.state.3d_markers@v4` so the registry and Prompt asset version remain consistent.

- [ ] **Step 2: Update the Prompt regression test.**

Assert `version === "v4"` and match the new visible-box/depth wording while preserving checks for structured multimodal output, fixed-object filtering, full image evidence, and rejection of missing `imageRegion`.

- [ ] **Step 3: Update the workflow wiki as durable knowledge.**

In the “场景状态空间语义标记” current rule, replace the statement that wall/ceiling markers may use model radial depth with the new rule: AI markers with image evidence place wall/ceiling objects at the current outer wall reference radius, floor objects use ground intersection or outer-floor fallback, and image-region angular spans plus structured kind ranges calibrate dimensions. Retain the precision limitation and manual/coordinate-only compatibility notes. This is a durable workflow rule, not a changelog.

- [ ] **Step 4: Run Prompt and documentation checks.**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/sceneState3dMarkersPrompt.test.js server/tests/scene3dMarkerProjection.test.js server/tests/sceneSemanticMarkers.test.js server/tests/sceneState3dMarkerService.test.js
git diff --check
```

- [ ] **Step 5: Commit the Prompt and wiki unit.**

```powershell
git add server/src/prompting/prompts/drama/sceneState3dMarkers.prompts.ts server/src/prompting/registry/promptAssetLoaderEntries.ts server/tests/sceneState3dMarkersPrompt.test.js docs/wiki/workflows/drama-blocking-3d.md docs/superpowers/plans/2026-08-26-scene-marker-placement-size.md
git commit -s -m "docs: align scene marker prompt and workflow rules"
```

### Task 4: Release notes, full verification, browser acceptance, and integration

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Review: all files changed by Tasks 1–3

- [ ] **Step 1: Use the release-note updater audit.**

Run the `readme-release-updater` skill against the branch scope. Record a concise user-facing entry under the current date describing more accurate scene fixed-object marker placement and sizing; keep implementation details out of the public note. Refresh only the README `## 最新更新` block according to the skill, preserving older release history.

- [ ] **Step 2: Run proportional verification.**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
pnpm --filter @ai-novel/client typecheck
node --test server/tests/scene3dMarkerProjection.test.js server/tests/sceneSemanticMarkers.test.js server/tests/sceneState3dMarkerService.test.js server/tests/sceneState3dMarkersPrompt.test.js
git diff --check
```

If the complete client build is needed by the current branch state, run `pnpm --filter @ai-novel/client build` once and record its result; do not rerun unchanged expensive checks.

- [ ] **Step 3: Verify the live browser behavior.**

Use the existing in-app browser session at the current local fixed ports. Refresh the scene 3D editor for the出租屋 state, confirm that the window marker is on the matching right/left wall direction and near the outer wall rather than around the projection center, and inspect the marker list/viewport for no new runtime error. Use the API only for read-only evidence; do not trigger a paid re-identification unless the current stored marker is unavailable.

- [ ] **Step 4: Commit public notes, then integrate and push.**

After reviewing the complete diff and status, create a signed documentation commit if needed:

```powershell
git add README.md docs/releases/release-notes.md
git commit -s -m "docs: note scene marker calibration"
```

From the clean main workspace, use the repository integration entry point with the focused verification command:

```powershell
pnpm workflow:integrate codex/scene-marker-placement-size --push --verify "pnpm --filter @ai-novel/shared build && pnpm --filter @ai-novel/server build && pnpm --filter @ai-novel/client typecheck && node --test server/tests/scene3dMarkerProjection.test.js server/tests/sceneSemanticMarkers.test.js server/tests/sceneState3dMarkerService.test.js server/tests/sceneState3dMarkersPrompt.test.js"
```

The integration script must perform the signed non-fast-forward merge and explicit `origin/main` push. Do not manually merge on main.

- [ ] **Step 5: Audit final state and clean up.**

Confirm `git status --short` is clean in main, `git rev-parse HEAD` equals `git rev-parse origin/main`, and the feature worktree/branch is removed only after it is fully merged. Run `git worktree list --porcelain` and `git worktree prune`, preserving every unrelated active worktree. Report the focused test/build/browser evidence and any pre-existing verification gaps.
