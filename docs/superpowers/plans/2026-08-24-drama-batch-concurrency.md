# 短剧批量分镜画面并发优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 将短剧批量分镜画面生成从固定 3 路提升为服务端保护下的 4 路并发，并确保新建/恢复任务、错误状态和前端进度展示保持一致。

**Architecture:** 在 `services/drama/production` 增加只负责短剧关键帧并发策略的纯函数模块，统一定义 1–4 路安全范围和默认 4 路。`DramaBatchOrchestrator` 在创建和恢复任务时规范化并发值，并让 worker pool 使用持久化的实际值；前端只展示实际并发，不增加用户需要理解 provider 限制的配置项。

**Tech Stack:** TypeScript、Prisma JSON progress、React/React Query、Node test runner、pnpm workspace。

---

### Task 1: 锁定并发策略契约

**Files:**
- Create: `server/tests/dramaBatchImageConcurrency.test.js`
- Test against: `server/src/services/drama/production/dramaBatchConcurrency.ts`

- [ ] **Step 1: 写失败测试**

创建 Node test runner 测试，覆盖默认值、低于下限、高于上限、非数字历史值和小数值：

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
  MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
  MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
  normalizeDramaKeyframeBatchConcurrency,
} = require("../dist/services/drama/production/dramaBatchConcurrency.js");

test("关键帧批量默认使用图片桥安全上限 4 路", () => {
  assert.equal(DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY, 4);
  assert.equal(MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY, 4);
  assert.equal(MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY, 1);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(undefined), 4);
});

test("关键帧批量并发值始终被裁剪到 1-4 的整数", () => {
  assert.equal(normalizeDramaKeyframeBatchConcurrency(0), 1);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(-3), 1);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(2.9), 2);
  assert.equal(normalizeDramaKeyframeBatchConcurrency(99), 4);
  assert.equal(normalizeDramaKeyframeBatchConcurrency("not-a-number"), 4);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaBatchImageConcurrency.test.js
```

预期：FAIL，因为 `dist/services/drama/production/dramaBatchConcurrency.js` 尚不存在。

### Task 2: 实现策略模块并接入批量恢复链

**Files:**
- Create: `server/src/services/drama/production/dramaBatchConcurrency.ts`
- Modify: `server/src/services/drama/production/DramaBatchOrchestrator.ts:12-102,230-390`
- Test: `server/tests/dramaBatchImageConcurrency.test.js`
- Test: `server/tests/dramaBatchConcurrency.test.js`

- [ ] **Step 1: 实现最小策略模块**

新增纯函数模块，不访问数据库、不发 provider 请求：

```ts
export const MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY = 1;
export const MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY = 4;
export const DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY = MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY;

export function normalizeDramaKeyframeBatchConcurrency(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY;
  }
  return Math.min(
    MAX_DRAMA_KEYFRAME_BATCH_CONCURRENCY,
    Math.max(MIN_DRAMA_KEYFRAME_BATCH_CONCURRENCY, Math.floor(numeric)),
  );
}
```

- [ ] **Step 2: 让 orchestrator 持久化并使用实际并发**

在 `DramaBatchOrchestrator.ts` 导入策略函数，并保留 `DRAMA_KEYFRAME_BATCH_CONCURRENCY` 作为兼容导出，值指向新的默认值。修改规则：

```ts
concurrency: input.type === "keyframes"
  ? DEFAULT_DRAMA_KEYFRAME_BATCH_CONCURRENCY
  : undefined,
```

恢复任务时把历史值规范化：

```ts
concurrency: job.type === "keyframes"
  ? normalizeDramaKeyframeBatchConcurrency(progress.concurrency)
  : undefined,
```

执行 worker pool 时使用恢复后的 `nextProgress.concurrency`：

```ts
await runWithConcurrency(
  shots,
  normalizeDramaKeyframeBatchConcurrency(nextProgress.concurrency),
  processShotAt,
);
```

视频和 TTS 的串行行为保持不变；不新增数据库字段，不改变图片 runtime 的 provider 路由。

- [ ] **Step 3: 更新并发回归测试并运行绿色测试**

保留通用 scheduler 测试的 3 路边界，同时新增 4 路 worker pool 实测：使用 8 个延迟任务记录 `maxActive`，断言不会超过 4、所有镜头都被访问且最终 active 为 0。

运行：

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaBatchImageConcurrency.test.js server/tests/dramaBatchConcurrency.test.js
```

预期：全部 PASS。

### Task 3: 让批量状态显示实际并发

**Files:**
- Modify: `client/src/pages/drama/components/DramaVisualPanel.tsx:290-315`
- Modify: `client/tests/dramaShotBatchFeedback.test.js`
- Modify: `client/src/api/media/drama.ts:344-365` only if the existing progress type needs alignment

- [ ] **Step 1: 写前端契约测试**

在现有批量反馈测试中增加断言，要求主短剧工作室的 `BatchJobStatus` 使用 `progress.concurrency` 输出“并发 N 路”；同时把服务端固定并发的源码断言更新为默认 4，并断言 worker 使用 `nextProgress.concurrency` 的规范化值。

- [ ] **Step 2: 实现最小 UI 展示**

在批量状态统计行增加条件渲染：

```tsx
{progress.concurrency ? <span>并发 {progress.concurrency} 路</span> : null}
```

复用现有 `text-xs text-muted-foreground` 样式和已有进度结构，不新增交互控件或硬编码颜色。

- [ ] **Step 3: 运行客户端相关测试/类型检查**

运行：

```powershell
pnpm --filter @ai-novel/client exec tsc --noEmit
pnpm --filter @ai-novel/client exec vitest run tests/dramaShotBatchFeedback.test.js
```

预期：类型检查和契约测试均 PASS。按项目规则不默认启动浏览器；UI 实际操作由用户验收。

### Task 4: 更新长期文档与用户可见发布说明

**Files:**
- Modify: `docs/wiki/workflows/comic-drama-workflow.md` 的批量任务段落
- Modify: `docs/releases/release-notes.md` 的 `2026-08-24` 日期段
- Modify: `README.md` 的 `## 最新更新` 最新日期段

- [ ] **Step 1: 更新 wiki**

在批量任务工作流中记录：关键帧批量默认 4 路、应用侧硬上限 4 路、Codex bridge 真实上限来源、Grok Build 无界 bridge 仍由应用侧保护、恢复任务以 progress 中的规范化并发为准。

- [ ] **Step 2: 使用 readme-release-updater 规则更新发布说明**

只写用户可见行为：批量分镜画面会自动使用更高的安全并发，状态中显示并发路数；不要写文件路径、内部常量或测试名。

- [ ] **Step 3: 检查文档 diff**

运行：

```powershell
git diff --check
```

预期：无空白错误，旧的 release note 条目保持不变。

### Task 5: 完整验证并交付

**Files:**
- All files from Tasks 1–4

- [ ] **Step 1: 运行服务端关键回归**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/dramaBatchImageConcurrency.test.js server/tests/dramaBatchConcurrency.test.js server/tests/dramaBatchBlockingSketch.test.js server/tests/dramaStaticShotContracts.test.js
```

- [ ] **Step 2: 运行客户端关键回归**

```powershell
pnpm --filter @ai-novel/client exec tsc --noEmit
pnpm --filter @ai-novel/client exec vitest run tests/dramaShotBatchFeedback.test.js
```

- [ ] **Step 3: 做静态运行时检查**

确认 `http://127.0.0.1:18766/health` 与 `http://127.0.0.1:18767/health` 仍返回 ready；不调用图片生成 endpoint，不消耗订阅额度。检查 worktree diff 只包含本任务文件。

- [ ] **Step 4: 请求代码审查并处理反馈**

按 `requesting-code-review` skill 派发聚焦审查，重点检查并发值在创建/恢复/执行三处是否一致、是否可能重复覆盖进度、是否误改视频/TTS 顺序。

- [ ] **Step 5: 提交实现分支**

使用签名提交：

```powershell
git add -- server/src/services/drama/production/dramaBatchConcurrency.ts server/src/services/drama/production/DramaBatchOrchestrator.ts server/tests/dramaBatchImageConcurrency.test.js server/tests/dramaBatchConcurrency.test.js client/src/pages/drama/components/DramaVisualPanel.tsx client/tests/dramaShotBatchFeedback.test.js client/src/api/media/drama.ts docs/wiki/workflows/comic-drama-workflow.md docs/releases/release-notes.md README.md
git commit -s -m "perf: increase drama storyboard batch concurrency"
```

- [ ] **Step 6: 从干净 main 集成并推送**

确认主工作区仍是干净 `main`，然后执行：

```powershell
pnpm workflow:integrate codex/drama-batch-concurrency-v1 --push --verify "pnpm --filter @ai-novel/server build"
```

最后核对 `git status --short --branch`、`git log -1 --oneline` 和 `git ls-remote origin refs/heads/main`，确认远程 `main` 已包含合并提交，再删除本任务 worktree/本地分支并运行 `git worktree prune`。
