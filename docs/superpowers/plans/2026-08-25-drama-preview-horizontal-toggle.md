# Drama Preview Horizontal Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分镜卡片的 `3D图 / AI图` 预览切换改为左 3D、右 AI 的水平 tab，并把三个操作按钮稳定放在切换区域下方。

**Architecture:** 只调整 `ShotVoiceRow` 的现有预览控制栏，不改变 `PreviewKind`、AI 图可用性判断、3D 草图兜底、生成和 AI 摆位路由。通过 ARIA tablist 保留同一组预览状态，用 Tailwind 语义 token 和现有 `Button`/`AiButton` 维持主题与按钮行为。

**Tech Stack:** React 19, TypeScript, Tailwind CSS, lucide-react, Node.js `node:test`, Vite。

---

### Task 1: 增加水平切换的失败契约测试

**Files:**
- Modify: `client/tests/shotVoiceBlockingSketchEntry.test.js`
- Test source: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`

- [x] **Step 1: 写出要求水平 tab 的断言**

在现有“草图与 AI 画面之间切换”测试中追加以下断言，明确要求水平方向、两列布局以及只响应左右方向键：

```js
assert.match(source, /aria-orientation="horizontal"/);
assert.match(source, /grid grid-cols-2/);
assert.doesNotMatch(source, /aria-orientation="vertical"/);
assert.match(source, /\["ArrowLeft", "ArrowRight"\]/);
```

- [x] **Step 2: 运行测试确认它因旧布局失败**

Run:

```powershell
pnpm --dir client exec node --test tests/shotVoiceBlockingSketchEntry.test.js
```

Expected: 现有测试失败，至少报告找不到 `aria-orientation="horizontal"`，原因是当前源码仍是纵向 tab。

### Task 2: 实现水平 tab 和下方按钮布局

**Files:**
- Modify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx:650-805`

- [x] **Step 1: 将键盘行为限定为水平 tab 的左右方向键**

保留现有 `selectPreview` 校验和活动 tab 的 `tabIndex`，把处理函数改成只拦截左右键：

```tsx
const handlePreviewKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: PreviewKind) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  selectPreview(current === "sketch" ? "ai" : "sketch");
};
```

- [x] **Step 2: 将 tablist 改为水平两列，并保持三个按钮在其下方**

将 tablist 的方向和布局改为：

```tsx
<div
  role="tablist"
  aria-label={`第 ${shot.order} 镜预览类型`}
  aria-orientation="horizontal"
  className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/20 p-1"
>
```

保留两个 tab 的 DOM 顺序为 `3D图` 后 `AI图`，并保留其后的三个控件顺序为 `编辑3D`、`AI摆位`、`生成AI图`/`重新生图`。继续使用 `Button` 和 `AiButton`，不要复制按钮样式或改变既有禁用条件。

- [x] **Step 3: 运行 focused tests 确认变为绿色**

Run:

```powershell
pnpm --dir client exec node --test tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dPage.contract.test.js
```

Expected: 12 个测试全部通过，且原有 3D 草图兜底、AI 图禁用和 AI 摆位契约仍然通过。

### Task 3: 更新用户可见变更记录

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [x] **Step 1: 在当前日期条目补充分镜预览切换说明**

用面向用户的文案记录：分镜预览现在以左侧 3D 图、右侧 AI 图的水平切换展示，编辑、AI 摆位和生图操作集中在切换区域下方。不要写文件名、内部实现或迁移过程。

- [x] **Step 2: 检查文案和文档清单**

Run:

```powershell
git diff --check
pnpm check:docs-manifest
```

Expected: 无空白错误，文档清单校验通过。

### Task 4: 完整验证并交付

**Files:**
- Verify: `client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx`
- Verify: `client/tests/shotVoiceBlockingSketchEntry.test.js`

- [x] **Step 1: 运行客户端类型检查和生产构建**

```powershell
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

Expected: 两条命令退出码为 0。

- [x] **Step 2: 用真实浏览器检查分镜卡片**

在现有 `5174` 页面打开“分镜”标签，确认真实 DOM 满足：

1. 预览控制栏顶部横向排列 `3D图`、`AI图`，顺序为左 3D、右 AI。
2. 三个按钮位于水平切换下面，顺序为编辑 3D、AI 摆位、生成/重新生图。
3. 没有 AI 图时 3D 图仍选中、AI 图仍禁用；有 AI 图时两者可以点击切换。

- [x] **Step 3: 提交、合并、推送并清理**

```powershell
git add client/src/pages/drama/comicDrama/ShotVoiceListPanel.tsx client/tests/shotVoiceBlockingSketchEntry.test.js README.md docs/releases/release-notes.md
git commit -s -m "fix: make drama preview toggle horizontal"
pnpm workflow:integrate codex/drama-preview-horizontal-toggle --push --verify "pnpm --dir client exec node --test tests/shotVoiceBlockingSketchEntry.test.js tests/dramaBlocking3dPage.contract.test.js && pnpm check:docs-manifest"
pnpm workflow:cleanup codex/drama-preview-horizontal-toggle
```

最后确认 `main` 与 `origin/main` 指向同一提交，主工作树干净，且只清理本任务已经合并的隔离工作树。
