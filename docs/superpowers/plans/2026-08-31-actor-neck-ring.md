# UAL2 Actor Neck Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the UAL2 outer neck render as a continuous same-hue light highlight in animation and drama 3D previews while preserving the existing body, joints, skeleton, and animation behavior.

**Architecture:** Repair the two checked-in UAL2 GLBs once at the resource boundary by splitting the known outer-neck triangles from M_Main into a new M_Neck primitive. Keep runtime material assignment backward-compatible: M_Main receives the actor color, while M_Joints and M_Neck receive the existing lightened joint material. The repair script is deterministic and fail-closed for unknown geometry signatures.

**Tech Stack:** Node.js CommonJS resource tooling, glTF/GLB JSON and binary chunks, TypeScript material policy, Vitest/node tests, pnpm checks, Codex in-app browser.

---

## File map

- Create: scripts/animation/repair_ual2_neck_material.cjs — deterministic GLB splitter and exported geometry helpers.
- Create: scripts/animation/repair_ual2_neck_material.test.cjs — resource-transform tests using the real UAL2 files and synthetic failure cases.
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.ts — add the M_Neck role and shared highlight classification.
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialRuntime.ts — route both joint and neck roles to the light material.
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts — preserve the public material-policy facade export.
- Existing: client/src/pages/models/modelLibrary3d/modelMaterials.ts — the normalized material resolver already maps declared material names; no source change is needed once the UAL2 map declares M_Neck.
- Modify: client/src/config/modelLibrary.ts — declare the static UAL2 M_Neck tint.
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialAsset.test.mjs — assert both real UAL2 resources contain a complete neck partition.
- Modify: client/src/pages/animations/animationPreviewApp.test.mjs — assert the shared runtime policy exposes and uses the neck role.
- Modify: docs/wiki/product/model-library.md — record the durable UAL2 material-boundary rule.
- Modify: docs/releases/release-notes.md — record the user-visible highlight result.
- Modify: README.md — refresh the latest user-facing update entry.
- Create outside the repository: a verified timestamped backup of both original GLBs before replacement.

## Task 1: Commit the approved design and plan

- [x] **Step 1: Commit the design document**

Run:

~~~text
git add docs/superpowers/specs/2026-08-31-actor-neck-ring-design.md
git commit -s -m "docs: define UAL2 neck ring highlight"
~~~

Expected: one signed commit containing only the design document.

- [x] **Step 2: Commit this implementation plan**

Run:

~~~text
git add docs/superpowers/plans/2026-08-31-actor-neck-ring.md
git commit -s -m "docs: plan UAL2 neck ring highlight"
~~~

Expected: one signed commit containing only this plan.

## Task 2: Add the failing resource contract

**Files:**
- Create: scripts/animation/repair_ual2_neck_material.test.cjs
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialAsset.test.mjs

- [x] **Step 1: Write tests against the required resource result**

The CommonJS test must import the transformer helpers and inspect both real inputs. It must require exactly one M_Neck material, a body primitive with M_Main, a neck primitive with M_Neck, disjoint body/neck triangle sets covering the original M_Main triangles, unchanged M_Joints, unchanged skeleton/animation counts, and all 16 angular bins represented by neck triangle centroids. Add one synthetic or cloned-input assertion that a changed vertex/index signature throws before writing an output.

The existing client asset test must make the same assertions at the browser-facing asset paths so future resource edits cannot silently regress either checked-in GLB.

- [x] **Step 2: Run the focused tests and verify the expected RED state**

Run:

~~~text
node --test scripts/animation/repair_ual2_neck_material.test.cjs
node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialAsset.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs
~~~

Expected: the new resource assertions fail because the current GLBs do not yet contain M_Neck; no failure should be caused by a syntax or path error.

## Task 3: Implement the fail-closed GLB repair tool

**Files:**
- Create: scripts/animation/repair_ual2_neck_material.cjs

- [x] **Step 1: Implement parsing and signature validation**

Expose helpers for parsing a GLB, reading accessors, classifying triangles, splitting indices, and serializing a GLB. Require the known UAL2 signature: one Mannequin mesh with M_Main and M_Joints, 3389 M_Main vertices, 17196 original M_Main indices, and 65 bones. Reject non-GLB input, malformed JSON/BIN chunks, already-repaired input unless explicitly enabled, and mismatched signatures with descriptive non-zero CLI errors.

- [x] **Step 2: Implement deterministic neck selection**

Use the bind-pose M_Main positions and select triangles whose centroid is in the known neck band y = 1.485 through 1.595, and whose vertices all satisfy radial distance <= 0.17 and absolute x <= 0.17. Require non-empty selection, at least one selected triangle near both vertical boundaries, and all 16 atan2(z, x) angular bins. Keep original triangle order in each output index list.

- [x] **Step 3: Implement GLB serialization without rewriting animation data**

Reuse the original vertex attribute accessors for both M_Main and M_Neck. Append aligned index bufferViews/accessors for body-only and neck-only indices, clone the M_Joints PBR material as M_Neck, replace the original body index accessor, append the M_Neck primitive, and update only the JSON and BIN chunk lengths. Preserve nodes, skins, animations, and the original M_Joints primitive exactly.

- [x] **Step 4: Run the new unit/resource tests**

Run:

~~~text
node --test scripts/animation/repair_ual2_neck_material.test.cjs
~~~

Expected: all transformer tests pass, including complete angular coverage and fail-closed behavior.

## Task 4: Back up and repair both checked-in UAL2 resources

**Files:**
- Modify: client/public/anims/cine57/UAL2_UE_Anims.glb
- Modify: client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb

- [x] **Step 1: Create and verify an external backup**

Create a timestamped directory below C:/Users/su/AppData/Local/Temp, copy client/public/anims/cine57/UAL2_UE_Anims.glb and client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb into it, then record file size and SHA-256 for each source and backup. Stop if either copy is missing or the hashes differ.

- [x] **Step 2: Generate repaired outputs outside tracked paths**

Run the transformer into C:/Users/su/AppData/Local/Temp/actor-neck-ring-output-<timestamp>:

~~~text
node scripts/animation/repair_ual2_neck_material.cjs client/public/anims/cine57/UAL2_UE_Anims.glb C:/Users/su/AppData/Local/Temp/actor-neck-ring-output-<timestamp>/UAL2_UE_Anims.glb
node scripts/animation/repair_ual2_neck_material.cjs client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb C:/Users/su/AppData/Local/Temp/actor-neck-ring-output-<timestamp>/UAL2_Standard.glb
~~~

Parse both outputs with the resource test and compare their node, skin, animation, and original M_Joints counts against the backups before replacing tracked files.

- [x] **Step 3: Replace only the two validated resources**

Copy the validated temporary outputs over the two exact GLB paths. Do not delete the backups. Re-run the resource tests and inspect the binary-only diff with git status.

## Task 5: Apply the shared runtime and static model-library material policy

**Files:**
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.ts
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialRuntime.ts
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts
- Existing: client/src/pages/models/modelLibrary3d/modelMaterials.ts (verified without modification)
- Modify: client/src/config/modelLibrary.ts

- [x] **Step 1: Extend the material-role contract**

Add BLOCKING_3D_NECK_MATERIAL_NAME = M_Neck and a neck role. Classify the trimmed, case-insensitive M_Neck name as neck and retain M_Joints compatibility. Keep the public facade export stable.

- [x] **Step 2: Route neck and joints to the same highlight material**

Change material application so only main uses the actor color; joints and neck use the existing lightened material. Ensure repeated setEntityMaterial calls update both roles and old resources without M_Neck continue to work.

- [x] **Step 3: Declare static preview tint**

Add M_Neck to the UAL2 model-library material map with the same light-blue tint used for the existing joint highlight. Ensure the static model-material resolver maps it explicitly instead of falling back to purple/default.

- [x] **Step 4: Run focused TypeScript and policy tests**

Run the existing actor-material and model-library focused checks plus the client typecheck command defined by package scripts. Expected: no TypeScript errors, policy tests pass, and the real-resource test remains green.

## Task 6: Update durable project documentation and release surfaces

**Files:**
- Modify: docs/wiki/product/model-library.md
- Modify: docs/releases/release-notes.md
- Modify: README.md

- [x] **Step 1: Add the durable wiki rule**

Document that UAL2 has separate M_Main, M_Joints, and M_Neck material boundaries; both animation and standard GLBs must be repaired together; the repair tool must fail closed on signature changes; and runtime highlight routing remains shared across animation and drama viewers.

- [x] **Step 2: Update user-facing release surfaces**

Add a concise current-date release note and update README latest-update text to describe the continuous neck highlight in the 3D character preview. Do not mention internal file names, test names, or change-history narration in user-facing copy.

- [x] **Step 3: Run documentation consistency checks**

Review the diff against the design and plan, check that release notes preserve prior entries, and confirm README latest update links to the release history without duplicating old date blocks.

## Task 7: Self-test the complete user path

- [x] **Step 1: Run all focused automated checks**

Run the transformer tests, real-resource asset tests, actor material tests, model-library gate, and the narrowest client typecheck/build check covering the touched imports. Expected: exit code 0 and no known-failing test.

- [x] **Step 2: Run the required built-in browser smoke**

Using the Codex in-app browser, open the animation preview at /animations/unreal-daily-male-locomotion-idle-break-01 and the drama 3D preview at /drama/studio/cmt0z2mgy0012zsb5d716mkzj/scenes/cmt2z8y8700027sb5i4bt8cvs/states/initial-bloodhorn-hunt/3d?returnStage=assets&returnAssetTab=scenes. Verify the model renders, inspect front/side/back views, confirm the outer neck remains a continuous light band, and capture screenshots. Record console and network errors; a clean smoke requires none attributable to this change. Close only the test tab.

- [x] **Step 3: Perform self-acceptance**

Re-read the design and user requirement against the diff. Confirm the neck is a material partition rather than a camera-only effect, both resources are covered, old resources remain compatible, and no unrelated files or worktrees were changed.

## Task 8: Commit and integrate

- [ ] **Step 1: Commit the feature branch**

After the self-test gate passes, stage only the intended source, resource, test, and documentation files and run:

~~~text
git commit -s -m "fix: render UAL2 neck highlight as full ring"
~~~

Expected: signed commit with no unrelated changes.

- [ ] **Step 2: Integrate, push, and verify from clean main**

From the clean main workspace run:

~~~text
pnpm workflow:integrate codex/actor-neck-ring --push --verify "<focused verification command>"
git status --short
git rev-parse HEAD
git rev-parse origin/main
git worktree list --porcelain
~~~

Expected: integration verification passes, main is clean, and HEAD equals origin/main.

- [ ] **Step 3: Clean up only this completed worktree**

Run:

~~~text
pnpm workflow:cleanup codex/actor-neck-ring
pnpm git:worktree-prune
~~~

Preserve every other user-owned worktree and report the verified backup path and final local/remote status.
