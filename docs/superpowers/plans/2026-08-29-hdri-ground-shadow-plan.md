# HDRI Ground Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PlayCanvas scene/blocking HDRI ground receive shadows from placed proxy characters without changing the visible panorama projection or Remotion video pipeline.

**Architecture:** Keep the existing custom cubemap projection as the opaque backdrop. Add a second lower-dome mesh using PlayCanvas's built-in `StandardMaterial.shadowCatcher` in multiplicative blend mode, and enable the existing HDRI-derived directional light and actor shadow flags. Keep scene-marker helpers non-physical and update both meshes together when environment geometry changes.

**Tech Stack:** TypeScript, PlayCanvas 2.21, Vite client, Node test runner, repository contract tests.

---

### Task 1: Add the regression contract before production changes

**Files:**
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [ ] **Step 1: Add assertions for the missing shadow path**

Add one test that requires the HDRI key light and proxy actor to use `castShadows: true`, and one test that requires the environment runtime to create a ground-only shadow catcher with `createGroundDomeGeometry`, `shadowCatcher = true`, `pc.BLEND_MULTIPLICATIVE`, `receiveShadow = true`, and `castShadow = false`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/dramaBlocking3dStaticHdri.contract.test.js
```

Expected result: failure because the current source contains `castShadows: false`, does not create a ground shadow catcher, and does not update or destroy a second mesh.

### Task 2: Add reusable lower-dome and shadow-catcher primitives

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/index.ts`

- [ ] **Step 1: Expose the lower-dome geometry wrapper**

Import `createGroundDomeGeometryData` beside `createBackdropGeometryData` and add:

```ts
export function createGroundDomeGeometry(projectionCenterHeight: number, domeRadius: number): pc.Geometry {
  return createPlayCanvasGeometry(createGroundDomeGeometryData(projectionCenterHeight, domeRadius));
}
```

- [ ] **Step 2: Add the standard shadow-catcher material factory**

Add a factory that configures `shadowCatcher = true`, `blendType = pc.BLEND_MULTIPLICATIVE`, `useSkybox = false`, `depthWrite = false`, zero diffuse/specular, and calls `update()`. Export both helpers through the blocking3d facade.

- [ ] **Step 3: Keep the primitive testable by source contract**

Do not put shadow state in a generic utility. The core factory owns PlayCanvas material defaults, while the environment runtime owns lifecycle and mesh instances.

### Task 3: Enable the actual shadow producer and environment receiver

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentKeyLight.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts`

- [ ] **Step 1: Enable bounded directional shadows**

Set the HDRI key light to `castShadows: true` and configure its existing directional shadow settings with the current scene scale: PCF shadow type, finite shadow distance, 2048 resolution, and a small bias/normal offset. Keep `clearHdriKeyLight` disabling the light when the environment is cleared.

- [ ] **Step 2: Make proxy actors cast shadows**

Change the actor asset instantiation to `resource.instantiateRenderEntity?.({ castShadows: true })`. Do not enable shadows for transparent scene-marker helper boxes.

- [ ] **Step 3: Create a ground-only shadow catcher with the HDRI**

Track `environmentShadowCatcher`, its mesh instance, and its material in the environment runtime. During `load`, construct the lower-dome geometry, apply the shadow-catcher material, set `meshInstance.receiveShadow = true` and `meshInstance.castShadow = false`, and add it on the world layer at the same position and scale as the visible backdrop.

- [ ] **Step 4: Update lifecycle and rebuild behavior**

Destroy the catcher entity, mesh, and material in `clearEnvironmentVisuals`; update its scale in `applySettings`; and replace/destroy its old geometry in `rebuildEnvironmentBackdropMesh`. Preserve the existing request-id race handling and error cleanup.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/dramaBlocking3dStaticHdri.contract.test.js
```

Expected result: all HDRI contracts pass, including the new shadow path.

### Task 4: Document the durable rendering rule

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: Document the boundary**

State that the HDRI image is the visible environment, while placed 3D subjects cast onto a lower-dome shadow catcher; editing markers remain non-physical helpers.

- [ ] **Step 2: Record the user-visible behavior**

Update the current date release entry and README latest update with the visible ground-shadow improvement, without exposing internal file names or implementation details in user-facing copy.

### Task 5: Self-test and delivery

**Files:**
- No additional source files.

- [ ] **Step 1: Run focused client verification**

Run the HDRI contract tests, PlayCanvas environment unit tests, client typecheck, and client build. Inspect `git diff --check` and review the diff against the requirement that shadows land only on the ground portion.

- [ ] **Step 2: Attempt browser verification without touching another task**

Use the existing local browser tab if its frontend process serves this worktree. If the fixed `5174` service belongs to another active worktree or has unrelated runtime errors, do not stop it or change ports; record browser verification as blocked by that external process and rely on the focused source/build evidence.

- [ ] **Step 3: Commit the coherent change**

Use a signed commit:

```powershell
git add client/src/pages/drama/comicDrama/components/blocking3d client/tests/dramaBlocking3dStaticHdri.contract.test.js docs/wiki/workflows/drama-blocking-3d.md README.md docs/releases/release-notes.md
git commit -s -m "fix: render hdr ground shadows in blocking scenes"
```

- [ ] **Step 4: Integrate and push from the clean main checkout**

Run the repository integration workflow with the focused client verification, then confirm `HEAD == origin/main`, the main worktree is clean, and this feature worktree is removed only after it is merged.
