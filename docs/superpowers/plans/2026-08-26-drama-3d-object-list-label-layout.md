# 漫剧 3D 对象列表命名与高度布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task.

**Goal:** 让场景 3D 编辑器和分镜 3D 草图的对象列表使用清晰的世界/参考角色语义，并把对象列表固定为右侧面板约三分之一高度，将更多空间留给属性编辑。

**Architecture:** 保持 `Drama3DEditorShell` 作为两页共用的工作台布局边界，保持 `Drama3DObjectPanel` 只负责对象选择展示。名称只在两个页面构造现有对象项时调整；空间标记继续由已有 `visibleSceneMarkers`/`context.scene.markers` 直接生成列表项，不改变 API、数据库或 viewer。

**Tech Stack:** React 19、Tailwind CSS 语义 token、shadcn Card/Button、lucide-react、Node contract tests、TypeScript/Vite。

---

### Task 1: 写名称、空间标记和布局契约测试

**Files:**
- Modify: `client/tests/drama3dEditorWorkbench.contract.test.js`
- Modify: `client/tests/dramaBlocking3dPage.contract.test.js`

- [ ] **Step 1: 写失败断言**

在工作台契约中加入以下可观察行为：场景编辑页对象项使用 `label: "世界"` 和 `label: "参考角色"`，属性类型徽标/字段使用相同语义；两个页面都从现有场景标记数组展开对象行；共享 shell 使用 `grid-rows-[minmax(0,33.333%)_minmax(0,1fr)]`，对象区和属性区保持 `min-h-0`、`overflow-hidden`/`overflow-y-auto`。

```js
assert.match(scenePage, /label: "世界"/);
assert.match(scenePage, /label: "参考角色"/);
assert.match(scenePage, /selectedMarker \? "空间标记"/);
assert.match(scenePage, /visibleSceneMarkers\.map/);
assert.match(blockingPage, /context\.scene\.markers\.map/);
assert.match(shell, /grid-rows-\[minmax\(0,33\.333%\)_minmax\(0,1fr\)\]/);
assert.doesNotMatch(scenePage, /label: "场景对象"/);
assert.doesNotMatch(scenePage, /label: "比例参照"/);
```

- [ ] **Step 2: 运行测试确认 RED**

运行：

```bash
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/dramaBlocking3dPage.contract.test.js
```

预期：新增名称和三分之一 track 断言失败，证明测试锁定了当前缺口。

### Task 2: 调整共享工作台高度和卡片间距

**Files:**
- Modify: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DEditorShell.tsx`
- Modify: `client/src/pages/drama/comicDrama/components/editor3d/Drama3DObjectPanel.tsx`

- [ ] **Step 1: 收敛右侧两个 grid track**

将右侧 `aside` 的行定义改为：

```tsx
<aside className="grid min-h-0 min-w-0 grid-rows-[minmax(0,33.333%)_minmax(0,1fr)] gap-2 overflow-hidden max-xl:min-h-[34rem]">
```

保留对象区和属性区的 `h-full min-h-0 overflow-hidden`，确保对象数量只在对象卡内部滚动、属性字段只在属性卡内部滚动。

- [ ] **Step 2: 压缩对象卡标题上下留白**

将对象卡标题改为保持语义 token 的紧凑样式：

```tsx
<CardHeader className="shrink-0 px-3 pb-2 pt-2.5">
  <CardTitle className="flex items-center gap-2 text-sm">
```

对象列表内容继续使用 `min-h-0 flex-1 overflow-y-auto`，不改变按钮键盘焦点和选中状态。

### Task 3: 统一对象名称并锁定空间标记直出

**Files:**
- Modify: `client/src/pages/drama/comicDrama/DramaScene3DPage.tsx`
- Modify: `client/src/pages/drama/comicDrama/DramaBlocking3DPage.tsx`

- [ ] **Step 1: 修改场景编辑页展示语义**

将场景页对象项和属性语义调整为：

```tsx
{
  id: SCENE_OBJECT_ID,
  label: "世界",
  kind: "scene",
  // 其余 selected/onSelect 保持现有逻辑
}
// ...visibleSceneMarkers.map(...)
{
  id: REFERENCE_OBJECT_ID,
  label: "参考角色",
  kind: "reference",
  // 其余 selected/onSelect 保持现有逻辑
}
```

类型徽标将场景分支显示为「世界」，参考对象分支显示为「参考角色」；场景信息字段使用「世界」作为字段名，聚焦按钮使用「聚焦参考角色」。空间标记详情和 `visibleSceneMarkers.map` 保持现有选择与聚焦回调。

- [ ] **Step 2: 修改分镜页对象语义并保留全部标记**

分镜页的环境根对象显示为「世界」，其余角色和 `context.scene.markers.map` 维持原顺序和选择逻辑；属性页场景分支的类型徽标显示「世界」。分镜页没有固定比例参考项，不新增或隐藏对象。

- [ ] **Step 3: 运行 RED→GREEN 契约测试**

重复运行 Task 1 的 Node test 命令，预期所有名称、对象数组和布局断言通过。

### Task 4: 文档、定向验证与交付

**Files:**
- Modify: `docs/wiki/workflows/drama-blocking-3d.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新稳定工作流规则和用户可见说明**

在 3D 工作流 wiki 记录对象树的命名规则（世界、参考角色、空间标记）和右侧面板三分之一/剩余空间分配；按 `readme-release-updater` 规则合并当天发布说明并更新 README 最新更新。只记录用户能看到的界面能力，不记录提交过程。

- [ ] **Step 2: 运行完整的前端定向检查**

依次运行：

```bash
pnpm exec node --experimental-strip-types --test tests/drama3dEditorWorkbench.contract.test.js tests/dramaBlocking3dPage.contract.test.js
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
pnpm check:docs-manifest
```

预期：四条命令均以退出码 0 完成；若出现与本次文件无关的既有失败，记录具体测试名和错误，不放宽本次契约断言。

- [ ] **Step 3: 浏览器验收**

在当前浏览器打开场景 3D 编辑器和一个分镜 3D 草图，确认对象列表中显示「世界」、空间标记和「参考角色」（分镜页显示场景、角色、空间标记），对象区约占右侧三分之一，属性编辑区从其下方开始并可滚动。

- [ ] **Step 4: 提交和集成**

在功能工作树中使用签名提交；从干净 `main` 运行：

```bash
pnpm workflow:integrate codex/scene-object-panel-label-layout --push --verify "pnpm --filter @ai-novel/client typecheck && pnpm --filter @ai-novel/client build && pnpm check:docs-manifest"
```

确认 `git rev-parse HEAD` 与 `git rev-parse origin/main` 相同、主工作树干净，再删除本次已合并的功能工作树和分支。
