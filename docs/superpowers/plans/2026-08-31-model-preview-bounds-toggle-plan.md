# 模型详情包围盒显示开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模型详情页的包围盒线框使用中性灰色，并通过默认关闭的“显示包围盒”复选框控制其即时显示与隐藏。

**Architecture:** 在模型库 3D 查看器内部保留实时几何 AABB，仅新增一个不影响模型变换的 `boundsVisible` 绘制状态和 `setBoundsVisible` 只读查看 API。详情页使用受控原生 checkbox 保存当前页面状态，异步查看器加载完成后同步状态；不写入数据库或浏览器存储。

**Tech Stack:** React 19, TypeScript, PlayCanvas 2.21, Tailwind CSS semantic tokens, Node test runner (`--experimental-strip-types`), Vite。

---

## Task 1: 先写包围盒可见性与颜色的失败合约测试

**Files:**

- Modify: `client/tests/modelPreviewReadonly.contract.test.js:15-36`

- [ ] **Step 1: 写失败测试**

在现有只读预览合约测试后增加以下测试，锁定用户可见入口和查看器边界：

```js
test("模型包围盒默认隐藏，并可通过复选框切换为灰色线框", () => {
  assert.match(editorSource, /data-model-bounds-toggle/);
  assert.match(editorSource, /type="checkbox"/);
  assert.match(editorSource, /显示包围盒/);
  assert.match(editorSource, /setBoundsVisible/);
  assert.match(viewerSource, /let boundsVisible = options\.showBounds \?\? false/);
  assert.match(viewerSource, /setBoundsVisible\(visible: boolean\)/);
  assert.match(viewerSource, /if \(boundsVisible && modelDisplayBoundsMin && modelDisplayBoundsMax\)/);
  assert.match(viewerSource, /const MODEL_BOUNDS_COLOR = new pc\.Color\(0\.68, 0\.68, 0\.68, 0\.9\)/);
  assert.doesNotMatch(viewerSource, /new pc\.Color\(0\.27, 0\.74, 0\.96/);
});
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run:

```bash
pnpm --filter @ai-novel/client exec node --test tests/modelPreviewReadonly.contract.test.js
```

Expected: FAIL，失败原因是当前源码还没有 checkbox、`setBoundsVisible`、默认隐藏条件和灰色常量；不得通过修改测试断言来消除失败。

## Task 2: 在模型查看器中实现只读包围盒显示状态

**Files:**

- Modify: `client/src/pages/models/modelLibrary3d/modelViewerApp.ts:40-60,360-365,483-505`

- [ ] **Step 1: 扩展查看器选项和接口**

在 `ModelViewerOptions` 增加可选的 `showBounds?: boolean`，在 `ModelViewer` 增加：

```ts
setBoundsVisible: (visible: boolean) => void;
```

查看器初始化时使用：

```ts
let boundsVisible = options.showBounds ?? false;
const MODEL_BOUNDS_COLOR = new pc.Color(0.68, 0.68, 0.68, 0.9);
```

这样未传入选项时始终默认隐藏，并把颜色集中为中性灰色。

- [ ] **Step 2: 让帧绘制和 setter 只影响包围盒**

将现有包围盒绘制条件改为：

```ts
if (boundsVisible && modelDisplayBoundsMin && modelDisplayBoundsMax) {
  app.drawWireAlignedBox(
    modelDisplayBoundsMin,
    modelDisplayBoundsMax,
    MODEL_BOUNDS_COLOR,
    false,
  );
}
```

在返回对象中增加：

```ts
setBoundsVisible(visible) {
  boundsVisible = visible;
},
```

不得把开关接入 `modelAdjust`、相机状态、拾取器、变换 gizmo 或 HDRI setter。

- [ ] **Step 3: 运行测试确认查看器部分转绿**

Run:

```bash
pnpm --filter @ai-novel/client exec node --test tests/modelPreviewReadonly.contract.test.js
```

Expected: 新增可见性合约与已有只读边界测试 PASS；如果失败，只修正查看器接口或条件，不扩展到无关模块。

## Task 3: 在详情页增加默认隐藏的复选框并同步查看器

**Files:**

- Modify: `client/src/pages/models/ModelEditorPage.tsx:18-83,145-163`

- [ ] **Step 1: 增加页面状态和异步同步机制**

增加一个默认值为 `false` 的状态及 ref：

```tsx
const [showBounds, setShowBounds] = useState(false);
const showBoundsRef = useRef(false);
```

创建查看器时传入 `showBounds: showBoundsRef.current`；查看器完成加载后调用 `nextViewer.setBoundsVisible(showBoundsRef.current)`，保证用户在异步加载期间做出的选择不会被旧闭包覆盖。模型条目变化时重置 ref 和状态为 `false`。

- [ ] **Step 2: 添加可访问的 checkbox 控件**

在“模型信息”与聚焦按钮之间加入：

```tsx
<label
  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-sm"
  data-model-bounds-toggle
>
  <input
    id="model-bounds-visibility"
    type="checkbox"
    checked={showBounds}
    onChange={(event) => {
      const nextVisible = event.target.checked;
      showBoundsRef.current = nextVisible;
      setShowBounds(nextVisible);
      viewerRef.current?.setBoundsVisible(nextVisible);
    }}
    aria-label="显示模型包围盒"
    className="h-4 w-4 accent-primary"
  />
  <span>显示包围盒</span>
</label>
```

控件使用现有语义 token，不增加持久化，不禁用加载期间的选择；它只改变包围盒可见性。

- [ ] **Step 3: 运行页面合约测试**

Run:

```bash
pnpm --filter @ai-novel/client exec node --test tests/modelPreviewReadonly.contract.test.js
```

Expected: PASS，且原有“无 Transform/HDRI 编辑入口、保留系统 HDRI”断言继续通过。

## Task 4: 更新长期规则和用户可见记录

**Files:**

- Modify: `docs/wiki/architecture/model-preview-readonly.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新架构规则**

将“3D 画面显示非交互式线框包围盒”改为“3D 画面提供可选的非交互式线框包围盒，默认隐藏；显示开关只改变绘制状态”。在失败模式中补充：可见性默认不持久化，详情页重新进入仍隐藏；颜色和状态不能成为模型变换或环境设置入口。

- [ ] **Step 2: 更新用户视角的 release notes 与 README 最新更新**

在现有 `2026-08-31` 日期块合并一条简短说明：模型详情预览默认隐藏包围盒，用户可通过“显示包围盒”查看灰色尺寸线框。README 只保留最新日期摘要和 release notes 链接，不写内部文件、测试或实现过程。

## Task 5: 自测、浏览器验收和交付

**Files:**

- No new source files.

- [ ] **Step 1: 运行完整模型预览聚焦测试**

Run:

```bash
pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/models/modelLibrary3d/modelGeometryStats.test.mjs src/pages/models/modelLibrary3d/modelViewerCamera.test.mjs src/pages/models/modelLibrary3d/studioEnvironmentPresets.test.mjs tests/modelPreviewReadonly.contract.test.js tests/modelStudioEnvironment.contract.test.js tests/modelPreviewLighting.contract.test.js tests/modelTextureQuality.contract.test.js tests/scenePreviewEnvironmentUnification.contract.test.js tests/studioEnvironmentAssets.contract.test.js
```

Expected: 现有模型预览相关测试全部 PASS，新增的默认隐藏、灰色和 checkbox 合约包含在通过结果中。

- [ ] **Step 2: 运行客户端类型检查、构建和 diff 检查**

Run:

```bash
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
git diff --check
```

Expected: 三条命令均退出码 0；构建中的既有体积或 Browserslist 提示不作为本次失败，若出现本次文件的 TypeScript 错误必须修复后重跑。

- [ ] **Step 3: 使用内置浏览器验证真实交互**

访问 `http://127.0.0.1:5174/models/bed-12a`，确认：初始画面没有包围盒；勾选“显示包围盒”后出现灰色线框；取消勾选后线框消失；模型信息、相机查看、聚焦、复位、快照仍可用；无控制台错误。

- [ ] **Step 4: 自审、提交并集成**

提交前确认只包含本任务文件，用户可见改动已更新 release notes/README，运行：

```bash
git add client/src/pages/models/ModelEditorPage.tsx client/src/pages/models/modelLibrary3d/modelViewerApp.ts client/tests/modelPreviewReadonly.contract.test.js docs/wiki/architecture/model-preview-readonly.md docs/releases/release-notes.md README.md
git commit -s -m "feat(models): toggle model bounds preview"
```

然后从干净 `main` 执行：

```bash
pnpm workflow:integrate codex/model-preview-bounds-toggle --push --verify "pnpm --filter @ai-novel/client exec node --experimental-strip-types --test src/pages/models/modelLibrary3d/modelGeometryStats.test.mjs src/pages/models/modelLibrary3d/modelViewerCamera.test.mjs src/pages/models/modelLibrary3d/studioEnvironmentPresets.test.mjs tests/modelPreviewReadonly.contract.test.js tests/modelStudioEnvironment.contract.test.js tests/modelPreviewLighting.contract.test.js tests/modelTextureQuality.contract.test.js tests/scenePreviewEnvironmentUnification.contract.test.js tests/studioEnvironmentAssets.contract.test.js"
```

集成成功后确认 `main` 与 `origin/main` SHA 相同，清理本次已合并的 worktree 和本地分支，保留其它并发 worktree。
