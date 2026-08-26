# 漫剧 3D 左侧控制栏与视口布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task.

**Goal:** 将场景 3D 编辑和分镜 3D 草图改为左侧控制栏、右侧全宽视口，隐藏重复的对象/属性标题，并移除角色脚下的圆盘式选择标记。

**Architecture:** 继续使用 `Drama3DEditorShell` 作为两个页面的布局边界。Shell 在桌面端使用左侧固定控制栏和右侧剩余视口，左栏内部按 header、对象列表、属性内容分层；页面只调整传入的极简 header 和属性卡内容，viewer 只移除旧 selection ring，保留已有角色外轮廓与 marker 线框。

**Tech Stack:** React 19、Tailwind CSS 语义 token、shadcn Card/Button、lucide-react、PlayCanvas、Node contract tests、TypeScript/Vite。

---

### Task 1: 写左侧布局、标题隐藏和圆盘移除的失败契约

**Files:**
- Modify: `client/tests/drama3dEditorWorkbench.contract.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`

- [ ] **Step 1: 写失败断言**

在工作台契约中加入以下可观察合同：Shell 使用 `xl:grid-cols-[22rem_minmax(0,1fr)]`，左栏的 header 出现在对象区和属性区之前，视口 section 位于左栏之后；对象组件不再包含 `CardHeader`、`CardTitle` 或 `Box` 标题图标；两个页面的属性区域不再包含 `CardHeader`/`CardTitle`；两个页面保留属性内部 `overflow-y-auto`。viewer 继续调用 `drawEntitySelectionOutline`，但不再出现 `selectionRing`、`SELECTION_RING_OPACITY` 或 `createSelectionRingGeometryData`。

```js
assert.match(shell, /xl:grid-cols-\[22rem_minmax\(0,1fr\)\]/);
assert.match(shell, /<aside aria-label="场景编辑控制栏"[\s\S]*\{header\}[\s\S]*data-editor-region="objects"[\s\S]*data-editor-region="actions"/);
assert.match(shell, /data-editor-region="viewport"/);
assert.doesNotMatch(objectPanel, /CardHeader|CardTitle|<Box/);
assert.doesNotMatch(scenePage, /CardHeader|CardTitle/);
assert.doesNotMatch(blockingPage, /CardHeader|CardTitle/);
assert.match(scenePage, /overflow-y-auto/);
assert.match(blockingPage, /overflow-y-auto/);

assert.match(viewerSource, /drawEntitySelectionOutline/);
assert.doesNotMatch(viewerSource, /selectionRing|SELECTION_RING_OPACITY|createSelectionRingGeometryData/);
```

- [ ] **Step 2: 运行测试确认 RED**

运行：

```bash
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/dramaBlocking3dPage.contract.test.js
```

预期：新增布局、标题和 selection ring 断言失败，证明测试锁定了当前缺口；既有断言继续通过。

### Task 2: 调整共享 Shell 为左侧控制栏和右侧视口

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DEditorShell.tsx`
- Modify: `client/tests/drama3dEditorWorkbench.contract.test.js`

- [ ] **Step 1: 把 header 放入左侧栏**

将当前 header 全宽结构改为下面的层级，确保桌面端左栏顺序是导航、对象、属性，右侧只有视口：

```tsx
<div className="grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden max-xl:overflow-y-auto xl:grid-cols-[22rem_minmax(0,1fr)]">
  <aside aria-label="场景编辑控制栏" className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden max-xl:min-h-[34rem]">
    <header className="shrink-0">{header}</header>
    <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,33.333%)_minmax(0,1fr)] gap-2 overflow-hidden">
      <section aria-label="场景对象列表" data-editor-region="objects" className="h-full min-h-0 overflow-hidden">
        {objects}
      </section>
      <section aria-label="属性面板" data-editor-region="actions" className="h-full min-h-0 overflow-hidden">
        {actions}
      </section>
    </div>
  </aside>
  <section aria-label="3D 场景视口" data-editor-region="viewport" className="min-h-0 min-w-0 overflow-hidden max-xl:min-h-[20rem]">
    {viewport}
  </section>
</div>
```

保持根容器的 `h-full min-h-0`，窄屏继续让左栏先出现、视口后出现并允许外层滚动。

- [ ] **Step 2: 运行布局契约确认仍为 RED**

暂不修改页面或组件，重复 Task 1 的测试命令，确认 Shell 相关断言转为通过，其余标题和 ring 断言仍失败。

### Task 3: 删除对象卡/属性卡标题并收敛页面导航

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx`
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`

- [ ] **Step 1: 删除对象卡可见标题**

从 `Drama3DObjectPanel.tsx` 移除 `Box`、`CardHeader`、`CardTitle` 导入和 header JSX，只保留填满卡片的可滚动内容：

```tsx
<Card className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
  <CardContent className="h-full min-h-0 flex-1 overflow-y-auto p-2">
    {/* 保留现有对象按钮与空状态 */}
  </CardContent>
</Card>
```

对象按钮继续是原生 `button`，保留 `aria-pressed`、`data-object-selected`、hover/focus/disabled 状态和图标+名称。

- [ ] **Step 2: 删除两个属性卡可见标题**

在两个页面移除 `CardHeader`、`CardTitle` 导入和包含标题/Badge 的 header；让现有属性内容直接从 `CardContent` 开始，并保留 `h-full min-h-0 flex-1 overflow-y-auto`。不要删除字段、按钮、Toast、保存锁定或空/错误状态。

```tsx
<Card className="flex h-full min-h-0 flex-col overflow-hidden">
  <CardContent className="h-full min-h-0 flex-1 space-y-4 overflow-y-auto">
    {/* 当前对象属性、控制按钮、空/错误状态 */}
  </CardContent>
</Card>
```

- [ ] **Step 3: 将页面 header 收敛为返回按钮和主名称**

场景页 header 只渲染返回按钮和 `scene.name`；分镜页只渲染返回按钮和当前镜头主名称。移除 header 中的状态 Badge、状态文字、副标题、操作说明和 `status` 的可见展示；保留 canvas 的 loading/error overlay、保存期间按钮禁用和 Toast 反馈。

```tsx
<div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
  <Button type="button" variant="ghost" size="icon" aria-label="返回" title="返回" onClick={goBack}>
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
  </Button>
  <h1 className="min-w-0 truncate text-sm font-semibold">{primaryName}</h1>
</div>
```

删除只用于 header 展示的 `status/setStatus` 状态及 viewer `onStatus` 回调；viewer 的 `onStatus` 接口仍可保留给其他调用者。

- [ ] **Step 4: 运行标题/滚动契约确认 GREEN**

运行：

```bash
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/dramaBlocking3dPage.contract.test.js
```

预期：对象/属性标题隐藏、左栏布局、属性内部滚动和顶部主名称断言通过；脚下 ring 断言仍失败。

### Task 4: 移除 viewer 脚下圆盘并保留外轮廓

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/blocking3d/blocking3dViewerApp.ts`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`

- [ ] **Step 1: 删除 ring 初始化和生命周期**

删除 `createSelectionRingGeometryData` 导入、`SELECTION_RING_OPACITY` 常量、selection material/geometry/mesh/entity 创建和 `selectionRing.destroy()`；`emitSelection` 只通知 `selectionListeners`，不再移动或启用脚下实体。

```ts
const emitSelection = () => {
  for (const listener of selectionListeners) listener(selectedLabel);
};
```

- [ ] **Step 2: 删除 update loop 中的 ring 定位**

保留 selected actor 查询和外轮廓调用，只移除 `selectionRing.setPosition` 等脚下圆盘定位逻辑：

```ts
const actor = selectedActor();
if (actor) drawEntitySelectionOutline(app, actor.entity, SELECTION_OUTLINE_COLOR);
```

- [ ] **Step 3: 运行完整聚焦契约**

重复 Task 3 的 Node 测试命令，预期所有契约通过，且选中角色仍有 AABB 外轮廓。

### Task 5: 文档、验证和交付

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新稳定工作流规则和用户可见说明**

在 3D 工作流 wiki 记录：桌面端左栏负责导航、对象选择和属性，右侧视口独占剩余空间；对象/属性卡不重复渲染标题；脚下 ring 已移除但角色外轮廓保留。按 `readme-release-updater` 规则把同一条用户可见变化合并到 `2026-08-26` 的 release notes 和 README 最新更新。

- [ ] **Step 2: 运行最终检查**

```bash
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/storyScene3dEditorContracts.test.js tests/dramaBlocking3dPage.contract.test.js
pnpm typecheck
pnpm --filter @ai-novel/client build
pnpm check:docs-manifest
git diff --check
```

预期：契约测试、类型检查、客户端构建、文档清单和差异检查均以退出码 0 完成；浏览器视觉验收由用户完成。

- [ ] **Step 3: 提交并集成**

使用 `git commit -s` 提交；从干净 `main` 运行：

```bash
pnpm setup:git-hooks
pnpm check:workspace-integrity
pnpm workflow:integrate codex/drama-3d-left-layout --verify "pnpm typecheck" --push
pnpm workflow:cleanup codex/drama-3d-left-layout
```

最后核对 `git rev-parse HEAD`、`git rev-parse origin/main` 和 `git ls-remote origin refs/heads/main` 一致，确认主工作区干净且本任务 worktree 已清理；不触碰其他并行 worktree。
