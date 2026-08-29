# 动画预览工作台 Implementation Plan

> For agentic workers: execute this plan task-by-task with executing-plans or subagent-driven-development. Every checkbox is a required step.

Goal: 将动画卡片改为独立 HDR 3D 预览页，支持播放、时间轴精确定位、截图作为预览帧，并让分镜 3D 草图复用同一份 UAL2 动画资源。

Architecture: 扩展现有 PlayCanvas 动画运行时，复用模型库的 HDR 布光与摄影棚穹顶；新增独立页面和浏览器关键帧存储模块。动画目录继续是静态数据，关键帧覆盖保存在当前浏览器。

Tech stack: React 19, React Router, PlayCanvas 2.21, Tailwind semantic tokens, lucide-react, Node test, TypeScript/Vite.

---

## 文件边界

- Create: client/src/pages/animations/AnimationPreviewPage.tsx — 独立预览页布局、控制栏、时间轴和关键帧动作。
- Create: client/src/pages/animations/animationPreviewStorage.ts — 版本化浏览器关键帧读写、清除和订阅。
- Create: client/src/pages/animations/animationPreviewStorage.test.mjs — 关键帧存储真实行为测试。
- Create: client/src/pages/animations/AnimationPreviewPage.test.mjs — 页面、路由和交互契约测试。
- Modify: client/src/pages/animations/animationPreviewApp.ts — HDR 场景、统一 GLB、播放暂停、时间定位、取景和截图 API。
- Modify: client/src/pages/animations/AnimationLibraryPage.tsx — 去掉 Dialog，卡片改为详情页链接并优先读取用户关键帧。
- Modify: client/src/pages/animations/animationThumbnailStudio.ts — 升级默认缩略图缓存版本并避让用户关键帧。
- Modify: client/src/config/animationLibraryContent.test.mjs — 验证统一 GLB 中的分镜基础动作。
- Modify: client/src/pages/animations/animationPreviewApp.test.mjs — 更新运行时、HDR、页面和截图契约。
- Modify: client/src/router/index.tsx — 注册 animations/:animationId 懒加载路由。
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts — 统一分镜角色资源地址。
- Modify: client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts — 只加载统一容器并从中取得角色和动画。
- Modify: docs/wiki/product/model-library.md — 记录动画工作台、关键帧缓存和共享资源边界。
- Modify: docs/releases/release-notes.md and README.md — 记录用户可见能力。

## Task 1: 关键帧存储契约

Files: animationPreviewStorage.ts and animationPreviewStorage.test.mjs.

- [x] Step 1: Write a failing test.

Use an in-memory localStorage and dynamically import the module after installing globalThis.window. Test writing and reading dataUrl/timeSeconds/updatedAt, rejecting malformed data, clearing an entry, and notifying subscribers. The test must call these exports: STORAGE_KEY, getAnimationKeyframe, setAnimationKeyframe, clearAnimationKeyframe, subscribeAnimationKeyframes.

    test("关键帧写入后可读回截图和时间", () => {
      const saved = setAnimationKeyframe("walk-forward", "data:image/jpeg;base64,abc", 0.42);
      assert.equal(saved.dataUrl, "data:image/jpeg;base64,abc");
      assert.equal(saved.timeSeconds, 0.42);
      assert.equal(getAnimationKeyframe("walk-forward").dataUrl, saved.dataUrl);
    });

- [x] Step 2: Run the test and verify the expected failure.

    node --experimental-strip-types --test client/src/pages/animations/animationPreviewStorage.test.mjs

Expected: failure because the module and exports do not exist.

- [x] Step 3: Implement the minimal storage module.

Use a module-level Map, lazy JSON loading, and the key animation-library:keyframes:v1. Validate image data URLs and finite non-negative times. Catch JSON and quota errors so memory state remains usable. Persist ISO timestamps and notify listeners after successful writes or clears.

- [x] Step 4: Run the same test and verify all storage tests pass.

- [x] Step 5: Commit with git commit -s -m "feat: persist animation preview keyframes".

## Task 2: 可控 HDR 动画场景运行时

Files: animationPreviewApp.ts and animationPreviewApp.test.mjs.

- [x] Step 1: Add failing source-contract assertions for setupStudioLighting, upgradeStudioEnvironment, attachStudioBackdrop, setTime, getDuration, capturePreviewFrame, fitView and resetView. Also assert the old UAL1 animation URL is absent.
- [x] Step 2: Run node --experimental-strip-types --test client/src/pages/animations/animationPreviewApp.test.mjs and confirm the new assertions fail.
- [x] Step 3: Extend the runtime API with play, pause, setTime, getTime, getDuration, isPlaying, fitView, resetView and capturePreviewFrame. Add onTimeChange and initialTimeSeconds options.

Use one UAL2 container for the model and all tracks. Remove the camera SKYBOX layer, reuse model-library studio lighting and backdrop, and dispose asynchronous HDR handles on cancellation. Track activeStateCurrentTime as the source of truth. setTime clamps to the real track duration, pauses the layer, renders the selected pose, and reports the new time. Use computeSourceBounds for ground placement and fitView. Return a bounded JPEG data URL for the preview frame.

- [x] Step 4: Run the focused runtime test and verify all tests pass.

    node --experimental-strip-types --test client/src/pages/animations/animationPreviewApp.test.mjs

- [x] Step 5: Commit with git commit -s -m "feat: add HDR animation preview controls". The runtime shipped with the animation preview workspace feature commit.

## Task 3: 独立动画预览页面与卡片导航

Files: new AnimationPreviewPage.tsx and AnimationPreviewPage.test.mjs; modify AnimationLibraryPage.tsx, router/index.tsx, and animationThumbnailStudio.ts.

- [x] Step 1: Write failing source-contract tests.

Require animation cards to use a Link to /animations/ plus the entry id, require no Dialog or openAnimationPreview in the library page, require the detail page to use useParams, data-animation-preview-page, an accessible animation timeline, setTime, setAnimationKeyframe and capturePreviewFrame, and require the route animations/:animationId.
- [x] Step 2: Run the new page test and confirm it fails before the final route/test contract is in place.
- [x] Step 3: Implement the page.

Render a model-editor-like full-height page with a back bar, large canvas card, metadata/control card, responsive narrow-screen stacking, loading state, invalid-id redirect, retry/return error state, and disabled controls before viewer readiness. Use Button, Badge, Card, Link, Navigate and lucide-react only.

Own currentTime, duration, playing, keyframe and saving state. The range input uses min 0, max duration, step 0.01, a visible time label, focus styling and keyboard support. Play/pause calls the viewer API. The preview-frame action captures the current canvas, writes it through setAnimationKeyframe, updates the side preview and emits toast.success; failures use toast.error. Provide clear-keyframe, focus-view and reset-view actions.

Cards resolve image as keyframe data first and default thumbnail second. Subscribe to both stores and only enqueue default generation when neither is present. Change the default thumbnail cache key from animation-library:thumbnails:v2 to v3.

- [x] Step 4: Run the page tests and client typecheck; expect all focused page tests to pass and typecheck exit 0.

    node --experimental-strip-types --test client/src/pages/animations/AnimationPreviewPage.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs
    pnpm --filter @ai-novel/client typecheck

- [x] Step 5: Commit with git commit -s -m "feat: add animation preview workspace".

## Task 4: 分镜 3D 草图统一使用 UAL2 动画资源

Files: blocking3dViewerCore.ts, blocking3dViewerApp.ts, animationLibraryContent.test.mjs and animationPreviewApp.test.mjs.

- [x] Step 1: Add a failing content assertion that the published GLB includes the actual Cine57 clips A_INP_Idle, A_INP_WalkFwd_Loop and A_chair_loop01; add a source assertion that the blocking viewer does not reference UAL1_Standard.glb.
- [x] Step 2: Run the content/source tests and confirm the source assertion fails against the old two-asset loader.
- [x] Step 3: Change the blocking actor URL to /anims/cine57/UAL2_UE_Anims.glb. Remove the second animation asset load and collect resource.animations from the same container used for instantiateRenderEntity. Keep the existing semantic pose resolver and static-frame behavior; add explicit asset-clip compatibility entries for the published Cine57 names, without a UAL1 fallback.
- [x] Step 4: Run the resource, pose, runtime and typecheck commands from the plan; all must pass.
- [x] Step 5: Commit with git commit -s -m "feat: share UAL2 animation asset with blocking viewer". The resource unification shipped with the animation preview workspace feature commit.

## Task 5: 文档、发布说明与静态检查

Files: docs/wiki/product/model-library.md, docs/releases/release-notes.md and README.md.

- [x] Step 1: Add durable wiki guidance for the independent HDR animation page, shared UAL2 GLB, static pose sampling in blocking, versioned local keyframes, and HDR/localStorage fallback.
- [x] Step 2: Add a single 2026-08-30 release-notes entry describing independent preview, timeline selection and screenshot preview frame. Refresh only the newest README latest-update block.
- [x] Step 3: Run git diff --check, all focused animation/page/storage/resource/pose/HDR tests, and pnpm --filter @ai-novel/client typecheck. No whitespace errors or focused failures are allowed.
- [ ] Step 4: Commit with git commit -s -m "docs: document animation preview workflow".

## Task 6: 浏览器自测、审查与交付

- [ ] Step 1: Confirm fixed local services on ports 3100 and 5174. Use an isolated Playwright CLI session and temporary output/playwright artifacts; do not change ports or touch unrelated processes.
- [ ] Step 2: Verify animations -> click a card -> independent /animations/idle-stand page -> HDR backdrop and shadow -> GLB request 200 -> play/pause -> timeline seek freezes the corresponding pose -> set preview frame shows success and side preview -> return shows the saved card image -> reload preserves it. Repeat one walk or sit clip and capture desktop/narrow screenshots. Inspect console/network. If a real project shot is available, verify blocking 3D initializes with the shared UAL2 resource and standing/walking/sitting poses.
- [ ] Step 3: Run the final shared build, focused tests, client typecheck and git status gate. Expected: all focused tests pass, typecheck exits 0, and the worktree contains only intended committed changes.
- [ ] Step 4: Request code review with design doc, plan, base SHA and final SHA. Fix all Critical/Important findings and rerun the gate.
- [ ] Step 5: From clean main run check:workspace-integrity, workflow:integrate codex/animation-preview-page --push --verify with the focused test command, then workflow:cleanup codex/animation-preview-page. Verify main/origin SHA equality, clean status, and preserve all other worktrees.

## Plan self-review

Every design requirement has a task: independent route, HDR scene, precise timeline, screenshot keyframe, card reuse, UAL2 sharing, loading/error/fallback states, tests, browser smoke, wiki and release surfaces. No server/database model is added because the chosen boundary is browser persistence for the built-in static library.
