# HDR Background Layer Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every HDR/equirectangular scene panorama treat interactive furniture and near-field props as 3D-only foreground while preserving fixed architecture and distant background context.

**Architecture:** Keep the scene panorama contract in `scenePanoramaLayout.ts`, which is already shared by the legacy novel scene endpoint, scene state-image generation, and the legacy comic scene endpoint. Move raw scene/bible descriptions before that shared contract so the final prompt rules have precedence, and add tests for both allowed background categories and forbidden foreground categories.

**Tech Stack:** TypeScript, Node.js built-in test runner, pnpm workspace builds, Prisma-generated TypeScript types.

---

### Task 1: Lock the shared background/foreground contract with failing tests

**Files:**
- Modify: `server/tests/storyAssetImage.test.js`
- Modify: `server/tests/storyAssetStateImage.test.js`
- Modify: `server/tests/imageAspectEnforcement.test.js`
- Create: `server/tests/comicScenePanoramaPrompt.test.js`

- [ ] **Step 1: Add the expected content-policy assertions.**

Add assertions that the prompt contains all of the following ideas: fixed walls/ceilings/floor materials and distant buildings/mountains/tree lines are allowed background; furniture and placeable props are excluded from every zone; individual near-field rocks, grass, bushes, logs, crates and ground clutter are excluded; raw scene context cannot override the exclusion; and the comic prompt does not allow tiny background figures. Assert ordering by checking the raw context index is lower than the final background policy index.

The new comic test should call the exported `buildSceneSheetPrompt` with a bible containing `keyElements: "床靠墙，前景有石头，白墙和远处山体"` and assert that the returned prompt keeps `白墙`/`远处山体` context while placing the background-only policy after the bible content and excluding the furniture/near-field categories.

- [ ] **Step 2: Run the focused tests and confirm the new assertions fail for the missing behavior.**

Run from `server` after the existing baseline build:

```powershell
node --test tests/storyAssetImage.test.js tests/storyAssetStateImage.test.js tests/imageAspectEnforcement.test.js tests/comicScenePanoramaPrompt.test.js
```

Expected result: existing tests pass, while the new shared-policy/order assertions fail because the current legacy/comic prompt puts scene context after the layout contract and has the comic `NO characters or only tiny background figures` wording. Do not change production code until this red result is observed.

### Task 2: Implement one final background-layer policy and apply it to every panorama entry

**Files:**
- Modify: `server/src/services/image/panorama/scenePanoramaLayout.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetImageService.ts`
- Modify: `server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts`
- Modify: `server/src/services/comic/ComicSceneService.ts`

- [ ] **Step 1: Add the explicit allowed-background and forbidden-foreground lines to the shared panorama contract.**

Extend `SCENE_PANORAMA_LAYOUT_PROMPT_LINES` with a final content distinction equivalent to:

```ts
"background layer allowed content: fixed non-interactive surfaces and architecture such as walls, ceilings, floor or terrain materials, built-in doors and windows, distant facades, mountain ridges and far tree lines may be rendered when supported by the scene context; these are background elements, not placeable foreground props",
"foreground exclusion is absolute: beds, tables, chairs, sofas, desks, cabinets, shelves, counters and every other movable or interactive furniture/prop are 3D models placed later, so never render them anywhere in the panorama even when the scene description mentions them",
"near-field natural-object exclusion is absolute: never render individual rocks, stones, boulders, grass tufts, bushes, shrubs, tree trunks, logs, crates, debris or ground clutter close to the camera or near the character; distant geological formations and distant tree lines may remain as background scenery",
"scene descriptions are background context only, not an object inventory: preserve allowed walls, architecture, materials, lighting and atmosphere, but ignore excluded furniture and near-field objects as visible subjects",
```

Keep the existing three-zone, 2:1, interior, and negative-prompt contracts. Do not add keyword-based deletion of the source description.

- [ ] **Step 2: Reorder the legacy novel panorama prompt.**

In `buildScenePanoramaPrompt`, append time/weather and the sanitized environment context before `scenePanoramaLayoutLinesFor(scene.sceneType)`, then place style and architecture lines before the shared layout contract. The shared layout/content policy must be the last substantive instruction block. Preserve `sanitizeSceneEnvironmentDescription`, provider routing, `IMAGE_SPECS.scenePanorama`, and `SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT`.

- [ ] **Step 3: Keep scene state descriptions before the shared policy and make the policy the final scene block.**

In `buildStateImagePrompt`, retain character and prop branches exactly as they are. For the scene branch, keep state description, image prompt, reference-image context, and style metadata before the scene layout lines; append the shared panorama layout contract after the scene-specific empty-environment lines so furniture/near-field exclusions cannot be followed by a later raw scene instruction.

- [ ] **Step 4: Reorder the legacy comic scene prompt and remove its conflicting figure allowance.**

In `buildSceneSheetPrompt`, add bible fields (`palette`, `keyElements`, `materials`, `ambiance`, `layout`) before `scenePanoramaLayoutLinesFor(sceneType)`. Replace `environment concept art, NO characters or only tiny background figures` with the shared empty-environment/no-living-subject rule. Keep `IMAGE_SPECS.scenePanorama`, provider routing, and `SCENE_PANORAMA_LAYOUT_NEGATIVE_PROMPT` unchanged.

- [ ] **Step 5: Re-run the focused tests and confirm green.**

Run from `server`:

```powershell
node --test tests/storyAssetImage.test.js tests/storyAssetStateImage.test.js tests/imageAspectEnforcement.test.js tests/comicScenePanoramaPrompt.test.js
```

Expected result: every test passes, including the new ordering and three-entrypoint contract checks.

### Task 3: Review, document the user-visible rule, and run the self-test gate

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: Perform self-acceptance against the requirement.**

Review the diff and verify that: furniture is never requested as panorama content; near-field natural objects are excluded; walls/fixed architecture/distant scenery remain allowed; all three panorama generators consume the same shared rules; no database or projection behavior changed; and existing panorama files are not silently regenerated.

- [ ] **Step 2: Update user-facing release surfaces.**

Add one dated 2026-08-29 release-note entry and refresh the README latest-update block to describe that HDR scenes keep background architecture and distant scenery while interactive furniture and near-field props are placed separately as 3D models. Do not mention source file names, prompt identifiers, or implementation history in user-facing copy.

- [ ] **Step 3: Run the required checks.**

From the repository root, run:

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server typecheck
pnpm --filter @ai-novel/server test
```

The focused tests from Task 2 must report zero failures, server typecheck must exit 0, and the server test suite must exit 0. If a pre-existing unrelated failure appears, record its exact command and output instead of weakening the new assertions.

- [ ] **Step 4: Commit the implementation.**

```powershell
git add server/src/services/image/panorama/scenePanoramaLayout.ts server/src/modules/novel/story-settings/application/StoryAssetImageService.ts server/src/modules/novel/story-settings/application/StoryAssetStateImageService.ts server/src/services/comic/ComicSceneService.ts server/tests/storyAssetImage.test.js server/tests/storyAssetStateImage.test.js server/tests/imageAspectEnforcement.test.js server/tests/comicScenePanoramaPrompt.test.js README.md docs/releases/release-notes.md
git commit -s -m "fix: separate HDR background from foreground props"
```

### Task 4: Integrate and verify the repository state

**Files:**
- No additional source files.

- [ ] **Step 1: Run the repository integration command from clean `main`.**

```powershell
pnpm workflow:integrate codex/hdr-background-layer-policy --push --verify "pnpm --filter @ai-novel/server test"
```

- [ ] **Step 2: Reinstall hooks if the shared checkout was changed by concurrent worktree setup, then verify final state.**

```powershell
pnpm setup:git-hooks
pnpm check:workspace-integrity
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
```

Expected result: `main` is clean, local and remote revisions match, and the feature worktree/branch is removed only after confirming the branch is an ancestor of `main`. Existing unrelated worktrees remain untouched.
