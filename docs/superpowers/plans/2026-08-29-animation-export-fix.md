# 动画导出姿态修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复动画库三段导入动作的姿态和骨盆位移，并让错误的动画资源在发布前自动失败。

**Architecture:** 将 UAL2 重定向逻辑收敛到 `scripts/animation/` 的独立命令行工具。工具以源骨架绑定姿态为基准计算世界旋转差，以源绑定姿态为基准传递根/骨盆的平移增量；客户端资源测试负责验证 GLB 格式和面向用户的动作语义，缩略图通过资源缓存版本自动更新。

**Tech Stack:** Python 3、glTF 2.0 GLB、Node.js `node:test`、PlayCanvas、Vite。

---

### Task 1: 固化当前错误的内容回归

**Files:**
- Create: `client/src/config/animationLibraryContent.test.mjs`
- Read: `client/src/config/animationLibrary.ts`
- Test: `client/src/config/animationLibraryContent.test.mjs`

- [x] **Step 1: Write the failing test**

测试解析动画采样器并重组节点世界姿态，覆盖三件事：待机左手必须低于左肩、坐姿骨盆相对绑定姿态的位移必须小于 `0.75`、行走双脚必须存在明显轨迹；同时检查所有导入动画的旋转 accessor 为 `VEC4` 单位四元数，且只指向 skin joints。

- [x] **Step 2: Run it to verify it fails**

Run:

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

Expected: FAIL，当前发布资源报告待机手部高度差约 `0.048`，并在修复首个断言后报告坐姿骨盆位移约 `1.610`。

- [x] **Step 3: Keep the assertions independent of the exporter implementation**

采样器测试只读取发布 GLB 的公开 glTF 数据，不导入 Python 工具，也不把当前错误输出当作基准；这样替换资源或更换导出器时仍能捕获用户可见的姿态回归。

- [x] **Step 4: Run the focused test after the resource replacement**

Run:

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

Expected: PASS，3 个子测试全部通过。

### Task 2: 收敛并修正 UAL2 重定向工具

**Files:**
- Create: `scripts/animation/retarget_ual2.py`
- Test: `scripts/animation/retarget_ual2.py` 的内置四元数自检，以及 Task 1 的发布资源回归
- Reference: `D:/UnrealWorkspace/gltf-tools/final_retarget.py`

- [x] **Step 1: Add an explicit CLI contract**

工具接受 `source.glb target.glb output.glb animation-name` 四个参数，读取源动画第一条 animation，向目标 GLB 追加同名片段；目标节点映射只从 `skins[].joints` 建立，禁止把 `Mannequin` 网格包装节点当作骨骼。

- [x] **Step 2: Preserve rotation data as VEC4**

写 accessor 时显式传入组件数，旋转使用 `4`、平移使用 `3`、时间使用 `1`；禁止从拍平后的数组重新推断组件数。每个输出旋转在写入前归一化，并执行相邻四元数半球连续化。

- [x] **Step 3: Use the correct world-space rest-pose formula**

对每个匹配骨骼使用世界绑定姿态差：

```python
desired_world = qmul(qmul(source_world, qconj(source_rest_world)), target_rest_world)
target_local = qnorm(desired_world if parent_world is None else qmul(qconj(parent_world), desired_world))
```

该方向把源动画从源绑定姿态产生的世界旋转增量应用到目标绑定姿态，避免不同骨架局部轴方向造成待机手臂仍保持 T 姿。

- [x] **Step 4: Transfer translation as a rest-relative delta**

根/骨盆平移不能使用 `target_rest * source_animation / source_rest` 的逐分量比例。对每个有源平移轨道的根/骨盆节点执行：

```python
scale = norm(target_rest_translation) / max(norm(source_rest_translation), 1e-6)
target_translation = target_rest_translation + scale * (source_animation_translation - source_rest_translation)
```

这样坐姿的源骨盆下降量会映射为目标骨盆下降量，不会把源坐标轴的绝对位置误写成目标深度偏移。

- [x] **Step 5: Correct the verifier to validate the same formula**

验证器比较目标重组后的世界四元数与 `desired_world`，而不是直接比较不同绑定骨架的 `source_world` 和 `target_world`；当最小绝对点积低于 `0.999` 时退出失败，并打印骨骼名。

### Task 3: 生成并发布修复后的 GLB

**Files:**
- Modify: `client/public/anims/cine57/UAL2_UE_Anims.glb`
- Preserve: `client/src/config/animationLibrary.ts` 的 id、分类、clipName 和时长

- [x] **Step 1: Generate isolated candidate outputs**

使用 Cine57 的三个原始源 GLB 和 UAL2 基础 GLB，分别运行：

```text
python scripts/animation/retarget_ual2.py D:/UnrealWorkspace/Cine57-exported/anims/A_INP_Idle.glb D:/UnrealWorkspace/Cine57-exported/anims/UAL2_UE_Base-DIAG.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMFIX-Idle.glb A_INP_Idle
python scripts/animation/retarget_ual2.py D:/UnrealWorkspace/Cine57-exported/anims/A_INP_WalkFwd_Loop.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMFIX-Idle.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMFIX-Idle-Walk.glb A_INP_WalkFwd_Loop
python scripts/animation/retarget_ual2.py D:/UnrealWorkspace/Cine57-exported/anims/A_chair_loop01.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMFIX-Idle-Walk.glb D:/UnrealWorkspace/Cine57-exported/anims/ANIMFIX-All.glb A_chair_loop01
```

将三个通过校验的片段合并回 UAL2 基础 GLB，只替换对应导入片段；不得修改网格、skin inverse bind matrices 或原有 43 段 UAL2 动画。

- [x] **Step 2: Verify the generated GLB before copying it into the worktree**

Run:

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
```

Expected: 待机、坐姿和行走语义断言通过，旋转输出仍全部为 `VEC4` 单位四元数。

- [x] **Step 3: Replace the tracked public asset only after verification**

复制验证通过的合并 GLB 到 `client/public/anims/cine57/UAL2_UE_Anims.glb`，用 `Get-FileHash -Algorithm SHA256` 记录新资源 hash，避免把未验证的中间文件加入提交。

### Task 4: 让预览缓存跟随资源更新

**Files:**
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts:30`
- Test: `client/src/pages/animations/animationPreviewApp.test.mjs`（补充缓存版本契约）

- [x] **Step 1: Write the cache-version assertion**

断言缩略图存储 key 不再使用旧的 `animation-library:thumbnails:v1`。

- [x] **Step 2: Bump the storage key**

把 key 更新为 `animation-library:thumbnails:v2`，让浏览器自动放弃旧的绑定姿态截图并重新生成三张缩略图；不增加面向用户的解释性文案。

- [x] **Step 3: Run focused client tests**

Run:

```text
pnpm --filter @ai-novel/client test
```

Expected: 客户端现有测试与动画内容测试全部 PASS。

### Task 5: 记录长期维护规则与用户可见更新

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`（仅刷新 `## 最新更新` 最新日期块）

- [x] **Step 1: Update the wiki**

补充源 UE 动画必须导出为绝对姿态、重定向旋转/平移公式、GLB 内容门禁和失败诊断顺序；只记录稳定规则，不写本次文件变更清单。

- [x] **Step 2: Update user-facing release surfaces**

用用户视角记录动画预览姿态修复和资源更新后缩略图自动刷新，不出现内部文件名、schema、测试名或实现过程描述。

### Task 6: Self-test and delivery

**Files:**
- Verify all changed files in the worktree

- [x] **Step 1: Run code-level checks**

```text
node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs
pnpm --filter @ai-novel/client test
pnpm --filter @ai-novel/client typecheck
git diff --check
```

- [x] **Step 2: Run browser smoke self-test**

Use an isolated Playwright session against `http://127.0.0.1:5174/animations`: clear only the animation thumbnail cache for the test session, open the animation library, wait for all three thumbnails, open each preview, capture screenshots, and confirm no page errors or failed GLB requests. Existing non-fatal Radix description warnings are recorded separately.

- [x] **Step 3: Self-accept the requirement**

Compare the diff and screenshots against the original request: idle no longer renders as T-pose, walk retains alternating legs, chair stays near the character instead of jumping along depth, and old thumbnails are not reused.

- [ ] **Step 4: Commit the coherent implementation**

```text
git add scripts/animation client/src/config/animationLibraryContent.test.mjs client/src/pages/animations/animationThumbnailStudio.ts client/src/pages/animations/animationPreviewApp.test.mjs client/public/anims/cine57/UAL2_UE_Anims.glb docs/wiki/product/model-library.md docs/releases/release-notes.md README.md
git commit -s -m "fix: correct animation export poses"
```

- [ ] **Step 5: Integrate and push**

From the clean main workspace, run:

```text
pnpm workflow:integrate codex/animation-export-fix --push --verify "node --experimental-strip-types --test client/src/config/animationLibraryContent.test.mjs"
```

Then verify `git status --short`, `git worktree list --porcelain`, and equality of local `main` with `origin/main`; remove only this fully merged worktree and branch.
