# HDRI 投射中心地面稳定化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复共享 HDRI 投影材质在投射中心附近的等距柱状南极奇点，让通用资产和所有 blocking3d 预览的地面不再出现旋涡。

**Architecture:** 保留一个连续 EnviroDome、一个 MeshInstance 和原始 `sampler2D` 投影。材质在既有世界方向采样之外，按 `radiusMeters` 为地面中心增加 8%–28% 的有限稳定投影环，并通过环形 `smoothstep` 混合回原始投影；稳定环的外圈经度和纬度与原始投影对齐，中心只固定南极奇点的经度，避免形成新的可见圆盘。半径只作为运行时 uniform，不进入数据库。CPU 投影 helper 与 GLSL 使用相同公式，作为数值回归契约。

**Tech Stack:** React/Vite、TypeScript、PlayCanvas GLSL、Node `node:test`、pnpm workspace、Codex 内置浏览器。

---

### Task 1: 建立投影稳定区的数值契约

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts`
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs`

- [ ] **Step 1: Write the failing test**

新增 `getProjectedHdriGroundStabilization`、`projectEquirectangularSurface` 的导入和以下测试：

```js
test("投射中心地面使用有限稳定区，不让微小位置变化跨越整条经度轴", () => {
  const center = projectEquirectangularSurface([0, 0, 0], 2, 7.5);
  const nearby = [
    projectEquirectangularSurface([0.01, 0, 0], 2, 7.5),
    projectEquirectangularSurface([-0.01, 0, 0], 2, 7.5),
    projectEquirectangularSurface([0, 0, 0.01], 2, 7.5),
  ];

  assert.equal(center.groundStabilization, 1);
  assert.ok(nearby.every((sample) => sample.groundStabilization > 0.99));
  assert.ok(nearby.every((sample) => Math.abs(sample.u - center.u) < 0.01));
  assert.ok(nearby.every((sample) => sample.v < 0.9));
});

test("稳定区按半径缩放，并在边界连续退出", () => {
  assert.equal(getProjectedHdriGroundStabilization(0, 7.5), 1);
  assert.equal(getProjectedHdriGroundStabilization(7.5 * 0.28, 7.5), 0);
  assert.ok(getProjectedHdriGroundStabilization(7.5 * 0.18, 7.5) > 0);
  assert.ok(getProjectedHdriGroundStabilization(15 * 0.18, 15) > 0);
  assert.equal(getProjectedHdriGroundStabilization(1, 0), 0);
  assert.equal(getProjectedHdriGroundStabilization(1, Number.NaN), 0);
});

test("上半球和稳定区外仍然使用原始方向投影", () => {
  const upper = projectEquirectangularSurface([0, 4, 0], 2, 7.5);
  const rawUpper = projectEquirectangularDirection([0, 2, 0]);
  const outerGround = projectEquirectangularSurface([7, 0, 0], 2, 7.5);
  const rawGround = projectEquirectangularDirection([7, -2, 0]);

  assert.equal(upper.groundStabilization, 0);
  assert.deepEqual(upper, { ...rawUpper, groundStabilization: 0 });
  assert.equal(outerGround.groundStabilization, 0);
  assert.deepEqual(outerGround, { ...rawGround, groundStabilization: 0 });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs
```

Expected: FAIL because the two new helpers are not exported.

- [ ] **Step 3: Implement the CPU contract**

Add the constants `PROJECTED_HDRI_GROUND_STABILIZATION_START_RATIO = 0.08`, `PROJECTED_HDRI_GROUND_STABILIZATION_END_RATIO = 0.28`, cap V offset `0.34`, U scale `1.6`, V scale `3`, and minimum radius `0.001`. Add `ProjectedHdriSurfaceCoordinates { u; v; groundStabilization }`, a finite-radius resolver, wrapped-U interpolation that chooses the shortest path across 0/1, and `getProjectedHdriGroundStabilization(horizontalDistance, projectionRadiusMeters)`.

Implement `projectEquirectangularSurface(surfacePosition, projectionCenterHeight, projectionRadiusMeters, panoramaHorizonV, hdriAzimuthOffsetDegrees)` by:
1. subtracting the projection height and calling the unchanged direction-only helper for the raw coordinates;
2. enabling stabilization only when `surfacePosition[1] < projectionCenterHeight - 0.001`;
3. using `1 - smoothstep(0.08, 0.28, horizontalDistance / safeRadius)`;
4. deriving a stable longitude that moves from fixed `u=0.5` at the center to the raw projected longitude at the 28% outer ring, using wrapped shortest-path interpolation;
5. deriving the stable latitude from the raw projection height at that outer ring: `v = clamp(horizon + atan2(max(projectionCenterHeight, 0.001), safeRadius * 0.28) / PI, 0, 0.96)`;
6. mixing V linearly and U on the wrapped shortest path.

Keep `projectEquirectangularDirection` unchanged for key-light estimation and existing direction tests.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the Step 2 command. Expected: all projection tests PASS, including existing horizon, pole and azimuth-offset tests.

### Task 2: Apply the stable projection to the shared PlayCanvas material

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts`
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs`
- Test: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [ ] **Step 1: Write failing shader/runtime assertions**

Add assertions that the fragment source contains `uProjectionRadiusMeters`, `groundCenterProgress`, `stablePanoramaU`, `stablePanoramaV`, `fract(`, and the original `texture2D(uEnvironmentMap, vec2(panoramaU, panoramaV))` call, while containing no `samplerCube` or `textureCube`. Add a contract assertion that the runtime settings object contains `projectionRadiusMeters: environmentSettings.radiusMeters`.

- [ ] **Step 2: Implement the fragment shader**

Add `projectionRadiusMeters: number` to `ProjectedHdriMaterialSettings`, set `uProjectionRadiusMeters` in `updateProjectedHdriMaterial`, and use the following shader calculations after the azimuth rotation:

```glsl
float safeProjectionRadius = max(uProjectionRadiusMeters, 0.001);
float normalizedGroundDistance = length(projectionToSurface.xz) / safeProjectionRadius;
float groundSurfaceProgress = 1.0 - step(
    uProjectionCenterHeight - 0.001,
    vWorldPosition.y
);
float groundCenterProgress = groundSurfaceProgress * (1.0 - smoothstep(
    0.08,
    0.28,
    normalizedGroundDistance
));

float rawPanoramaU = mix(
    1.0 - azimuthProgress,
    0.5,
    smoothstep(0.94, 0.999, abs(sourceDirection.y))
);
float rawPanoramaV = clamp(
    uPanoramaHorizonV - asin(clamp(sourceDirection.y, -1.0, 1.0)) / 3.14159265,
    0.0,
    1.0
);
float stableAzimuthProgress = smoothstep(0.0, 0.28, normalizedGroundDistance);
float stableUOffset = rawPanoramaU - 0.5;
stableUOffset = stableUOffset > 0.5
  ? stableUOffset - 1.0
  : (stableUOffset < -0.5 ? stableUOffset + 1.0 : stableUOffset);
float stablePanoramaU = fract(
    0.5 + stableUOffset * stableAzimuthProgress + 1.0
);
float stableGroundHeight = max(uProjectionCenterHeight, 0.001);
float stableGroundRadius = safeProjectionRadius * 0.28;
float stablePanoramaV = clamp(
    uPanoramaHorizonV
      + atan(stableGroundHeight, stableGroundRadius) / 3.14159265,
    0.0,
    0.96
);
float wrappedUDelta = stablePanoramaU - rawPanoramaU;
wrappedUDelta = wrappedUDelta > 0.5
  ? wrappedUDelta - 1.0
  : (wrappedUDelta < -0.5 ? wrappedUDelta + 1.0 : wrappedUDelta);
float panoramaU = fract(
    rawPanoramaU + wrappedUDelta * groundCenterProgress + 1.0
);
float panoramaV = mix(rawPanoramaV, stablePanoramaV, groundCenterProgress);
```

Decode the raw sample exactly as today. Inside the stable blend, sample the same source texture at the stable coordinates, use the same RGBE-or-gamma decoder, mix decoded linear colors before tone mapping, and leave the output alpha from the raw sample.

- [ ] **Step 3: Forward the existing radius**

Make the only `getProjectedHdriMaterialSettings` object in `blocking3dEnvironmentRuntime.ts` contain:

```ts
const getProjectedHdriMaterialSettings = (
  environmentSettings: Blocking3dEnvironmentSettings,
): ProjectedHdriMaterialSettings => ({
  projectionCenterHeight: environmentSettings.projectionCenterHeight,
  projectionRadiusMeters: environmentSettings.radiusMeters,
  panoramaHorizonV: environmentSettings.panoramaHorizonV,
  hdriAzimuthOffsetDegrees: lighting.hdriAzimuthOffsetDegrees,
});
```

Do not create another runtime or UI setting. The existing `applySettings` path must update the new uniform; mesh rebuild behavior remains unchanged.

- [ ] **Step 4: Run focused tests**

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/dramaBlocking3dStaticHdri.contract.test.js
```

Expected: PASS and no cubemap or reproject regression.

### Task 3: Document the durable rule

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the wiki**

Keep the existing rule against vertex panorama UVs and cubemap reproject. Add that the shared material handles the mathematical nadir singularity with a radius-scaled, ground-only stable sampling zone and a continuous blend; this is an internal projection guard, not persisted data or a visible dividing line.

- [ ] **Step 2: Update release notes and README**

Under the existing `2026-09-03` heading, add a concise user-facing bullet that the HDRI ground projection center no longer shows a vortex while sky/remote background and original source clarity remain. Do not expose shader terminology in end-user copy.

- [ ] **Step 3: Run documentation checks**

```powershell
git diff --check
pnpm check:docs-manifest
```

Expected: no whitespace errors and the docs manifest check passes.

### Task 4: Self-test in the isolated browser lane

**Files:**
- No additional source files.

- [ ] **Step 1: Start isolated services**

Read `server/.env` in `D:\\Github\\AI-Novel-Writing-Assistant-hdr-ground-projection-fix`; use its provisioned `PORT=3127` and `CLIENT_PORT=5258`. Start only this worktree's API and Vite processes, leaving main `3100`/`5174` untouched.

- [ ] **Step 2: Open and inspect the generic HDRI page**

Use the Codex in-app browser at `http://127.0.0.1:5258/settings/narrator-voice/hdri/exterior`. Confirm the page, `中央广场` asset, default 15 m / 10% / 50% controls, and rendered viewport.

- [ ] **Step 3: Verify the visual fix**

Move the viewport toward the cyan projection-center gizmo and capture a screenshot. Confirm no circular vortex, radial ground stretch or hard-edged stabilization disc. Change diameter and projection height sliders; confirm no black screen and the environment remains world-fixed.

- [ ] **Step 4: Check browser diagnostics**

Inspect console/dev logs and network failures after the interactions. Expected: no uncaught errors, shader compile failure, failed environment texture request, or API persistence request caused by the internal shader guard.

- [ ] **Step 5: Run code checks**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test
```

Expected: typecheck and the projection/static HDRI focus pass. The full client suite is also run as a baseline check; its existing unrelated failures must match the clean main checkout before this change is accepted.

### Task 5: Review, commit, integrate and clean up

- [ ] **Step 1: Review the exact diff**

```powershell
git status --short
git diff --stat
git diff --check
```

Confirm only projection code, focused tests, wiki, release notes, README and this plan changed; no database, generated media, main-lane or unrelated worktree files are present.

- [ ] **Step 2: Commit the completed unit**

```powershell
git add client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts client/tests/dramaBlocking3dStaticHdri.contract.test.js docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md docs/superpowers/plans/2026-09-03-hdri-ground-projection-stabilization.md
git commit -s -m "fix: stabilize hdri ground projection center"
```

- [ ] **Step 3: Integrate and push from clean main**

```powershell
pnpm workflow:integrate codex/hdr-ground-projection-fix --push --verify "pnpm --filter @ai-novel/client typecheck"
```

This must rerun the focused typecheck before creating the signed merge commit and pushing only `origin/main`.

- [ ] **Step 4: Verify refs and clean up**

```powershell
git status --short --branch
git rev-parse main
git rev-parse origin/main
git worktree list --porcelain
```

Confirm main and origin/main are equal, main is clean, this worktree is removed only after successful integration, and unrelated worktrees remain untouched.
