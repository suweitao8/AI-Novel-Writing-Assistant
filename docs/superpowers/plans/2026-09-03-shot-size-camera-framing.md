# 分镜景别取景一致性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让近景、特写等自动构图生成的相机参数在 3D 编辑器和导出的分镜草图中保持有效，不再被编辑总览相机覆盖。

**Architecture:** 保留服务端按景别计算的 `layout3d.camera` 和前端独立 `shotCameraPose`。页面启动时只在没有布局时调用编辑器 `fitView()`；导出 PNG 时临时把编辑器主相机切换到场景摄像机机位，捕获结束后通过 `finally` 恢复编辑状态。

**Tech Stack:** React/TypeScript, PlayCanvas, Node.js built-in tests, Vite, local in-app browser.

---

### Task 1: 为布局加载和草图导出建立失败回归测试

**Files:**
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`
- Modify: `client/tests/dramaBlocking3dCamera.contract.test.js`

- [ ] **Step 1: 写页面启动回归测试**

在 `dramaBlocking3dPage.contract.test.js` 增加一个测试，读取 `DramaBlocking3DPage.tsx`，验证 `nextViewer.fitView()` 的启动调用只保留在 `layout.actors.length === 0` 的分支，并且在 `nextViewer.selectActor(null)` 后不再无条件调用 `nextViewer.fitView()`：

```js
test("打开已有 3D 布局时保留景别相机，不被编辑总览覆盖", () => {
  const nextViewerFitCalls = [...pageSource.matchAll(/nextViewer\.fitView\(\)/g)];
  assert.equal(nextViewerFitCalls.length, 1, "启动阶段只能保留无布局时的 fitView");
  assert.match(
    pageSource,
    /if \(layout\.actors\.length > 0\) nextViewer\.loadLayout\(layout\);\s*else nextViewer\.fitView\(\);/,
  );
  assert.doesNotMatch(
    pageSource,
    /nextViewer\.selectActor\(null\);\s*nextViewer\.fitView\(\);/,
  );
});
```

- [ ] **Step 2: 写导出相机回归测试**

在 `dramaBlocking3dCamera.contract.test.js` 增加一个测试，截取 `capturePng()` 实现，要求它保存编辑相机状态、使用 `shotCameraPose.position/yawDeg/pitchDeg` 设置捕获机位、使用 `cameraState.fovDeg`，并在 `finally` 中恢复：

```js
test("草图导出使用场景摄像机机位并恢复编辑相机", () => {
  const viewerSource = readFileSync(
    new URL(
      "../src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const captureStart = viewerSource.indexOf("capturePng() {");
  const captureEnd = viewerSource.indexOf("    destroy() {", captureStart);
  assert.ok(captureStart >= 0 && captureEnd > captureStart);
  const captureSource = viewerSource.slice(captureStart, captureEnd);
  assert.match(captureSource, /cameraEntity\.getPosition\(\)/);
  assert.match(captureSource, /cameraEntity\.getEulerAngles\(\)/);
  assert.match(captureSource, /shotCameraPose\.position/);
  assert.match(captureSource, /shotCameraPose\.yawDeg/);
  assert.match(captureSource, /shotCameraPose\.pitchDeg/);
  assert.match(captureSource, /cameraState\.fovDeg/);
  assert.match(captureSource, /finally \{/);
  assert.match(captureSource, /cameraEntity\.setPosition/);
  assert.match(captureSource, /cameraEntity\.setEulerAngles/);
});
```

- [ ] **Step 3: 运行测试确认先失败**

Run from the worktree root:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/dramaBlocking3dPage.contract.test.js tests/dramaBlocking3dCamera.contract.test.js
```

Expected: the new page test fails because the current startup code has two `nextViewer.fitView()` calls, and the new capture test fails because `capturePng()` currently renders the editor camera without applying `shotCameraPose`.

### Task 2: 修正布局加载与导出相机边界

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx:288-319`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts:934-948, 1417-1465`

- [ ] **Step 1: 让启动流程区分已保存布局和空白布局**

在创建 viewer 的 `try` 块中保存 `const hasSavedLayout = layout.actors.length > 0;`，使用它加载布局；注册监听器后保留 `nextViewer.selectActor(null);`，只在 `!hasSavedLayout` 时调用 `nextViewer.fitView()`。不要修改顶部“聚焦角色”按钮调用的 `viewer.fitView()`。

- [ ] **Step 2: 捕获期间切到场景摄像机**

在 `capturePng()` 开始处保存以下主相机状态：位置、欧拉角、FOV、近/远裁剪面、视口矩形、图层数组和实体 enabled 状态。关闭场景摄像机机身及取景小窗后，把主相机临时设置为：

```ts
cameraEntity.setPosition(new pc.Vec3(...shotCameraPose.position));
cameraEntity.setEulerAngles(shotCameraPose.pitchDeg, shotCameraPose.yawDeg, 0);
cameraComponent.fov = cameraState.fovDeg;
cameraComponent.rect = new pc.Vec4(0, 0, 1, 1);
cameraFrame.update();
```

继续使用现有 1280×720 resize、两次 render、PNG 编码和辅助对象隐藏逻辑；在 `finally` 中恢复保存的相机状态、`cameraFrame` 和所有辅助状态。恢复逻辑必须覆盖异常路径。

- [ ] **Step 3: 导出期间停止绘制摄像机辅助线**

把更新循环中的 `shotCamera.drawGizmo(app, cameraSelected)` 条件扩展为同时检查 `!shotCameraHelpersSuppressed`，保证捕获的两帧不会重新绘制摄像机线框；画中画构图线继续由既有 `preview.enabled` 条件控制。

- [ ] **Step 4: 运行新增回归测试确认变绿**

Run:

```powershell
pnpm --filter @ai-novel/client exec node --test tests/dramaBlocking3dPage.contract.test.js tests/dramaBlocking3dCamera.contract.test.js
```

Expected: all tests pass, including both new regression assertions.

### Task 3: 更新长期工作流规则和用户可见更新说明

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新工作流 wiki**

在“AI 相机意图与确定性构图解析”节补充稳定规则：编辑浏览相机可以被用户主动聚焦/导航，但已有 `layout3d` 加载不得再调用总览 `fitView()`；草图 PNG 必须由独立场景摄像机机位捕获，防止浏览相机覆盖景别。

- [ ] **Step 2: 更新 2026-09-03 release notes**

在已有 `### 2026-09-03` 下增加用户视角条目，说明漫剧 3D 草图现在会按近景/特写保持正确主体距离和画面占比，且保存的草图与取景相机一致。

- [ ] **Step 3: 刷新 README 最新更新块**

把 `README.md` 的 `## 最新更新` 空内容替换为只包含 `### 2026-09-03` 的一条面向用户的摘要，并保留指向完整 release notes 的链接；不要复制历史日期。

- [ ] **Step 4: 检查文档格式**

Run:

```powershell
pnpm check:docs-manifest
git diff --check
```

Expected: both commands exit 0 and wiki 不是变更列表，而是描述相机职责边界与故障避免规则。

### Task 4: 完成代码检查和真实 3D 页面回归

**Files:**
- Test: `client/tests/dramaBlocking3dPage.contract.test.js`
- Test: `client/tests/dramaBlocking3dCamera.contract.test.js`
- Test: `server/tests/dramaShotBlockingAutoPlanService.test.js`

- [ ] **Step 1: 运行客户端针对性测试**

```powershell
pnpm --filter @ai-novel/client exec node --test tests/dramaBlocking3dPage.contract.test.js tests/dramaBlocking3dCamera.contract.test.js tests/dramaShotBlockingSketchApi.test.js
```

Expected: targeted client tests pass with zero failures.

- [ ] **Step 2: 运行类型检查**

```powershell
pnpm --filter @ai-novel/client typecheck
```

Expected: TypeScript exits 0.

- [ ] **Step 3: 启动隔离 lane 并进行浏览器 smoke**

Read `server/.env` in the worktree for its provisioned `PORT=3125` and `CLIENT_PORT=5189`, start only this worktree's client/API processes, and open the local drama 3D sketch route in the built-in in-app browser. Use the existing project `cmt0z2mgy0012zsb5d716mkzj` and inspect a shot with `shotSize` “近景” and the next shots with “特写”. If the isolated API cannot read the existing project data, keep the smoke test read-only and use the runtime/source checks to verify the camera boundary rather than mutating the user's project or falling back to the shared main lane.

Verify the following actions and evidence:

1. Page loads without a connection error or console exception.
2. Existing layout opens with the saved camera composition; it does not jump to the all-actor overview.
3. The camera preview shows the close-up/near-shot subject occupying materially more of the 16:9 frame than the old overview.
4. Move the editor view away and inspect the camera preview/capture path; if an end-to-end save is needed for evidence, use only an isolated clearly marked test shot. Confirm the exported sketch still follows the scene camera rather than the editor view.
5. Network requests used by the page have no failed 4xx/5xx responses; capture a desktop screenshot of the corrected 3D sketch and the camera preview as evidence.

- [ ] **Step 4: Review requirements before commit**

Check that no database files were changed, the “聚焦角色” button remains an explicit manual editor action, existing layout loading no longer calls the overview fit, and the capture restore path is inside `finally`.

- [ ] **Step 5: Commit the coherent implementation**

```powershell
git status --short
git diff --check
git add client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts client/tests/dramaBlocking3dPage.contract.test.js client/tests/dramaBlocking3dCamera.contract.test.js docs/wiki/workflows/drama-blocking-3d.md docs/releases/release-notes.md README.md
git commit -s -m "fix: preserve shot size camera framing in blocking sketches"
```

Expected: the commit contains only this feature, with all self-tests completed before commit.
