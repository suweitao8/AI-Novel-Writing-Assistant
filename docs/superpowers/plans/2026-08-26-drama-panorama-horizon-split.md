# 漫剧场景全景地面分界 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让场景全景图严格按上下区域生成，并允许用户在场景 3D 编辑器中调整图片到 3D 地面的纵向分界，且分镜 3D 草图复用同一参数。

**Architecture:** 在共享场景环境合同中增加 `panoramaHorizonV`，服务端缺省值为 `0.5`、限制为 `0.40–0.65`，客户端投影 shader 和 CPU 投影统一用该值替换写死的 `0.5`。场景全景生成提示词通过共享视觉约束常量同时注入状态图和旧版场景全景入口；场景编辑器只保存场景资产环境参数，分镜布局继续读取该参数而不建立第二份设置。

**Tech Stack:** TypeScript、React、PlayCanvas GLSL shader、Node `node:test`、Prisma JSON 环境快照、pnpm workspace。

---

### Task 1: 扩展场景环境合同并保持旧数据兼容

**Files:**
- Modify: `shared/types/comicDrama.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts`
- Modify: `server/src/modules/novel/story-settings/http/storySettingsRoutes.ts`
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `client/src/api/media/drama.ts`
- Test: `server/tests/storyScene3dEnvironment.test.mjs`
- Test: `server/tests/dramaShotBlockingSketchContracts.test.mjs`

- [ ] **Step 1: Write failing contract assertions**

  Add assertions that the normalized scene environment contains `panoramaHorizonV: 0.5`, clamps `0.39` to `0.4` and `0.66` to `0.65`, serializes the value, and that a legacy 3D blocking layout without the field normalizes to `0.5`.

- [ ] **Step 2: Run the focused contract tests and confirm the new assertions fail**

  Run:

  ```powershell
  pnpm --filter @ai-novel/shared build
  pnpm --filter @ai-novel/server build
  pnpm --filter @ai-novel/server exec node --test tests/storyScene3dEnvironment.test.mjs tests/dramaShotBlockingSketchContracts.test.mjs
  ```

  Expected: failure because the current environment type and normalizers do not expose `panoramaHorizonV`.

- [ ] **Step 3: Add the field to every contract boundary**

  Use the same property and bounds everywhere:

  ```ts
  panoramaHorizonV: { min: 0.4, max: 0.65 },
  ```

  Add `panoramaHorizonV: number` to `StoryScene3DEnvironment` and `DramaShotBlockingSketch3DEnvironment`; include it in `StoryScene3DEnvironmentInput`; add it to both scene create/update zod schemas; normalize missing values to `0.5` and clamp supplied values; force legacy `yawDeg` and `intensity` behavior to remain unchanged. Update the client API environment type with the same property.

- [ ] **Step 4: Re-run the contract tests**

  Run the command from Step 2. Expected: all tests in both files pass, including legacy snapshots and the new default/clamp/serialization assertions.

- [ ] **Step 5: Commit the contract unit**

  ```powershell
  git add shared/types/comicDrama.ts server/src/modules/novel/story-settings/application/StoryScene3dEnvironment.ts server/src/modules/novel/story-settings/http/storySettingsRoutes.ts server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts client/src/api/media/drama.ts server/tests/storyScene3dEnvironment.test.mjs server/tests/dramaShotBlockingSketchContracts.test.mjs
  git commit -s -m "feat: add panorama horizon environment setting"
  ```

### Task 2: Strengthen both scene panorama generation prompts

**Files:**
- Modify: `server/src/services/drama/visual/dramaVisualStyles.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts`
- Test: `server/tests/storyAssetStateImage.test.js`
- Test: `server/tests/storyAssetImage.test.js`

- [ ] **Step 1: Add failing prompt assertions**

  Extend the scene prompt tests to require all of the following phrases or equivalent stable constants: an exact two-zone layout, fixed boundary at `v=0.5`, complete objects above the line with a clean safety margin, lower half containing only continuous ground/floor/terrain, and explicit prohibitions against furniture legs or objects crossing into the lower half.

- [ ] **Step 2: Run the prompt tests and confirm failure**

  Run:

  ```powershell
  pnpm --filter @ai-novel/shared build
  pnpm --filter @ai-novel/server build
  pnpm --filter @ai-novel/server exec node --test tests/storyAssetStateImage.test.js tests/storyAssetImage.test.js
  ```

  Expected: failure for the new safety-margin and lower-half negative constraints.

- [ ] **Step 3: Create one shared scene panorama contract**

  Export from `dramaVisualStyles.ts`:

  ```ts
  export const SCENE_PANORAMA_LAYOUT_PROMPT_LINES = [
    "strict two-zone equirectangular layout split by the exact vertical center line v=0.5",
    "upper zone v=0.0-0.48 contains the sky or ceiling, walls, distant background and complete fixed environment objects",
    "every bed, table, chair, sofa, cabinet, tree, building, rock and other tall object must be fully above v=0.48 with a clean safety margin",
    "lower zone v=0.52-1.0 contains only one continuous clean ground, floor or terrain surface with sparse low-lying natural detail",
    "the narrow center band v=0.48-0.52 remains an uncluttered horizon transition; no object, furniture leg or object fragment crosses it",
  ] as const;

  export const SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT =
    "furniture or objects in the lower half, furniture legs crossing the horizon, objects crossing the center line, split furniture, stretched props on the ground, cluttered floor, repeated ground objects";
  ```

  Replace duplicated state-image lines with the shared positive lines. Append the shared lines to `buildScenePanoramaPrompt` for the legacy scene endpoint. Add the shared negative contract to the scene branch of both negative prompts without changing character or prop prompts.

- [ ] **Step 4: Re-run the prompt tests**

  Run the command from Step 2. Expected: all prompt tests pass and both generation paths contain the same strict split contract.

- [ ] **Step 5: Commit the prompt unit**

  ```powershell
  git add server/src/services/drama/visual/dramaVisualStyles.ts server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/src/modules/novel/story-settings/application/StoryAssetImageService.ts server/tests/storyAssetStateImage.test.js server/tests/storyAssetImage.test.js
  git commit -s -m "feat: constrain scene panorama ground zone"
  ```

### Task 3: Make equirectangular projection use the saved split

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Test: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs` (create if absent)

- [ ] **Step 1: Add failing projection math tests**

  Add tests that `projectEquirectangularDirection([1, 0, 0], 0.5).v === 0.5`, `projectEquirectangularDirection([1, 0, 0], 0.58).v === 0.58`, the top direction clamps to `0`, the bottom direction clamps to `1`, and the default argument preserves the old result.

- [ ] **Step 2: Run the projection tests and confirm failure**

  ```powershell
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs
  ```

  Expected: failure because the projection function currently has no split argument.

- [ ] **Step 3: Implement the shared projection parameter**

  Add `panoramaHorizonV` to `ProjectedHdriMaterialSettings`, pass it as `uPanoramaHorizonV`, and use this GLSL/CPU formula:

  ```glsl
  float v = clamp(uPanoramaHorizonV - asin(clamp(projectionDirection.y, -1.0, 1.0)) / PI, 0.0, 1.0);
  ```

  Add the default and clamp in `normalizeEnvironmentSettings`; keep HDRI atlas generation, lighting, mesh geometry, horizontal `u`, and existing old-layout behavior unchanged.

- [ ] **Step 4: Run projection and static contract tests**

  ```powershell
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs tests/dramaBlocking3dStaticHdri.contract.test.js
  ```

  Expected: all tests pass, including a contract assertion that `uPanoramaHorizonV` is updated when settings change.

- [ ] **Step 5: Commit the projection unit**

  ```powershell
  git add client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.ts client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts client/tests/dramaBlocking3dStaticHdri.contract.test.js client/src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs
  git commit -s -m "feat: support adjustable panorama horizon projection"
  ```

### Task 4: Add the scene editor control and reuse it in storyboard 3D

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/tests/storyScene3dEditorContracts.test.js`
- Modify: `client/tests/storyScene3dStateContracts.test.js`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`

- [ ] **Step 1: Add failing UI and persistence assertions**

  Require the scene editor source to render an accessible control with `aria-label="全景地面分界"`, range `40–65`, step `1`, and percent output; require its save snapshot to include `panoramaHorizonV`. Require the storyboard source to continue taking `context.scene.environment` unchanged.

- [ ] **Step 2: Run the client contract tests and confirm failure**

  ```powershell
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyScene3dEditorContracts.test.js tests/storyScene3dStateContracts.test.js tests/dramaBlocking3dStaticHdri.contract.test.js
  ```

  Expected: failure because the scene editor only exposes height and diameter.

- [ ] **Step 3: Implement the control and save path**

  Add `panoramaHorizonV` to the page's initial state, use it in the `snapshot` passed to `updateStorySettingsScene`, and extend `updateEnvironmentSetting`'s key union. Render a range input beside the existing HDRI controls:

  ```tsx
  <input aria-label="全景地面分界" min="40" max="65" step="1" value={Math.round(environmentSettings.panoramaHorizonV * 100)} onChange={(event) => updateEnvironmentSetting("panoramaHorizonV", Number(event.target.value) / 100)} />
  ```

  Display the current value as a percentage. The viewer receives the setting immediately for preview; existing exit-save behavior remains unchanged.

- [ ] **Step 4: Run client typecheck and focused contracts**

  ```powershell
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyScene3dEditorContracts.test.js tests/storyScene3dStateContracts.test.js tests/dramaBlocking3dStaticHdri.contract.test.js
  pnpm --filter @ai-novel/client typecheck
  ```

  Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the UI unit**

  ```powershell
  git add client/src/pages/drama/comicDrama/DramaScene3DPage.tsx client/tests/storyScene3dEditorContracts.test.js client/tests/storyScene3dStateContracts.test.js client/tests/dramaBlocking3dStaticHdri.contract.test.js
  git commit -s -m "feat: expose panorama ground split control"
  ```

### Task 5: Document the durable workflow and user-visible behavior

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: Update the workflow rule**

  Document that scene panorama generation uses a strict two-zone contract, `panoramaHorizonV` defaults to 50%, and the scene editor value is shared by storyboard 3D. State that the parameter changes texture sampling only and does not alter scale or HDRI lighting.

- [ ] **Step 2: Update user-facing release surfaces**

  Add one concise 2026-08-26 bullet to the release notes and the README latest-update block describing the adjustable panorama ground boundary and stricter scene panorama composition.

- [ ] **Step 3: Run documentation diff checks and commit**

  ```powershell
  git diff --check
  git add docs/wiki/workflows/drama-blocking-3d.md README.md docs/releases/release-notes.md
  git commit -s -m "docs: document panorama ground split"
  ```

### Task 6: Full focused verification and browser acceptance

**Files:**
- Verify the committed files and the live page; do not add new production scope.

- [ ] **Step 1: Run the complete focused test set**

  ```powershell
  pnpm --filter @ai-novel/shared build
  pnpm --filter @ai-novel/server build
  pnpm --filter @ai-novel/server exec node --test tests/storyScene3dEnvironment.test.mjs tests/dramaShotBlockingSketchContracts.test.mjs tests/storyAssetStateImage.test.js tests/storyAssetImage.test.js
  pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/storyScene3dEditorContracts.test.js tests/storyScene3dStateContracts.test.js tests/dramaBlocking3dStaticHdri.contract.test.js src/pages/drama/comicDrama/components/blocking3d/blocking3dEnvironmentProjection.test.mjs
  pnpm --filter @ai-novel/client typecheck
  git diff --check
  ```

  Expected: all commands exit 0, with no focused test failures.

- [ ] **Step 2: Verify the live scene editor in the built-in browser**

  Open the existing scene 3D route, confirm the control initially shows 50%, drag it to a non-default value such as 58%, confirm the canvas updates immediately, leave and re-enter, and confirm 58% persists. Then open the storyboard 3D route for the same scene and confirm the same environment boundary is used. Inspect browser logs for errors and restore the non-destructive preview to the saved value before leaving.

- [ ] **Step 3: Commit any final verification-only corrections**

  If browser verification finds a real defect, add a focused failing test and fix it before continuing; do not bypass a failing check or claim visual completion from static tests alone.

- [ ] **Step 4: Integrate and close the delivery loop**

  From the clean `main` workspace, run:

  ```powershell
  pnpm workflow:integrate codex/drama-panorama-horizon-split --push
  pnpm workflow:cleanup codex/drama-panorama-horizon-split
  git worktree prune
  ```

  Verify `git rev-parse HEAD` equals `git rev-parse origin/main`, the feature branch/worktree no longer exists, and restore any unrelated concurrent file that was temporarily preserved without staging it.
