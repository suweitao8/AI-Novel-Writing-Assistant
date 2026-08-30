# Model Visual Naming and Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make model-library names derive from screenshot-confirmed visual identity, correct the confirmed ashtray entry, and make every catalog/detail preview use a stable three-quarter 45° view with approximately 80% subject occupancy.

**Architecture:** Keep stable model IDs and GLB filenames unchanged. Add a repo-owned visual-review manifest and validator as the semantic naming layer above the existing selection policy; require every published catalog entry to have an approved, binding review record. Add a renderer-independent AABB projection/framing module and use it from both thumbnail and detail-view code. Keep browser thumbnail caching, but bump its version when the framing contract changes.

**Tech Stack:** Node.js ESM test scripts, JSON policy data, TypeScript/React, PlayCanvas, Vitest-free Node test runner, Vite, Codex built-in browser smoke testing.

---

## Task 1: Establish failing tests for visual review coverage

**Files:**
- Create: `scripts/models/model-library-visual-review.test.mjs`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] Add tests that require an approved review for every curated catalog entry, reject an unknown ID, reject mismatched filename/mesh/name/category bindings, and assert `desk-set-01a` resolves to `烟灰缸` in `日用小物`.
- [ ] Add the visual-review test file to the `test:model-library` script or import it from the existing model-library test entrypoint.
- [ ] Run `pnpm test:model-library` and confirm the new tests fail because the review manifest/helper and semantic override do not exist yet.

## Task 2: Implement the visual-review manifest and import quality gate

**Files:**
- Create: `scripts/models/model-library-visual-review.json`
- Create: `scripts/models/modelLibraryVisualReview.mjs`
- Modify: `scripts/models/modelLibraryPolicy.mjs`
- Modify: `scripts/models/modelLibraryQuality.mjs`
- Modify: `scripts/models/curate-cine57-library.mjs`
- Modify: `scripts/models/model-library-selection.json`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] Record all 79 current catalog entries with stable ID, mesh name, filename, screenshot-confirmed semantic name/category, observable description, approved status, and review evidence.
- [ ] Correct `desk-set-01a` to `烟灰缸` / `日用小物` without changing its ID or GLB filename; add `日用小物` to the category policy.
- [ ] Export pure lookup and validation functions from `modelLibraryVisualReview.mjs` and make visual-review values the final catalog override while retaining existing policy values as compatibility data.
- [ ] Make the quality gate reject missing, duplicate, unapproved, or binding-mismatched review records, including entries produced by a future import.
- [ ] Make curation apply the review-derived name/category through the existing generated-catalog path; do not hand-edit `client/src/config/modelLibrary.ts`.
- [ ] Run `pnpm test:model-library` and `pnpm check:model-library`; confirm both pass against the current 79-model library.

## Task 3: Establish failing tests for the shared preview framing contract

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs`

- [ ] Add tests for standard 45° yaw, 25° downward pitch, 50° FOV, target occupancy `0.80`, and tolerance `[0.76, 0.84]`.
- [ ] Add projection tests for a wide flat box, a tall box, and a compact box using the AABB eight corners; assert finite camera distance and target occupancy within tolerance.
- [ ] Run the focused client test command and confirm it fails before the framing module exists.

## Task 4: Implement shared framing and wire thumbnails/detail view

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/modelPreviewFraming.ts`
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts`
- Modify: `client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs`

- [ ] Implement pure perspective projection over transformed AABB corners and a finite binary-search fit that targets 80% occupancy for the actual aspect ratio.
- [ ] Use the shared standard pose for thumbnail rendering and detail-view initial/reset framing; retain user orbit/zoom interactions after framing.
- [ ] Keep source bounds based on the existing transformed eight-corner calculation and normalize the model around its bottom center before fitting.
- [ ] Bump the thumbnail localStorage key from `model-library:thumbnails:v19` to `model-library:thumbnails:v20`.
- [ ] Run focused framing tests, client typecheck, and client build; fix any numerical or TypeScript regressions before continuing.

## Task 5: Regenerate and visually audit the current catalog

**Files:**
- Generated: `client/src/config/modelLibrary.ts`
- Review evidence: temporary local screenshot/contact-sheet artifacts outside the repository, unless a durable artifact is required by the existing model workflow.

- [ ] Run the non-destructive catalog generation/curation path so the generated catalog reflects the visual-review manifest and the new `日用小物` category.
- [ ] Open the model-library page in the Codex built-in browser and inspect the full contact sheet generated with the v20 framing rules.
- [ ] Open representative compact, tall, wide/flat, and large-model detail pages; verify the subject is centered, three-quarter, and approximately 80% of the frame.
- [ ] If a screenshot contradicts a manifest description, correct the manifest/policy entry and rerun the focused tests before marking it approved.
- [ ] Confirm no GLB, stable ID, or unrelated concurrent worktree content was modified.

## Task 6: Record durable project rules and user-facing release notes

**Files:**
- Create or modify: `docs/wiki/product/model-library.md`
- Create or modify: `docs/wiki/architecture/model-preview-framing.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] Document the durable rule that imported models need screenshot-based semantic review and that names cannot be inferred directly from English filenames.
- [ ] Document the shared 45°/25°/80% framing contract, AABB projection boundary, cache invalidation rule, and failure behavior for unreviewed assets.
- [ ] Update release notes and the README latest-update block with user-facing language only, following the readme-release-updater skill.

## Task 7: Self-test, review, commit, integrate, and clean up

- [ ] Run `pnpm check:workspace-integrity` from the clean main workspace before integration and confirm hooks/merge policy are valid.
- [ ] Run `pnpm test:model-library`, `pnpm check:model-library`, `pnpm --filter @ai-novel/client typecheck`, and `pnpm --filter @ai-novel/client build` in the task worktree.
- [ ] Run the required built-in-browser smoke path against `http://127.0.0.1:5174/models` and fixed API port `3100`; capture screenshots and verify no console errors.
- [ ] Review the diff against the requirement, stage only this task's files, and create a signed commit with `git commit -s`.
- [ ] Integrate with `pnpm workflow:integrate codex/model-visual-naming --push --verify "pnpm test:model-library && pnpm check:model-library"` from main.
- [ ] Verify final `main` status is clean, `HEAD` equals `origin/main`, and remove only this task's fully merged worktree/branch.
