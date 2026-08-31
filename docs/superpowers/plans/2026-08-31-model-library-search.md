# 模型与动画库搜索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在模型库隐藏角色模型展示，并为模型库与动画库提供可访问的实时搜索。

**Architecture:** 保留底层 `MODEL_LIBRARY` 角色资源，新增纯函数负责模型可见性和搜索匹配；模型页使用该函数构建可展示目录，动画页扩展既有筛选函数，把搜索作为与组别、套装、动作类型的交集条件。两页用受控 `Input` + 250ms 防抖，结果为空时显示清除入口。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、shadcn `Input`/`Button`、lucide-react、Node test runner。

---

### Task 1: 建立模型与动画搜索的纯逻辑契约

**Files:**
- Create: `client/src/config/librarySearch.ts`
- Create: `client/src/config/modelLibraryFilters.ts`
- Create: `client/src/config/modelLibraryFilters.test.mjs`
- Modify: `client/src/config/animationLibrary.ts`
- Modify: `client/src/config/animationLibraryTaxonomy.test.mjs`

- [ ] **Step 1: 写失败测试**

在 `modelLibraryFilters.test.mjs` 中导入真实目录和待实现函数，覆盖以下行为：空搜索返回全部非角色模型；角色条目不出现在模型可见结果；模型名称、文件名、分类可以命中，大小写不同的英文文件名也可以命中；无匹配词返回空数组。为动画目录追加测试：片段名、套装名和动作类型可搜索命中，搜索与现有组别筛选取交集。

在 `animationLibraryTaxonomy.test.mjs` 中增加一个通过 `filterAnimationLibraryEntries(ANIMATION_LIBRARY, { query: ... })` 的断言，锁定公开筛选 API 的搜索字段行为。

- [ ] **Step 2: 运行测试确认旧实现按预期失败**

Run: `node --experimental-strip-types --test client/src/config/modelLibraryFilters.test.mjs client/src/config/animationLibraryTaxonomy.test.mjs`

Expected: FAIL，因为搜索工具不存在，动画筛选器还不接受 `query`，模型目录也还没有隐藏角色的纯逻辑入口。

- [ ] **Step 3: 实现最小纯逻辑**

在 `librarySearch.ts` 提供 `normalizeLibrarySearchQuery(value)` 和 `matchesLibrarySearchQuery(query, values)`，统一 trim、大小写折叠和空词匹配。

在 `modelLibraryFilters.ts` 提供 `isModelLibraryEntryVisible(entry)` 与 `filterModelLibraryEntries(entries, query)`：只排除 `category === "角色"`，搜索字段为 `name`、`fileName`、`category`。

在 `animationLibrary.ts` 给 `AnimationLibraryFilters` 增加 `query?: string`，在现有三项筛选之后追加对 `name`、`clipName`、`id`、`packLabel`、`actionTypeLabel`、`sourceAssetName`、`sourcePack` 和 `sourceAssetPath` 的搜索匹配。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --test client/src/config/modelLibraryFilters.test.mjs client/src/config/animationLibraryTaxonomy.test.mjs`

Expected: all tests pass with zero failures。

### Task 2: 修改模型库页面的展示和搜索交互

**Files:**
- Modify: `client/src/pages/models/ModelLibraryPage.tsx`
- Create: `client/tests/modelAnimationLibrarySearch.contract.test.js`

- [ ] **Step 1: 写页面契约测试并确认失败**

页面契约测试读取真实页面源码，断言页面引用 `filterModelLibraryEntries`、渲染 `data-model-search`、`aria-label="搜索模型"`、`data-model-empty`，并不再直接用完整 `MODEL_LIBRARY` 生成分类计数或卡片列表。先运行测试，确认旧页面缺少这些契约。

- [ ] **Step 2: 实现模型页面**

增加 `searchInput`/防抖后的 `search` 状态；用 `filterModelLibraryEntries(MODEL_LIBRARY, search)` 作为可见目录，分类计数和页签只从可见目录派生。搜索栏使用现有 `Input` 和 `Search` 图标，搜索字段说明放在 placeholder 中。

当最终结果为空时显示 `data-model-empty`，并在搜索词或分类生效时提供 `Button` 清除搜索和分类；保留现有模型卡片、缩略图订阅和路由行为。

- [ ] **Step 3: 运行页面契约测试**

Run: `node --test client/tests/modelAnimationLibrarySearch.contract.test.js`

Expected: PASS。

### Task 3: 修改动画库页面的展示和搜索交互

**Files:**
- Modify: `client/src/pages/animations/AnimationLibraryPage.tsx`
- Modify: `client/tests/modelAnimationLibrarySearch.contract.test.js`

- [ ] **Step 1: 扩展失败契约**

在页面契约中断言动画页存在 `data-animation-search`、`aria-label="搜索动画"` 和 `data-animation-empty`，并通过 `filterAnimationLibraryEntries` 传入搜索条件；在旧页面上运行，确认契约失败。

- [ ] **Step 2: 实现动画搜索**

增加 250ms 防抖的 `searchInput`/`search` 状态；`packScopedEntries` 不带搜索词以保持动作类型计数可调整，最终 `entries` 带 `query: search` 与其他筛选取交集。增加搜索栏、最终结果空状态和“清除筛选”对搜索词的重置；保留现有组别、套装、动作类型筛选和动画缩略图逻辑。

- [ ] **Step 3: 运行页面契约与逻辑测试**

Run: `node --test client/tests/modelAnimationLibrarySearch.contract.test.js`

Run: `node --experimental-strip-types --test client/src/config/modelLibraryFilters.test.mjs client/src/config/animationLibraryTaxonomy.test.mjs`

Expected: all tests pass with zero failures。

### Task 4: 文档、质量检查和浏览器验收

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `docs/wiki/product/model-library.md`

- [ ] **Step 1: 更新用户可见说明与稳定 Wiki 规则**

在发布说明和 README 最新更新中说明模型库隐藏角色预览、模型/动画支持搜索；在模型库 Wiki 中记录角色资源与模型展示层分离，以及两页搜索字段和筛选交集规则。

- [ ] **Step 2: 运行代码检查**

Run: `pnpm --filter @ai-novel/shared build`

Run: `pnpm --filter @ai-novel/client typecheck`

Run: `pnpm --filter @ai-novel/client build`

Run: `pnpm check:docs-manifest`

Expected: all commands exit 0。

- [ ] **Step 3: 使用内置浏览器验收**

访问 `/models`：确认没有“角色”页签和 UAL2 角色卡片；输入可见模型名称后结果缩小，输入不存在的词显示空状态，清除后恢复。

访问 `/animations`：确认输入片段名、套装名或动作类型可以缩小结果；与组别/套装/动作类型组合时结果取交集，清除后恢复；记录控制台没有新增错误。

- [ ] **Step 4: 提交前复核**

运行 `git diff --check`、聚焦测试和 `git status --short`，确认只包含本计划范围内的文件，再执行签名提交。
