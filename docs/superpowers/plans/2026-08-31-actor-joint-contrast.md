# 角色代理关节对比材质 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让分镜、动画预览和动画缩略图中的蓝色代理角色以浅色关节材质显示动作结构。

**Architecture:** 将纯颜色计算和材质槽识别放入 `blocking3d/materials/actorMaterialPolicy.ts`，将 PlayCanvas 材质复用与 mesh 槽位绑定放入同目录的运行时模块。`blocking3dViewerCore.ts` 继续作为兼容门面导出公共常量和 `setEntityMaterial`，现有三个调用方无需分叉。材质变化同步提升动画缩略图和关键帧缓存版本，避免旧单色图片继续覆盖新效果。

**Tech Stack:** TypeScript, PlayCanvas `StandardMaterial`, Node test runner, Vite, React 3D preview runtime.

---

### Task 1: 建立关节材质策略和失败测试

**Files:**
- Create: `client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.ts`
- Create: `client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.test.mjs`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs`

- [ ] **Step 1: Write the failing test**

为策略模块写真实行为测试：蓝色主色必须产生更亮的同色系关节色，`M_Joints` 大小写/空白变化必须识别为关节，其他材质名必须保持主体角色。同步把现有缓存契约改为新版本 `keyframes:v3` 与 `thumbnails:v8`，并增加对策略/运行时模块的公共材质契约断言。

```js
test("蓝色代理角色的关节颜色更亮且保留蓝色倾向", () => {
  const joint = getBlocking3dActorJointColor(BLOCKING_3D_BLUE_ACTOR_COLOR);
  assert.ok(joint.every((channel, index) => channel > BLOCKING_3D_BLUE_ACTOR_COLOR[index]));
  assert.ok(joint[2] > joint[1] && joint[1] > joint[0]);
});

test("只把 M_Joints 材质槽识别为关节", () => {
  assert.equal(getBlocking3dActorMaterialRole(" M_Joints "), "joints");
  assert.equal(getBlocking3dActorMaterialRole("M_Main"), "main");
  assert.equal(getBlocking3dActorMaterialRole(undefined), "main");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.test.mjs`

Expected: FAIL because `actorMaterialPolicy.ts` and its exported strategy functions do not exist yet.

### Task 2: 实现策略和 PlayCanvas 双材质绑定

**Files:**
- Create: `client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialRuntime.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerCore.ts`
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/index.ts`

- [ ] **Step 1: Implement the minimal policy**

实现 `BLOCKING_3D_BLUE_ACTOR_COLOR`、`getBlocking3dActorJointColor` 和 `getBlocking3dActorMaterialRole`。关节色按主色与白色混合 42%，并限制在 `[0, 1]`；材质名 trim 后以不区分大小写的 `m_joints` 判断。

- [ ] **Step 2: Implement runtime material binding**

`setEntityMaterial` 为主体材质和关节材质分别配置 `diffuse`、`metalness=0`、`useLighting=true`、`useSkybox=true`。首次遍历 mesh 时记录其原始材质角色，后续角色换色复用同一主体材质对应的关节材质；`M_Joints` 绑定浅色，其他槽位绑定主体色；不存在关节槽时全部使用主体色。

- [ ] **Step 3: Keep the core facade stable**

从 `blocking3dViewerCore.ts` 移出原先的单材质实现，改为从 `materials/actorMaterialRuntime.ts` 导出同名 `setEntityMaterial` 和蓝色主色常量；`index.ts` 继续通过 core 门面导出，分镜、动画预览和缩略图调用点保持同一入口。

- [ ] **Step 4: Update cache contracts**

把 `animationPreviewStorage.ts` 的关键帧键更新为 `animation-library:keyframes:v3`，把 `animationThumbnailStudio.ts` 的缩略图键更新为 `animation-library:thumbnails:v8`，让已有单色图片自然失效并重新生成。

- [ ] **Step 5: Run the focused tests**

Run: `node --experimental-strip-types --test client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs`

Expected: PASS with 0 failures, including the cache-version and shared-entrypoint contracts.

### Task 3: 文档和发布说明

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/product/model-library.md`

- [ ] **Step 1: Update user-facing release surfaces**

在最新更新和发布记录中说明蓝色代理角色的关节浅色区分，使用动作预览和分镜草图作为用户视角描述，不写内部实现过程。

- [ ] **Step 2: Update durable wiki rule**

在模型/动画库 wiki 的角色预览边界和动画缩略图规则中补充：主体与 `M_Joints` 共享材质策略，任何颜色或材质逻辑变化都必须提升缓存版本，三个预览入口保持一致。

- [ ] **Step 3: Check documentation**

Run: `pnpm check:docs-manifest` and `git diff --check`

Expected: documentation manifest passes and no whitespace errors are reported.

### Task 4: 工程检查和视觉验收

**Files:**
- Test: `client/src/pages/drama/comicDrama/components/blocking3d/materials/actorMaterialPolicy.test.mjs`, `client/src/pages/animations/animationPreviewApp.test.mjs`

- [ ] **Step 1: Run code checks**

Run: `pnpm --filter @ai-novel/shared build`, `pnpm --filter @ai-novel/client typecheck`, `pnpm --filter @ai-novel/client build`, and `pnpm test:model-library`.

Expected: all commands exit 0; build may retain existing Browserslist/chunk-size warnings but no compilation errors.

- [ ] **Step 2: Run browser smoke test**

Use the built-in browser against `http://127.0.0.1:5174/animations/unreal-daily-male-locomotion-idle-break-01` and an existing drama 3D blocking page. Confirm the character remains blue while hand/leg/torso joint sections are visibly lighter during animation, and inspect console logs for zero errors.

- [ ] **Step 3: Self-accept against the design**

Confirm the GLB file and skeleton were not changed, all three callers still use the shared facade, saved actor color changes update both material roles, and old cached keyframes/thumbnails cannot be reused under the new keys.

### Task 5: 交付

**Files:**
- Commit all intended source, test, documentation, spec, and plan changes on `codex/actor-joint-contrast`.

- [ ] **Step 1: Commit the coherent implementation**

Run: `git status --short`, `git diff --cached --check`, `git commit -s -m "Highlight actor joints in 3D previews"`

- [ ] **Step 2: Integrate and verify from main**

Run from the clean main checkout: `pnpm workflow:integrate codex/actor-joint-contrast --push --verify "pnpm test:model-library"`

- [ ] **Step 3: Verify and clean up**

Confirm `git rev-parse HEAD` equals `git rev-parse origin/main`, `git status --short` is empty, then run `pnpm workflow:cleanup codex/actor-joint-contrast`. Preserve all other active worktrees.
