# Model Lighting Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Balance model-preview HDRI fill and ground shadow darkness so models retain readable form while projected shadows remain soft and grounded.

**Architecture:** Extend the existing shared blocking3d lighting profile with a model-only environment-atlas intensity. Apply that intensity at the scene boundary while preserving the visible HDRI backdrop and HDRI-derived key-light direction. Lower only the model profile’s shadow intensity so the existing multiplicative catcher produces a readable gray shadow; default profile consumers remain unchanged.

**Tech Stack:** TypeScript, PlayCanvas 2.21, Node `node:test`, Vite client, Codex in-app browser.

---

### Task 1: Add failing profile and runtime contract tests

**Files:**
- Create: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.test.mjs`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.test.mjs`

- [ ] **Step 1: Write the failing profile test**

Create a Node test that imports the real profile resolver and asserts the approved values:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BLOCKING_3D_LIGHTING_PROFILE,
  MODEL_PREVIEW_LIGHTING_PROFILE,
  resolveBlocking3dLightingProfile,
} from "./blocking3dEnvironmentLightingProfile.ts";

test("model preview profile separates HDRI fill from the visible backdrop", () => {
  const defaultProfile = resolveBlocking3dLightingProfile(DEFAULT_BLOCKING_3D_LIGHTING_PROFILE);
  const modelProfile = resolveBlocking3dLightingProfile(MODEL_PREVIEW_LIGHTING_PROFILE);

  assert.equal(defaultProfile.skyboxIntensity, 1);
  assert.equal(modelProfile.skyboxIntensity, 0.25);
  assert.equal(modelProfile.shadowIntensity, 0.3);
  assert.ok(Number.isFinite(modelProfile.skyboxIntensity));
  assert.ok(modelProfile.skyboxIntensity >= 0);
});
```

- [ ] **Step 2: Extend the runtime contract test with ownership checks**

Read `blocking3dEnvironmentRuntime.ts` as the existing test does and assert that the runtime contains all three contract points: it captures `app.scene.skyboxIntensity` before loading, applies `lighting.skyboxIntensity` after installing the environment atlas, and restores the captured value only inside the current-environment ownership branch. Keep the existing shadow-catcher assertions unchanged.

Use assertions equivalent to:

```js
assert.match(runtimeSource, /const initialSceneSkyboxIntensity\s*=\s*app\.scene\.skyboxIntensity/);
assert.match(runtimeSource, /app\.scene\.skyboxIntensity\s*=\s*lighting\.skyboxIntensity/);
assert.match(runtimeSource, /if \(ownsEnvironmentLighting\) app\.scene\.skyboxIntensity\s*=\s*initialSceneSkyboxIntensity/);
```

- [ ] **Step 3: Run the new tests and verify they fail for the intended reason**

Run:

```powershell
node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.test.mjs
```

Expected: failure because `skyboxIntensity` is not yet part of the profile and the runtime capture/apply/restore lines do not yet exist. Do not modify production code until this red result is observed.

### Task 2: Implement model-only HDRI fill and shadow balance

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.ts:11-42`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts:60-158`

- [ ] **Step 1: Add the profile field and approved constants**

Add `skyboxIntensity: number` to `Blocking3dLightingProfileConfig`. Set the default profile to `1` and the model profile to `0.25`. Change only the model profile’s `shadowIntensity` from `0.62` to `0.3`; retain its PCF5, shadow distance, bias, normal offset, and ambient fill values.

- [ ] **Step 2: Capture and restore the scene-level environment strength**

At the start of `createBlocking3dEnvironmentRuntime`, capture:

```ts
const initialSceneSkyboxIntensity = app.scene.skyboxIntensity;
```

In `clearEnvironmentLighting`, compute the existing `ownsEnvironmentLighting` boolean before destroying or nulling the current atlas. When it is true, restore both the existing fallback ambient color and `initialSceneSkyboxIntensity`. Do not restore either scene-level value when the runtime no longer owns `app.scene.envAtlas`, because a newer runtime may already be active.

- [ ] **Step 3: Apply the selected profile after installing the environment atlas**

Immediately after `app.scene.envAtlas = environmentAtlas`, assign:

```ts
app.scene.skyboxIntensity = lighting.skyboxIntensity;
```

Keep `applyHdriKeyLight(...)`, visible cubemap generation, projection geometry, and shadow-catcher construction in their current order. This makes `skyboxIntensity` affect only StandardMaterial environment processing; the custom projected HDRI backdrop remains visually unchanged.

- [ ] **Step 4: Run the focused tests and confirm green**

Run:

```powershell
node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLighting.test.mjs
```

Expected: all profile/runtime contract tests and all existing HDRI direction tests pass with zero failures.

### Task 3: Update durable and user-facing documentation

**Files:**
- Modify: `docs/wiki/architecture/scene-preview-environment.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Document the profile boundary in the architecture wiki**

Add a stable rule under the current lighting/environment section: the visible HDRI projection remains at full visual strength, model previews use `scene.skyboxIntensity = 0.25` and shadow intensity `0.30`, and default profile consumers retain their existing values. Explain that this separation is required because the visible backdrop and StandardMaterial environment contribution are different render paths.

- [ ] **Step 2: Record the user-visible result**

Add one concise entry to the current date block in `docs/releases/release-notes.md` and the newest `README.md` update: model 3D previews now show clearer model form with softer, less black ground shadows while preserving the HDRI background and light direction. Do not mention file names, internal constants, or migration details in user-facing copy.

- [ ] **Step 3: Review documentation for project copy rules**

Confirm the new text describes the user-visible result and stable reason, contains no change-history narration in UI-facing copy, and does not introduce placeholders.

### Task 4: Typecheck and browser visual regression

**Files:**
- No additional source files; verify the changed modules and documentation.

- [ ] **Step 1: Run source checks**

Run:

```powershell
git diff --check
pnpm --filter @ai-novel/client typecheck
```

Expected: both commands exit with code 0.

- [ ] **Step 2: Capture the post-change model preview**

Using the Codex in-app browser, open `http://127.0.0.1:5174/models/bed-12a`, wait at least 5 seconds for the GLB, textures, HDRI atlas and visible dome to settle, and capture a screenshot. Compare it with the approved baseline screenshot from the same page and view.

- [ ] **Step 3: Check the visual acceptance points**

Confirm all of the following from the screenshot and DOM:

1. The page contains the `双人床 A 3D 视口` canvas and no viewer error.
2. The HDRI background brightness and sun position remain unchanged.
3. The bed’s lit and unlit faces have readable form instead of uniform HDRI fill.
4. The ground shadow still points opposite the detected HDRI key light, but is gray/soft rather than a black multiplicative wedge.
5. `smokeTab.dev.logs({ levels: ["error", "warn"] })` returns no new warning or error entries.

- [ ] **Step 4: Verify the model list surface**

Navigate once to `http://127.0.0.1:5174/models`, confirm the model list renders, then return to the detail page if needed. Do not click save, generate, upload, or any control that writes business data.

### Task 5: Self-accept, commit, integrate, and audit

**Files:**
- Commit all source, test and documentation files from Tasks 1–3 only.

- [ ] **Step 1: Review the diff against the design**

Confirm that the diff changes only the model-preview environment fill/shadow balance, the scene-level strength ownership cleanup, focused tests, and the required docs. Confirm no direction estimator, projection geometry, scene profile, or database code changed.

- [ ] **Step 2: Commit the isolated worktree**

Run:

```powershell
git status --short
git diff --check
git add client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.ts client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.ts client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentLightingProfile.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentRuntime.test.mjs docs/wiki/architecture/scene-preview-environment.md docs/releases/release-notes.md README.md
git commit -s -m "fix: balance model preview lighting"
```

Expected: a signed commit with only the intended files and a clean feature worktree.

- [ ] **Step 3: Integrate and push from clean main**

From `D:\Github\AI-Novel-Writing-Assistant`, run:

```powershell
pnpm check:workspace-integrity
pnpm workflow:integrate codex/model-lighting-balance --push --verify "pnpm --filter @ai-novel/client typecheck"
```

Expected: a non-fast-forward merge into `main`, the focused verification reruns successfully, and `origin/main` is updated.

- [ ] **Step 4: Clean only this completed worktree and run final audit**

Run from the clean main checkout:

```powershell
pnpm workflow:cleanup codex/model-lighting-balance
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
pnpm workflow:audit
```

Expected: `main` is clean, the two SHA values match, this worktree/branch is gone, other worktrees remain untouched, and the lifecycle audit reports no unresolved issues.
