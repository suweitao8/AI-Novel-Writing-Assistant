# 模型透明叶片双面渲染实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让草、花和其他带透明镂空贴图的模型从正反两面都能完整显示，同时保持普通不透明模型的背面剔除。

**Architecture:** 在模型库 3D 材质模块旁增加一个只负责设置 PlayCanvas `cull` 的渲染策略函数，以目录 `opacity` 映射作为双面信号。`modelMaterials.ts` 在创建共享 `StandardMaterial` 时调用该策略；详情页、缩略图和分镜前景继续通过同一入口获得一致行为。不会改写 GLB、贴图或模型目录数据。

**Tech Stack:** TypeScript, PlayCanvas 2.21, Node.js `node:test`, Vite/React。

---

### Task 1: 固化透明材质双面策略

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/modelMaterialPolicy.ts`
- Test: `client/src/pages/models/modelLibrary3d/modelMaterialPolicy.test.mjs`

- [x] **Step 1: Write the failing tests**

  Add tests that import the policy module, apply it to real PlayCanvas `StandardMaterial` instances, and require a non-empty `opacity` mapping to set `pc.CULLFACE_NONE`, while an absent, empty, or whitespace-only mapping sets `pc.CULLFACE_BACK`.

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";
  import * as pc from "playcanvas";

  import { applyModelMaterialCulling } from "./modelMaterialPolicy.ts";

  test("透明镂空贴图材质启用双面渲染", () => {
    assert.equal(
      (() => {
        const material = new pc.StandardMaterial();
        applyModelMaterialCulling(material, { opacity: "/models/cine57/tex/grass.png" });
        return material.cull;
      })(),
      pc.CULLFACE_NONE,
    );
  });

  test("没有有效透明贴图的材质保持单面渲染", () => {
    for (const info of [undefined, {}, { opacity: "  " }]) {
      const material = new pc.StandardMaterial();
      applyModelMaterialCulling(material, info);
      assert.equal(material.cull, pc.CULLFACE_BACK);
    }
  });
  ```

- [x] **Step 2: Run the tests and verify they fail for the missing policy**

  Run:

  ```powershell
  node --experimental-strip-types --test client/src/pages/models/modelLibrary3d/modelMaterialPolicy.test.mjs
  ```

  Expected: FAIL because `modelMaterialPolicy.ts` does not exist yet.

- [x] **Step 3: Implement the minimal policy**

  Create the module with a narrow input type and apply the actual PlayCanvas constants:

  ```ts
  import * as pc from "playcanvas";

  export interface ModelMaterialCullingInput {
    opacity?: string;
  }

  export function applyModelMaterialCulling(
    material: Pick<pc.StandardMaterial, "cull">,
    info: ModelMaterialCullingInput | undefined,
  ): void {
    const hasOpacity = typeof info?.opacity === "string" && info.opacity.trim().length > 0;
    material.cull = hasOpacity ? pc.CULLFACE_NONE : pc.CULLFACE_BACK;
  }
  ```

- [x] **Step 4: Run the focused tests and verify they pass**

  Run the same command. Expected: 2 tests pass with 0 failures.

### Task 2: Apply the policy at the shared PlayCanvas material boundary

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/modelMaterials.ts`

- [x] **Step 1: Wire the policy into `applyModelMaterials`**

  Import `applyModelMaterialCulling` and, while building each material, set the cull mode before `material.update()`:

  ```ts
  applyModelMaterialCulling(material, info);
  ```

  Keep the assignment scoped to the `opacity` signal; do not set `CULLFACE_NONE` on all materials and do not alter alpha cutoff or depth behavior.

- [x] **Step 2: Run focused tests and client typecheck**

  Run:

  ```powershell
  node --experimental-strip-types --test client/src/pages/models/modelLibrary3d/modelMaterialPolicy.test.mjs
  pnpm --filter @ai-novel/client typecheck
  ```

  Expected: focused tests pass and client typecheck exits 0.

### Task 3: Document the durable rendering rule and verify the real page

**Files:**
- Create: `docs/wiki/debugging/model-foliage-double-sided-rendering.md`
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [x] **Step 1: Add the debugging/wiki entry**

  Record the reproduction (`/models/wildflower-c`), root cause (shared material replacement restores PlayCanvas back-face culling), current rule (`opacity` means `CULLFACE_NONE`), affected consumers, and diagnosis steps. Keep it as durable debugging knowledge rather than a per-commit changelog.

- [x] **Step 2: Update product/release documentation**

  Add one concise model-library rule to the product wiki and one user-visible release-note/README latest-update entry describing complete front/back rendering for transparent foliage. Do not change import admission or model files.

- [x] **Step 3: Run the model and documentation checks**

  Run:

  ```powershell
  pnpm test:model-library
  pnpm check:model-library
  pnpm check:docs-manifest
  git diff --check
  ```

  Result: `check:model-library` passed with 448 entries, `check:docs-manifest` passed, and `git diff --check` reported no whitespace errors. The broader `pnpm test:model-library` command was also run, but its existing assertion that there is exactly one non-static role resource fails on both this worktree and clean `main` (`MODEL_LIBRARY` currently contains the intentional `ue5-manny`, `ue5-quinn`, and `ual2-college-student` entries); this baseline mismatch is outside the double-sided material change and is not altered here.

- [x] **Step 4: Browser smoke self-test**

  Start the worktree dev lane using its `server/.env` ports (`3130`/`5314`), then use Codex In-app Browser to:

  1. Open `/models/wildflower-c` and wait for the 3D view to finish loading.
  2. Capture the default view and rotate to the opposite side.
  3. Confirm both sides of the grass/flower cards remain visible and the page has no console errors or failed model/texture requests.
  4. Open `/models` and confirm the model list still renders.

  Stop only the worktree dev processes after the smoke test; do not touch the main lane `3100`/`5174`.

### Task 4: Self-accept and deliver

**Files:**
- Modify: `docs/superpowers/plans/2026-09-03-model-double-sided-foliage.md`

- [x] **Step 1: Review the diff against the design**

  Confirm the change is limited to the shared material boundary, applies to detail/thumbnail/foreground consumers, preserves ordinary culling, and does not alter assets or import admission.

- [x] **Step 2: Mark the plan complete and commit the coherent implementation**

  Mark all completed checkboxes, stage only this feature's files, run the commit hook, and create a signed-off commit:

  ```powershell
  git add -- client/src/pages/models/modelLibrary3d/modelMaterialPolicy.ts client/src/pages/models/modelLibrary3d/modelMaterialPolicy.test.mjs client/src/pages/models/modelLibrary3d/modelMaterials.ts docs/wiki/debugging/model-foliage-double-sided-rendering.md docs/wiki/product/model-library.md docs/releases/release-notes.md README.md docs/superpowers/plans/2026-09-03-model-double-sided-foliage.md
  git diff --cached --check
  git commit -s -m "fix: render foliage materials double-sided"
  ```

- [x] **Step 3: Integrate, push, and clean up**

  From the clean main workspace run `pnpm workflow:integrate codex/grass-double-sided-material --push --verify "pnpm test:model-library"`, verify `HEAD == origin/main`, remove only this merged worktree and branch, prune worktrees, and report the final checks.
