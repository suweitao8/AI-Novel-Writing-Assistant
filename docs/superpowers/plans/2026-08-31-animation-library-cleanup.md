# Animation Library Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ( - [ ] ) syntax for tracking.

**Goal:** Make the animation library a coherent storyboard-facing catalog while preserving the existing UAL2/GLB compatibility path and making the same root-motion clips available to the 3D blocking editor.

**Architecture:** Keep the curated selection manifest as the source of truth and regenerate the TypeScript catalog from it. Add a pure catalog scope/filter layer for storyboard root-motion clips, compatibility legacy clips, and all clips. Centralize explicit root-motion pose aliases in the blocking resolver so the storyboard and animation page consume the same UAL2 GLB.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind semantic tokens, existing Tabs/SelectControl components, PlayCanvas, Node test runner, Python GLB inspection scripts.

---

### Task 1: Lock the catalog scope and taxonomy contract

**Files:**
- Modify: scripts/animation/build_animation_catalog_selection.cjs
- Modify: scripts/animation/animationCatalogSelection.json (generated)
- Modify: client/src/config/animationCatalogEntries.ts (generated)
- Modify: client/src/config/animationLibrary.ts
- Test: scripts/animation/animationCatalogSelection.test.cjs
- Test: client/src/config/animationLibraryContent.test.mjs

- [ ] **Step 1: Write failing catalog assertions**

Add assertions that all selected Cine57 clips are root-motion, the two idle-break clips and stairs-idle use standing-idle, parkour walk/run use locomotion plus standing posture, and the catalog exposes 104 storyboard clips and 46 compatibility clips.

```js
assert.equal(selection.clips.length, 104);
for (const id of [
  "unreal-daily-male-locomotion-idle-break-01",
  "unreal-daily-male-locomotion-idle-break-02",
  "unreal-misc-stairs-stairs-idle",
]) {
  assert.equal(selection.clips.find((clip) => clip.id === id)?.classificationId, "standing-idle");
}
for (const id of [
  "unreal-daily-parkour-walk-in-place",
  "unreal-daily-parkour-run-in-place",
]) {
  const clip = selection.clips.find((candidate) => candidate.id === id);
  assert.equal(clip?.classificationId, "locomotion");
  assert.equal(clip?.posture, "standing");
}
```

- [ ] **Step 2: Run focused tests and verify the new assertions fail**

Run:

```text
node scripts/animation/animationCatalogSelection.test.cjs
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

Expected: the existing selection fails the new taxonomy assertions.

- [ ] **Step 3: Correct explicit taxonomy and add typed filters**

Add explicit overrides in build_animation_catalog_selection.cjs for the idle-break clips, stairs-idle, parkour walk/run, parkour idle/balance idle, and the clearly identifiable movement posture cases. Regenerate sequentially:

```text
node scripts/animation/build_animation_catalog_selection.cjs D:/UnrealWorkspace/Cine57-exported/animation_catalog_scan.json scripts/animation/animationCatalogSelection.json
node scripts/animation/generate_animation_catalog_entries.cjs scripts/animation/animationCatalogSelection.json client/src/config/animationCatalogEntries.ts
```

In animationLibrary.ts, add AnimationLibraryScopeId and ANIMATION_LIBRARY_SCOPES. The scopes are storyboard (rootMotion true), compatibility (rootMotion false), and all. Add posture and weapon options, add weaponType to AnimationLibraryFilters, and apply scope plus weapon filters in filterAnimationLibraryEntries. Keep all existing IDs and GLB clip names stable so routes and saved keyframes remain valid. Order generated storyboard entries before legacy entries for the all view.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```text
node scripts/animation/animationCatalogSelection.test.cjs
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

Expected: PASS with 104 curated root-motion clips and no non-root-motion Cine57 selections.

- [ ] **Step 5: Commit the catalog unit**

```text
git add scripts/animation/build_animation_catalog_selection.cjs scripts/animation/animationCatalogSelection.json client/src/config/animationCatalogEntries.ts client/src/config/animationLibrary.ts scripts/animation/animationCatalogSelection.test.cjs client/src/config/animationLibraryContent.test.mjs
git commit -s -m "fix: normalize animation catalog scope and taxonomy"
```

### Task 2: Reorganize the animation library page around storyboard use

**Files:**
- Modify: client/src/pages/animations/AnimationLibraryPage.tsx
- Modify: client/src/pages/animations/AnimationPreviewPage.tsx
- Modify: client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs

- [ ] **Step 1: Replace the old page contract with failing UI-source assertions**

Update the page test to require a default storyboard scope, tabs for 分镜可用 and 兼容动画, SelectControl controls for pack/action/posture/weapon, scope-aware counts, and the existing current-page pagination. Remove assertions that forbid pack/select controls.

```js
assert.match(pageSource, /storyboard/);
assert.match(pageSource, /data-animation-scope-filter/);
assert.match(pageSource, /分镜可用/);
assert.match(pageSource, /兼容动画/);
assert.match(pageSource, /SelectControl/);
assert.match(pageSource, /data-animation-pack-filter/);
assert.match(pageSource, /data-animation-action-filter/);
assert.match(pageSource, /data-animation-posture-filter/);
assert.match(pageSource, /data-animation-weapon-filter/);
assert.match(pageSource, /entries\.slice\(/);
```

- [ ] **Step 2: Run the page test and verify it fails**

```text
node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
```

Expected: FAIL because the current page defaults to all 150 entries and has only source/classification chips.

- [ ] **Step 3: Implement the scope-aware page with existing UI primitives**

Use Tabs for the three library scopes and keep source-group/classification rows. Derive visible group tabs, classification counts, and pack options from the active scope and search. Reset dependent selections and return to page one whenever a filter changes. Use SelectControl with option children for action type, pack, posture, and weapon so keyboard navigation remains available.

```tsx
<SelectControl
  value={packId}
  onChange={(event) => setPackId(event.target.value)}
  aria-label="按套装筛选"
  data-animation-pack-filter
>
  <option value="all">全部套装</option>
  {availablePacks.map((pack) => (
    <option key={pack.id} value={pack.id}>{pack.label}</option>
  ))}
</SelectControl>
```

Keep the empty state, 250ms debounced search, focus-visible styles, and 24-card page size. Add a compact token-colored 分镜可用/兼容动画 badge to cards and the detail header. Reset returns to 分镜可用.

- [ ] **Step 4: Run the page test and TypeScript check**

```text
node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit the page unit**

```text
git add client/src/pages/animations/AnimationLibraryPage.tsx client/src/pages/animations/AnimationPreviewPage.tsx client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs
git commit -s -m "feat: organize animation library for storyboard use"
```

### Task 3: Make storyboard pose presets prefer curated root-motion clips

**Files:**
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts
- Test: client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.test.mjs
- Modify: client/src/config/animationLibraryContent.test.mjs

- [ ] **Step 1: Add failing root-first resolver tests**

Keep the legacy-only compatibility test and add a test where C57 and legacy names coexist. The resolver must choose the C57 catalog clip for standing, walking, running, crouching, talking, interacting, fighting, and sword.

```js
const available = [
  "C57_unreal_daily_male_locomotion_idle_break_01",
  "C57_unreal_misc_clazy_walk_forward",
  "C57_unreal_misc_clazy_jog_forward",
  "C57_unreal_daily_male_locomotion_crouch_forward",
  "C57_unreal_daily_dialogue_dialogue_idle",
  "C57_unreal_interaction_activations_door_pull",
  "C57_unreal_hand_combat_lucy_attack",
  "C57_unreal_weapon_combat_sword_pro_weak_attack",
  "A_INP_Idle",
  "A_INP_WalkFwd_Loop",
];
assert.equal(resolveBlocking3dPoseClip("standing", available).clipName, available[0]);
assert.equal(resolveBlocking3dPoseClip("walking", available).clipName, available[1]);
assert.equal(resolveBlocking3dPoseClip("running", available).clipName, available[2]);
```

- [ ] **Step 2: Run resolver tests and verify they fail**

```text
node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.test.mjs
```

Expected: FAIL because the existing resolver lists legacy names before C57 clips.

- [ ] **Step 3: Implement explicit catalog-backed aliases**

Import ANIMATION_CATALOG_ENTRIES, map stable catalog IDs to generated clip names, and prepend only semantically appropriate root-motion clips to each pose config. Leave sitting, arms-crossed, and prone without invented root aliases when the curated catalog has no equivalent; keep legacy aliases as compatibility fallbacks. Preserve special sample ratios and the safe standing fallback for old layouts.

- [ ] **Step 4: Run resolver and content tests**

```text
node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.test.mjs client/src/config/animationLibraryContent.test.mjs
```

Expected: PASS and the root-first mappings resolve against animation names in the checked-in UAL2 GLB.

- [ ] **Step 5: Commit the storyboard mapping unit**

```text
git add client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.ts client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.test.mjs client/src/config/animationLibraryContent.test.mjs
git commit -s -m "fix: use root-motion clips in storyboard pose presets"
```

### Task 4: Update durable documentation and release surfaces

**Files:**
- Modify: docs/wiki/product/model-library.md
- Modify: docs/releases/release-notes.md
- Modify: README.md

- [ ] **Step 1: Document the stable catalog boundary**

Extend the existing animation catalog wiki section with the scope rule, root-first storyboard mapping, and compatibility behavior for old layouts. Explain why IDs and GLB clip names remain stable while user-facing scope and taxonomy are normalized.

- [ ] **Step 2: Record the user-visible organization**

Use the readme-release-updater workflow to inspect the branch scope, merge the current date into the existing release-notes date block, and keep README 最新更新 limited to the newest date block plus the release-notes link. Write user-facing capabilities, not file paths, schemas, or test names.

- [ ] **Step 3: Review documentation consistency**

```text
node scripts/check-docs-manifest.cjs
```

Expected: PASS.

- [ ] **Step 4: Commit documentation**

```text
git add docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "docs: define organized storyboard animation catalog"
```

### Task 5: Self-test asset, runtime, and real browser path

**Files:**
- No additional source files unless a focused failure requires a fix.

- [ ] **Step 1: Run asset and catalog gates**

```text
node scripts/animation/rootMotionPolicy.test.cjs
node scripts/animation/animationCatalogSelection.test.cjs
node scripts/animation/verify_animation_catalog.cjs scripts/animation/animationCatalogSelection.json client/public/anims/cine57/UAL2_UE_Anims.glb
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

Expected: PASS; the GLB remains one UAL2 character plus its existing 150 animation tracks, and all 104 C57 tracks retain root translation channels.

- [ ] **Step 2: Run client checks**

```text
pnpm --filter @ai-novel/client typecheck
node --experimental-strip-types --test client/src/pages/animations/animationLibraryPageTaxonomy.test.mjs client/src/pages/drama/comicDrama/components/blocking3d/blocking3dPose.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run built-in-browser smoke verification**

Using the Codex in-app browser only, visit http://127.0.0.1:5174/animations, verify the default 分镜可用 count is 104, switch to 兼容动画 and 全部, exercise one source tab, one classification chip, every new select, search, reset, and pagination. Open one root-motion detail page, verify the blue UAL2 character renders, play/pause and move the frame slider, then return to the library. Capture screenshots and confirm no console errors or failed asset requests attributable to this change.

- [ ] **Step 4: Inspect final repository state**

```text
git status --short
git worktree list --porcelain
git diff main...HEAD --stat
```

Expected: only this worktree’s intended changes are present and all self-test evidence is recorded.

- [ ] **Step 5: Integrate and push from clean main**

From D:/Github/AI-Novel-Writing-Assistant, after the branch is clean and checks pass:

```text
pnpm workflow:integrate codex/animation-library-cleanup --push --verify "pnpm --filter @ai-novel/client typecheck"
```

Then verify HEAD equals origin/main, remove only this completed worktree/branch through the repository workflow, and run git worktree prune.

## Self-review

- The catalog remains one UAL2 GLB; no second character or non-root-motion Cine57 source is introduced.
- Existing legacy IDs and GLB clip names remain stable, so stored keyframes and old routes remain recoverable.
- Default discovery is storyboard-first while compatibility assets remain explicitly reachable.
- Browser smoke covers the real user path and keyboard-capable selectors, not only source assertions.

