# Animation Frame Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将动画详情页、关键帧存储和动画卡片统一为真实采样率下的整数帧，并默认使用动作中点帧生成预览图。

**Architecture:** 新增无 UI 依赖的 `animationFrame` 领域工具，集中处理帧率、帧数、50% 默认帧及帧/秒换算。动画目录给旧 UAL2 和 Cine57 片段提供 30/24fps 元数据，PlayCanvas 运行时优先从 `AnimTrack.inputs` 校验采样率。详情页和离屏缩略图工作室都只通过帧工具定位动作，关键帧存储以帧为规范字段并兼容迁移旧秒值。

**Tech Stack:** React 19, TypeScript, PlayCanvas AnimTrack, Vite, Node `node:test`, localStorage。

---

### Task 1: 建立动画帧领域工具

**Files:**
- Create: `client/src/pages/animations/animationFrame.ts`
- Create: `client/src/pages/animations/animationFrame.test.mjs`

- [ ] **Step 1: Write the failing tests**

在 `animationFrame.test.mjs` 导入尚不存在的工具，覆盖以下明确合同：

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  clampAnimationFrame,
  frameToSeconds,
  getAnimationFrameCount,
  getDefaultAnimationFrame,
  inferAnimationFrameRate,
  secondsToFrame,
} from "./animationFrame.ts";

test("24fps 和 30fps 的总帧数包含 0 帧与末帧", () => {
  assert.equal(getAnimationFrameCount(1, 24), 25);
  assert.equal(getAnimationFrameCount(2.5, 30), 76);
});

test("默认预览帧是最后一帧的 50%", () => {
  assert.equal(getDefaultAnimationFrame(1, 24), 12);
  assert.equal(getDefaultAnimationFrame(2.5, 30), 38);
});

test("帧与秒换算会按片段边界裁剪", () => {
  assert.equal(frameToSeconds(-1, 24, 1), 0);
  assert.equal(frameToSeconds(99, 24, 1), 1);
  assert.equal(secondsToFrame(-1, 24, 1), 0);
  assert.equal(secondsToFrame(99, 24, 1), 24);
  assert.equal(clampAnimationFrame(4.6, 5), 5);
});

test("从 AnimTrack 的单值输入采样间隔推断真实帧率", () => {
  assert.equal(
    inferAnimationFrameRate({ inputs: [{ components: 1, data: [0, 1 / 24, 2 / 24] }] }, 30),
    24,
  );
  assert.equal(inferAnimationFrameRate({ inputs: [] }, 30), 30);
});

test("异常输入不会产生非有限帧值", () => {
  assert.equal(getAnimationFrameCount(Number.NaN, Number.POSITIVE_INFINITY), 1);
  assert.equal(getDefaultAnimationFrame(Number.NaN, 30), 0);
  assert.equal(secondsToFrame(Number.NaN, 30, 1), 0);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```text
node --experimental-strip-types --test client/src/pages/animations/animationFrame.test.mjs
```

Expected: FAIL because `animationFrame.ts` and its exports do not exist yet.

- [ ] **Step 3: Implement the minimal frame contract**

在 `animationFrame.ts` 实现以下无副作用函数：

```ts
export interface AnimationTrackTimingLike {
  inputs?: readonly {
    components?: unknown;
    data?: unknown;
  }[];
}

export const DEFAULT_ANIMATION_FRAME_RATE = 30;
export const DEFAULT_PREVIEW_FRAME_FRACTION = 0.5;

export function getAnimationFrameCount(durationSeconds: number, frameRate: number): number;
export function getDefaultAnimationFrame(durationSeconds: number, frameRate: number): number;
export function clampAnimationFrame(frame: number, lastFrame: number): number;
export function frameToSeconds(frame: number, frameRate: number, durationSeconds: number): number;
export function secondsToFrame(seconds: number, frameRate: number, durationSeconds: number): number;
export function inferAnimationFrameRate(track: AnimationTrackTimingLike, fallback: number): number;
```

具体实现规则：帧率只接受有限的正数并四舍五入到整数；总帧数为 `max(1, round(max(0, duration) * fps) + 1)`；默认帧为 `round((count - 1) * 0.5)`；`frameToSeconds`/`secondsToFrame` 先处理非法输入，再按 0 到末帧裁剪。推断帧率时从 `components === 1` 的 `data` 读取相邻正时间差，取中位数并将 `1 / delta` 四舍五入；没有有效采样时返回回退值。

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same command. Expected: 5 passing tests.

- [ ] **Step 5: Commit the frame utility**

```text
git add client/src/pages/animations/animationFrame.ts client/src/pages/animations/animationFrame.test.mjs
git commit -s -m "feat: add animation frame timing contract"
```

### Task 2: 将真实采样率纳入动画目录

**Files:**
- Modify: `client/src/config/animationLibrary.ts:64-180`
- Modify: `client/src/config/animationLibrary.test.mjs:15-80`

- [ ] **Step 1: Extend the directory contract and test it against the GLB**

在 `AnimationLibraryEntry` 增加 `readonly frameRate: number`。`makeLegacyEntry` 固定写入 30，`makeUnrealEntry` 固定写入 24。扩展现有 GLB 解析辅助函数，读取每个动画的单值 input accessor，相邻采样间隔中位数推断实际整数帧率，并对每个目录条目断言 `entry.frameRate` 与真实值一致；同时断言所有目录条目的 `frameRate` 为有限正整数。

- [ ] **Step 2: Run the directory tests and verify the new assertions fail**

Run:

```text
node --experimental-strip-types --test client/src/config/animationLibrary.test.mjs
```

Expected: FAIL until the directory entries expose `frameRate` and the assertions are implemented.

- [ ] **Step 3: Implement metadata and the actual-rate assertions**

保持 `animationCatalogEntries.ts` 的生成字段不变，在 `animationLibrary.ts` 的两个构造函数中按来源赋值；在测试中缓存一次 GLB 的 `name -> { duration, frameRate }` 映射，避免逐条重复读取文件。不要把所有动作强行改成同一个帧率。

- [ ] **Step 4: Run the directory tests and verify they pass**

Run the same command. Expected: all existing directory tests pass, including 24fps/30fps checks.

- [ ] **Step 5: Commit the catalog metadata**

```text
git add client/src/config/animationLibrary.ts client/src/config/animationLibrary.test.mjs
git commit -s -m "feat: expose animation frame rates"
```

### Task 3: 将关键帧存储切换为帧并迁移旧数据

**Files:**
- Modify: `client/src/pages/animations/animationPreviewStorage.ts:1-158`
- Modify: `client/src/pages/animations/animationPreviewStorage.test.mjs:1-95`

- [ ] **Step 1: Write failing storage tests**

将新测试改为调用 `setAnimationKeyframe("walk-forward", dataUrl, 10, 24)`，断言返回和持久化数据包含 `frame: 10`、`frameRate: 24`，不再依赖 `timeSeconds`。另加独立模块导入测试：预置 `animation-library:keyframes:v2` 中 `timeSeconds: 1.25`，以 `getAnimationKeyframe("walk-forward", 24)` 读取后断言迁移为 `frame: 30` 并写入新版本存储键。

- [ ] **Step 2: Run the storage test and verify it fails**

```text
node --experimental-strip-types --test client/src/pages/animations/animationPreviewStorage.test.mjs
```

Expected: FAIL because the current schema requires `timeSeconds` and the setter accepts no frame rate.

- [ ] **Step 3: Implement schema v3 and lazy v2 migration**

将接口改为：

```ts
export interface AnimationKeyframe {
  animationId: string;
  dataUrl: string;
  frame: number;
  frameRate: number;
  updatedAt: string;
}
```

使用 `animation-library:keyframes:v3` 为新键，读取 v2 时暂存旧记录；`getAnimationKeyframe(animationId, frameRate)` 在命中旧记录时用 `Math.round(timeSeconds * frameRate)` 转成规范帧、写入 v3 并删除旧缓存项。新 setter `setAnimationKeyframe(animationId, dataUrl, frame, frameRate)` 只接受有限非负整数帧和有限正帧率。非法记录继续被忽略，存储不可用时保留内存缓存。

- [ ] **Step 4: Run the storage tests and verify they pass**

Run the same command. Expected: both canonical-frame and v2-migration tests pass.

- [ ] **Step 5: Commit the storage change**

```text
git add client/src/pages/animations/animationPreviewStorage.ts client/src/pages/animations/animationPreviewStorage.test.mjs
git commit -s -m "feat: persist animation keyframes by frame"
```

### Task 4: 将 PlayCanvas 预览器公共控制面改为帧

**Files:**
- Modify: `client/src/pages/animations/animationPreviewApp.ts:1-481`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs:1-250`

- [ ] **Step 1: Extend the source-contract tests before implementation**

断言预览器 options 使用 `initialFrame`、`frameRateHint`、`onFrameChange`，handle 使用 `setFrame/getFrame/getFrameCount/getFrameRate`；断言应用调用 `getDefaultAnimationFrame`、`frameToSeconds`、`secondsToFrame`、`inferAnimationFrameRate`。删除对页面公共 API `setTime/getTime/getDuration/onTimeChange` 的契约断言，增加 `assert.doesNotMatch` 防止这些秒单位 API重新暴露。

- [ ] **Step 2: Run the animation preview source tests and verify they fail**

```text
node --experimental-strip-types --test client/src/pages/animations/animationPreviewApp.test.mjs
```

Expected: FAIL because the current previewer still exposes seconds.

- [ ] **Step 3: Implement frame-based runtime state**

在 `AnimationPreviewOptions` 中增加 `initialFrame?: number`、`frameRateHint?: number` 和 `onFrameChange(frame, frameCount, frameRate, playing)`；从 `AnimTrack.inputs` 推断帧率，目录 hint 作为回退，并用实际 `track.duration` 计算总帧数。将 `applyTime` 替换为 `applyFrame`：帧先经过 `clampAnimationFrame`，再用 `frameToSeconds` 写入 `activeStateCurrentTime`，渲染后回调当前帧。播放更新时用 `secondsToFrame` 把动画层当前秒数转换为整数帧。

加载片段后若没有传入已保存帧，使用 `getDefaultAnimationFrame` 定位到 50% 帧并暂停；传入的帧也按当前片段边界裁剪后暂停。播放、暂停、销毁和错误清理保持现有行为，避免在加载失败时残留 WebGL 应用。

- [ ] **Step 4: Run the source tests and verify they pass**

Run the same command. Expected: all animation preview source tests pass.

- [ ] **Step 5: Commit the previewer API**

```text
git add client/src/pages/animations/animationPreviewApp.ts client/src/pages/animations/animationPreviewApp.test.mjs
git commit -s -m "feat: drive animation preview by frames"
```

### Task 5: 统一 50% 中间帧缩略图和详情页 UI

**Files:**
- Modify: `client/src/pages/animations/animationThumbnailStudio.ts:1-310`
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx:1-293`
- Modify: `client/src/pages/animations/AnimationPreviewPage.tsx:1-326`
- Modify: `client/src/pages/animations/animationPreviewApp.test.mjs:160-250`
- Modify: `client/src/pages/animations/AnimationPreviewPage.test.mjs:1-45`

- [ ] **Step 1: Add failing UI/thumbnail contract assertions**

扩展源码测试：

```js
assert.match(studioSource, /getDefaultAnimationFrame/);
assert.match(studioSource, /frameToSeconds/);
assert.doesNotMatch(studioSource, /durationSeconds \* 0\.4/);
assert.match(previewPageSource, /getAnimationKeyframe\(entry\.id, entry\.frameRate\)/);
assert.match(previewPageSource, /data-animation-current-frame/);
assert.match(previewPageSource, /step="1"/);
assert.doesNotMatch(previewPageSource, /formatTime| 秒|timeSeconds/);
assert.doesNotMatch(librarySource, /durationSeconds\.toFixed\(1\).*秒/);
```

- [ ] **Step 2: Run animation UI source tests and verify they fail**

```text
node --experimental-strip-types --test client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.test.mjs
```

Expected: FAIL because the studio still captures 40% seconds and the page renders seconds.

- [ ] **Step 3: Implement the thumbnail frame selection**

在 `animationThumbnailStudio.ts` 中给轨道类型补充 `duration`/`inputs`，使用 `inferAnimationFrameRate(track, entry.frameRate)`、`getAnimationFrameCount(trackDuration, fps)` 和 `getDefaultAnimationFrame(trackDuration, fps)`。动作状态初始化后暂停，设置 `activeStateCurrentTime = frameToSeconds(defaultFrame, fps, trackDuration)`，再等待渲染并抓取图像；将缓存键从 `animation-library:thumbnails:v7` 升为 `v8`。这样每张自动缩略图都确定来自动作中点整数帧。

- [ ] **Step 4: Implement frame-only details and card metadata**

在 `AnimationLibraryPage.tsx` 使用 `getAnimationFrameCount(entry.durationSeconds, entry.frameRate)` 显示“共 N 帧”，保留卡片优先手动关键帧、否则自动缩略图的逻辑。

在 `AnimationPreviewPage.tsx`：

```tsx
const [currentFrame, setCurrentFrame] = useState(0);
const [frameCount, setFrameCount] = useState(
  getAnimationFrameCount(entry?.durationSeconds ?? 0, entry?.frameRate ?? 30),
);
const [frameRate, setFrameRate] = useState(entry?.frameRate ?? 30);
```

传入 `initialFrame={getAnimationKeyframe(entry.id, entry.frameRate)?.frame}` 和 `frameRateHint={entry.frameRate}`，接收 `onFrameChange`。滑块范围为 `0..frameCount - 1`、`step="1"`、`onChange` 调用 `viewer.setFrame(Number(...))`。页面信息显示当前帧、总帧数和帧率，移除“秒”文案与 `formatTime`。保存时调用 `setAnimationKeyframe(entry.id, image, viewer.getFrame(), viewer.getFrameRate())`，提示显示帧号。

详情页的“卡片预览帧”继续显示手动关键帧；没有手动关键帧时订阅并显示 `getAnimationThumbnail(entry.id)` 生成的 50% 默认图，并标注“默认第 N 帧”，保证用户打开详情页就能看到将用于卡片的预览图。清除手动帧后恢复该默认图。

- [ ] **Step 5: Run the UI source tests and verify they pass**

Run the same command. Expected: all animation UI source tests pass.

- [ ] **Step 6: Commit the UI and thumbnail changes**

```text
git add client/src/pages/animations/animationThumbnailStudio.ts client/src/pages/animations/AnimationLibraryPage.tsx client/src/pages/animations/AnimationPreviewPage.tsx client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.test.mjs
git commit -s -m "feat: show animation previews by frame"
```

### Task 6: 更新长期文档并完成自测

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] **Step 1: Update durable and user-facing documentation**

在模型库 wiki 的动画预览规则中记录：目录按真实 24/30fps、帧号 0 起、默认 50% 帧、详情页与卡片共用同一帧、缩略图缓存为 v8。README 最新更新和 release notes 写用户可见行为，不写内部函数名或实现过程。

- [ ] **Step 2: Run all focused automated checks**

```text
node --experimental-strip-types --test client/src/pages/animations/animationFrame.test.mjs client/src/pages/animations/animationPreviewStorage.test.mjs client/src/config/animationLibrary.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.test.mjs
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

Expected: all focused Node tests pass, typecheck exits 0, and Vite build completes. Existing Browserslist/chunk-size warnings are non-blocking if no new errors appear.

- [ ] **Step 3: Self-accept the diff against the requirement**

用 `git diff --check` 和 `git diff --stat` 复核只包含动画帧、文档和测试；确认代码中没有模型/贴图/数据库文件变化，没有用户界面上的“秒”时间显示，且 50% 取帧、真实 24/30fps、整数步进、卡片默认图和旧关键帧迁移都有对应测试。

- [ ] **Step 4: Commit the documentation and release surfaces**

```text
git add README.md docs/releases/release-notes.md docs/wiki/product/model-library.md
git commit -s -m "docs: document animation frame previews"
```

- [ ] **Step 5: Run the required integration verification**

从干净 `main` 执行：

```text
pnpm workflow:integrate codex/animation-frame-preview --push --verify "pnpm --filter @ai-novel/client typecheck && node --experimental-strip-types --test client/src/pages/animations/animationFrame.test.mjs client/src/pages/animations/animationPreviewStorage.test.mjs client/src/config/animationLibrary.test.mjs client/src/pages/animations/animationPreviewApp.test.mjs client/src/pages/animations/AnimationPreviewPage.test.mjs"
```

### Task 7: 内置浏览器验收与收尾

**Files:**
- No additional code files; use the running local services and Git state.

- [ ] **Step 1: Verify the animation library card path**

在内置浏览器打开 `http://127.0.0.1:5174/animations`，确认卡片副标题显示“共 N 帧”而非“秒”；打开一个 Cine57 动作和一个旧 UAL2 动作，等待自动缩略图生成，确认每张卡片有静态预览图。

- [ ] **Step 2: Verify the detail timeline path**

打开卡片进入详情页，确认默认画面停在中间帧且状态显示“第 N 帧 / 共 M 帧”；拖动滑块只能按整数帧变化，播放/暂停仍可用；点击“设为预览帧”后返回动画库，卡片图切换为保存帧；点击“恢复默认预览图”后回到 50% 默认帧。

- [ ] **Step 3: Capture visual and console evidence**

对动画库和详情页截取关键截图；检查内置浏览器当前会话没有新增 console error。若出现资源加载错误，保留错误原文并在提交前修复或明确阻塞原因。

- [ ] **Step 4: Clean up only merged session worktrees**

确认 `main` 与 `origin/main` SHA 相同、`git status --short --branch` 干净、`git worktree list --porcelain` 只保留其他会话仍在使用的 worktree；删除本次已合并的 `D:\Github\AI-Novel-Writing-Assistant-animation-frame-preview` 及其本地分支，不触碰未合并 worktree。
