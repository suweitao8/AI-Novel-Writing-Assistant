# 漫剧专注模式下的系统设置可见性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在漫剧开发专注模式下隐藏小说向的系统设置检查与入口，同时保留漫剧所需配置和未来恢复完整产品线的能力。

**Architecture:** 以 `client/src/config/dramaFocusNav.ts` 作为唯一可见性策略源，分别提供路由入口过滤和功能卡片过滤。系统设置总览根据功能策略决定是否渲染 readiness 卡片，并停用只为该卡片服务的 RAG/写法查询；移动端将漫剧主入口映射后再过滤，避免专注模式下入口被自身过滤掉。所有隐藏行为通过契约测试锁定，路由和数据层保持兼容。

**Tech Stack:** React 19、React Router、TanStack Query、TypeScript、Tailwind 语义 token、Node `node:test` 契约测试。

---

## 文件结构与职责

- Modify: `client/src/config/dramaFocusNav.ts` — 集中维护漫剧专注模式的路由/功能可见性策略。
- Modify: `client/src/pages/settings/views/SettingsOverviewPage.tsx` — 隐藏小说 readiness 卡片并停用其专属查询，保留漫剧设置卡片。
- Modify: `client/src/components/layout/mobile/mobileSiteNavigation.ts` — 先把“创作”主入口映射为“漫剧”，再应用路由可见性；统一移动端标题。
- Modify: `client/tests/settingsNavigationContracts.test.js` — 对齐当前设置路由并锁定总览可见性合同。
- Modify: `client/tests/mobileSiteNavigation.test.js` — 锁定漫剧专注模式的移动端主导航和“更多”菜单。
- Create: `client/tests/dramaFocusNav.test.js` — 测试集中式路由/功能可见性策略及恢复开关。
- Modify: `docs/wiki/product/settings-readiness.md` — 记录完整写作模式与漫剧专注模式的适用边界。
- Modify: `docs/releases/release-notes.md` — 写入用户可见的系统设置收敛说明。
- Modify: `README.md` — 刷新“最新更新”中的用户可见摘要。

### Task 1: 写入可见性策略的失败测试

**Files:**
- Create: `client/tests/dramaFocusNav.test.js`

- [ ] **Step 1: 创建策略契约测试**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAMA_FOCUS_MODE,
  isDramaFocusFeatureVisible,
  isNavRouteVisible,
} from "../src/config/dramaFocusNav.ts";

test("漫剧专注模式隐藏小说生产导航并保留漫剧设置入口", () => {
  assert.equal(DRAMA_FOCUS_MODE, true);
  assert.equal(isNavRouteVisible("/"), false);
  assert.equal(isNavRouteVisible("/novels"), false);
  assert.equal(isNavRouteVisible("/creative-hub"), false);
  assert.equal(isNavRouteVisible("/drama"), true);
  assert.equal(isNavRouteVisible("/models"), true);
  assert.equal(isNavRouteVisible("/settings"), true);
  assert.equal(isNavRouteVisible("/settings/models"), true);
  assert.equal(isNavRouteVisible("/settings/narrator-voice"), true);
  assert.equal(isNavRouteVisible("/settings/records"), true);
  assert.equal(isNavRouteVisible("/settings/art-style"), true);
});

test("漫剧专注模式隐藏小说创作可用性检查，关闭模式后恢复", () => {
  assert.equal(isDramaFocusFeatureVisible("novel-readiness"), false);
  assert.equal(isDramaFocusFeatureVisible("novel-readiness", false), true);
});
```

- [ ] **Step 2: 运行测试确认缺口真实存在**

Run: `pnpm exec node --experimental-strip-types --test tests/dramaFocusNav.test.js`

Expected: FAIL because `isDramaFocusFeatureVisible` has not been implemented yet.

### Task 2: 写入系统总览与移动端行为的失败契约

**Files:**
- Modify: `client/tests/settingsNavigationContracts.test.js`
- Modify: `client/tests/mobileSiteNavigation.test.js`

- [ ] **Step 1: 将设置路由合同对齐当前产品入口**

在设置路由测试中断言 `settings/models`、`settings/director`、`settings/knowledge`、`settings/narrator-voice`、`settings/appearance`、`settings/records`、`settings/art-style` 和 `settings`；移除已经不存在的 `settings/maintenance` 与旧的“模型与厂商/桌面与维护”标签断言。

新增总览源代码合同：

```js
test("漫剧专注模式隐藏小说 readiness 并保留漫剧设置卡片", async () => {
  const source = await read("src/pages/settings/views/SettingsOverviewPage.tsx");
  assert.match(source, /isDramaFocusFeatureVisible/);
  assert.match(source, /novel-readiness/);
  assert.match(source, /enabled: SHOW_NOVEL_READINESS/);
  assert.match(source, /SHOW_NOVEL_READINESS \? <SettingsReadinessCard items=\{items\} \/> : null/);
  assert.match(source, /settings\/models/);
  assert.match(source, /settings\/narrator-voice/);
});
```

- [ ] **Step 2: 把移动端期望改成漫剧专注模式**

将 `getMobilePrimaryNavItems()` 期望改为：

```js
[
  ["creation", "/drama", "漫剧"],
  ["tasks", "/tasks", "任务"],
  ["more", "", "更多"],
]
```

将“更多”菜单期望改为只保留当前策略允许的路径：`/models`、`/tasks`、`/art-style`、`/settings`；并断言 `getMobilePageTitle("/drama") === "漫剧"`。

- [ ] **Step 3: 运行新增/更新测试确认实现缺口**

Run: `pnpm exec node --experimental-strip-types --test tests/dramaFocusNav.test.js tests/settingsNavigationContracts.test.js tests/mobileSiteNavigation.test.js`

Expected: the new feature assertion and the mapped mobile navigation assertions remain red against the current implementation; these failures are the intended implementation gaps and are not a green gate yet.

### Task 3: 实现集中式策略与系统总览过滤

**Files:**
- Modify: `client/src/config/dramaFocusNav.ts`
- Modify: `client/src/pages/settings/views/SettingsOverviewPage.tsx`

- [ ] **Step 1: 添加带类型的功能可见性策略**

在现有路由集合后加入：

```ts
export type DramaFocusFeature = "novel-readiness";

const DRAMA_FOCUS_HIDDEN_FEATURES = new Set<DramaFocusFeature>([
  "novel-readiness",
]);

export function isDramaFocusFeatureVisible(
  feature: DramaFocusFeature,
  focusMode = DRAMA_FOCUS_MODE,
): boolean {
  return !focusMode || !DRAMA_FOCUS_HIDDEN_FEATURES.has(feature);
}
```

保留 `isNavRouteVisible` 的现有默认行为，避免改动其他路由调用方。

- [ ] **Step 2: 让系统总览停用 readiness 专属查询**

在 `SettingsOverviewPage.tsx` 使用策略常量：

```tsx
const SHOW_NOVEL_READINESS = isDramaFocusFeatureVisible("novel-readiness");
```

将 RAG 与写法查询配置为 `enabled: SHOW_NOVEL_READINESS`，将 readiness `useMemo` 在隐藏时返回空数组，并把 JSX 改为：

```tsx
<SettingsShell
  title="系统设置"
  description={SHOW_NOVEL_READINESS
    ? "查看创作环境状态，并进入需要调整的设置。"
    : "配置漫剧所需的模型、音色、画风和输出设置。"}
>
  {SHOW_NOVEL_READINESS ? <SettingsReadinessCard items={items} /> : null}
  <DramaVideoRenderProfileCard />
  {/* 保留现有 entries 渲染 */}
</SettingsShell>
```

不删除 `SettingsReadinessCard` 或其构建函数，以便完整写作模式恢复时继续可用。

- [ ] **Step 3: 运行策略与设置契约**

Run: `pnpm exec node --experimental-strip-types --test tests/dramaFocusNav.test.js tests/settingsNavigationContracts.test.js`

Expected: PASS，所有策略、系统总览过滤和保留入口合同通过。

### Task 4: 修复移动端漫剧入口并锁定可见集合

**Files:**
- Modify: `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- Modify: `client/tests/mobileSiteNavigation.test.js`

- [ ] **Step 1: 在过滤前映射专注模式主入口**

将 `getMobilePrimaryNavItems` 改为先映射后过滤：

```ts
export function getMobilePrimaryNavItems(): MobileNavItem[] {
  const modeItems = DRAMA_FOCUS_MODE
    ? primaryNavItems.map((item) => (
      item.key === "creation"
        ? { ...item, label: "漫剧", to: "/drama" }
        : item
    ))
    : primaryNavItems;
  return modeItems.filter((item) => isNavRouteVisible(item.to));
}
```

把 `/drama` 的 route title 从“短剧”改为“漫剧”。为使现有 Node 契约测试可直接执行，将本文件对专注模式配置的 import 改为同一源码树内的相对路径 `../../../config/dramaFocusNav`，不改变 Vite alias 或运行时模块合同。

- [ ] **Step 2: 运行移动端契约**

Run: `pnpm exec node --experimental-strip-types --test tests/mobileSiteNavigation.test.js`

Expected: PASS，主导航包含漫剧，更多菜单不包含已隐藏的小说入口，标题统一为漫剧。

### Task 5: 自测、文档和交付

**Files:**
- Modify: `docs/wiki/product/settings-readiness.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: 更新稳定 Wiki 规则**

在 `settings-readiness.md` 的 Decision/Current Rule 中说明：完整写作模式保留 readiness 首屏；`DRAMA_FOCUS_MODE` 开启时，漫剧设置总览隐藏小说 readiness，并停用只服务该卡片的 RAG/写法状态查询，模型等漫剧依赖仍保留。不要写当前提交文件列表或一次性工作记录。

- [ ] **Step 2: 更新用户可见发布信息**

使用 `readme-release-updater` 检查本分支范围，在 `2026-08-29` 日期块合并一条面向用户的说明：系统设置聚焦漫剧所需配置，隐藏暂不使用的小说创作检查与入口，同时保留模型、旁白、画风、记录和视频输出。刷新 README 的 `## 最新更新` 只保留最新日期摘要，并链接完整发布说明。

- [ ] **Step 3: 运行代码级自测**

Run: `pnpm exec node --experimental-strip-types --test tests/dramaFocusNav.test.js tests/settingsNavigationContracts.test.js tests/mobileSiteNavigation.test.js`

Expected: all focused navigation/settings tests pass.

Run: `pnpm --filter @ai-novel/client typecheck`

Expected: exit code 0.

Run: `pnpm --filter @ai-novel/client build`

Expected: Vite production build succeeds.

Run: `pnpm check:docs-manifest`

Expected: docs manifest passes.

- [ ] **Step 4: 执行隔离浏览器 smoke 自测**

使用项目 browser smoke 工具启动隔离浏览器/专用标签，访问 `http://127.0.0.1:5174/settings`，确认：

1. 页面没有“创作可用性检查”；
2. 模型、旁白音色、画风、记录和视频输出入口仍可见且可点击；
3. 移动视口打开系统设置时，页签可横向滚动且不出现自动导演、知识库与写法、外观；
4. 控制台无错误，设置页面请求中没有 readiness 专属 RAG/写法查询失败。

记录访问页面、关键操作、控制台/网络状态和截图路径。

- [ ] **Step 5: 提交、合并、推送和清理**

在隔离工作树确认自测通过且只包含本任务改动后：

```bash
git add client/src/config/dramaFocusNav.ts client/src/pages/settings/views/SettingsOverviewPage.tsx client/src/components/layout/mobile/mobileSiteNavigation.ts client/tests/dramaFocusNav.test.js client/tests/settingsNavigationContracts.test.js client/tests/mobileSiteNavigation.test.js docs/wiki/product/settings-readiness.md docs/releases/release-notes.md README.md
git diff --cached --check
git commit -s -m "feat: focus settings on drama workflow"
```

从干净 `main` 工作区运行：

```bash
pnpm workflow:integrate codex/drama-focus-settings --verify "pnpm typecheck" --push
pnpm workflow:cleanup codex/drama-focus-settings
```

最后核对 `main` clean、`HEAD == origin/main == git ls-remote origin refs/heads/main`，并确认本任务工作树/分支已清理，其他并行工作树仍存在。
