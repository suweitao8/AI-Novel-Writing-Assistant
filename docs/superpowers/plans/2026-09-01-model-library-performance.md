# 模型库预览加载与分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将模型库改为 24 条/页，并让缩略图只为当前页附近卡片生成，同时把缓存持久化从逐张同步全量写入改为合并调度，缩短首屏可用时间。

**Architecture:** 先对静态模型清单做现有可见性、分类和搜索筛选，再由纯函数计算页码和当前页切片；页面只挂载当前页卡片，卡片内部继续使用 `IntersectionObserver` 进行 320px 视口预加载。缩略图工作室保持单实例、串行渲染和 256×192 JPEG 合同，但离页卡片会取消尚未开始的排队请求，生成结果先写内存缓存，localStorage 在浏览器空闲时合并写入。

**Tech Stack:** React 19 + TypeScript + Vite, Tailwind/shadcn Button, PlayCanvas, browser IntersectionObserver/requestIdleCallback, Node.js `node:test`, pnpm workspace。

---

### Task 1: 用失败测试锁定分页和缩略图调度合同

**Files:**
- Create: `client/src/pages/models/modelLibraryPagination.test.mjs`
- Modify: `client/tests/modelThumbnailPerformance.contract.test.js`
- Read-only targets: `client/src/pages/models/ModelLibraryPage.tsx`, `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`

- [ ] **Step 1: 写分页行为测试**

创建 `client/src/pages/models/modelLibraryPagination.test.mjs`，内容如下。该测试先导入尚不存在的分页模块，应该因为功能尚未实现而失败：

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_LIBRARY_PAGE_SIZE,
  getModelLibraryPage,
} from "./modelLibraryPagination.ts";

const entries = Array.from({ length: 51 }, (_, index) => `model-${index + 1}`);

test("模型库默认每页 24 条并返回正确的页切片", () => {
  assert.equal(MODEL_LIBRARY_PAGE_SIZE, 24);
  assert.deepEqual(getModelLibraryPage(entries, 1), {
    page: 1,
    totalPages: 3,
    entries: entries.slice(0, 24),
  });
  assert.deepEqual(getModelLibraryPage(entries, 3), {
    page: 3,
    totalPages: 3,
    entries: entries.slice(48),
  });
});

test("模型库页码会限制在有效范围，空结果仍有第 1 页", () => {
  assert.equal(getModelLibraryPage(entries, 0).page, 1);
  assert.equal(getModelLibraryPage(entries, 99).page, 3);
  assert.deepEqual(getModelLibraryPage([], 5), {
    page: 1,
    totalPages: 1,
    entries: [],
  });
});
```

- [ ] **Step 2: 扩展页面/队列合同测试**

在 `client/tests/modelThumbnailPerformance.contract.test.js` 追加以下测试，先锁定用户可见分页、筛选重置、离页取消和持久化批处理行为：

```js
test("模型库只渲染当前分页并提供边界安全的分页控件", () => {
  assert.match(paginationSource, /MODEL_LIBRARY_PAGE_SIZE\s*=\s*24/);
  assert.match(pageSource, /getModelLibraryPage/);
  assert.match(pageSource, /pageEntries/);
  assert.match(paginationComponentSource, /data-model-pagination/);
  assert.match(paginationComponentSource, /第[\s\S]*页/);
});

test("模型库筛选变化回到第一页并释放离页缩略图请求", () => {
  assert.match(pageSource, /setPage\(1\)/);
  assert.match(pageSource, /cancelThumbnail\(entry\.id\)/);
});

test("缩略图生成完成后安排合并持久化，不在队列循环中同步重写缓存", () => {
  assert.match(thumbnailSource, /scheduleCachePersist/);
  assert.match(thumbnailSource, /requestIdleCallback/);
  assert.doesNotMatch(
    thumbnailSource,
    /memoryCache\.set\(entry\.id, dataUrl\);\s*persistCache\(\)/,
  );
});
```

- [ ] **Step 3: 运行 RED 检查**

运行：

```powershell
node --experimental-strip-types --test client/src/pages/models/modelLibraryPagination.test.mjs client/tests/modelThumbnailPerformance.contract.test.js
```

预期：测试失败；分页测试因 `modelLibraryPagination.ts` 尚不存在而失败，页面合同因尚未出现 `MODEL_LIBRARY_PAGE_SIZE`、`pageEntries`、`data-model-pagination`、`cancelThumbnail` 和 `scheduleCachePersist` 而失败。不能把失败改成跳过测试。

### Task 2: 实现可测试的分页计算与分页控件

**Files:**
- Create: `client/src/pages/models/modelLibraryPagination.ts`
- Create: `client/src/pages/models/components/ModelLibraryPagination.tsx`
- Modify: `client/src/pages/models/ModelLibraryPage.tsx`

- [ ] **Step 1: 实现纯分页函数**

创建 `client/src/pages/models/modelLibraryPagination.ts`：

```ts
export const MODEL_LIBRARY_PAGE_SIZE = 24;

export interface ModelLibraryPage<T> {
  page: number;
  totalPages: number;
  entries: T[];
}

export function getModelLibraryPage<T>(
  entries: readonly T[],
  requestedPage: number,
  pageSize = MODEL_LIBRARY_PAGE_SIZE,
): ModelLibraryPage<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : MODEL_LIBRARY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(entries.length / safePageSize));
  const safePage = Number.isFinite(requestedPage)
    ? Math.min(totalPages, Math.max(1, Math.floor(requestedPage)))
    : 1;
  const start = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    totalPages,
    entries: entries.slice(start, start + safePageSize),
  };
}
```

- [ ] **Step 2: 让分页测试变绿**

运行：

```powershell
node --experimental-strip-types --test client/src/pages/models/modelLibraryPagination.test.mjs
```

预期：2 个分页行为测试全部通过。

- [ ] **Step 3: 实现模型页私有分页控件**

创建 `client/src/pages/models/components/ModelLibraryPagination.tsx`，只复用项目现有 `Button` 和语义 token：

```tsx
import { Button } from "@/components/ui/button";

export function ModelLibraryPagination(props: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (props.totalPages <= 1) return null;

  return (
    <nav
      className="flex flex-wrap items-center justify-end gap-2"
      aria-label="模型列表分页"
      data-model-pagination
    >
      <Button
        type="button"
        variant="outline"
        disabled={props.page <= 1}
        onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
      >
        上一页
      </Button>
      <div className="flex h-9 min-w-28 items-center justify-center px-3 text-sm text-muted-foreground" aria-live="polite">
        第 <span className="mx-1 font-medium tabular-nums text-foreground">{props.page}</span> /{" "}
        <span className="mx-1 font-medium tabular-nums text-foreground">{props.totalPages}</span> 页
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={props.page >= props.totalPages}
        onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
      >
        下一页
      </Button>
    </nav>
  );
}
```

- [ ] **Step 4: 在页面中接入筛选后分页**

在 `ModelLibraryPage.tsx`：

1. 引入 `getModelLibraryPage`、`MODEL_LIBRARY_PAGE_SIZE` 和 `ModelLibraryPagination`。
2. 让 `entries` 以 `visibleEntries` 为筛选源，确保分类计数、搜索结果和分页总数使用同一份可展示目录。
3. 增加 `page` state，使用 `getModelLibraryPage(entries, page)` 得到 `currentPage`、`totalPages` 和 `pageEntries`。
4. 添加 `useEffect(() => setPage(1), [category, search])`；另一个 effect 在筛选结果缩小时把越界页收敛到 `currentPage`。
5. 只对 `pageEntries` 调用 `entries.map`，并在网格下方渲染 `ModelLibraryPagination`。

页面核心状态应具有以下形态：

```tsx
const [page, setPage] = useState(1);
const entries = useMemo(() => {
  const categoryEntries = category === "全部"
    ? visibleEntries
    : visibleEntries.filter((entry) => entry.category === category);
  return filterModelLibraryEntries(categoryEntries, search);
}, [category, search, visibleEntries]);
const currentPage = getModelLibraryPage(entries, page, MODEL_LIBRARY_PAGE_SIZE);

useEffect(() => {
  setPage(1);
}, [category, search]);

useEffect(() => {
  if (page !== currentPage.page) setPage(currentPage.page);
}, [currentPage.page, page]);
```

渲染时使用 `currentPage.entries`，分页控件传入 `currentPage.page`、`currentPage.totalPages` 和 `setPage`；计数区继续显示筛选后的总数，并补充当前页范围时不得把“当前页数量”误当成筛选总数。

- [ ] **Step 5: 运行分页测试和页面合同测试**

运行：

```powershell
node --experimental-strip-types --test client/src/pages/models/modelLibraryPagination.test.mjs client/tests/modelThumbnailPerformance.contract.test.js
```

预期：分页测试和既有缩略图尺寸/视口门控合同全部通过。

### Task 3: 释放离页队列并合并缓存持久化

**Files:**
- Modify: `client/src/pages/models/modelLibrary3d/thumbnailStudio.ts`
- Modify: `client/src/pages/models/ModelLibraryPage.tsx`

- [ ] **Step 1: 添加未开始请求取消入口并先验证页面清理合同**

在 `thumbnailStudio.ts` 增加：

```ts
export function cancelThumbnail(id: string): void {
  pendingEntries.delete(id);
}
```

在 `ModelCard` effect 的 cleanup 中，在解除 observer 和订阅后调用 `cancelThumbnail(entry.id)`。已缓存或已从队列取出的条目调用该函数均安全；不强制中断当前正在加载的 GLB，避免破坏 PlayCanvas 资源清理。

- [ ] **Step 2: 替换逐张同步持久化**

保留现有 `persistCache()` 的单次全量序列化逻辑，但增加一个只允许单任务存在的调度器：

```ts
let cachePersistIdleId: number | null = null;
let cachePersistTimer: ReturnType<typeof window.setTimeout> | null = null;

function scheduleCachePersist(): void {
  if (!storageEnabled || cachePersistIdleId !== null || cachePersistTimer !== null) return;
  const flush = () => {
    cachePersistIdleId = null;
    cachePersistTimer = null;
    persistCache();
  };
  if (typeof window.requestIdleCallback === "function") {
    cachePersistIdleId = window.requestIdleCallback(flush, { timeout: 1000 });
  } else {
    cachePersistTimer = window.setTimeout(flush, 250);
  }
}
```

生成循环改为：

```ts
const dataUrl = await active.render(entry);
memoryCache.set(entry.id, dataUrl);
scheduleCachePersist();
emitThumbnails();
```

不在 `disposeThumbnailStudio()` 中等待或同步 flush；详情页启动继续不被缓存写入阻塞。`persistCache()` 失败时仍将 `storageEnabled` 设为 `false`，内存缓存继续可用。

- [ ] **Step 3: 运行 RED→GREEN 聚焦合同**

运行：

```powershell
node --experimental-strip-types --test client/tests/modelThumbnailPerformance.contract.test.js
```

预期：取消入口和合并持久化合同通过，且既有 256×192、HDRI、阴影、详情生命周期合同不回退。

### Task 4: 更新长期 wiki 和用户可见发布面

**Files:**
- Modify: `docs/wiki/debugging/model-library-thumbnail-slow-loading.md`
- Modify: `docs/wiki/product/model-library.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新调试 wiki 的当前规则**

在 `docs/wiki/debugging/model-library-thumbnail-slow-loading.md` 保留已有根因证据，并把当前决策改为：模型库使用 24 条/页，当前页仍由 `IntersectionObserver` 以 320px 门控生成，离页未开始请求会被释放，缓存写入采用空闲批处理；明确 256×192 已足够，继续压缩不是主修复。

- [ ] **Step 2: 更新模型库产品/架构规则**

在 `docs/wiki/product/model-library.md` 的模型库展示规则附近补充分页和缩略图调度边界：静态目录仍是单一事实源，分页只控制浏览器展示与生成压力，不是服务端 CRUD；模型详情和动画库规则保持不变。

- [ ] **Step 3: 更新发布说明和 README 最新更新**

在 `docs/releases/release-notes.md` 的 `2026-09-01` 条目增加用户视角说明：模型库按页浏览，当前页附近优先准备预览，切换搜索/分类后页码稳定回到第一页。同步刷新 `README.md` 的 `## 最新更新` 当前日期块；不要写内部文件名、缓存 key 或测试名。

### Task 5: 通过自测门禁并完成交付

**Files:**
- Test/build outputs only; do not commit generated artifacts.

- [ ] **Step 1: 安装/确认隔离工作树依赖并运行聚焦测试**

如工作树缺少依赖，运行 `pnpm install --offline`；若离线缓存不可用，运行普通 `pnpm install`。随后运行：

```powershell
git diff --check
node --experimental-strip-types --test client/src/pages/models/modelLibraryPagination.test.mjs client/src/pages/models/modelLibrary3d/modelPreviewFraming.test.mjs client/tests/modelThumbnailPerformance.contract.test.js client/tests/modelPreviewLighting.contract.test.js client/tests/modelStudioEnvironment.contract.test.js client/tests/scenePreviewEnvironmentUnification.contract.test.js
```

预期：所有聚焦测试通过；若某测试因依赖环境失败，记录具体模块并补齐依赖后重跑，不用 `--no-verify` 绕过。

- [ ] **Step 2: 运行客户端类型检查和构建**

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/client typecheck
pnpm --filter @ai-novel/client build
```

- [ ] **Step 3: 在固定端口执行内置浏览器 smoke**

使用 Codex 内置浏览器访问 `http://127.0.0.1:5174/models`，记录以下证据：

1. 首次打开只挂载 24 张模型卡片，页面显示第 1 / 9 页（以当前 208 条目录为准）。
2. 首屏图片仍为 `naturalWidth=256`、`naturalHeight=192`，并保持 `loading="lazy"`、`decoding="async"`。
3. 点击“下一页”后变为第 2 / 9 页，卡片名称发生变化；点击“上一页”回到第 1 页；第一页“上一页”和最后一页“下一页”均禁用。
4. 输入搜索词或切换分类后，结果回到第 1 页；无结果仍显示清除筛选入口。
5. 详情链接仍能打开模型预览；缩略图后台工作不会阻塞详情页；控制台无新增 error，现有纹理格式 warning 单独记录。
6. 截取模型库首屏和分页后的关键截图作为验收证据。

- [ ] **Step 4: 自审并创建签名提交**

确认工作树只包含本计划范围内的页面、测试、分页模块、wiki、设计/计划、README 和发布说明；运行：

```powershell
git status --short
git diff --check
git add client/src/pages/models/ModelLibraryPage.tsx client/src/pages/models/components/ModelLibraryPagination.tsx client/src/pages/models/modelLibraryPagination.ts client/src/pages/models/modelLibraryPagination.test.mjs client/src/pages/models/modelLibrary3d/thumbnailStudio.ts client/tests/modelThumbnailPerformance.contract.test.js docs/wiki/debugging/model-library-thumbnail-slow-loading.md docs/wiki/product/model-library.md docs/releases/release-notes.md README.md docs/superpowers/plans/2026-09-01-model-library-performance.md
git commit -s -m "perf: paginate model library thumbnails"
```

- [ ] **Step 5: 从干净 main 集成、推送并清理**

主工作区仍有其他并行任务时，不触碰其文件；待主工作区可集成后，在主工作树运行：

```powershell
pnpm setup:git-hooks
pnpm check:workspace-integrity
pnpm workflow:integrate codex/model-library-performance --push --verify "pnpm --filter @ai-novel/client typecheck"
```

集成后确认 `HEAD` 与 `origin/main` 相同、主工作树干净；只移除本次已合并的 `D:\Github\AI-Novel-Writing-Assistant-model-library-performance` 工作树和本地分支，保留所有其他并行工作树，并运行 `git worktree prune`。

## Self-review

- 设计中的所有需求均有对应任务：24 条分页、筛选重置、离页队列释放、缓存批处理、256×192 保持、文档/发布面更新、客户端检查和真实浏览器验收。
- 分页纯函数先写测试并确认失败，再实现；页面合同测试覆盖当前页渲染和缩略图调度，避免只测按钮外观。
- 没有用继续压小图片尺寸来替代根因修复；不改变模型目录、详情页、HDRI、材质、阴影或动画库。
- 计划不包含未完成占位内容或未定义的模块名；所有代码步骤的接口与调用方保持一致。
