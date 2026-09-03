# Model Preview Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Cine57 模型导入中的 alpha 丢失问题，并让每个静态模型在进入发布目录前都必须通过真实详情页预览和材质质量门禁。

**Architecture:** 保留 `scripts/models/textureAlpha.mjs` 作为 alpha 规则的纯函数边界，修正仓库外 FBX→GLB 构建器对 `execFile` stdout 的读取；在仓库内把视觉审核契约改为所有静态条目必需真实详情页证据，并由现有总质量门禁校验资源哈希。全量复核只发布通过的目录条目，异常产物用精确清单移到仓库外的可恢复隔离目录。

**Tech Stack:** Node.js ESM tests, PlayCanvas model detail viewer, FFmpeg/ffprobe, Cine57 FBX→GLB external builder, TypeScript/Vite client, PowerShell file/hash verification.

---

### Task 1: 固定 alpha 探测的失败回归

**Files:**
- Modify: `scripts/models/textureAlpha.mjs`
- Test: `scripts/models/textureAlpha.test.mjs`
- External operational file: `C:\Users\su\AppData\Local\Temp\fbx2gltf-test\build-library-v3.cjs`

- [ ] **Step 1: Write the failing test**

在 `scripts/models/textureAlpha.test.mjs` 导入一个新的 `parseFfprobePixelFormat` 纯函数，并增加 `execFile` 结果形状回归测试：传入 `{ stdout, stderr }` 时必须从 `stdout` 解析出 `rgba`。保留现有 `YMIN=...`、`YMIN:...`、缺失统计和 normal/RMA 测试；测试还要断言解析出的 RGBA 与 `YMIN=0` 会选择 `png`。

```js
test("execFile 的 stdout JSON 形状不会让 RGBA 探测静默回退", () => {
  const execFileResult = { stdout: JSON.stringify({ streams: [{ pix_fmt: "rgba" }] }), stderr: "" };
  const pixelFormat = parseFfprobePixelFormat(execFileResult);
  assert.equal(pixelFormat, "rgba");
  assert.equal(
    getTextureOutputExtension({
      pixelFormat,
      ffmpegOutput: "lavfi.signalstats.YMIN=0",
    }),
    "png",
  );
});
```

- [ ] **Step 2: Run the focused test to verify the baseline and capture the current bug**

Run: `pnpm exec node --test scripts/models/textureAlpha.test.mjs`

Expected: the new test fails because `parseFfprobePixelFormat` does not exist yet. This is the required red phase; do not weaken the test by parsing `execFileResult.stdout` inline.

- [ ] **Step 3: Implement the minimal operational fix**

Create a dated external backup before editing the builder, verify the backup exists and has the same SHA-256, then add the tested parser to `scripts/models/textureAlpha.mjs` and change the ffprobe parse in `build-library-v3.cjs`:

```js
const out = await run("ffprobe", ["-v", "quiet", "-show_streams", "-of", "json", src]);
const json = JSON.parse(out.stdout);
```

Also replace the local alpha decision branch with the tested rule semantics: if `pix_fmt` is alpha-capable, run `alphaextract,signalstats,metadata=print`; preserve PNG when the minimum is missing or below `254`; force JPG only for normal/RMA buckets. Do not alter the external builder until the backup hash check succeeds.

- [ ] **Step 4: Re-run alpha tests and probe the three known source images**

Run: `pnpm exec node --test scripts/models/textureAlpha.test.mjs`

Run `ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of json` and `ffmpeg -hide_banner -i <source> -vf alphaextract,signalstats,metadata=print -f null -` for `D:\UnrealWorkspace\Cine57-exported3\tex\_Props_Suburban_Household_VOL12_Decor_Textures_TX_Plants_Plastic_Set_01a_ALB.TX_Plants_Plastic_Set_01a_ALB_baseColor.png` and `D:\UnrealWorkspace\Cine57-exported6\tex\_Enviroments_NorthernIsle_Textures_T_MeadowPlants_BC_O.T_MeadowPlants_BC_O_baseColor.png`; use `D:\UnrealWorkspace\Cine57-exported3\tex\_Enviroments_Mountain_Environment_Set_Foliage_Textures_T_grass_02_BC_M.T_grass_02_BC_M_baseColor.png` as the retained-control image.

Expected: tests pass; the plant and `SM_Grass_a` source images report `rgba` and `YMIN=0`; the builder’s `probeAlpha` returns true for those sources when exercised.

- [ ] **Step 5: Commit the coherent alpha fix**

Run: `git add scripts/models/textureAlpha.mjs scripts/models/textureAlpha.test.mjs && git commit -s -m "fix: preserve alpha in model texture import"`

The external builder backup and edit remain outside Git; record their exact paths and hashes in the implementation notes/wikified debugging entry, not in the application repository.

### Task 2: Make real detail-page preview evidence mandatory

**Files:**
- Modify: `scripts/models/modelLibraryVisualReview.mjs`
- Test: `scripts/models/model-library-visual-review.test.mjs`
- Modify: `scripts/models/model-library-visual-review.json`
- Modify: `scripts/models/modelLibraryQuality.mjs` only if the updated evidence contract needs a narrow error propagation change

- [ ] **Step 1: Write failing contract tests**

Add tests proving that a published static entry with `standard-thumbnail-audit-*` and no `preview` is rejected, and that a preview hash mismatch is rejected. Keep the existing detail-evidence test and use a complete `preview` record with the concrete route `/models/desk-set-01a`, a 64-character SHA-256, `model-detail-v1`, a date, and `textureStatus`.

```js
test("普通缩略图证据不能替代真实详情页预览", () => {
  const entry = MODEL_LIBRARY.find((candidate) => candidate.id === "desk-set-01a");
  assert.ok(entry);
  const review = getVisualReviewById(entry.id);
  assert.ok(review);
  const errors = validateModelVisualReview({
    library: [entry],
    reviews: [{ ...review, reviewEvidence: "standard-thumbnail-audit-2026-09-02", preview: undefined }],
  });
  assert.ok(errors.some((error) => error.includes("actual 3D preview evidence")));
});
```

- [ ] **Step 2: Run the focused visual-review test and verify it fails**

Run: `pnpm exec node --test scripts/models/model-library-visual-review.test.mjs`

Expected: the new test fails because the current validator only requires preview when the evidence prefix is `model-preview-audit-`.

- [ ] **Step 3: Implement the mandatory preview rule**

Change `validatePreviewEvidence` so every published static review requires a complete preview object; remove the conditional `requiresPreview` branch. Require `reviewEvidence` to use the `model-preview-audit-` prefix, require all preview fields, require `previewPath === /models/${review.id}`, require a valid SHA-256, and compare it with `assetSha256ById` when supplied. Keep error messages stable enough for focused tests and keep non-static filtering unchanged.

- [ ] **Step 4: Generate real preview evidence from the product viewer**

Use the built-in IAB on the worktree’s client lane to visit `/models`, then each published static model’s `/models/<id>` detail route. For every entry, wait for the 3D canvas to render under the shared HDRI, inspect the final frame for broken geometry, opaque atlas blocks, black triangles, missing textures, white collision shells, and incorrect material color, and record pass/fail plus the actual asset hash. Do not use the delete control.

For entries that fail, write an exact quarantine candidate record containing ID, filename, reason, evidence date, GLB hash, and all catalog texture hashes. For entries that pass, populate the `preview` object in `model-library-visual-review.json` with the actual route, hash, renderer, date, and texture status. Do not assign a pass record without seeing the final detail-page frame. The review JSON is generated evidence, not a substitute for the browser audit.

- [ ] **Step 5: Run the visual-review tests after updating the generated evidence**

Run: `pnpm exec node --test scripts/models/model-library-visual-review.test.mjs`

Expected: all published static entries have approved detail-page evidence, every preview hash matches the current GLB and catalog textures, and the negative tests reject missing or stale evidence.

- [ ] **Step 6: Commit the preview contract and evidence**

Run: `git add scripts/models/modelLibraryVisualReview.mjs scripts/models/model-library-visual-review.test.mjs scripts/models/model-library-visual-review.json && git commit -s -m "fix: require real model preview evidence"`

### Task 3: Identify and quarantine current bad assets safely

**Files:**
- Modify: `scripts/models/model-library-selection.json`
- Modify: `scripts/models/modelLibraryPolicy.mjs` only through generated policy inputs if needed
- Modify: `client/src/config/modelLibrary.ts` through `curate-cine57-library.mjs`, never by hand
- Modify: `client/src/config/modelLibraryUsage.ts` through the curator if the removed IDs are referenced there
- Create: external quarantine manifest under `D:\UnrealWorkspace\Cine57-model-quality-quarantine-20260902-preview\`
- External assets: move only explicitly confirmed bad published GLB/texture files into the same quarantine directory

- [ ] **Step 1: Write the quarantine safety test/fixture**

Extend `scripts/models/model-library-quality.test.mjs` to assert that the precise quarantine entries are not published, repo-local quarantined files remain in the repository, external quarantine entries have `location: "external"` plus a manifest record and are absent from the published catalog, and no unrelated orphan is ignored. Preserve the existing exact ID/file-name binding tests.

- [ ] **Step 2: Run the focused quality test to verify the new quarantine case fails**

Run: `pnpm exec node --test scripts/models/model-library-quality.test.mjs`

Expected: the new assertion identifies the current `plants-plastic-set-01a` and `grass-tuft-a` published entries as not yet quarantined, while existing repo-local quarantine fixtures continue to pass.

- [ ] **Step 3: Create and verify a recoverable backup manifest**

Before moving anything, create the exact external quarantine directory `D:\UnrealWorkspace\Cine57-model-quality-quarantine-20260902-preview\` and a manifest containing source path, destination path, file size, SHA-256, model ID, filename, reason, and evidence date. Verify every source file exists, every destination is outside the repository, and every manifest hash is non-empty and matches the source. Do not use recursive deletion or broad globs.

- [ ] **Step 4: Move only confirmed bad outputs**

Move the old broken JPG/GLB outputs for `plants-plastic-set-01a` and `grass-tuft-a` to the verified quarantine directory, then hash the moved files and compare them to the manifest. If the corrected rebuild passes the real preview, it may receive a new published output; otherwise it remains quarantined. Do not move `grass-02-a-1`, whose PNG/opacity preview is currently valid.

- [ ] **Step 5: Update the explicit selection/quarantine policy and regenerate the catalog**

Record the old broken outputs as external quarantine artifacts first. Add `location: "external"` only for assets that still fail after corrected re-import; an asset that passes the corrected detail preview may be republished under its existing ID while its old broken artifact remains in the external manifest. Run `node --experimental-strip-types scripts/models/curate-cine57-library.mjs --apply-review-only` from the worktree with the verified generated review data, then inspect the diff to ensure every failing entry is excluded and no unrelated files were removed.

- [ ] **Step 6: Run focused quality verification**

Run: `pnpm exec node --test scripts/models/model-library-quality.test.mjs scripts/models/modelLibraryTextureAudit.test.mjs`

Expected: the catalog excludes the quarantined IDs, all remaining GLBs and texture paths are valid, no unsupported names or dangling references exist, and unrelated orphan files still fail the gate.

- [ ] **Step 7: Commit the safe quarantine policy**

Run: `git add scripts/models/model-library-selection.json scripts/models/modelLibraryPolicy.mjs client/src/config/modelLibrary.ts client/src/config/modelLibraryUsage.ts scripts/models/model-library-quality.test.mjs && git commit -s -m "chore: quarantine invalid model previews"`

### Task 4: Rebuild the alpha-sensitive assets and close the material contract

**Files:**
+ Modify: `scripts/models/modelLibraryTextureAudit.mjs` for the narrowly missing final-format/opacity assertion and import-audit manifest loading
- Test: `scripts/models/modelLibraryTextureAudit.test.mjs`
- Modify: generated `client/src/config/modelLibrary.ts` and `scripts/models/model-library-visual-review.json` after rebuilding
- External operational file: corrected `C:\Users\su\AppData\Local\Temp\fbx2gltf-test\build-library-v3.cjs`

- [ ] **Step 1: Write failing texture-contract tests**

Add tests for a material whose baseColor is a `.jpg` but whose import audit metadata says the source had meaningful alpha; assert rejection unless an explicit independent opacity map/scalar is present. Add a passing fixture for `.png` baseColor mapped to the same `.png` opacity path. Keep the existing GLB material binding tests. The fixture must exercise the same metadata shape that the production import audit will consume.

- [ ] **Step 2: Run the focused texture test to verify the contract catches alpha loss**

Run: `pnpm exec node --test scripts/models/modelLibraryTextureAudit.test.mjs`

Expected: the new alpha-loss fixture fails before implementation because the current contract has no final-format/source-alpha assertion.

- [ ] **Step 3: Implement the narrow final-format contract**

Encode the corrected import result in a dedicated JSON manifest at `scripts/models/model-library-import-audit.json`, keyed by published model/material/role. Extend the texture audit to consume that manifest and reject a meaningful-alpha source that is represented by JPG without an independent opacity mapping. Do not infer alpha from filenames or add model-name-specific branches. Unknown or failed source probing must be recorded as `preserveAlpha: true`, never as an opaque pass.

- [ ] **Step 4: Rebuild only the two affected source assets first**

Using the corrected external builder and the verified source manifests `_manifest_batch3.jsonl` and `_manifest_batch6.jsonl`, regenerate `SM_Plants_Plastic_Set_01a` and `SM_Grass_a` baseColor outputs from the exact source files listed in Task 1. Confirm both remain PNG, the catalog maps baseColor and opacity correctly, and normal/RMA remain JPG. Preserve all non-alpha assets until the focused outputs pass.

- [ ] **Step 5: Re-run the actual detail routes**

In IAB, open `/models/plants-plastic-set-01a` and `/models/grass-tuft-a` if they are republished, wait for the final canvas, and inspect the frame. The expected result is leaf/grass silhouettes with transparent atlas backgrounds and no black triangles or rectangular planes. Update preview hashes only after the frame is verified.

- [ ] **Step 6: Run focused material and model tests**

Run: `pnpm exec node --test scripts/models/modelLibraryTextureAudit.test.mjs scripts/models/model-library-quality.test.mjs scripts/models/model-library-visual-review.test.mjs`

Expected: all corrected outputs satisfy texture existence, material mapping, alpha semantics, GLB structure, and preview hash checks.

- [ ] **Step 7: Commit the rebuilt asset metadata and gate**

Run: `git add scripts/models/modelLibraryTextureAudit.mjs scripts/models/modelLibraryTextureAudit.test.mjs client/src/config/modelLibrary.ts scripts/models/model-library-visual-review.json && git commit -s -m "fix: enforce alpha-safe model materials"`

### Task 5: Full library self-test, browser smoke, documentation, and release notes

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Create or modify: `docs/wiki/debugging/model-preview-alpha-and-import-gate.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md` latest-update section if the repository convention requires it
- Test: existing model library test commands and client typecheck

- [ ] **Step 1: Document durable debugging knowledge**

Record the `execFile` `{ stdout, stderr }` parsing failure, the difference between GLB `alphaMode` and source texture alpha, the mandatory detail-page evidence rule, the exact quarantine/restore process, and the diagnostic order. Keep the wiki explanatory and stable rather than listing only changed files.

- [ ] **Step 2: Run the complete model-library checks**

Run: `pnpm test:model-library`

Run: `pnpm check:model-library`

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: all commands exit `0`; the quality check reports no published orphan, missing texture, stale preview hash, unsupported GLB name, or missing detail evidence.

- [ ] **Step 3: Perform the required IAB browser smoke**

Use the worktree’s `server/.env` lane and built-in IAB only. Visit `/models`, confirm the published model count/category tabs and pagination render, open a normal textured model and each corrected alpha-sensitive model, verify the final 3D canvas and key controls (`聚焦`, `复位视角`, bounds checkbox) without clicking `删除模型`, and collect console errors. Capture screenshots of the model list and corrected model details as evidence.

- [ ] **Step 4: Review the final diff and release metadata**

Run: `git diff --check`, `git status --short`, and `git diff --stat main..HEAD`; inspect all generated catalog/review/import-audit changes for scope. Update release notes and README latest update for the user-visible model-import quality behavior; do not add a changelog entry to the wiki.

- [ ] **Step 5: Commit documentation and final metadata**

Run: `git add docs/wiki/product/model-library.md docs/wiki/debugging/model-preview-alpha-and-import-gate.md docs/releases/release-notes.md README.md && git commit -s -m "docs: document model preview import gate"`

- [ ] **Step 6: Run the self-acceptance gate**

Compare the final diff against every requirement in `docs/superpowers/specs/2026-09-02-model-preview-quality-gate-design.md`: alpha preserved, real preview mandatory, current bad models isolated/recoverable, normal grass retained, no runtime crop fallback, tests/browser smoke documented. Leave the branch unmerged if any acceptance item lacks evidence.

---

## Execution Notes

- Work only in `D:\Github\AI-Novel-Writing-Assistant-model-preview-quality-gate`; never switch the main workspace branch.
- Preserve all other existing worktrees and their running services.
- Use `git commit -s` for every coherent unit. Do not use `--no-verify`.
- Asset moves are explicitly authorized only for confirmed bad model outputs and require the verified external manifest/hash before movement.
- After all checks pass, integrate through `pnpm workflow:integrate codex/model-preview-quality-gate --push --verify "pnpm test:model-library && pnpm check:model-library && pnpm --filter @ai-novel/client typecheck"`, then remove only this fully merged worktree with `pnpm workflow:cleanup` and verify local/remote `main` equality.
