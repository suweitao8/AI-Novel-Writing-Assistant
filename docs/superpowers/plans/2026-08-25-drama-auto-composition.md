# Drama 3D Automatic Composition and Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drama 3D blocking self-saving and self-confirming, automatically compose new shots with a registered structured AI planner, and render the planned camera depth of field in the PlayCanvas preview.

**Architecture:** Keep `DramaShotBlockingSketchService` as the boundary that assembles authoritative shot/scene/character context and normalizes AI output into the existing `layout3d` contract. The API returns an unapplied plan; the client applies it to the live viewer and uses one debounced save pipeline for JSON, PNG, and confirmation. Extend the existing PlayCanvas orbit camera with optional backward-compatible camera fields and `CameraFrame.dof`, while the scene-asset editor uses the same autosave/flush interaction pattern for its environment-only settings.

**Tech Stack:** React 19, React Query, TypeScript, Express/Zod, Prisma JSON field, Prompt Registry + `runStructuredPrompt`, PlayCanvas 2.21.4, Node test runner, Tailwind semantic tokens, `AiButton`.

---

## Task 1: Extend the backward-compatible 3D camera contract

**Files:**
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`
- Modify: `client/src/api/media/drama.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts`
- Test: `server/tests/dramaShotBlockingSketchContracts.test.mjs`
- Test: `client/tests/dramaBlocking3dMath.test.js`

- [ ] **Step 1: Write the failing server contract test**

Add a camera fixture with the new fields and assert that old camera input is normalized to exact defaults while new values survive normalization:

```js
test("3D 相机兼容旧快照并保存镜头与景深参数", () => {
  const old = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: { azim: 0, elev: -12, distance: 4, focalPoint: [0, 0.8, 0] },
      actors: [],
    },
  });
  assert.deepEqual(old.layout3d.camera, {
    azim: 0,
    elev: -12,
    distance: 4,
    focalPoint: [0, 0.8, 0],
    fovDeg: 52,
    nearClip: 0.05,
    farClip: 200,
    depthOfFieldEnabled: false,
    focusDistance: 8,
    focusRange: 5,
    blurRadius: 3,
  });

  const next = normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      ...old.layout3d,
      camera: {
        ...old.layout3d.camera,
        fovDeg: 38,
        nearClip: 0.1,
        farClip: 120,
        depthOfFieldEnabled: true,
        focusDistance: 4.5,
        focusRange: 2.25,
        blurRadius: 4,
      },
    },
  });
  assert.equal(next.layout3d.camera.depthOfFieldEnabled, true);
  assert.equal(next.layout3d.camera.focusDistance, 4.5);
  assert.equal(next.layout3d.camera.blurRadius, 4);
});

test("3D 相机拒绝越界景深字段", () => {
  assert.throws(() => normalizeBlockingSketchData({
    ...validSketch,
    layout3d: {
      schemaVersion: 1,
      engine: "playcanvas",
      camera: {
        azim: 0, elev: 0, distance: 3, focalPoint: [0, 0, 0],
        fovDeg: 120, nearClip: 0.01, farClip: 200,
        depthOfFieldEnabled: true, focusDistance: 3, focusRange: 2, blurRadius: 3,
      },
      actors: [],
    },
  }), /3D 相机/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the missing fields**

Run from `D:\Github\AI-Novel-Writing-Assistant-drama-auto-composition`:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingSketchContracts.test.mjs
```

Expected: FAIL because the normalized camera currently contains only `azim`, `elev`, `distance`, and `focalPoint`.

- [ ] **Step 3: Implement minimal shared defaults and normalization**

In `DramaShotBlockingSketchContracts.ts`, add `BLOCKING_SKETCH_3D_CAMERA_DEFAULTS`, extend `DramaShotBlockingSketch3DCamera`, and normalize optional legacy fields with finite range checks. Use these ranges: `fovDeg 30..100`, `nearClip 0.05..5`, `farClip 20..300`, `focusDistance 0.25..100`, `focusRange 0.1..100`, and `blurRadius 0..10`. `depthOfFieldEnabled` defaults to `false`; all old snapshots remain valid and receive defaults in the returned object.

Mirror the exact fields and defaults in the client API type and `blocking3dMath.ts`; keep `schemaVersion: 1` so existing persisted layouts are migrated on read rather than rejected.

Extend `blockingSketch3dCameraSchema` in `dramaRoutes.ts` with the same optional/defaulted fields and exact numeric ranges so HTTP input and service normalization agree.

- [ ] **Step 4: Run the focused server and client tests**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingSketchContracts.test.mjs
pnpm --filter @ai-novel/client test -- dramaBlocking3dMath.test.js
```

Expected: PASS, with old snapshots gaining defaults and invalid camera values rejected.

- [ ] **Step 5: Commit the contract unit**

```powershell
git add server/src/services/drama/visual/DramaShotBlockingSketchContracts.ts server/src/modules/drama/http/dramaRoutes.ts client/src/api/media/drama.ts client/src/pages/drama/comicDrama/components/blocking3d/blocking3dMath.ts server/tests/dramaShotBlockingSketchContracts.test.mjs client/tests/dramaBlocking3dMath.test.js
git commit -s -m "feat: extend drama blocking camera contract"
```

## Task 2: Add the registered structured AI auto-composition prompt

**Files:**
- Create: `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Test: `server/tests/dramaShotBlockingAutoPlanPrompt.test.js`

- [ ] **Step 1: Write the failing prompt contract test**

Create a test that imports the prompt source after build and verifies its registered identity, structured mode, output schema, complete actor/camera shape, and Chinese composition constraints:

```js
const { dramaShotBlockingAutoPlanPrompt } = require("../dist/prompting/prompts/drama/shotBlockingAutoPlan.prompts.js");

test("自动构图 Prompt 输出完整角色摆位与相机景深合同", () => {
  assert.equal(dramaShotBlockingAutoPlanPrompt.id, "drama.shot.blocking.autoPlan");
  assert.equal(dramaShotBlockingAutoPlanPrompt.version, "v1");
  assert.equal(dramaShotBlockingAutoPlanPrompt.mode, "structured");
  const output = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
    actors: [{ characterName: "沈烬", position: [1, 0, -1], yawDeg: 180, scale: [1, 1, 1], pose: "talking" }],
    camera: {
      azim: -35, elev: -10, distance: 7, focalPoint: [0, 0.8, 0],
      fovDeg: 52, nearClip: 0.05, farClip: 200,
      depthOfFieldEnabled: true, focusDistance: 7, focusRange: 4, blurRadius: 3,
    },
    compositionNote: "双人关系清楚",
  });
  assert.equal(output.actors[0].characterName, "沈烬");
  assert.equal(output.camera.depthOfFieldEnabled, true);
});

test("自动构图 Prompt 明确要求使用全部输入角色和横屏构图", () => {
  const messages = dramaShotBlockingAutoPlanPrompt.render({
    shotJson: "动作：沈烬与血角兽对峙",
    sceneJson: "荒原",
    actorsJson: "沈烬、血角兽",
  });
  assert.match(messages.map((message) => String(message.content)).join("\n"), /全部角色|每个.*角色/);
  assert.match(messages.map((message) => String(message.content)).join("\n"), /16:9/);
});
```

- [ ] **Step 2: Run the prompt test and confirm it fails because the asset is not registered**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanPrompt.test.js
```

Expected: FAIL with the prompt module or prompt export missing.

- [ ] **Step 3: Implement the PromptAsset**

Define `DramaShotBlockingAutoPlanPromptInput` with `shotJson`, `sceneJson`, and `actorsJson`. Define a Zod output schema containing 1–12 actor entries, the exact supported static pose enum, camera fields/ranges, and a bounded `compositionNote`.

Render a `SystemMessage` that says the model is a cinematic horizontal storyboard director, must use every actor supplied by the caller exactly once, must not invent names, must keep actors grounded and spatially readable, and must return only schema JSON. Render a `HumanMessage` containing the three labeled context blocks. Add a `postValidate` that trims actor names and rejects duplicate/empty names; completeness against the authoritative actor list remains a service-layer check.

Register `{ key: "drama.shot.blocking.autoPlan@v1", load: () => require("../prompts/drama/shotBlockingAutoPlan.prompts").dramaShotBlockingAutoPlanPrompt as UnknownPromptAsset }` next to the existing drama keyframe entry.

- [ ] **Step 4: Run the prompt test and the registry governance tests**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanPrompt.test.js
node --test server/tests/prompting-governance.test.js server/tests/prompting.test.js
```

Expected: PASS; the new asset is accepted by `runStructuredPrompt` registration checks.

- [ ] **Step 5: Commit the prompt unit**

```powershell
git add server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts server/src/prompting/registry/promptAssetLoaderEntries.ts server/tests/dramaShotBlockingAutoPlanPrompt.test.js
git commit -s -m "feat: add structured drama blocking planner"
```

## Task 3: Implement the server auto-plan application boundary and route

**Files:**
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`
- Modify: `client/src/api/media/drama.ts`
- Test: `server/tests/dramaShotBlockingAutoPlanService.test.js`
- Test: `server/tests/dramaShotBlockingSketchRoutes.test.js`
- Test: `client/tests/dramaShotBlockingSketchApi.test.js`

- [ ] **Step 1: Write the failing service and route contract tests**

Add source-contract assertions for an `autoPlan` service method, `runStructuredPrompt`, authoritative character completeness validation, and the `POST .../blocking-sketch/auto-plan` route. Add the client API assertion for `autoPlanDramaShotBlockingSketch` and the new path.

The service test must specify the required behavior with a representative planner result: the authoritative context contains `沈烬` and `血角兽`, the result contains both exactly once, and the returned layout contains both actors and the normalized camera DOF fields. A planner result missing `血角兽` must throw a 400-level error rather than place it with a hard-coded fallback.

- [ ] **Step 2: Run the focused tests and confirm they fail**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/dramaShotBlockingSketchRoutes.test.js
pnpm --filter @ai-novel/client test -- dramaShotBlockingSketchApi.test.js
```

Expected: FAIL because the service method, endpoint, and client function do not exist.

- [ ] **Step 3: Assemble authoritative auto-plan context**

Extend the internal `BlockingSketchShot` select to include `order`, `shotSize`, `cameraMove`, `durationSec`, `action`, `dialogue`, and `visualPrompt`. Keep actor selection based on `characterRefs` and state selection based on `characterStates`; do not let the client infer or invent actors.

Implement `autoPlan(projectId, shotId, options)` in `DramaShotBlockingSketchService`:

```ts
async autoPlan(projectId: string, shotId: string, options: DramaLLMOptions = {}) {
  const shot = await this.assertShotInProject(projectId, shotId);
  const context = await this.getEditorContext(projectId, shotId);
  if (!context.scene) throw new AppError("当前镜头没有可用的场景状态图。", 409);
  if (context.actors.length === 0) throw new AppError("当前镜头没有可规划的出场角色。", 409);
  const result = await runStructuredPrompt({
    asset: dramaShotBlockingAutoPlanPrompt,
    promptInput: { shotJson: JSON.stringify(shotContext), sceneJson: JSON.stringify(context.scene), actorsJson: JSON.stringify(context.actors) },
    options: { provider: options.provider, model: options.model, temperature: options.temperature ?? 0.25 },
  });
  return buildAutoPlanLayout(result.output, context.actors);
}
```

`buildAutoPlanLayout` must compare normalized actor names against the context actor set, reject missing/extra/duplicate names, normalize every actor through the existing static pose and coordinate contract, normalize the camera through the new camera contract, and return `{ layout, compositionNote }`. It must use the scene environment from the authoritative context and never persist data.

- [ ] **Step 4: Add the route and client API**

Use the existing `llmOptionsSchema` on:

```ts
router.post(
  "/projects/:id/shots/:shotId/blocking-sketch/auto-plan",
  validate({ params: shotParamsSchema, body: llmOptionsSchema }),
  async (req, res, next) => {
    try {
      const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
      const data = await dramaShotBlockingSketchService.autoPlan(id, shotId, (req.body ?? {}) as never);
      res.status(200).json({ success: true, data, message: "3D 草图构图已规划。" });
    } catch (error) {
      next(error);
    }
  },
);
```

Add `autoPlanDramaShotBlockingSketch(id, shotId, options?)` in `client/src/api/media/drama.ts` using the same `ApiResponse` wrapper and path.

- [ ] **Step 5: Run focused tests and build**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/dramaShotBlockingSketchRoutes.test.js
pnpm --filter @ai-novel/client test -- dramaShotBlockingSketchApi.test.js
```

Expected: PASS, including rejection of missing authoritative actors.

- [ ] **Step 6: Commit the server API unit**

```powershell
git add server/src/services/drama/visual/DramaShotBlockingSketchService.ts server/src/modules/drama/http/dramaRoutes.ts client/src/api/media/drama.ts server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/dramaShotBlockingSketchRoutes.test.js client/tests/dramaShotBlockingSketchApi.test.js
git commit -s -m "feat: expose drama blocking auto plan"
```

## Task 4: Connect PlayCanvas camera parameters and real DOF preview

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Modify: `client/tests/dramaBlocking3dStaticHdri.contract.test.js`
- Test: `client/tests/dramaBlocking3dCamera.contract.test.js`

- [ ] **Step 1: Write the failing viewer contract test**

Assert source-level wiring for `CameraFrame`, camera FOV/clip synchronization, DOF fields, export/import, and capture compatibility:

```js
test("PlayCanvas 3D 草图使用保存的镜头和真实景深管线", () => {
  assert.match(viewerSource, /CameraFrame/);
  assert.match(viewerSource, /depthOfFieldEnabled/);
  assert.match(viewerSource, /focusDistance/);
  assert.match(viewerSource, /focusRange/);
  assert.match(viewerSource, /blurRadius/);
  assert.match(viewerSource, /camera\.fovDeg/);
  assert.match(viewerSource, /camera\.nearClip/);
  assert.match(viewerSource, /camera\.farClip/);
  assert.match(viewerSource, /exportLayout/);
  assert.match(viewerSource, /loadLayout/);
});
```

- [ ] **Step 2: Run the contract test and confirm it fails**

```powershell
pnpm --filter @ai-novel/client test -- dramaBlocking3dCamera.contract.test.js
```

Expected: FAIL because the viewer has no `CameraFrame` or DOF state.

- [ ] **Step 3: Implement camera-frame synchronization**

Add `const cameraFrame = cameraEntity.script.create(pc.CameraFrame, { properties: { dof: { enabled: false } } });` after adding a script component and before starting the app. Keep the returned instance typed as `pc.CameraFrame | null`; if the runtime cannot create it, the viewer remains functional with DOF disabled and reports a status rather than failing all 3D editing.

Update `syncCamera` to set `cameraEntity.camera.fov`, `nearClip`, and `farClip`. Add `syncDepthOfField()` that maps the normalized camera state to `cameraFrame.dof.enabled`, `focusDistance`, `focusRange`, `blurRadius`, `highQuality: true`, `nearBlur: false`, and calls `cameraFrame.update()`.

Call both sync functions from default initialization, `setCameraState`, `resetCamera`, `fitView`, and `loadLayout`. Extend `getCameraState`/`exportLayout` to return all fields. `capturePng` must temporarily resize and render using the same active CameraFrame, then restore the canvas and render again.

Keep `loadLayout` tolerant of older layouts by passing through `normalizeBlocking3dCamera`, and keep `setCameraState` emitting the same normalized state without changing actor behavior.

- [ ] **Step 4: Run client typecheck and focused tests**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test -- dramaBlocking3dCamera.contract.test.js dramaBlocking3dPage.contract.test.js dramaBlocking3dStaticHdri.contract.test.js
```

Expected: PASS with no TypeScript errors and existing HDRI/pose behavior unchanged.

- [ ] **Step 5: Commit the viewer unit**

```powershell
git add client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts client/tests/dramaBlocking3dCamera.contract.test.js client/tests/dramaBlocking3dPage.contract.test.js client/tests/dramaBlocking3dStaticHdri.contract.test.js
git commit -s -m "feat: render drama blocking depth of field"
```

## Task 5: Replace manual blocking save/confirm with first-entry planning and autosave

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Modify: `client/tests/dramaShotBlockingSketchApi.test.js`

- [ ] **Step 1: Write the failing page contract assertions**

Add assertions that the page imports and calls `autoPlanDramaShotBlockingSketch`, uses `AiButton`, triggers first-entry planning only when no `layout3d` exists, preserves existing layouts, has a retry path, and has no manual save/confirm controls:

```js
assert.match(pageSource, /autoPlanDramaShotBlockingSketch/);
assert.match(pageSource, /<AiButton/);
assert.match(pageSource, /!context\.sketch\?\.layout3d/);
assert.match(pageSource, /自动保存/);
assert.match(pageSource, /await handleAutoSave\(\)/);
assert.doesNotMatch(pageSource, /保存草图/);
assert.doesNotMatch(pageSource, /确认草图/);
assert.doesNotMatch(pageSource, /window\.confirm/);
```

- [ ] **Step 2: Run the page contract test and confirm it fails**

```powershell
pnpm --filter @ai-novel/client test -- dramaBlocking3dPage.contract.test.js
```

Expected: FAIL because the page still renders manual save/confirm buttons and has no planner.

- [ ] **Step 3: Refactor the save pipeline into a shared auto-save Promise**

Replace `handleSave(confirmAfterSave)` with `handleAutoSave()` that:

1. Reuses `savePromiseRef` if one exists.
2. Disables viewer interaction and sets `autoSaveState` to `saving`.
3. Builds the current layout, calls `saveDramaShotBlockingSketch`, captures 1280×720 PNG, uploads it, and always calls `confirmDramaShotBlockingSketch` after upload.
4. Updates `savedData`, clears `dirty`, invalidates the project/comic-drama queries, and sets `autoSaveState` to `saved`.
5. On failure keeps `dirty`, sets `autoSaveState` to `error`, and uses `toast.error("自动保存 3D 草图失败", { description })`.
6. Releases the interaction lock and shared Promise in `finally`.

Add a `useEffect` that schedules `handleAutoSave` after 1000 ms of no changes, with cleanup clearing the timeout. The effect must not schedule while planning, saving, or leaving. The returned `goBack` must set `leavingRef`, await the shared auto-save when dirty, reset the ref on failure, and navigate only after success. Remove `Check`/`Save` imports and both manual action buttons; show a compact `role="status"` label for `自动保存中`, `已自动保存`, or `自动保存失败`.

- [ ] **Step 4: Add AI planner application and first-entry rule**

Add `planning`/`planError` state and `handleAutoPlan`:

```ts
const handleAutoPlan = async () => {
  if (!viewer || !context?.scene || planning || saving) return;
  setPlanning(true);
  viewer.setInteractionEnabled(false);
  try {
    const response = await autoPlanDramaShotBlockingSketch(projectId, shotId);
    const layout = response.data?.layout;
    if (!layout) throw new Error("自动构图没有返回有效布局。");
    viewer.loadLayout(layout);
    syncSelection(viewer);
    setDirty(true);
    setPlanError(null);
  } catch (error) {
    setPlanError(error instanceof Error ? error.message : "自动构图失败，请重试。");
    toast.error("自动构图失败", { description: error instanceof Error ? error.message : "请稍后重试。" });
  } finally {
    viewer.setInteractionEnabled(true);
    setPlanning(false);
  }
};
```

Use a ref keyed by `shotId` to run it once after the viewer is initialized only when `context.sketch?.layout3d` is absent and `context.actors.length > 0`. Existing layout load remains unchanged. Put an `AiButton` in the right-side camera card labeled `正在自动构图...` / `重新自动构图` / `自动构图`; disable it during saving/planning and expose a normal `Button` retry for a failed request only if the AI action guard permits the original action. Show read-only values from `viewer.getCameraState()` for FOV, focus distance, focus range, and blur radius so the user can see the planned parameters without adding more manual fields.

Do not auto-plan if the context has no scene or no actors; render an empty state instead. A planner error must not call `loadLayout`, so an existing layout remains visible.

- [ ] **Step 5: Run page and client tests**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test -- dramaBlocking3dPage.contract.test.js dramaShotBlockingSketchApi.test.js dramaBlocking3dMath.test.js
```

Expected: PASS; page source has no manual save/confirm interaction and the AI action has loading/error/retry states.

- [ ] **Step 6: Commit the blocking page unit**

```powershell
git add client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx client/tests/dramaBlocking3dPage.contract.test.js client/tests/dramaShotBlockingSketchApi.test.js
git commit -s -m "feat: autosave and auto-compose drama blocking"
```

## Task 6: Make the scene asset 3D editor autosave on change and exit

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/tests/storyScene3dEditorContracts.test.js`

- [ ] **Step 1: Write the failing scene editor contract assertions**

Add assertions for `mutateAsync`/auto-save scheduling, an async `goBack`, an automatic-save status, and absence of manual save controls:

```js
assert.match(page, /mutateAsync/);
assert.match(page, /自动保存/);
assert.match(page, /await saveEnvironment/);
assert.doesNotMatch(page, /保存场景参数/);
assert.doesNotMatch(page, /window\.confirm/);
```

- [ ] **Step 2: Run the scene contract test and confirm it fails**

```powershell
pnpm --filter @ai-novel/client test -- storyScene3dEditorContracts.test.js
```

Expected: FAIL because the page currently exposes two manual save buttons and a confirmation dialog.

- [ ] **Step 3: Implement debounced scene autosave and exit flush**

Change the mutation to accept a snapshot argument rather than reading a stale closure. Keep a ref containing the latest `environmentSettings`, add a shared `savePromiseRef`, and implement `saveEnvironment()` that calls `saveMutation.mutateAsync(snapshot)`, invalidates the scene and scene-list queries, marks clean only when the latest settings still equal the saved snapshot, and reports errors through `toast.error`.

Schedule `saveEnvironment()` 700 ms after a slider change, canceling the timer on cleanup. Make `goBack` async: if dirty, await the shared save Promise or start a flush; return only after success. Remove `Save` import and both manual buttons, and replace them with a `role="status"` label that reports `自动保存中`, `已自动保存`, or `自动保存失败`.

Keep sliders disabled while saving and retain semantic Tailwind tokens and existing accessible labels. Do not add new UI dependencies or hard-coded colors.

- [ ] **Step 4: Run client typecheck and focused tests**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test -- storyScene3dEditorContracts.test.js
```

Expected: PASS with no manual save/confirm copy left in the scene editor.

- [ ] **Step 5: Commit the scene autosave unit**

```powershell
git add client/src/pages/drama/comicDrama/DramaScene3DPage.tsx client/tests/storyScene3dEditorContracts.test.js
git commit -s -m "feat: autosave scene 3d settings"
```

## Task 7: Update durable project documentation and release surfaces

**Files:**
- Modify: `docs/wiki/architecture/` or the existing relevant drama workflow page discovered by the wiki index
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Locate the existing drama workflow wiki page and release-note format**

Run:

```powershell
rg -n "分镜|摆位|3D|草图|自动保存|release" docs/wiki docs/releases README.md | Select-Object -First 220
```

Use the existing page if one covers drama visual workflow; otherwise create `docs/wiki/workflows/drama-3d-blocking.md` with Background / Decision / Current Rule / Failure Modes / Related Modules / Source Documents. Document the durable rule that a confirmed blocking sketch is the production input, that autosave must finish JSON + PNG + confirmation, and that AI planner output is authoritative for initial layout while deterministic code only validates it.

- [ ] **Step 2: Write user-facing release notes**

Add one entry under `### 2026-08-25` describing automatic 3D shot composition, visible depth-of-field preview, and automatic saving of scene and blocking edits. Do not mention source paths, schema IDs, tests, or change-history narration. Update `README.md` `## 最新更新` to show only the newest date block and link to the full release notes.

- [ ] **Step 3: Run documentation checks**

```powershell
pnpm check:docs-manifest
git diff --check
```

Expected: PASS with no unrelated documentation rewrites.

- [ ] **Step 4: Commit documentation as one coherent unit**

```powershell
git add docs/wiki docs/releases/release-notes.md README.md
git commit -s -m "docs: document drama 3d composition workflow"
```

## Task 8: Full verification and browser acceptance

**Files:**
- No new source files; inspect all diffs and test artifacts.

- [ ] **Step 1: Run targeted server verification**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaShotBlockingAutoPlanPrompt.test.js server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/dramaShotBlockingSketchRoutes.test.js server/tests/dramaShotBlockingSketchService.test.js server/tests/dramaShotKeyframeBlockingSketch.test.js
```

Expected: PASS, including old draft/confirmed behavior and new auto-plan route contracts.

- [ ] **Step 2: Run targeted client verification**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client test -- dramaBlocking3dPage.contract.test.js dramaBlocking3dCamera.contract.test.js dramaBlocking3dMath.test.js dramaShotBlockingSketchApi.test.js storyScene3dEditorContracts.test.js dramaBlocking3dStaticHdri.contract.test.js
```

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 3: Run the relevant production builds**

```powershell
pnpm --filter @ai-novel/server build
pnpm --filter @ai-novel/client build
```

Expected: PASS; no changes to fixed ports or running services.

- [ ] **Step 4: Use the existing in-app browser for real acceptance**

Use the already running browser tab and the current local services; do not start another server or change ports. Verify:

1. Open a shot with no `layout3d`: the page automatically calls auto-plan, both current shot actors appear in the PlayCanvas scene, the camera card shows FOV/focus/blur values, and the canvas visibly changes when DOF is enabled.
2. Wait for the automatic-save status to settle, leave with the back control, re-enter, and confirm the same actors, camera, DOF values, PNG preview and confirmed state remain. Inspect the API response rather than relying only on the badge.
3. Open a shot with an existing layout: it is not overwritten on entry; `重新自动构图` applies a new result only after the AI request succeeds.
4. Make a manual actor adjustment and leave without clicking any save/confirm button; re-enter and verify the adjustment persisted.
5. Open a scene asset, move each environment slider, leave immediately, re-enter, and verify values persisted without a confirmation dialog or manual save click.
6. Trigger an auto-plan failure if the running configuration permits; verify the existing scene remains and a retry action is visible.

- [ ] **Step 5: Audit git scope and prepare integration**

```powershell
git diff HEAD~8 --stat
git status --short
git worktree list --porcelain
```

Confirm only the planned files changed, no credentials/generated artifacts are staged, and the isolated worktree is clean after commits.

- [ ] **Step 6: Update the plan with verification evidence and integrate**

From the clean main workspace, run the project integration entry point with the narrowest required check:

```powershell
pnpm workflow:integrate codex/drama-auto-composition --push --verify "pnpm --filter @ai-novel/client typecheck"
```

Then verify `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the worktree list; remove only this fully merged worktree and branch using the integration workflow’s cleanup path. Do not touch other active worktrees.
