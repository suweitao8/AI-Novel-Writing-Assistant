# 模型库缩略图视口加载 Implementation Plan

> **For agentic workers:** Execute each task in order. Keep the change in the isolated `codex/model-thumbnail-loading` worktree until self-test passes.

**Goal:** 让模型库只为视口附近的卡片启动 3D 缩略图生成，消除首屏全目录串行解析造成的长时间占位，同时保留完整卡片目录和现有预览质量。

**Architecture:** `ModelLibraryPage.tsx` 继续渲染全部目录；`ModelCard` 使用 `IntersectionObserver` 以 `rootMargin: "320px 0px"` 门控 `ensureThumbnail`。观察器触发后解除观察并订阅现有缩略图广播，`thumbnailStudio.ts` 的单工作室串行队列、缓存和 256×192 输出不变。

**Tech Stack:** React 19 + TypeScript + Vite, PlayCanvas, browser IntersectionObserver, Node.js `node:test`, pnpm workspace。

---

### Task 1: 用失败的合同测试锁定视口门控

**Files:**
- Modify: `client/tests/modelThumbnailPerformance.contract.test.js`
- Read-only targets: `client/src/pages/models/ModelLibraryPage.tsx`, `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`

- [ ] **Step 1: 添加失败测试**

在现有模型缩略图合同测试中加入以下断言：页面源码必须包含 `useRef`、`IntersectionObserver`、`rootMargin: "320px 0px"` 和卡片 ref；`ensureThumbnail(entry)` 必须位于观察器回调/兼容兜底函数中，而不是卡片挂载 effect 的第一层无条件调用。

- [ ] **Step 2: 运行聚焦测试确认当前实现失败**

从工作树根目录运行：

```powershell
node --test client/tests/modelThumbnailPerformance.contract.test.js
```

预期新增断言失败，因为当前卡片 effect 在挂载时直接调用 `ensureThumbnail(entry)`。

### Task 2: 实现卡片级视口门控

**Files:**
- Modify: `client/src/pages/models/ModelLibraryPage.tsx`

- [ ] **Step 1: 为卡片保存根节点引用和已缓存状态**

引入 `useRef`，将 `Link` 的根节点绑定到 `HTMLAnchorElement` ref。初始状态继续从 `getThumbnail(entry.id)` 读取；缓存命中时直接显示缩略图，不创建观察器。

- [ ] **Step 2: 按视口启动请求并清理生命周期**

在 effect 中创建一次 `IntersectionObserver`，配置 `rootMargin: "320px 0px"`、`threshold: 0`。卡片首次相交时断开观察，订阅广播，再调用 `ensureThumbnail`；若调用发现已有缓存则立即同步状态并退订。effect 清理时断开观察并退订。

- [ ] **Step 3: 保留兼容兜底与原有视觉合同**

当 `IntersectionObserver` 不存在或卡片节点不可用时直接请求一次缩略图。保留 `aspect-[4/3]`、现有 spinner、`loading="lazy"`、`decoding="async"` 和所有卡片链接/筛选行为，不新增说明性 UI 文案。

### Task 3: 记录长期规则和用户可见更新

**Files:**
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/wiki/architecture/model-preview-framing.md`
- Create: `docs/wiki/debugging/model-library-thumbnail-slow-loading.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新模型库长期规则**

在模型库 wiki 的缩略图规则中记录：浏览器图片懒加载不能替代 3D 生成门控，所有模型卡片请求必须经过视口附近观察器，远离视口的卡片不能在挂载时进入队列；动画库保持独立规则。

- [ ] **Step 2: 增加调试知识页**

按 `Background / Evidence / Root Cause / Decision / Failure Modes / Verification` 记录本次排查路径，明确“全量卡片挂载 + 单工作室串行 GLB/贴图/材质渲染”是慢加载根因，避免以后只继续压缩缩略图而漏掉调度问题。

- [ ] **Step 3: 更新用户可见发布面**

在 `docs/releases/release-notes.md` 的 `2026-09-01` 条目增加模型库首屏加载优化；README 的“最新更新”只保留最新日期块，使用用户视角描述卡片会按浏览位置准备预览，不写内部实现名。

### Task 4: 通过自测门禁

**Files:**
- Test and build outputs only; do not commit generated artifacts.

- [ ] **Step 1: 运行聚焦合同和源码测试**

```powershell
git diff --check
node --experimental-strip-types --test client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs client/tests/modelThumbnailPerformance.contract.test.js client/tests/modelPreviewLighting.contract.test.js client/tests/modelStudioEnvironment.contract.test.js client/tests/scenePreviewEnvironmentUnification.contract.test.js
```

- [ ] **Step 2: 运行共享包构建、客户端类型检查和构建**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

- [ ] **Step 3: 在固定端口做真实浏览器回归**

使用内置浏览器访问 `http://127.0.0.1:5174/models`，确认完整网格出现、首屏卡片先于远端卡片准备缩略图、滚动到后续区域后新卡片开始生成；检查模型图片继续为 256×192 且保留 lazy/async 属性，记录控制台错误并截图留证。

### Task 5: 签名提交、合并、推送和清理

- [ ] **Step 1: 自审 diff 并创建签名提交**

确认工作树只包含本计划列出的页面、测试、wiki、设计/计划、README 和发布说明，然后运行：

```powershell
git add client/src/pages/models/ModelLibraryPage.tsx client/tests/modelThumbnailPerformance.contract.test.js docs/superpowers/specs/2026-09-01-model-library-thumbnail-loading-design.md docs/superpowers/plans/2026-09-01-model-library-thumbnail-loading.md docs/wiki/product/model-library.md docs/wiki/debugging/model-library-thumbnail-slow-loading.md docs/releases/release-notes.md README.md
git commit -s -m "perf: gate model thumbnails by viewport"
```

- [ ] **Step 2: 从干净 main 集成并显式推送**

在主工作树恢复 hooks、运行工作区完整性检查后执行：

```powershell
pnpm setup:git-hooks
pnpm check:workspace-integrity
pnpm workflow:integrate codex/model-thumbnail-loading --push --verify "pnpm --filter @ai-novel/client typecheck"
```

- [ ] **Step 3: 核验远端并只清理本次工作树**

确认 `HEAD` 与 `origin/main` 相同、主工作树干净，检查所有 worktree 后只移除本次已合并的 `D:\Github\AI-Novel-Writing-Assistant-model-thumbnail-loading` 和本地分支；保留其他并行工作树。

## Self-review

- 首屏根因有真实页面和源码链路证据；修复只改变请求时机，不改变渲染质量和资源目录。
- 卡片完整 DOM、搜索/筛选、键盘链接、缓存命中和旧浏览器兜底均保留。
- 失败测试先锁定行为，再实现；UI 变化包含类型检查、合同测试和内置浏览器回归。
- 用户可见行为写入发布说明，视口门控和失败模式写入开发 wiki；动画缩略图、详情页和数据库均不在范围内。
