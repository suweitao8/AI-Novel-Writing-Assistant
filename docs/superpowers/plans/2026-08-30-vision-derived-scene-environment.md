# Vision-Derived Scene Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the low-value scene-type UI and make scene 3D environment defaults come from a cached vision analysis of the panorama, with bounded 15 m / 2 m fallback values and manual override protection.

**Architecture:** Keep legacy `sceneType` data readable but stop using it as the 3D default selector or showing it in the scene asset UI. Add a registered structured vision prompt and a story-settings application service that analyzes a state image, normalizes the result, persists image-fingerprint metadata, and exposes one idempotent API. The 3D page lazily requests analysis when the scene image is available; the existing sliders remain the manual override path.

**Tech Stack:** React 19, Vite, Express 5, Prisma/SQLite, LangChain structured PromptAsset, Zod, Sharp, PlayCanvas, Node test runner, Playwright/in-app browser.

---

### Task 1: Add the environment-analysis contract and failing tests

**Files:**
- Modify: `shared/types/comicDrama.ts`
- Modify: `shared/utils/scene3dEnvironment.ts`
- Test: `server/tests/storyScene3dEnvironment.test.mjs`
- Create: `server/tests/storyScene3dEnvironmentAnalysis.test.mjs`

- [ ] **Step 1: Write failing contract tests**

Add tests that assert:

```js
test("uses 15m diameter and 2m projection center as the type-independent fallback", () => {
  const environment = getDefaultStoryScene3dEnvironment();
  assert.equal(environment.domeRadius, 15);
  assert.equal(environment.projectionCenterHeight, 2);
  assert.equal(environment.projectionCenterHeightRatio, 2 / 15);
  assert.equal(environment.panoramaHorizonV, 0.5);
});

test("normalizes a vision estimate and keeps its image fingerprint", () => {
  const result = normalizeVisionStoryScene3dEnvironment({
    domeDiameterMeters: 18.4,
    projectionCenterHeightMeters: 2.2,
    panoramaHorizonV: 0.51,
    confidence: 0.9,
    evidence: "地面延展到画面下半区，门高提供尺度参照。",
    sourceImageArtifactId: "artifact-1",
    sourceImageGeneratedAt: "2026-08-30T00:00:00.000Z",
  });
  assert.equal(result.environment.domeRadius, 18.4);
  assert.equal(result.environment.projectionCenterHeight, 2.2);
  assert.equal(result.analysis.confidence, 0.9);
  assert.equal(result.analysis.sourceImageArtifactId, "artifact-1");
});

test("falls back when the vision result has no trustworthy scale", () => {
  const result = normalizeVisionStoryScene3dEnvironment({ confidence: 0.2 });
  assert.equal(result.environment.domeRadius, 15);
  assert.equal(result.environment.projectionCenterHeight, 2);
  assert.equal(result.analysis.fallbackUsed, true);
});
```

- [ ] **Step 2: Run the focused tests and verify the expected RED failure**

Run:

```powershell
pnpm --filter @ai-novel/server exec node --test tests/storyScene3dEnvironment.test.mjs tests/storyScene3dEnvironmentAnalysis.test.mjs
```

Expected: the new exports are missing or the old type-dependent values fail, proving the tests exercise the requested behavior.

- [ ] **Step 3: Implement the shared contract minimally**

Add `StoryScene3dEnvironmentAnalysis` metadata to the shared environment type and implement:

- type-independent fallback constants (`domeRadius=15`, `projectionCenterHeight=2`, `ratio=2/15`, `panoramaHorizonV=0.5`);
- `normalizeVisionStoryScene3dEnvironment` with numeric bounds, confidence threshold, and fallback metadata;
- serialization/parsing of `analysis` and `customized` without dropping unknown legacy fields;
- `resolveStoryScene3dEnvironment` behavior that preserves custom environments but uses the type-independent fallback for uncustomized legacy rows.

Do not remove the legacy `sceneType` type from storage or unrelated extraction contracts in this task.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same command. Expected: all environment contract tests pass with 0 failures.

### Task 2: Add a registered vision prompt and application service

**Files:**
- Create: `server/src/prompting/prompts/drama/sceneState3dEnvironment.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Create: `server/src/modules/novel/story-settings/application/StoryScene3dVisionImage.ts`
- Create: `server/src/modules/novel/story-settings/application/StoryScene3dEnvironmentAnalysisService.ts`
- Test: `server/tests/storyScene3dEnvironmentAnalysis.test.mjs`

- [ ] **Step 1: Add failing prompt/service tests**

Test that the PromptAsset render contains an `image_url`, asks the model to identify the 50% horizon/ground boundary and scale evidence, and that `buildVisionEnvironmentAnalysis` rejects stale image fingerprints before writing. Use the existing prompt-runner test injection pattern and a real structured output fixture; do not mock the production normalizer.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
pnpm --filter @ai-novel/server exec node --test tests/storyScene3dEnvironmentAnalysis.test.mjs
```

Expected: imports for the new PromptAsset/service fail because the files do not yet exist.

- [ ] **Step 3: Implement the registered PromptAsset**

Create `drama.scene.state.3d_environment` with a Zod output schema containing bounded `panoramaHorizonV`, `domeDiameterMeters`, `projectionCenterHeightMeters`, `confidence`, and optional `evidence`. The prompt must explicitly say:

- input is a 2:1 equirectangular scene panorama;
- v=0.5 is the initial reference line, but return the visually observed projection horizon;
- estimate diameter only from visible scale cues and floor/ground extent;
- do not invent precision when no scale cue is visible;
- return JSON only.

Register the asset in `promptAssetLoaderEntries.ts` with an explicit version and structured schema.

- [ ] **Step 4: Implement image preparation and analysis service**

Reuse the existing story-state image resolution and Sharp compression pattern in an owned `StoryScene3dVisionImage.ts` module. The service must:

- load the requested scene/state row and image;
- require PNG/JPEG/WebP and cap raw input at 8 MB;
- use `getVisionModelProvider()` and reject text-only providers;
- call `runStructuredPrompt` with the registered prompt and image;
- normalize the result with the shared contract;
- perform a CAS write that checks scene/state image fingerprint before updating `scene3dEnvironmentJson`;
- return the projected scene.

- [ ] **Step 5: Run GREEN tests and server typecheck**

Run:

```powershell
pnpm --filter @ai-novel/server exec node --test tests/storyScene3dEnvironmentAnalysis.test.mjs
pnpm --filter @ai-novel/server typecheck
```

Expected: focused tests pass and typecheck exits 0.

### Task 3: Expose an idempotent API and remove type-driven defaults

**Files:**
- Modify: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StorySettingsProjection.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts`
- Test: `server/tests/storyScene3dPropagationContract.test.js`

- [ ] **Step 1: Write the route and projection contract tests first**

Add assertions that an uncustomized scene with a legacy `sceneType` still projects the 15/2 fallback, while a custom environment remains unchanged. Add a route-level test fixture for:

```text
POST /api/novels/:id/settings/scenes/:sceneId/states/:stateId/3d-environment/analyze
```

The response must be the normal `StorySettingsScene` projection, including the updated environment and analysis metadata.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm --filter @ai-novel/server exec node --test tests/storyScene3dPropagationContract.test.js
```

Expected: the new route or projection contract is missing.

- [ ] **Step 3: Implement the route and projection**

Register the strict body schema (`provider`, `model`, `temperature`), call the analysis service, and return a localized success message. Update service/projection reads so the type-independent environment resolver is used consistently. Do not remove legacy fields from database selects or extraction payloads.

- [ ] **Step 4: Run the focused server contract tests**

Run:

```powershell
pnpm --filter @ai-novel/server exec node --test tests/storyScene3dPropagationContract.test.js tests/storyScene3dEnvironment.test.mjs tests/storyScene3dEnvironmentAnalysis.test.mjs
```

Expected: all listed tests pass with 0 failures.

### Task 4: Simplify scene UI and trigger analysis from the 3D editor

**Files:**
- Modify: `client/src/pages/novels/components/storySettings/assetForms.tsx`
- Modify: `client/src/components/storyAssets/storyAssetPresentation.ts`
- Modify: `client/src/api/story/storySettings.ts`
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Test: `client/tests/storyAssetPresentation.test.mjs`
- Test: `client/tests/storyScene3dEnvironmentAnalysis.test.mjs`

- [ ] **Step 1: Write failing UI/trigger tests**

Add presentation assertions that a scene with a legacy `sceneType` only shows time/weather badges and no scene-type label. Add a pure trigger-state test that an unchanged image fingerprint is analyzed once, a changed fingerprint is analyzed again, and an already customized environment is not auto-overwritten.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/storyAssetPresentation.test.mjs tests/storyScene3dEnvironmentAnalysis.test.mjs
```

Expected: the legacy type badge remains or the trigger helper is missing.

- [ ] **Step 3: Remove only the user-facing scene type controls**

Remove the scene-type selector from `assetForms.tsx`, remove `sceneTypeLabel` and the scene-type badge from scene presentation, and leave time/weather controls intact. Keep the legacy type values in save payloads only where existing compatibility code requires them; no database deletion is allowed.

- [ ] **Step 4: Add the API client and lazy 3D-page trigger**

Add `analyzeStoryScene3dEnvironment` beside the existing marker API. In `DramaScene3DPage.tsx`, trigger it only when a selected state has a readable image and the projected environment has no current matching analysis. Guard with a ref/fingerprint, keep the viewer usable during analysis, update the query cache on success, and surface failures with the existing `toast.error` path without replacing a usable environment. The existing manual sliders remain disabled only by their current save/loading states.

- [ ] **Step 5: Run the client tests and typecheck**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/storyAssetPresentation.test.mjs tests/storyScene3dEnvironmentAnalysis.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Expected: all focused tests pass and typecheck exits 0.

### Task 5: Update durable documentation and perform browser self-test

**Files:**
- Create or modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the workflow wiki**

Document that scene type is compatibility-only for this path, the panorama-driven analysis contract, image fingerprint cache, fallback values, manual override semantics, and the fact that absolute scale is an AI estimate rather than a measurement.

- [ ] **Step 2: Run the browser smoke self-test against the isolated client/API**

Use a dedicated browser tab or isolated browser instance against `http://127.0.0.1:5174` and `http://127.0.0.1:3100`:

1. Open the novel scene asset page.
2. Confirm scene cards no longer show a type badge.
3. Open a scene 3D editor with an existing state image.
4. Confirm the analysis request runs at most once for the current image and the environment controls remain usable.
5. Change the diameter slider and save; confirm the manual value persists after reload.
6. Check console and network logs for no critical errors or failed API calls.

Capture a screenshot of the simplified scene card and the 3D environment panel as evidence.

- [ ] **Step 3: Run the full focused verification set**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server exec node --test tests/storyScene3dEnvironment.test.mjs tests/storyScene3dEnvironmentAnalysis.test.mjs tests/storyScene3dPropagationContract.test.js
pnpm --filter @ai-novel/client exec node --test tests/storyAssetPresentation.test.mjs tests/storyScene3dEnvironmentAnalysis.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Expected: every listed test passes; any unrelated stale baseline test must be reported separately rather than treated as evidence for this feature.

- [ ] **Step 4: Commit the coherent implementation**

Before committing, run the release-note workflow, inspect `git diff` and `git status`, stage only this feature and its documentation, then run:

```powershell
git add shared/types/comicDrama.ts shared/utils/scene3dEnvironment.ts server/src/prompting server/src/modules/novel/story-settings client/src/pages/novels/components/storySettings/assetForms.tsx client/src/components/storyAssets/storyAssetPresentation.ts client/src/api/story/storySettings.ts client/src/pages/drama/comicDrama/DramaScene3DPage.tsx server/tests client/tests docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
git commit -s -m "feat: derive scene 3d defaults from panorama vision"
```

- [ ] **Step 5: Integrate, push, and clean up**

From the clean main checkout run the repository integration command with the focused verification command, explicitly push `origin/main`, confirm local and remote SHAs match, then remove only the completed `codex/auto-scene-environment` worktree and branch. Preserve all other active worktrees.
