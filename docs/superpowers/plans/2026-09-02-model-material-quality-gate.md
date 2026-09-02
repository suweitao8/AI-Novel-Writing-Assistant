# Model Material Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prevent GLB assets with missing material bindings or embedded 1×1 placeholder base-color textures from reaching the usable Cine57 model catalog, while preserving rejected files in a reversible quarantine list.

**Architecture:** Extend the existing renderer-independent GLB inspection and catalog texture contract. Every GLB material that declares a base-color texture must resolve to an explicit catalog material entry; an embedded 1×1 image without that override is reported as a placeholder failure. Add exact `quarantinedAssets` policy metadata and teach curation/orphan checks to accept only those files outside the published catalog. Regenerate the catalog so the 10 confirmed bad assets are unpublished and add the missing canoe material binding.

**Tech Stack:** Node.js ESM, Node built-in test runner, GLB 2.0 JSON/BIN parsing, TypeScript static catalog, JSON curation policy, pnpm scripts.

---

### Task 1: Lock the failing material contract in tests

**Files:**
- Modify: `scripts/models/modelLibraryQuality.test.mjs`
- Modify: `scripts/models/modelLibraryTextureAudit.test.mjs`

- [x] **Step 1: Add a 1×1 embedded PNG GLB fixture and assert inspection exposes it.**

Add a fixture material with `pbrMetallicRoughness.baseColorTexture.index = 0`, an embedded `data:image/png;base64,...` image, and a one-position mesh. Assert that `inspectGlb()` returns `hasBaseColorTexture: true`, `embedded: true`, `width: 1`, and `height: 1` for that material.

- [x] **Step 2: Add the failing catalog-contract assertion.**

Call `validateModelTextureContract()` with a material named `MI_Bad` and no `MI_Bad` catalog mapping. Expect the exact error shape to include the entry ID, the material name, and `embedded 1x1 baseColor placeholder`. Also assert that a material with a matching catalog tint or base-color mapping does not produce this error.

- [x] **Step 3: Run the focused tests and confirm RED before implementation.**

Run:

```text
node --experimental-strip-types --test scripts/models/modelLibraryQuality.test.mjs scripts/models/modelLibraryTextureAudit.test.mjs
```

Expected result: the new inspection/contract assertions fail because the implementation does not yet expose embedded image metadata or enforce unbound base-color materials.

### Task 2: Implement GLB material inspection and binding validation

**Files:**
- Modify: `scripts/models/modelLibraryQuality.mjs`
- Modify: `scripts/models/modelLibraryTextureAudit.mjs`

- [x] **Step 1: Parse embedded image dimensions without a renderer.**

Add a private reader in `modelLibraryQuality.mjs` that accepts a GLB image plus JSON/BIN data, handles a `data:` URI or image `bufferView`, recognizes PNG IHDR width/height, and returns `{ embedded, mimeType, width, height }`. Do not decode or rewrite assets. The reader must return `embedded: false` for external URIs and `width/height: null` for unsupported encodings.

- [x] **Step 2: Attach base-color metadata to `inspectGlb()`.**

For each material, keep the existing name/alpha fields and add `hasBaseColorTexture` plus `baseColorTexture` metadata resolved through `textures[].source` and `images[]`. Preserve the existing geometry, reference, and bounds behavior.

- [x] **Step 3: Enforce the catalog binding contract.**

Extend `validateModelTextureContract()` so every `glbMaterial.hasBaseColorTexture` material must have a normalized-name catalog mapping. If the resolved image is embedded and exactly 1×1, emit an error containing `embedded 1x1 baseColor placeholder`; otherwise emit an error containing `GLB baseColor material is missing catalog mapping`. Keep the current transparent-material and missing-file checks unchanged.

- [x] **Step 4: Pass inspected material metadata through the quality gate.**

Pass the enriched `inspection.materials` from `validateModelLibrary()` into the texture contract. Do not add a color-specific allowlist: the dimension-based rule must reject future placeholder colors as well.

- [x] **Step 5: Run focused tests and verify GREEN for the new contract.**

Run:

```text
node --experimental-strip-types --test scripts/models/modelLibraryQuality.test.mjs scripts/models/modelLibraryTextureAudit.test.mjs
```

Expected result: the fixture assertions pass; the real catalog may still fail until the quarantine policy and regenerated catalog are applied.

### Task 3: Add reversible quarantine policy and publish only validated entries

**Files:**
- Modify: `scripts/models/model-library-selection.json`
- Modify: `scripts/models/modelLibraryPolicy.mjs`
- Modify: `scripts/models/curate-cine57-library.mjs`
- Modify: `scripts/models/modelLibraryQuality.mjs`
- Modify: `scripts/models/model-library-quality.test.mjs`

- [x] **Step 1: Declare the exact quarantine records.**

Add `quarantinedAssets` records containing `id`, `fileName`, `reason`, and `evidence` for the 10 confirmed assets listed in `docs/superpowers/specs/2026-09-02-model-material-quality-gate-design.md`. Remove those IDs from `newAssets`; do not add a wildcard or filename-prefix rule. The canoe remains published after its explicit material mapping is added in Task 4.

- [x] **Step 2: Export validated quarantine sets from the policy module.**

Validate unique quarantine IDs and filenames, ensure they are not in `keepExistingIds` or `newAssets`, and export immutable `CINE57_QUARANTINED_ASSETS`, `CINE57_QUARANTINED_MODEL_IDS`, and `CINE57_QUARANTINED_MODEL_FILE_NAMES` values for curation and quality checks.

- [x] **Step 3: Allow only exact quarantined GLBs outside the catalog.**

Update curation and quality orphan checks so a top-level GLB is accepted outside the generated catalog only when its filename is in `CINE57_QUARANTINED_MODEL_FILE_NAMES`. Verify every declared quarantine file exists, is not published, and has no duplicate catalog filename. All other unknown/orphan GLBs remain errors.

- [x] **Step 4: Regenerate the catalog without deleting assets.**

Run:

```text
node --experimental-strip-types scripts/models/curate-cine57-library.mjs --apply-review-only
```

This must remove the 10 quarantined entries from `client/src/config/modelLibrary.ts` while retaining their GLB files. The normal curation path must also skip physical deletion for files listed in `quarantinedAssets`.

- [x] **Step 5: Add policy and catalog assertions.**

Assert that every quarantined ID is absent from `MODEL_LIBRARY`, every quarantine file still exists, no non-quarantine orphan is accepted, and the published static count/category rules remain valid.

### Task 4: Close the existing canoe material gap

**Files:**
- Modify: `scripts/models/model-library-selection.json`
- Regenerated: `client/src/config/modelLibrary.ts`
- Test: `scripts/models/model-library-quality.test.mjs`

- [x] **Step 1: Add the explicit duplicate-slot mapping.**

Under `materialOverrides.wooden-canoe-01`, add `M_dark_wooden_planks_3` with the same tint as `M_dark_wooden_planks` (`[0.42, 0.42, 0.45]`). This is a deterministic catalog override for the existing GLB material name, not a renderer fallback.

- [x] **Step 2: Re-run curation and assert complete base-color material coverage.**

Regenerate with `--apply-review-only`, then assert the canoe has no GLB base-color material without a normalized catalog mapping and that the published quality gate returns no errors.

### Task 5: Document the durable rule and user-visible result

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` only if its latest-update section requires a new user-visible entry

- [x] **Step 1: Update the model-library wiki.**

Document that material review checks the GLB’s actual base-color bindings and embedded image dimensions, and that invalid assets use an exact reversible quarantine record. Keep the entry as a durable workflow rule, not a per-file change log.

- [x] **Step 2: Update the user-facing release note.**

Describe that the model library now excludes assets whose materials cannot render reliably and keeps model previews from showing placeholder colors. Do not mention internal test names or implementation-only paths.

### Task 6: Run the self-test gate and inspect the diff

**Files:**
- All files changed above

- [x] **Step 1: Run the model-library test suite and curation check.**

Run:

```text
pnpm test:model-library
pnpm check:model-library
```

Expected result: both commands exit 0; `check:model-library` reports the published catalog count with no orphan or unresolved material errors.

- [x] **Step 2: Re-run a read-only full scan of all published GLBs.**

Confirm that every published GLB base-color material is mapped, no published GLB relies on an unbound 1×1 embedded image, the 10 quarantine files are not in `MODEL_LIBRARY`, and the canoe has complete coverage.

- [x] **Step 3: Review the diff and repository state.**

Run `git diff --check`, `git status --short`, and `git diff --stat`. Confirm only the material gate, quarantine policy, regenerated catalog, docs, and tests are changed; do not stage unrelated concurrent work.

- [x] **Step 4: Commit only after self-acceptance.**

Use a signed commit from this worktree:

```text
git add docs/superpowers/specs/2026-09-02-model-material-quality-gate-design.md docs/superpowers/plans/2026-09-02-model-material-quality-gate.md scripts/models/modelLibraryQuality.mjs scripts/models/modelLibraryTextureAudit.mjs scripts/models/modelLibraryPolicy.mjs scripts/models/curate-cine57-library.mjs scripts/models/model-library-selection.json scripts/models/model-library-quality.test.mjs scripts/models/modelLibraryTextureAudit.test.mjs client/src/config/modelLibrary.ts docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "fix: reject invalid model materials"
```

Do not commit until the focused tests, curation check, and self-acceptance review all pass.
