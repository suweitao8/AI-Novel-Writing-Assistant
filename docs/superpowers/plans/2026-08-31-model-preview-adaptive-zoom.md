# 模型预览自适应缩放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模型库 3D 预览的滚轮缩放不再受 HDRI 半径或固定 200 米远裁剪面的限制，并按模型实际显示尺寸适配近距离和远距离查看。

**Architecture:** 在模型库 3D 模块内新增纯计算模块，统一负责相机距离安全归一化和动态裁剪面；`modelViewerApp.ts` 只负责读取当前模型包围球、调用计算函数并把结果同步到 PlayCanvas 相机。HDRI 运行时仍只管理穹顶、环境光和地面网格，不参与相机缩放边界。

**Tech Stack:** React 19 + Vite、TypeScript、PlayCanvas、Node `node:test`（`--experimental-strip-types`）。

---

### Task 1: 为自适应相机规则写失败测试

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/modelViewerCamera.test.mjs`

- [ ] **Step 1: Write the failing tests**

写入以下测试，先从尚不存在的 `modelViewerCamera.ts` 导入函数，覆盖大模型远端、小模型近端、动态裁剪面和极端数值保护：

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  getModelViewerCameraClipPlanes,
  getModelViewerCameraMinimumDistance,
  normalizeModelViewerCameraDistance,
} from "./modelViewerCamera.ts";

test("模型相机远端不再被 15 米 HDRI 的旧边界截断", () => {
  const distance = normalizeModelViewerCameraDistance(8, 1);

  assert.equal(distance, 8);
  assert.ok(distance > 6.375);
});

test("小模型的最近距离按模型尺寸计算，而不是固定 0.2 米", () => {
  const minimum = getModelViewerCameraMinimumDistance(0.001);

  assert.ok(minimum < 0.2);
  assert.equal(normalizeModelViewerCameraDistance(minimum / 2, 0.001), minimum);
});

test("远裁剪面随相机距离和模型半径扩大，近裁剪面支持近距离查看", () => {
  const close = getModelViewerCameraClipPlanes(0.01, 0.001);
  const far = getModelViewerCameraClipPlanes(500, 25);

  assert.ok(close.nearClip < 0.05);
  assert.ok(far.farClip > 500 + 25);
  assert.ok(far.farClip > close.farClip);
});

test("相机距离出现非有限值时回到模型尺度内的安全值", () => {
  const distance = normalizeModelViewerCameraDistance(Number.POSITIVE_INFINITY, 2);

  assert.ok(Number.isFinite(distance));
  assert.ok(distance >= getModelViewerCameraMinimumDistance(2));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/models/modelLibrary3d/modelViewerCamera.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `modelViewerCamera.ts` has not been created yet.

### Task 2: 实现模型尺度相机计算模块

**Files:**
- Create: `client/src/pages/models/modelLibrary3d/modelViewerCamera.ts`
- Test: `client/src/pages/models/modelLibrary3d/modelViewerCamera.test.mjs`

- [ ] **Step 1: Implement the minimal pure functions**

实现以下契约：

```ts
export interface ModelViewerCameraClipPlanes {
  nearClip: number;
  farClip: number;
}

export function getModelViewerCameraMinimumDistance(modelRadius: number): number;
export function normalizeModelViewerCameraDistance(distance: number, modelRadius: number): number;
export function getModelViewerCameraClipPlanes(distance: number, modelRadius: number): ModelViewerCameraClipPlanes;
```

使用模型半径的比例作为最近距离（比例为 `0.0001`），仅用 `Number.EPSILON` 级别的保护防止零值；不要引入任何远端上限。非有限距离只作为数值异常处理，回退到模型半径约两倍的有限距离。裁剪面使用 `nearClip = min(0.05, distance * 0.05)` 并保留极小正数保护，`farClip` 至少覆盖 `distance + radius * 2`、`distance * 1.25` 和默认 200。

- [ ] **Step 2: Run the focused test and verify it passes**

Run the same command from Task 1. Expected: 4 tests pass, 0 fail.

### Task 3: 接入模型查看器并移除 HDRI 缩放边界

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts:1-450,525-548`
- Modify: `client/tests/modelStudioEnvironment.contract.test.js:50-70`

- [ ] **Step 1: Wire the pure functions into the viewer**

在 `modelViewerApp.ts` 导入三个相机函数，并把 `modelCenterY`、`modelRadius` 声明移动到首次调用 `syncCamera` 之前。新增 `getVisibleModelRadius()`，返回基础模型半径乘当前 `modelRoot` 缩放的绝对值。

把 `syncCamera` 的距离处理改为：

```ts
const modelDisplayRadius = getVisibleModelRadius();
const distance = normalizeModelViewerCameraDistance(cameraState.distance, modelDisplayRadius);
const clipPlanes = getModelViewerCameraClipPlanes(distance, modelDisplayRadius);
camera.nearClip = clipPlanes.nearClip;
camera.farClip = clipPlanes.farClip;
cameraState.distance = distance;
```

删除 `getCameraMaxDistance` 及所有对 `currentEnvironmentRadiusMeters * 0.85`、`0.2`、`0.25`、`0.35` 的相机距离上限/下限夹取。`fitCameraTo` 和 `onWheel` 都通过新的归一化函数与 `syncCamera` 工作；`setTransform` 完成模型变换后调用 `syncCamera()`，让改变模型缩放后立即刷新裁剪面。不要修改环境半径对穹顶和网格的现有用途。

- [ ] **Step 2: Update the structural contract test**

把模型查看器契约改为断言源码引用 `normalizeModelViewerCameraDistance`、`getModelViewerCameraClipPlanes`，并断言不存在 `getCameraMaxDistance` 与 `currentEnvironmentRadiusMeters * 0.85`；保留环境切换和共享穹顶断言。

- [ ] **Step 3: Run focused code checks**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/models/modelLibrary3d/modelViewerCamera.test.mjs
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test tests/modelStudioEnvironment.contract.test.js
pnpm --filter @ai-novel/client typecheck
```

Expected: the new camera tests, the updated environment contract, and client typecheck all pass. Existing unrelated baseline failures remain separately recorded and must not be attributed to this change.

### Task 4: 自测、文档和交付

**Files:**
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`
- Review: `docs/wiki/`（仅在发现新的长期架构规则时更新）

- [ ] **Step 1: Review the diff against the requirement**

确认模型预览的相机距离没有 HDRI 半径远端上限，近端按模型半径适配，远裁剪面会随距离变化，聚焦/复位仍调用原有 `fitView`/`resetView`。

- [ ] **Step 2: Run the UI self-test in the built-in browser**

在固定本地服务 `http://127.0.0.1:5174/models/<可用模型 id>` 打开模型预览，等待模型和中央广场 HDRI 完成；实际在画布上执行多次滚轮向下、向上，确认拉远后仍持续变化、拉近可继续变化，再点击“聚焦”和“复位视角”确认取景恢复。检查控制台无新增错误，并保存关键截图。若开发服务当前使用主工作树，先完成合入后再进行浏览器验证，确保验证的是最终主分支代码。

- [ ] **Step 3: Update user-facing release surfaces**

按 `readme-release-updater` skill 检查本次 Git 范围；在 2026-08-31 的 release notes 和 README 最新更新中记录“模型预览支持按模型尺寸持续缩放”，不写内部文件名、测试名或实现过程。如果该变更不产生新的长期架构知识，则不新增 wiki 页面，并在最终报告说明。

- [ ] **Step 4: Commit, integrate, push, and clean up**

在隔离工作树中执行 `git diff --check`、`git status --short`，确认只有本任务文件；使用 `git add` 精确暂存并执行 `git commit -s`。从干净主工作树执行：

```powershell
pnpm workflow:integrate codex/model-preview-unbounded-zoom --push --verify "pnpm --filter @ai-novel/client typecheck"
```

最后核对 `git status --short --branch`、`git log -1 --oneline`、`git ls-remote origin refs/heads/main` 和 `git worktree list --porcelain`，删除本次已合入的工作树和本地分支，不触碰其他工作树。
