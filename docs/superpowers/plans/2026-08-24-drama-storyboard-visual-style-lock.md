# 漫剧分镜统一写实媒介锁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent drama storyboard images in one project from switching between realistic and cartoon/animation rendering, while preserving scene-era atmosphere and providing an explicit force-regeneration path for existing shots.

**Architecture:** Keep `DramaProject.visualStyle` as the era/atmosphere selector, derive a stable `renderFamily` (`live_action` by default), and pass it through the existing drama visual-style resolver into every asset/state/keyframe prompt. Filter the per-shot era judge to the locked family. Extend the existing episode keyframe batch contract with `force` so an explicit user action can regenerate completed images without silently overwriting them.

**Tech Stack:** TypeScript/Node.js, Prisma SQLite schema already deployed, Express/Zod, React 19, React Query, shadcn/ui, existing image-generation runtime and drama batch orchestrator.

---

### Task 1: Add failing visual-family and prompt-lock tests

**Files:**
- Create: `server/tests/dramaVisualStyleConsistency.test.js`
- Modify: `server/tests/dramaArtStyle.test.js`

- [ ] **Step 1: Add tests for the desired family contract**

Create tests that import the built server modules and assert:

```js
test("写实项目只允许 live_action 时代候选", async () => {
  const context = await resolveDramaArtStyleContext({
    visualStyle: "post_apocalyptic",
    sourceRef: null,
    scriptJudge: { target: "第9镜", scriptExcerpt: "室内对话" },
    judgeFn: async (input) => {
      assert.ok(input.availableStyles.every((style) => style.key !== "guoman_fantasy"));
      return { styleKey: "guoman_fantasy", reason: "故意模拟不兼容结果" };
    },
  });
  assert.equal(context.renderFamily, "live_action");
  assert.equal(context.specific?.label, "末世废土");
});

test("没有项目风格时默认锁定写实媒介", async () => {
  const context = await resolveDramaArtStyleContext({
    sourceRef: null,
    judgeFn: async () => null,
  });
  assert.equal(context.renderFamily, "live_action");
});

test("资产和分镜提示词都包含写实媒介锁", () => {
  const shotLines = buildShotStylePromptLines(DEFAULT_DRAMA_ASSET_STYLES, ["character"], null, "live_action");
  const assetLines = buildAssetStylePromptLines("character", DEFAULT_DRAMA_ASSET_STYLES.character, null, "live_action");
  assert.match([...shotLines, ...assetLines].join(" "), /统一写实影视化/);
  assert.match(combineShotStyleAvoidInstructions(DEFAULT_DRAMA_ASSET_STYLES, ["character"], null, "live_action"), /卡通/);
});
```

Also assert the animation family still produces an animation lock when `guoman_fantasy` is explicitly selected, so the fix does not remove an intentional user choice.

- [ ] **Step 2: Build the server baseline and run the new tests to verify RED**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaVisualStyleConsistency.test.js
```

Expected: the test command fails because `renderFamily` and the fourth prompt-builder arguments do not exist yet. Do not change production code before recording this failure.

- [ ] **Step 3: Add source-contract assertions for the batch force flag**

Add focused assertions to a new or existing batch contract test that the route schema, client payload type, and orchestrator all carry `force` for keyframe jobs. The test should distinguish keyframe `force=true` from the existing TTS force behavior.

### Task 2: Implement the stable render-family resolver and prompt constraints

**Files:**
- Modify: `server/src/services/drama/visual/dramaVisualStyles.ts`
- Modify: `server/src/services/drama/visual/dramaArtStyleResolver.ts`
- Modify: `server/src/services/drama/visual/DramaShotKeyframeService.ts`
- Modify: `server/src/services/drama/DramaCharacterImageService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`

- [ ] **Step 1: Add render-family types and deterministic fallback**

In `dramaVisualStyles.ts`, add:

```ts
export type DramaRenderFamily = "live_action" | "animation";
export const DEFAULT_DRAMA_RENDER_FAMILY: DramaRenderFamily = "live_action";
```

Add one immutable prompt policy per family. The live-action policy must explicitly say all shots use one realistic cinematic/live-action medium and must reject cartoon, anime, illustration, cel-shading, flat 2D and painterly rendering. The animation policy must explicitly say all shots use one animation medium and reject live-action photography. Export `resolveDramaRenderFamily(styleKey)` so unknown/custom keys deterministically return `live_action`.

- [ ] **Step 2: Thread `renderFamily` through style prompt builders**

Extend `ResolvedDramaArtStyle` with `renderFamily`. Extend `buildAssetStylePromptLines`, `buildShotStylePromptLines`, `combineAssetStyleAvoidInstructions`, and `combineShotStyleAvoidInstructions` with a final optional family argument defaulting to `live_action`; append the family policy without changing existing callers’ output order for the asset-specific and era-specific lines.

- [ ] **Step 3: Filter per-shot era candidates by the locked family**

In `resolveDramaArtStyleContext`, calculate the family from the explicit project `visualStyle`, then the novel default built-in style, and finally the default `live_action` family. Keep a compatible chain style only; a per-asset `pinnedStyle` can change era atmosphere but cannot change the project render medium. When building `availableStyles`, include only built-in presets whose `styleFamily` matches the lock; custom era styles remain atmosphere-only and inherit the lock. Accept a judge result only when it resolves to a compatible style. If no compatible result exists, use the compatible chain style or the built-in same-family fallback.

- [ ] **Step 4: Pass the resolved family into all image-generation entrypoints**

Update every `build*StylePromptLines` and `combine*StyleAvoidInstructions` call in the listed files to use `styleContext.renderFamily`. Update the drama shot keyframe prompt and negative prompt first, then asset/state image generation so the references themselves share the same medium.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaVisualStyleConsistency.test.js server/tests/dramaArtStyle.test.js
```

Expected: all focused visual-style tests pass.

### Task 3: Add explicit force regeneration to episode keyframe batches

**Files:**
- Modify: `server/src/modules/drama/http/dramaRoutes.ts`
- Modify: `server/src/services/drama/production/DramaBatchOrchestrator.ts`
- Modify: `client/src/api/media/drama.ts`
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Test: `server/tests/dramaBatchForceKeyframe.test.js`

- [ ] **Step 1: Make the batch regression test fail**

Exercise the orchestrator’s keyframe processing with a completed `keyframeData` value. Assert `force=false` returns `skipped` without invoking generation and `force=true` invokes generation. Use the existing injected `DramaShotKeyframeService` seam; do not mock unrelated provider behavior.

- [ ] **Step 2: Implement server force semantics**

Keep `force` in the validated batch body and persisted progress. Pass `nextProgress.force` to `processKeyframeShot`. Change the skip guard to:

```ts
if ((!force && hasDoneKeyframe(shot.keyframeData)) || isDraftBlockingSketch(shot.blockingSketchData)) {
  return "skipped";
}
```

Keep draft blocking-sketch protection unchanged. Include forced completed shots in cost estimation and retain existing version-history archiving through `runImageGeneration`.

- [ ] **Step 3: Implement the UI action with complete states**

Add a clearly labeled “按统一写实风格重生成本集” action beside the existing keyframe batch action. It must target all current shot IDs, send `{ type: "keyframes", shotIds, force: true }`, use `AiButton` for the AI generation action, disable while any keyframe job is active, show a loading label, and surface success/error through the existing toast wrapper. Use the existing components/tokens and do not introduce new colors or a custom dialog. If confirmation is needed, use the existing project dialog primitive and restore focus to the trigger after closing.

- [ ] **Step 4: Run batch route/orchestrator tests**

Run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaBatchBlockingSketch.test.js server/tests/dramaVisualStyleConsistency.test.js
```

Expected: the force test and all existing focused batch tests pass.

### Task 4: Add durable documentation and user-facing release note

**Files:**
- Create: `docs/wiki/workflows/drama-visual-style-consistency.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` latest update block

- [ ] **Step 1: Document the boundary**

Document that era/atmosphere may change by story context but render medium is project-locked; state the default fallback, candidate filtering, custom-style behavior, and force-regeneration rule. This is durable workflow knowledge, not a per-commit changelog.

- [ ] **Step 2: Update release surfaces**

Add a user-facing entry under `2026-08-24` describing the unified realistic storyboard rendering and explicit batch re-generation action. Keep `README.md` limited to the newest date block and link to the full release notes.

### Task 5: Verify the real project and deliver

**Files:**
- No new source files; verify the current project data and generated artifacts.

- [ ] **Step 1: Run focused and full relevant checks**

Run the visual-style and batch tests, server typecheck, client typecheck, client build, and `git diff --check`. Reuse no stale result after source changes.

- [ ] **Step 2: Use the running browser/API to regenerate and compare**

Without restarting the fixed-port services, call the explicit force batch action for the current episode after confirming no active conflicting batch job. Poll the project until all target shots finish. Inspect the generated prompts for the target shots and compare the new第8/9 images in the in-app browser. Check both image dimensions and that `keyframeData.generatedAt`/version changed while the prior version remains in history.

- [ ] **Step 3: Review the diff and commit coherent units**

Commit the implementation and documentation with `git commit -s` only after the focused checks and real artifact verification pass. Before committing, run `git status --short` and inspect the staged diff for unrelated changes.

- [ ] **Step 4: Integrate and push**

From the clean main workspace, run:

```powershell
pnpm workflow:integrate codex/drama-style-consistency-v1 --push --verify "pnpm --filter @ai-novel/server typecheck"
```

Then verify `git status --short --branch`, `git rev-parse HEAD origin/main`, and clean only this task’s merged worktree/branch. Do not touch concurrent worktrees.
