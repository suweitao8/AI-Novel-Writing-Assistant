# Drama Blocking 3D Static HDRI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将分镜摆位统一为「3D 草图」，以静态关键帧和半球 HDRI 环境替代二维编辑器、动态播放和后置背景平面。

**Architecture:** 前端删除二维编辑入口和私有编辑器，但保留服务端 `blockingSketchData`/PNG 兼容契约。PlayCanvas viewer 仍用动画资源查找姿势片段，只在确定的 sampleTime 取样并暂停；场景等距柱状图改挂到跟随相机的 `DomeGeometry` 半球内部。现有保存、确认、首帧参考链不变。

**Tech Stack:** React 19, TypeScript, PlayCanvas 2.21, Tailwind semantic tokens, Node test runner, Vite.

---

### Task 1: 锁定静态布局和入口契约

**Files:**
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `client/src/api/media/drama.ts`
- Modify: `server/tests/dramaShotBlockingSketchContracts.test.mjs`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Modify: `client/tests/shotVoiceBlockingSketchEntry.test.js`
- Create: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [ ] **Step 1: Write failing tests**

  Add assertions that normalized 3D actors always return `actionPlaying: false`; the list contains `3D 草图` and does not contain `2D 草图` or `ShotBlockingSketchDialog`; the viewer contract contains `DomeGeometry`, `setEnvironment`, static pose sampling, and no play/pause API.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

  Run from the client directory:

  ```powershell
  node --test tests/dramaBlocking3dPage.contract.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dStaticHdri.contract.test.js
  ```

  Expected: failure because the current entry still exposes `2D 草图`, layout normalization preserves `true`, and the viewer still uses a background plane and play/pause API.

- [ ] **Step 3: Implement the contract minimum**

  Keep the persisted field for backward compatibility, but normalize the value to `false` and document it as the legacy static-frame marker. Keep the existing API names and `layout3d` shape so historical PNG/reference consumers do not change.

- [ ] **Step 4: Run the focused tests again**

  ```powershell
  node --test tests/dramaBlocking3dPage.contract.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dStaticHdri.contract.test.js
  ```

  Expected: the contract tests for the server normalization pass after the UI/runtime tasks are complete; entry/viewer assertions remain red until their owning tasks land.

### Task 2: Remove the user-facing 2D editor

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Delete: `client/src/pages/drama/comicDrama/components/ShotBlockingSketchDialog.tsx`
- Delete: `client/src/pages/drama/comicDrama/components/shotBlockingSketchMath.ts`
- Delete: `client/tests/shotBlockingSketchDialog.contract.test.js`
- Delete: `client/tests/shotBlockingSketchMath.test.js`

- [ ] **Step 1: Remove the import, local dialog state, dialog JSX, and `2D 草图` button**

  Keep `parseBlockingSketch` only for the confirmed/draft status shown on the single entry. Navigate to `/blocking-3d` and use the labels `3D 草图` / `继续 3D 草图`.

- [ ] **Step 2: Run entry tests**

  ```powershell
  node --test tests/dramaBlocking3dPage.contract.test.js tests/shotVoiceBlockingSketchEntry.test.js
  ```

  Expected: PASS with one 3D entry and no 2D editor reference.

- [ ] **Step 3: Verify deletion has no remaining imports**

  ```powershell
  rg -n "ShotBlockingSketchDialog|shotBlockingSketchMath|2D 草图" src tests
  ```

  Expected: no matches. Server-side `blockingSketch` names are allowed because they are the compatibility/data contract.

### Task 3: Make the PlayCanvas viewer a static-frame HDRI stage

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts`
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [ ] **Step 1: Write the static/HDRI runtime assertions**

  Assert that the viewer loads a `DomeGeometry`, creates an environment entity with front-face culling, follows the camera, calls animation sampling with playback disabled, exports `actionPlaying: false`, and exposes no `setSelectedActionPlaying`/`getSelectedActionPlaying` methods.

- [ ] **Step 2: Implement static pose sampling**

  Change the pose application path to assign the resolved clip with looping disabled, set the resolved `sampleTime`, pause the layer, and set the animation component to `playing = false`. Remove the viewer's play/pause methods and actor action state; keep `actionPlaying: false` only in the serialized compatibility snapshot. Initialize and load every actor through the same static path.

- [ ] **Step 3: Replace the background plane with a dome environment**

  Replace `backgroundUrl`, `backgroundEntity`, and `setBackground` with `environmentUrl`, `environmentDome`, and `setEnvironment`. Load the existing 2:1 scene image as a texture, create `new pc.DomeGeometry({ latitudeBands: 40, longitudeBands: 64 })`, create a `pc.Mesh`/render entity, set the material to the texture-backed emissive map with `material.cull = pc.CULLFACE_FRONT` and `depthWrite = false`, and move the dome to the camera position on each update. Remove the `blocking3d-background` plane creation entirely.

- [ ] **Step 4: Simplify the page controls**

  Pass `environmentUrl` to the viewer, remove `Pause`/`Play` imports and action state, and rename the panel to `静态姿势`. Keep pose selection and all spatial/camera controls. Update status and help copy to `3D 草图` and static-frame wording.

- [ ] **Step 5: Run client focused tests and typecheck**

  ```powershell
  node --test tests/dramaBlocking3dPage.contract.test.js tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dStaticHdri.contract.test.js tests/dramaShotBlockingSketchApi.test.js
  pnpm typecheck
  ```

  Expected: all focused tests pass and the client typecheck exits 0.

### Task 4: Update durable workflow documentation and release surfaces

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the workflow rule**

  State that 3D 草图 is the only user entry, poses are static sampled frames, and the scene image is a dome/HDRI environment. Keep the compatibility rule for server-side old data and confirmed PNGs.

- [ ] **Step 2: Add one user-facing release entry**

  Add the current date block bullet to both release surfaces without implementation/meta wording.

- [ ] **Step 3: Run docs/source checks**

  ```powershell
  git diff --check
  rg -n "3D 草图|静态|DomeGeometry|HDRI" docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
  ```

### Task 5: Full verification and delivery

**Files:**
- Verify: all files above plus `server/src/services/drama/visual/DramaShotKeyframeService.ts` and `server/src/services/drama/production/DramaBatchOrchestrator.ts`

- [ ] **Step 1: Run relevant server tests**

  ```powershell
  pnpm --filter @ai-novel/server build
  node --test server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaShotBlockingSketchService.test.js server/tests/dramaShotBlockingSketchRoutes.test.js server/tests/dramaShotKeyframeBlockingSketch.test.js server/tests/dramaBatchBlockingSketch.test.js
  ```

- [ ] **Step 2: Run client build**

  ```powershell
  pnpm --filter @ai-novel/client build
  ```

- [ ] **Step 3: Perform browser acceptance**

  Open the current workbench, enter a shot's `3D 草图`, verify that the list has no 2D action, the scene image wraps around a dome instead of a flat rear plane, changing a pose leaves the model still, and save/confirm returns the shot to the list with its sketch state.

- [ ] **Step 4: Commit, integrate, push, and verify final SHA**

  Use a signed commit on `codex/drama-blocking-3d-static-hdri`, run the repository integration command from a clean main checkout with `--push`, and verify local `main` equals `origin/main`.
