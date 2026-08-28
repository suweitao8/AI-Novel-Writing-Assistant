# Drama AI Relation Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make drama shot auto-composition preserve explicit character relationships, so a grounded actor and an actor on top of it cannot be visually inverted and declared size differences survive proxy scaling.

**Architecture:** Keep the registered `drama.shot.blocking.autoPlan` Prompt as the AI interpretation boundary. Its structured result will include directed character relations and size relations. `DramaShotBlockingSketchService` will validate relation endpoints, apply only relation-derived geometric constraints after existing height normalization, and then run the existing stage/FOV safety pass; no character-specific branches or text keyword routing will be added.

**Tech Stack:** TypeScript, Zod, Prompt Registry, `runStructuredPrompt` semantic retry, Node test runner, Prisma-backed drama service, PlayCanvas layout contract.

---

### Task 1: Extend the auto-composition Prompt with directed relations

**Files:**
- Modify: `server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts`
- Modify: `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- Modify: `server/tests/dramaShotBlockingAutoPlanPrompt.test.js`
- Modify: `server/tests/dramaShotBlockingAutoPlanService.test.js`

- [ ] **Step 1: Add failing Prompt contract assertions**

Change the expected Prompt version to `v6`, add a required `relations: []` to the single-actor fixture, and assert that a directed relationship preserves its orientation and size declaration:

```js
const relational = dramaShotBlockingAutoPlanPrompt.outputSchema.parse({
  ...output,
  actors: [
    { ...output.actors[0], characterName: "血角兽", pose: "crouching" },
    { ...output.actors[0], characterName: "叶晨", pose: "lying" },
  ],
  relations: [{
    subjectCharacterName: "血角兽",
    objectCharacterName: "叶晨",
    relation: "on_top_of",
    sizeRelation: "larger",
  }],
});
assert.equal(relational.relations[0].subjectCharacterName, "血角兽");
assert.equal(relational.relations[0].objectCharacterName, "叶晨");
assert.equal(relational.relations[0].sizeRelation, "larger");
```

Assert that rendered Prompt text explains `subject`/ `object` direction, `on_top_of` as upper-versus-grounded, and the larger-body requirement. Add the same relation to the shared service `planOutput` fixture so later service tests describe the intended first-shot relationship.

- [ ] **Step 2: Run the Prompt test and confirm it fails**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanPrompt.test.js
```

Expected: FAIL because the current `v5` schema has no `relations` field and the registry still points to `@v5`.

- [ ] **Step 3: Implement the v6 relation schema and Prompt instructions**

In `shotBlockingAutoPlan.prompts.ts`, add a trimmed relation schema with:

- directed names `subjectCharacterName` and `objectCharacterName`;
- `relation`: `on_top_of | under | beside | in_front_of | behind | facing | holding | attacking | following`;
- `sizeRelation`: `larger | smaller | similar`.

Make `relations` required and capped at 24, change the asset version to `v6`, trim names in `postValidate`, reject self-relations and duplicate directed relation keys, and reject an empty relation list when more than one actor is returned. Add one semantic retry attempt whose message explicitly restates that `on_top_of` means subject above and object grounded. Keep the existing 16:9, stage radius, projection-center, height, camera, static-frame, and marker requirements, while adding the instruction “先识别关系，再规划坐标”; do not add names or keyword parsing.

Register `drama.shot.blocking.autoPlan@v6` in `promptAssetLoaderEntries.ts`.

- [ ] **Step 4: Run Prompt and registry governance tests**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanPrompt.test.js
node --test server/tests/prompting-governance.test.js server/tests/prompting.test.js
```

Expected: PASS with the registered `@v6` identity and relation instructions.

- [ ] **Step 5: Commit the Prompt unit**

```powershell
git add server/src/prompting/prompts/drama/shotBlockingAutoPlan.prompts.ts server/src/prompting/registry/promptAssetLoaderEntries.ts server/tests/dramaShotBlockingAutoPlanPrompt.test.js server/tests/dramaShotBlockingAutoPlanService.test.js
git commit -s -m "feat: add relations to drama auto composition"
```

### Task 2: Enforce relation geometry and actual proxy scale in the service

**Files:**
- Modify: `server/src/services/drama/visual/DramaShotBlockingSketchService.ts`
- Modify: `server/tests/dramaShotBlockingAutoPlanService.test.js`
- Modify: `server/tests/shotBlockingAutoPlanFit.test.js`

- [ ] **Step 1: Add failing first-shot and rejection tests**

Add authoritative heights `叶晨=1.75` and `血角兽=2.2). Pass an intentionally inverted actor payload together with the correct directed relation, then assert:

```js
const firstShotActors = [
  { characterName: "叶晨", sourceImageKind: "state_sheet", heightMeters: 1.75, heightSource: "manual" },
  { characterName: "血角兽", sourceImageKind: "state_sheet", heightMeters: 2.2, heightSource: "ai" },
];
const result = serviceModule.buildDramaShotBlockingAutoPlanLayout(
  invertedFirstShotOutput,
  firstShotActors,
  { projectionCenterHeight: 1, domeRadius: 20, yawDeg: 0, intensity: 1 },
);
const yechen = result.layout.actors.find((actor) => actor.characterName === "叶晨");
const beast = result.layout.actors.find((actor) => actor.characterName === "血角兽");
assert.equal(yechen.pose, "lying");
assert.equal(yechen.position[1], 0);
assert.equal(beast.pose, "crouching");
assert.ok(beast.position[1] > yechen.position[1]);
assert.ok(Math.hypot(beast.position[0] - yechen.position[0], beast.position[2] - yechen.position[2]) <= 0.9);
assert.ok(beast.scale[1] > yechen.scale[1]);
```

Also add `assert.throws` cases for an unknown relation endpoint, a duplicate directed relation, and a two-actor output with `relations: []`; each must match a 422-level relation error. Add a fit regression using the normalized first-shot result and the existing 100-degree FOV cap.

- [ ] **Step 2: Run the focused service tests and confirm they fail**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/shotBlockingAutoPlanFit.test.js
```

Expected: FAIL because the current service preserves the inverted `standing`/`prone` payload and has no relation contract.

- [ ] **Step 3: Implement relation validation and normalization**

In `DramaShotBlockingSketchService.ts`, add an owned `enforceAutoPlanRelations` function and call it after height-based scale conversion but before `normalizeBlockingSketch3dLayout` and FOV fitting. It must:

1. Validate planned actor completeness as today, then validate relation endpoints, self-relations, duplicate directed keys, and non-empty relations for multi-actor results.
2. Compare actual proxy size using the normalized absolute vertical scale (`actor.scale[1]`); do not multiply by `heightMeters` a second time after `heightToProxyScale` has been applied.
3. For `on_top_of`, treat `subject` as upper and `object` as grounded: set the object root y to 0 and its pose to `lying` when it is not `lying`/ `prone`; set the subject pose to `crouching` when it is not `crouching`/ `prone`/ `kneeling`; preserve the AI horizontal direction while clamping separation to 0.9 meters; set subject y to a small positive offset based on the object height.
4. For `sizeRelation=larger` or `smaller`, uniformly adjust the subject’s three axes to reach a 1.15 margin relative to the object. Throw an `AppError` if the adjustment would exceed the 0.1–10 scale contract. Leave `similar` unchanged.
5. Keep stage clamping, camera anchoring, environment ownership, composition notes, and the final FOV fit unchanged.

Use relation fields as the only semantic source. Do not inspect `action`, `dialogue`, `visualPrompt`, or character names with regex/keyword branches.

- [ ] **Step 4: Run service, contract, and static-chain tests**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/shotBlockingAutoPlanFit.test.js server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaStaticShotContracts.test.js
```

Expected: PASS; the inverted fixture becomes grounded Ye Chen, upper crouched Bloodhorn, larger normalized proxy, and the existing stage/camera checks remain green.

- [ ] **Step 5: Commit the service unit**

```powershell
git add server/src/services/drama/visual/DramaShotBlockingSketchService.ts server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/shotBlockingAutoPlanFit.test.js
git commit -s -m "fix: enforce drama composition relations"
```

### Task 3: Record the durable workflow rule and user-facing change

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Update the wiki**

Add a focused subsection under the existing editor AI-composition rules with Background / Decision / Current Rule / Failure Modes / Related Modules / Source Documents semantics. Record directed relation output, `on_top_of` direction, post-height scale comparison, and the rule that deterministic code only realizes structured AI output. Include the first-shot diagnosis as a durable failure mode, not as a changelog.

- [ ] **Step 2: Update release surfaces**

Use the `readme-release-updater` skill against the actual Git scope before committing. Add a user-facing current-date entry describing more reliable overlapping-character composition and preserved size relationships. Update `README.md` `## 最新更新` to show only the newest date block and full-history link; do not mention source paths, schema IDs, tests, or implementation narration.

- [ ] **Step 3: Run documentation checks and commit**

```powershell
pnpm check:docs-manifest
git diff --check
git add docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
git commit -s -m "docs: document drama relation composition"
```

Expected: documentation checks pass with no unrelated rewrites.

### Task 4: Full self-test, real first-shot regression, and delivery

**Files:** Inspect all changes in the isolated worktree; no additional source files expected.

- [ ] **Step 1: Run focused server verification**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/dramaShotBlockingAutoPlanPrompt.test.js server/tests/dramaShotBlockingAutoPlanService.test.js server/tests/shotBlockingAutoPlanFit.test.js server/tests/dramaShotBlockingSketchContracts.test.mjs server/tests/dramaShotBlockingSketchRoutes.test.js server/tests/dramaShotBlockingSketchService.test.js server/tests/dramaShotKeyframeBlockingSketch.test.js server/tests/dramaStaticShotContracts.test.js
```

Expected: all selected tests pass and the built registry uses `@v6`.

- [ ] **Step 2: Verify current first-shot data without mutation**

Read `GET /api/drama/projects/:projectId/shots/:shotId/blocking-sketch` and feed its current actor heights plus a representative v6 relation result into the built service function. Assert that Ye Chen is grounded, the Bloodhorn is above him with an upper pose and larger normalized proxy scale, and the normalized camera still passes the existing stage/FOV checks. Do not save, upload, confirm, or modify the database.

- [ ] **Step 3: Run the required browser smoke self-test**

Read and follow the browser QA skill before controlling a browser. Use an isolated browser context against `http://127.0.0.1:5174` and the existing API at `http://127.0.0.1:3100`; never touch the user’s open in-app browser tab. Open the first shot’s 3D blocking page, click the explicit AI auto-composition action, and verify the relation-aware plan applies, the viewport shows grounded Ye Chen and a visibly larger Bloodhorn above him, the composition note remains visible, no new console errors appear, and the existing autosave/PNG/confirm chain settles. If the configured model is unavailable, record the exact upstream failure and rely on deterministic service verification plus the browser error state; do not fake success or alter existing data to make the check pass.

- [ ] **Step 4: Self-accept and audit**

Review the diff against the design, confirm no name-based or regex semantic fallback was introduced, then run:

```powershell
git diff --check
git status --short
git worktree list --porcelain
```

Expected: only planned files changed and the isolated worktree is clean after commits.

- [ ] **Step 5: Integrate and push**

From the clean `main` checkout, after confirming this source worktree is clean:

```powershell
pnpm workflow:integrate codex/drama-ai-composition-relations --push --verify "pnpm --filter @ai-novel/client typecheck"
```

Then verify local/remote SHA equality and remove only this fully merged worktree and branch with the repository cleanup workflow; preserve every other active worktree.
