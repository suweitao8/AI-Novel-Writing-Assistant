# 模型资产卡片缩略图 256px Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将模型库卡片缩略图统一为最长边不超过 256px 的 4:3 JPEG，淘汰旧尺寸缓存，保持无地面网格的干净画面，并让浏览器异步解码卡片图片。

**Architecture:** 继续复用 `thumbnailStudio.ts` 的单一离屏 PlayCanvas 渲染器，只把其画布、绘图缓冲、相机拟合和 JPEG 输出统一切换到 256×192；通过版本化 localStorage 键隔离已有 288×216 缓存。模型库卡片保留原有懒加载，额外声明异步图片解码；动画库和模型详情预览不修改。

**Tech Stack:** React + TypeScript + Vite, PlayCanvas, browser localStorage, Node.js `node:test`, pnpm workspace。

---

### Task 1: Lock the model-thumbnail contract with a failing test

**Files:**
- Create: `client/tests/modelThumbnailPerformance.contract.test.js`
- Read-only contract targets: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`, `client/src/pages/models/ModelLibraryPage.tsx`

- [ ] **Step 1: Write the failing contract test**

Create a Node test that reads the two source files and asserts the requested behavior:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const thumbnailSource = read("../src/pages/models/modelLibrary3d/thumbnailStudio.ts");
const pageSource = read("../src/pages/models/ModelLibraryPage.tsx");

test("模型卡片缩略图输出最长边不超过 256px 并保持 4:3", () => {
  const match = thumbnailSource.match(
    /const THUMBNAIL_SIZE = \{ width: (\d+), height: (\d+) \} as const;/,
  );
  assert.ok(match, "缩略图必须声明固定输出尺寸");
  const width = Number(match[1]);
  const height = Number(match[2]);
  assert.ok(width <= 256 && height <= 256, `缩略图尺寸 ${width}x${height} 超过 256px 上限`);
  assert.deepEqual([width, height], [256, 192]);
  assert.equal(width / height, 4 / 3);
});

test("模型缩略图缓存版本与卡片异步解码合同已升级", () => {
  assert.match(thumbnailSource, /model-library:thumbnails:v27/);
  assert.doesNotMatch(thumbnailSource, /model-library:thumbnails:v26/);
  assert.doesNotMatch(thumbnailSource, /buildBlocking3dGroundGridLines|drawBlocking3dGroundGrid/);
  assert.match(pageSource, /loading="lazy"/);
  assert.match(pageSource, /decoding="async"/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the old implementation**

Run from `D:\Github\AI-Novel-Writing-Assistant-model-thumbnail-256\client`:

```powershell
node --test tests/modelThumbnailPerformance.contract.test.js
```

Expected result: the size assertion fails because the current source is `288×216`; the cache assertion also fails because the current key is `model-library:thumbnails:v26`, and the page lacks `decoding="async"`.

### Task 2: Implement the bounded, cache-invalidated model thumbnail

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts:30-32`
- Modify: `client/src/pages/models/ModelLibraryPage.tsx:35-43`
- Modify: `client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs:109-117`
- Modify: `client/tests/modelPreviewLighting.contract.test.js:49-51`
- Modify: `client/tests/modelStudioEnvironment.contract.test.js:86-87`
- Modify: `client/tests/modelTextureQuality.contract.test.js:31-32`

- [ ] **Step 1: Change the single thumbnail output contract**

Replace the existing model-thumbnail constants with:

```ts
const THUMBNAIL_SIZE = { width: 256, height: 192 } as const;
const JPEG_QUALITY = 0.75;
const STORAGE_KEY = "model-library:thumbnails:v27";
```

Do not add a second size constant. Existing canvas dimensions, fixed PlayCanvas resolution, and `fitModelPreviewCamera` aspect-ratio calculation already read `THUMBNAIL_SIZE`, so the same 4:3 output contract reaches rendering and encoding.

- [ ] **Step 2: Enable asynchronous browser decoding on model cards**

Keep the existing `loading="lazy"` attribute and add the adjacent attribute to the model card image:

```tsx
loading="lazy"
decoding="async"
```

Do not change the card’s `aspect-[4/3]` layout or `object-cover` behavior.

- [ ] **Step 3: Verify the focused contract passes**

Run:

```powershell
node --test tests/modelThumbnailPerformance.contract.test.js
```

Expected result: both tests pass, proving the model renderer emits 256×192, uses v27, contains no grid draw call, and the card opts into lazy loading plus asynchronous decode.

- [ ] **Step 4: Update existing cache-version contracts**

Change the expected model key in `modelPreviewFraming.test.mjs`, `modelPreviewLighting.contract.test.js`, `modelStudioEnvironment.contract.test.js`, and `modelTextureQuality.contract.test.js` from `model-library:thumbnails:v26` to `model-library:thumbnails:v27`. Keep their older-version rejection assertions and all animation cache assertions unchanged.

### Task 3: Update durable documentation and user-facing release surfaces

**Files:**
- Already committed design: `docs/superpowers/specs/2026-08-31-model-thumbnail-256-design.md`
- Already committed plan: `docs/superpowers/plans/2026-08-31-model-thumbnail-256.md`
- Modify: `docs/wiki/architecture/model-preview-framing.md`
- Modify: `docs/wiki/product/model-library.md`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: Update the model-library wiki rule**

In the current thumbnail rule, change the model output description from `288×216` / `model-library:thumbnails:v26` to `256×192` / `model-library:thumbnails:v27`. Keep the animation values unchanged (`288×216` and `animation-library:thumbnails:v12`) because animation is outside this scope. Add that model card images use native lazy loading with asynchronous decode and that the 256px bound is chosen to match the maximum card width.

- [ ] **Step 2: Add a user-facing release-note entry under 2026-08-31**

Add one concise bullet explaining that model-library cards now use lightweight 256px-bounded previews, load offscreen images on demand, and keep the clean HDRI/model/shadow composition without editor grid lines.

- [ ] **Step 3: Refresh README’s latest update block**

Add the same user-facing capability to the existing `## 最新更新` → `### 2026-08-31` block without mentioning source files, cache keys, tests, or implementation history.

### Task 4: Run the self-test gate

**Files:**
- Test and build outputs only; do not commit generated artifacts.

- [ ] **Step 1: Run formatting and focused source contracts**

Run from the worktree root:

```powershell
git diff --check
node --experimental-strip-types --test client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs client/tests/modelThumbnailPerformance.contract.test.js client/tests/modelPreviewLighting.contract.test.js client/tests/modelStudioEnvironment.contract.test.js client/tests/scenePreviewEnvironmentUnification.contract.test.js
```

Expected result: no whitespace errors and all selected model-preview contracts pass.

- [ ] **Step 2: Run workspace typecheck and client build**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

Expected result: each command exits 0; the client build succeeds without changing ports or generated source files.

- [ ] **Step 3: Run the fixed-port browser smoke test**

Use the built-in browser against `http://127.0.0.1:5174/models` only if that port is serving this worktree’s feature build. Verify the model grid renders, inspect every loaded model-card `<img>` for `naturalWidth <= 256` and `naturalHeight <= 256`, confirm `loading="lazy"` and `decoding="async"`, capture a screenshot, and check browser console/network errors. If another worktree owns 5174, record its owning path and do not claim feature-specific visual proof.

### Task 5: Commit, integrate, push, and clean up

**Files:**
- All intentional changes from Tasks 1–3.

- [ ] **Step 1: Self-accept the diff and create a signed feature commit**

Confirm `git status --short` contains only the contract test, model thumbnail/card implementation, design/plan docs, wiki, release notes, and README. Then run:

```powershell
git add client/src/pages/models/modelLibrary3d/thumbnailStudio.ts client/src/pages/models/ModelLibraryPage.tsx client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs client/tests/modelThumbnailPerformance.contract.test.js client/tests/modelPreviewLighting.contract.test.js client/tests/modelStudioEnvironment.contract.test.js client/tests/modelTextureQuality.contract.test.js docs/superpowers/specs/2026-08-31-model-thumbnail-256-design.md docs/superpowers/plans/2026-08-31-model-thumbnail-256.md docs/wiki/architecture/model-preview-framing.md docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "perf: reduce model library thumbnail size"
```

- [ ] **Step 2: Restore main hooks and integrate with the required verification command**

From the clean main checkout, restore hooks with `pnpm setup:git-hooks`, run `pnpm check:workspace-integrity`, then run:

```powershell
pnpm workflow:integrate codex/model-thumbnail-256 --push --verify "pnpm --filter @ai-novel/client typecheck"
```

This performs the serialized no-fast-forward merge, signs the merge commit, pushes only `origin/main`, and reruns the focused client typecheck.

- [ ] **Step 3: Verify final refs and remove only this completed worktree**

Run `git status --short --branch`, compare `git rev-parse HEAD` with `git rev-parse origin/main`, inspect `git worktree list --porcelain`, and remove only `D:\Github\AI-Novel-Writing-Assistant-model-thumbnail-256` with the repository’s cleanup command after the merge is confirmed. Preserve the two pre-existing parallel worktrees.

## Self-review

- Spec coverage: output bound and 4:3 ratio are covered by Task 1; clean no-grid composition and cache invalidation are covered by Task 1 and Task 2; card loading performance is covered by the existing lazy attribute plus Task 2’s async decode; durable and user-facing documentation are covered by Task 3; verification and delivery are covered by Tasks 4–5.
- Scope: animation thumbnails, model details, HDRI rendering, and stored user data are explicitly unchanged.
- Placeholder scan: every task names exact files, code, commands, and expected results; there are no deferred TODOs.
- Type consistency: `THUMBNAIL_SIZE` remains an internal `as const` object consumed by canvas, fixed resolution, and camera aspect-ratio code; only its values and model cache key change.
