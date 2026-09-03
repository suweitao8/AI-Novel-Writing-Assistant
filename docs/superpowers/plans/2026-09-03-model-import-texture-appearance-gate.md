# 模型导入颜色贴图准入门禁实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阻止缺少真实 Base Color 的灰模进入模型库，并清理当前已确认的 17 个同类模型。

**Architecture:** 在已有 `inspectGlb` 与统一准入模块之间增加基于材质名的占位 Base Color 检查。质量门禁、暂存发布门禁和未来导入流程共同调用同一准入结论；当前资产用显式策略拒绝并由历史台账记录，源文件保持可恢复。

**Tech Stack:** Node.js ESM、Node test runner、GLB JSON inspection、Cine57 manifest JSONL、TypeScript/React model catalog。

---

### Task 1: Encode the failing gray-material case

**Files:**
- Modify: `scripts/models/model-library-import-admission.test.mjs`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] **Step 1: Write the failing test**

Add an inspection fixture with a `1×1` embedded Base Color texture and an entry whose only material declaration is the neutral fallback tint. Assert that `evaluateModelCandidate()` returns `failureStage: "texture"` and `reasonCode: "missing-base-color-texture"`. Add a second assertion with the same GLB evidence and a matching catalog `baseColor` path; it must not fail for the new reason.

- [ ] **Step 2: Run the focused test and verify the failure is real**

Run:

```text
pnpm exec node --experimental-strip-types --test scripts/models/model-library-import-admission.test.mjs
```

Expected before implementation: the new missing-color assertion fails because the current admission result is accepted.

- [ ] **Step 3: Add a regression assertion for the real asset shape**

Use `inspectGlb(fs.readFileSync(...))` on `SM_Axe_Black_01.glb` and assert that its `MI_Axe_Black_01` Base Color evidence is embedded `1×1`; this anchors the test to the observed import failure rather than only a synthetic fixture.

### Task 2: Implement the shared color-source admission rule

**Files:**
- Modify: `scripts/models/modelLibraryImportAdmission.mjs`
- Modify: `scripts/models/modelLibraryQuality.mjs`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [ ] **Step 1: Implement normalized material matching**

Add a local material-name normalizer matching the client runtime (`lowercase` and remove non-alphanumeric characters). For every inspected material with an embedded Base Color whose dimensions are `1×1` or unreadable, find the matching catalog material and require a non-empty `baseColor` path.

- [ ] **Step 2: Return a stable admission failure**

When no matching real `baseColor` exists, return:

```text
{ accepted: false, failureStage: "texture", reasonCode: "missing-base-color-texture", summary: "..." }
```

Run the focused admission and quality tests. Expected: the new test passes, while existing entries with valid external Base Color bindings remain accepted by this check.

- [ ] **Step 3: Verify the published catalog cannot retain a bad placeholder asset**

Run `pnpm check:model-library` before curating the current list and confirm it reports the new `missing-base-color-texture` failure for the known bad entries. This proves the quality gate observes the same root cause as the focused test.

### Task 3: Curate and record all current missing-color models

**Files:**
- Modify: `scripts/models/model-library-selection.json`
- Regenerate: `client/src/config/modelLibrary.ts`
- Regenerate: `client/src/config/modelLibraryUsage.ts`
- Regenerate: `scripts/models/model-library-import-history.json`
- Regenerate: `scripts/models/model-library-preview-browser-audit.json`
- Regenerate: `scripts/models/model-library-visual-review.json`
- Modify: `scripts/models/model-library-import-audit.json`

- [ ] **Step 1: Add the 17 explicit texture rejections**

Record the IDs listed in the design document with `reasonCode: "missing-base-color-texture"`, `failureStage: "texture"`, and evidence `model-texture-audit-2026-09-03`. Keep the entries asset-specific; do not add a broad axe/flag keyword rule.

- [ ] **Step 2: Regenerate the catalog and prune stale evidence**

Run:

```text
pnpm exec node --experimental-strip-types scripts/models/curate-cine57-library.mjs --apply-review-only
```

Expected: the static catalog decreases from 462 to 445; the role entry remains independent; source GLBs remain on disk and the removed IDs disappear from usage and preview/visual evidence.

- [ ] **Step 3: Rebuild the durable history with explicit source manifests**

Run the history generator with `_manifest_batch3.jsonl`, `_manifest_model_expansion.jsonl`, `_manifest_batch5.jsonl`, `_manifest_batch6.jsonl`, and `_manifest_batch6b.jsonl`. Expected: 484 records remain, with 445 approved and 39 rejected records; the 17 affected records append a rejected texture event instead of being silently overwritten.

### Task 4: Update durable documentation and release-facing notes

**Files:**
- Create: `docs/wiki/debugging/model-import-texture-appearance-gate.md`
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Modify: `.agents/skills/unreal-import/SKILL.md`

- [ ] **Step 1: Document the root cause and diagnosis path**

Record the distinction between a loadable GLB, an embedded `1×1` placeholder, a real catalog Base Color binding, and a visually accepted preview. Include the stable error code and the source-manifest evidence path.

- [ ] **Step 2: Document the publish rule**

State that a candidate with missing color evidence cannot enter the formal catalog and that the converter remains a staging tool. Add the user-visible catalog count and rejection behavior to release-facing notes without changing historical entries.

### Task 5: Verify end to end and deliver

**Files:**
- No additional source files.

- [ ] **Step 1: Run the focused and full checks**

Run `pnpm test:model-library`, `pnpm check:model-library`, `pnpm typecheck`, `pnpm check:docs-manifest`, and `git diff --check`. Expected: all pass; quality gate reports 446 total entries (445 static + 1 role).

- [ ] **Step 2: Run built-in browser smoke on the worktree lane**

Use the worktree API/client ports from `server/.env`. Visit `/models`, a representative valid detail page, search for `斧头` and `旗帜`, and try `/models/axe-01` and `/models/asian-flag-01`. Expected: list and valid detail load without console/network errors; rejected routes return to the catalog and no rejected card is displayed.

- [ ] **Step 3: Self-accept, sign, integrate and push**

Review the diff against the design, stage only this unit, run `git commit -s`, then use `pnpm workflow:integrate codex/model-import-texture-appearance-gate --push --verify "pnpm test:model-library"`. Verify clean `main`, `HEAD == origin/main`, and remove only this merged worktree and branch.
